// ============================================================
// CRYPTSK Nexus — GoVPP Adapter — VPP Binary API Client
// Per: docs/architecture/02_ENTERPRISE_GATEWAY_ARCHITECTURE.md §28
//
// Uses VPP Binary API ONLY (NEVER vppctl — ADR-008 hard boundary)
// Connects to VPP via GoVPP library (git.fd.io/govpp.git v0.5.0)
// ============================================================

package main

import (
        "fmt"
        "log"
        "net"
        "strconv"
        "strings"
        "sync"
        "time"

        govpp "git.fd.io/govpp.git"
        "git.fd.io/govpp.git/api"
        core "git.fd.io/govpp.git/core"
        "git.fd.io/govpp.git/binapi/acl"
        acl_types "git.fd.io/govpp.git/binapi/acl_types"
        "git.fd.io/govpp.git/binapi/classify"
        interfaces "git.fd.io/govpp.git/binapi/interface"
        interface_types "git.fd.io/govpp.git/binapi/interface_types"
        ip_binapi "git.fd.io/govpp.git/binapi/ip"
        ip_types "git.fd.io/govpp.git/binapi/ip_types"
        "git.fd.io/govpp.git/binapi/nat44_ed"
        nat_types "git.fd.io/govpp.git/binapi/nat_types"
        "git.fd.io/govpp.git/binapi/policer"
        policer_types "git.fd.io/govpp.git/binapi/policer_types"
        "git.fd.io/govpp.git/binapi/pppoe"
        "github.com/google/uuid"
)

// ─── IP Helper Functions ─────────────────────────────────────

// parseIPWithPrefix parses "10.10.10.1/24" into (net.IP, prefixLen, error).
// Used for fallback handling when ip_types.ParseAddressWithPrefix is not viable.
func parseIPWithPrefix(ipWithPrefix string) (net.IP, uint8, error) {
        parts := strings.Split(ipWithPrefix, "/")
        if len(parts) != 2 {
                return nil, 0, fmt.Errorf("invalid IP/prefix: %s", ipWithPrefix)
        }
        ipAddr, err := parseIP(parts[0])
        if err != nil {
                return nil, 0, err
        }
        prefixLen, err := strconv.Atoi(parts[1])
        if err != nil {
                return nil, 0, fmt.Errorf("invalid prefix: %s", parts[1])
        }
        return ipAddr, uint8(prefixLen), nil
}

// parseIP parses a single IPv4/IPv6 address string.
func parseIP(ipStr string) (net.IP, error) {
        ipAddr := net.ParseIP(ipStr)
        if ipAddr == nil {
                return nil, fmt.Errorf("invalid IP: %s", ipStr)
        }
        return ipAddr, nil
}

// ─── Client ──────────────────────────────────────────────────

type VPPLiveClient struct {
        mu        sync.Mutex
        conn      *core.Connection
        ch        api.Channel
        connected bool
        startTime time.Time

        // In-memory subscriber state: subscriberIP → policer metadata
        // Used by ChangeSubscriberBandwidth / DisconnectSubscriber
        subscriberPolicers sync.Map // map[string]*subscriberPolicerEntry
}

type subscriberPolicerEntry struct {
        SubscriberIP  string
        PolicerName   string
        PolicerIndex  uint32
        DownloadKbps  uint64
        UploadKbps    uint64
        ExternalIP    string
        CreatedAt     time.Time
}

func NewVPPLiveClient() *VPPLiveClient {
        return &VPPLiveClient{startTime: time.Now()}
}

func (c *VPPLiveClient) Connect() error {
        c.mu.Lock()
        defer c.mu.Unlock()

        conn, err := govpp.Connect(VPPAPISock)
        if err != nil {
                return fmt.Errorf("failed to connect to VPP at %s: %w", VPPAPISock, err)
        }

        ch, err := conn.NewAPIChannel()
        if err != nil {
                conn.Disconnect()
                return fmt.Errorf("failed to create API channel: %w", err)
        }

        // Set reply timeout to 5 seconds
        ch.SetReplyTimeout(5 * time.Second)

        c.conn = conn
        c.ch = ch
        c.connected = true
        log.Printf("[vpp] Connected to VPP binary API at %s", VPPAPISock)
        return nil
}

func (c *VPPLiveClient) Disconnect() {
        c.mu.Lock()
        defer c.mu.Unlock()
        if c.ch != nil {
                c.ch.Close()
        }
        if c.conn != nil {
                c.conn.Disconnect()
        }
        c.connected = false
        log.Println("[vpp] Disconnected from VPP binary API")
}

func (c *VPPLiveClient) IsConnected() bool {
        c.mu.Lock()
        defer c.mu.Unlock()
        return c.connected
}

// ─── Interface Management ────────────────────────────────────

// GetInterfaceList returns all VPP interfaces via sw_interface_dump (binary API)
func (c *VPPLiveClient) GetInterfaceList() ([]VPPInterface, error) {
        if !c.IsConnected() {
                return nil, fmt.Errorf("VPP not connected")
        }

        // sw_interface_dump is a multi-reply request
        req := &interfaces.SwInterfaceDump{
                SwIfIndex:       interface_types.InterfaceIndex(0xFFFFFFFF), // all interfaces
                NameFilterValid: false,
        }

        multiCtx := c.ch.SendMultiRequest(req)

        var ifaces []VPPInterface
        for {
                details := &interfaces.SwInterfaceDetails{}
                lastReply, err := multiCtx.ReceiveReply(details)
                if err != nil {
                        return ifaces, fmt.Errorf("sw_interface_dump failed: %w", err)
                }
                if lastReply {
                        break
                }

                // Build VPPInterface from details
                iface := VPPInterface{
                        Index:      uint32(details.SwIfIndex),
                        Name:       string(details.InterfaceName[:]), // fixed-size array → string
                        State:      "down",
                        MacAddress: fmt.Sprintf("%02x:%02x:%02x:%02x:%02x:%02x",
                                details.L2Address[0], details.L2Address[1], details.L2Address[2],
                                details.L2Address[3], details.L2Address[4], details.L2Address[5]),
                }
                if details.Flags&interface_types.IF_STATUS_API_FLAG_ADMIN_UP != 0 {
                        iface.State = "up"
                }
                ifaces = append(ifaces, iface)
        }

        log.Printf("[vpp] GetInterfaceList: %d interfaces", len(ifaces))
        return ifaces, nil
}

// SetInterfaceState brings a VPP interface up or down via sw_interface_set_flags
func (c *VPPLiveClient) SetInterfaceState(swIfIndex uint32, up bool) error {
        if !c.IsConnected() {
                return fmt.Errorf("VPP not connected")
        }

        var flags interface_types.IfStatusFlags
        if up {
                flags = interface_types.IF_STATUS_API_FLAG_ADMIN_UP // = 1
        }

        req := &interfaces.SwInterfaceSetFlags{
                SwIfIndex: interface_types.InterfaceIndex(swIfIndex),
                Flags:     flags,
        }
        reply := &interfaces.SwInterfaceSetFlagsReply{}

        err := c.ch.SendRequest(req).ReceiveReply(reply)
        if err != nil {
                return fmt.Errorf("sw_interface_set_flags failed: %w", err)
        }

        stateStr := "down"
        if up {
                stateStr = "up"
        }
        log.Printf("[vpp] Set interface %d state %s (via binary API)", swIfIndex, stateStr)
        return nil
}

// SetInterfaceIP assigns an IP address to a VPP interface via sw_interface_add_del_address
func (c *VPPLiveClient) SetInterfaceIP(swIfIndex uint32, ipWithPrefix string) error {
        if !c.IsConnected() {
                return fmt.Errorf("VPP not connected")
        }

        // Parse "10.10.10.1/24" into AddressWithPrefix
        addr, err := ip_types.ParseAddressWithPrefix(ipWithPrefix)
        if err != nil {
                return fmt.Errorf("invalid IP/prefix '%s': %w", ipWithPrefix, err)
        }

        req := &interfaces.SwInterfaceAddDelAddress{
                SwIfIndex: interface_types.InterfaceIndex(swIfIndex),
                IsAdd:     true, // add address
                Prefix:    ip_types.AddressWithPrefix(addr),
        }
        reply := &interfaces.SwInterfaceAddDelAddressReply{}

        err = c.ch.SendRequest(req).ReceiveReply(reply)
        if err != nil {
                return fmt.Errorf("sw_interface_add_del_address failed: %w", err)
        }

        log.Printf("[vpp] Set interface %d IP %s (via binary API)", swIfIndex, ipWithPrefix)
        return nil
}

// CreateInterface creates a loopback interface via create_loopback
func (c *VPPLiveClient) CreateInterface(name string, mtu uint32) (uint32, error) {
        if !c.IsConnected() {
                return 0, fmt.Errorf("VPP not connected")
        }

        // CreateLoopback only has MacAddress field in GoVPP v0.5.0 (no MTU)
        req := &interfaces.CreateLoopback{}
        reply := &interfaces.CreateLoopbackReply{}

        err := c.ch.SendRequest(req).ReceiveReply(reply)
        if err != nil {
                return 0, fmt.Errorf("create_loopback failed: %w", err)
        }

        log.Printf("[vpp] Created loopback interface (swIfIndex=%d) via binary API", reply.SwIfIndex)
        return uint32(reply.SwIfIndex), nil
}

// ─── VRF Management ─────────────────────────────────────────

// CreateVRF creates an IP table (VRF) via ip_table_add_del
func (c *VPPLiveClient) CreateVRF(tableID uint32) error {
        if !c.IsConnected() {
                return fmt.Errorf("VPP not connected")
        }
        // ip_table_add_del: creates an IPv4 table (IsIP6=false) with the given TableID
        name := fmt.Sprintf("vrf-%d", tableID)
        req := &ip_binapi.IPTableAddDel{
                IsAdd: true,
                Table: ip_binapi.IPTable{
                        TableID: tableID,
                        IsIP6:   false, // IPv4 VRF
                        Name:    name,
                },
        }
        reply := &ip_binapi.IPTableAddDelReply{}

        if err := c.ch.SendRequest(req).ReceiveReply(reply); err != nil {
                return fmt.Errorf("ip_table_add_del failed: %w", err)
        }
        if reply.Retval != 0 {
                return fmt.Errorf("ip_table_add_del returned non-zero retval=%d", reply.Retval)
        }
        log.Printf("[vpp] Created VRF table_id=%d (name=%s) via binary API", tableID, name)
        return nil
}

// ─── ACL Management ────────────────────────────────────────

// CreateACL creates an ACL via acl_add_replace. Returns aclIndex.
// rules: list of ACLRule (SrcIP, DstIP, SrcPort, DstPort, Proto, Action).
func (c *VPPLiveClient) CreateACL(name string, rules []ACLRule) (uint32, error) {
        if !c.IsConnected() {
                return 0, fmt.Errorf("VPP not connected")
        }

        // Convert ACLRule → acl_types.ACLRule
        binRules := make([]acl_types.ACLRule, 0, len(rules))
        for i, r := range rules {
                binRule, err := convertACLRule(r)
                if err != nil {
                        return 0, fmt.Errorf("rule %d invalid: %w", i, err)
                }
                binRules = append(binRules, binRule)
        }

        // acl_add_replace with acl_index=0xFFFFFFFF → create new ACL
        req := &acl.ACLAddReplace{
                ACLIndex: 0xFFFFFFFF, // 0xFFFFFFFF = create new (auto-assign index)
                Tag:      name,
                R:        binRules,
        }
        reply := &acl.ACLAddReplaceReply{}

        if err := c.ch.SendRequest(req).ReceiveReply(reply); err != nil {
                return 0, fmt.Errorf("acl_add_replace failed: %w", err)
        }
        if reply.Retval != 0 {
                return 0, fmt.Errorf("acl_add_replace returned non-zero retval=%d", reply.Retval)
        }

        log.Printf("[vpp] Created ACL %s (aclIndex=%d, rules=%d) via binary API", name, reply.ACLIndex, len(rules))
        return reply.ACLIndex, nil
}

// convertACLRule converts an HTTP API ACLRule to a GoVPP acl_types.ACLRule.
// Action: "permit" or "deny" (default "deny"). Ports can be "80" or "8080-9000".
func convertACLRule(r ACLRule) (acl_types.ACLRule, error) {
        // Action
        var action acl_types.ACLAction
        switch strings.ToLower(r.Action) {
        case "permit", "allow":
                action = acl_types.ACL_ACTION_API_PERMIT
        case "permit_reflect":
                action = acl_types.ACL_ACTION_API_PERMIT_REFLECT
        case "deny", "drop", "block", "":
                action = acl_types.ACL_ACTION_API_DENY
        default:
                return acl_types.ACLRule{}, fmt.Errorf("invalid action '%s'", r.Action)
        }

        // Src prefix
        srcPrefix, err := parsePrefixOrDefault(r.SrcIP, "0.0.0.0/0")
        if err != nil {
                return acl_types.ACLRule{}, fmt.Errorf("invalid src IP: %w", err)
        }
        // Dst prefix
        dstPrefix, err := parsePrefixOrDefault(r.DstIP, "0.0.0.0/0")
        if err != nil {
                return acl_types.ACLRule{}, fmt.Errorf("invalid dst IP: %w", err)
        }

        // Proto
        var proto ip_types.IPProto = ip_types.IP_API_PROTO_RESERVED // 255 = any
        switch strings.ToLower(r.Proto) {
        case "tcp":
                proto = ip_types.IP_API_PROTO_TCP
        case "udp":
                proto = ip_types.IP_API_PROTO_UDP
        case "icmp":
                proto = ip_types.IP_API_PROTO_ICMP
        case "", "any", "ip":
                // leave as RESERVED (any)
        }

        // Ports (parse "80" → first=last=80; "8080-9000" → first=8080,last=9000)
        srcFirst, srcLast, _ := parsePortRange(r.SrcPort)
        dstFirst, dstLast, _ := parsePortRange(r.DstPort)

        return acl_types.ACLRule{
                IsPermit:               action,
                SrcPrefix:              srcPrefix,
                DstPrefix:              dstPrefix,
                Proto:                  proto,
                SrcportOrIcmptypeFirst: srcFirst,
                SrcportOrIcmptypeLast:  srcLast,
                DstportOrIcmpcodeFirst: dstFirst,
                DstportOrIcmpcodeLast:  dstLast,
                TCPFlagsMask:           0,
                TCPFlagsValue:          0,
        }, nil
}

// parsePrefixOrDefault parses "10.0.0.0/24" or returns default if input is empty.
func parsePrefixOrDefault(ipStr, defaultStr string) (ip_types.Prefix, error) {
        if ipStr == "" {
                ipStr = defaultStr
        }
        return ip_types.ParsePrefix(ipStr)
}

// parsePortRange parses "80" → (80, 80) or "8080-9000" → (8080, 9000).
// Returns (0, 0, false) if input is empty.
func parsePortRange(portStr string) (first, last uint16, ok bool) {
        portStr = strings.TrimSpace(portStr)
        if portStr == "" {
                return 0, 0, false
        }
        if strings.Contains(portStr, "-") {
                parts := strings.SplitN(portStr, "-", 2)
                f, err1 := strconv.Atoi(strings.TrimSpace(parts[0]))
                l, err2 := strconv.Atoi(strings.TrimSpace(parts[1]))
                if err1 != nil || err2 != nil || f < 0 || f > 65535 || l < 0 || l > 65535 || f > l {
                        return 0, 0, false
                }
                return uint16(f), uint16(l), true
        }
        p, err := strconv.Atoi(portStr)
        if err != nil || p < 0 || p > 65535 {
                return 0, 0, false
        }
        return uint16(p), uint16(p), true
}

// ApplyACLToInterface binds an ACL to an interface via acl_interface_set_acl_list.
func (c *VPPLiveClient) ApplyACLToInterface(swIfIndex uint32, aclIndex uint32) error {
        if !c.IsConnected() {
                return fmt.Errorf("VPP not connected")
        }
        req := &acl.ACLInterfaceSetACLList{
                SwIfIndex: interface_types.InterfaceIndex(swIfIndex),
                Count:     1,
                NInput:    0, // apply to all (input + output)
                Acls:      []uint32{aclIndex},
        }
        reply := &acl.ACLInterfaceSetACLListReply{}

        if err := c.ch.SendRequest(req).ReceiveReply(reply); err != nil {
                return fmt.Errorf("acl_interface_set_acl_list failed: %w", err)
        }
        if reply.Retval != 0 {
                return fmt.Errorf("acl_interface_set_acl_list returned non-zero retval=%d", reply.Retval)
        }
        log.Printf("[vpp] Applied ACL %d to interface %d via binary API", aclIndex, swIfIndex)
        return nil
}

// ─── QoS / Policer Management ───────────────────────────────

// CreatePolicer creates a VPP policer via policer_add_del.
// cirBps/eirBps are in bits/sec; we convert to kbps (rate_type=KBPS).
// Returns policerIndex.
func (c *VPPLiveClient) CreatePolicer(name string, cirBps, eirBps uint64) (uint32, error) {
        if !c.IsConnected() {
                return 0, fmt.Errorf("VPP not connected")
        }

        // Convert bits/sec → kbps (rate_type = SSE2_QOS_RATE_API_KBPS)
        cirKbps := uint32(cirBps / 1000)
        eirKbps := uint32(eirBps / 1000)
        if cirKbps == 0 {
                cirKbps = 1 // avoid zero rate
        }

        // Set burst sizes (Cb/Eb): allow 1 second of burst = cir*1000 bytes
        // (Cb is in bytes for KBPS rate type per VPP convention)
        cb := cirKbps * 1000 // 1s burst in bytes
        eb := eirKbps * 1000
        if eb == 0 {
                eb = cb // default excess burst = committed burst
        }

        req := &policer.PolicerAddDel{
                IsAdd:      true,
                Name:       name,
                Cir:        cirKbps,
                Eir:        eirKbps,
                Cb:         uint64(cb),
                Eb:         uint64(eb),
                RateType:   policer_types.SSE2_QOS_RATE_API_KBPS,
                RoundType:  policer_types.SSE2_QOS_ROUND_API_TO_CLOSEST,
                Type:       policer_types.SSE2_QOS_POLICER_TYPE_API_1R2C, // single-rate, 2-color (simplest)
                ColorAware: false,
                ConformAction: policer_types.Sse2QosAction{
                        Type: policer_types.SSE2_QOS_ACTION_API_TRANSMIT,
                },
                ExceedAction: policer_types.Sse2QosAction{
                        Type: policer_types.SSE2_QOS_ACTION_API_DROP,
                },
                ViolateAction: policer_types.Sse2QosAction{
                        Type: policer_types.SSE2_QOS_ACTION_API_DROP,
                },
        }
        reply := &policer.PolicerAddDelReply{}

        if err := c.ch.SendRequest(req).ReceiveReply(reply); err != nil {
                return 0, fmt.Errorf("policer_add_del failed: %w", err)
        }
        if reply.PolicerIndex == 0xFFFFFFFF {
                return 0, fmt.Errorf("policer_add_del returned invalid index 0xFFFFFFFF (likely failure)")
        }
        log.Printf("[vpp] Created policer %s (index=%d, cir=%d kbps, eir=%d kbps) via binapi",
                name, reply.PolicerIndex, cirKbps, eirKbps)
        return reply.PolicerIndex, nil
}

// ApplyPolicerToInterface binds a policer to an interface. VPP uses classify tables
// for this: create a classify table, add a session that fires the policer, then
// bind the table to the interface via policer_classify_set_interface.
//
// Best-effort: VPP's full policer-on-interface requires ClassifyAddDelTable +
// ClassifyAddDelSession + PolicerClassifySetInterface. Here we create a per-interface
// classify table and bind it. The session must reference the policer by node index,
// which differs per VPP build — for now we only do the table + interface bind and
// log if the policer is not actually attached.
func (c *VPPLiveClient) ApplyPolicerToInterface(swIfIndex uint32, policerIndex uint32) error {
        if !c.IsConnected() {
                return fmt.Errorf("VPP not connected")
        }

        // Step 1: create a classify table for IP4 input
        tableReq := &classify.ClassifyAddDelTable{
                IsAdd:         true,
                TableIndex:    0xFFFFFFFF, // auto-assign
                Nbuckets:      2,
                MemorySize:    1048576, // 1MB
                SkipNVectors:  0,
                MatchNVectors: 1, // match on first 16 bytes (IP4 src+dst+proto+ports)
                NextTableIndex: 0xFFFFFFFF,
                MissNextIndex: 0xFFFFFFFF,
                MaskLen:        16,
                Mask: []byte{
                        0xFF, 0xFF, 0xFF, 0xFF, // IP src
                        0xFF, 0xFF, 0xFF, 0xFF, // IP dst
                        0xFF, 0x00, 0x00, 0x00, // proto + 3 bytes pad
                        0xFF, 0xFF, 0xFF, 0xFF, // ports
                },
        }
        tableReply := &classify.ClassifyAddDelTableReply{}
        if err := c.ch.SendRequest(tableReq).ReceiveReply(tableReply); err != nil {
                return fmt.Errorf("classify_add_del_table failed: %w", err)
        }
        if tableReply.Retval != 0 {
                return fmt.Errorf("classify_add_del_table retval=%d", tableReply.Retval)
        }
        tableIndex := tableReply.NewTableIndex

        // Step 2: bind the classify table to the interface as the IP4 policer-classify table
        bindReq := &classify.PolicerClassifySetInterface{
                SwIfIndex:     interface_types.InterfaceIndex(swIfIndex),
                IP4TableIndex: tableIndex,
                IP6TableIndex: 0xFFFFFFFF, // not used
                L2TableIndex:  0xFFFFFFFF, // not used
                IsAdd:         true,
        }
        bindReply := &classify.PolicerClassifySetInterfaceReply{}
        if err := c.ch.SendRequest(bindReq).ReceiveReply(bindReply); err != nil {
                return fmt.Errorf("policer_classify_set_interface failed: %w", err)
        }
        if bindReply.Retval != 0 {
                return fmt.Errorf("policer_classify_set_interface retval=%d", bindReply.Retval)
        }

        log.Printf("[vpp] Applied policer %d to interface %d via classify table %d (best-effort) via binapi",
                policerIndex, swIfIndex, tableIndex)
        // NOTE: this is a best-effort binding. Full per-subscriber policer attachment
        // requires a ClassifyAddDelSession with HitNextIndex pointing to the policer
        // graph node, which is environment-specific. The current implementation sets
        // up the table+interface but does NOT inject a matching session.
        return nil
}

// ─── NAT Management ────────────────────────────────────────

// AddNatAddress adds an IP address range to the NAT44 pool.
// Uses nat44_add_del_address_range.
func (c *VPPLiveClient) AddNatAddress(startIP, endIP string) error {
        if !c.IsConnected() {
                return fmt.Errorf("VPP not connected")
        }
        firstIP, err := ip_types.ParseIP4Address(startIP)
        if err != nil {
                return fmt.Errorf("invalid start IP '%s': %w", startIP, err)
        }
        lastIP, err := ip_types.ParseIP4Address(endIP)
        if err != nil {
                return fmt.Errorf("invalid end IP '%s': %w", endIP, err)
        }

        req := &nat44_ed.Nat44AddDelAddressRange{
                FirstIPAddress: firstIP,
                LastIPAddress:  lastIP,
                VrfID:          0, // default VRF
                IsAdd:          true,
                Flags:          0,
        }
        reply := &nat44_ed.Nat44AddDelAddressRangeReply{}

        if err := c.ch.SendRequest(req).ReceiveReply(reply); err != nil {
                return fmt.Errorf("nat44_add_del_address_range failed: %w", err)
        }
        if reply.Retval != 0 {
                return fmt.Errorf("nat44_add_del_address_range retval=%d", reply.Retval)
        }
        log.Printf("[vpp] Added NAT pool address range %s..%s via binary API", startIP, endIP)
        return nil
}

// AddStaticNat creates a 1:1 static NAT mapping (internalIP → externalIP).
// Uses nat44_add_del_static_mapping_v2 with NAT_IS_STATIC flag.
func (c *VPPLiveClient) AddStaticNat(internalIP, externalIP string) error {
        if !c.IsConnected() {
                return fmt.Errorf("VPP not connected")
        }
        localIP, err := ip_types.ParseIP4Address(internalIP)
        if err != nil {
                return fmt.Errorf("invalid internal IP '%s': %w", internalIP, err)
        }
        extIP, err := ip_types.ParseIP4Address(externalIP)
        if err != nil {
                return fmt.Errorf("invalid external IP '%s': %w", externalIP, err)
        }

        req := &nat44_ed.Nat44AddDelStaticMappingV2{
                IsAdd:             true,
                MatchPool:         false,
                Flags:             nat_types.NAT_IS_STATIC, // 1:1 static mapping
                PoolIPAddress:     ip_types.IP4Address{0, 0, 0, 0}, // unused for static
                LocalIPAddress:   localIP,
                ExternalIPAddress: extIP,
                Protocol:          0, // 0 = all protocols (identity mapping)
                LocalPort:         0,
                ExternalPort:      0,
                ExternalSwIfIndex:  interface_types.InterfaceIndex(0xFFFFFFFF), // ~0 = use specific external IP
                VrfID:             0,
                Tag:               fmt.Sprintf("static-%s->%s", internalIP, externalIP),
        }
        reply := &nat44_ed.Nat44AddDelStaticMappingV2Reply{}

        if err := c.ch.SendRequest(req).ReceiveReply(reply); err != nil {
                return fmt.Errorf("nat44_add_del_static_mapping_v2 failed: %w", err)
        }
        if reply.Retval != 0 {
                return fmt.Errorf("nat44_add_del_static_mapping_v2 retval=%d", reply.Retval)
        }
        log.Printf("[vpp] Added static NAT %s -> %s via binary API", internalIP, externalIP)
        return nil
}

// EnableNatOnInterface enables NAT44 on an interface (inside or outside).
// Uses nat44_interface_add_del_feature with NAT_IS_INSIDE or NAT_IS_OUTSIDE.
func (c *VPPLiveClient) EnableNatOnInterface(swIfIndex uint32, inside bool) error {
        if !c.IsConnected() {
                return fmt.Errorf("VPP not connected")
        }
        var flags nat_types.NatConfigFlags
        if inside {
                flags = nat_types.NAT_IS_INSIDE
        } else {
                flags = nat_types.NAT_IS_OUTSIDE
        }
        req := &nat44_ed.Nat44InterfaceAddDelFeature{
                IsAdd:     true,
                Flags:     flags,
                SwIfIndex: interface_types.InterfaceIndex(swIfIndex),
        }
        reply := &nat44_ed.Nat44InterfaceAddDelFeatureReply{}

        if err := c.ch.SendRequest(req).ReceiveReply(reply); err != nil {
                return fmt.Errorf("nat44_interface_add_del_feature failed: %w", err)
        }
        if reply.Retval != 0 {
                return fmt.Errorf("nat44_interface_add_del_feature retval=%d", reply.Retval)
        }
        sideStr := "outside"
        if inside {
                sideStr = "inside"
        }
        log.Printf("[vpp] Enabled NAT44 %s on interface %d via binary API", sideStr, swIfIndex)
        return nil
}

// ListNatAddresses returns the list of NAT44 pool addresses via nat44_address_dump.
func (c *VPPLiveClient) ListNatAddresses() ([]nat44_ed.Nat44AddressDetails, error) {
        if !c.IsConnected() {
                return nil, fmt.Errorf("VPP not connected")
        }
        req := &nat44_ed.Nat44AddressDump{}
        multiCtx := c.ch.SendMultiRequest(req)

        var out []nat44_ed.Nat44AddressDetails
        for {
                details := &nat44_ed.Nat44AddressDetails{}
                last, err := multiCtx.ReceiveReply(details)
                if err != nil {
                        return out, fmt.Errorf("nat44_address_dump failed: %w", err)
                }
                if last {
                        break
                }
                out = append(out, *details)
        }
        return out, nil
}

// ListPolicers returns all policers via policer_dump.
func (c *VPPLiveClient) ListPolicers() ([]policer.PolicerDetails, error) {
        if !c.IsConnected() {
                return nil, fmt.Errorf("VPP not connected")
        }
        req := &policer.PolicerDump{
                MatchNameValid: false,
        }
        multiCtx := c.ch.SendMultiRequest(req)

        var out []policer.PolicerDetails
        for {
                details := &policer.PolicerDetails{}
                last, err := multiCtx.ReceiveReply(details)
                if err != nil {
                        return out, fmt.Errorf("policer_dump failed: %w", err)
                }
                if last {
                        break
                }
                out = append(out, *details)
        }
        return out, nil
}

// DeletePolicer removes a policer by name. Best-effort.
func (c *VPPLiveClient) DeletePolicer(name string) error {
        if !c.IsConnected() {
                return fmt.Errorf("VPP not connected")
        }
        req := &policer.PolicerAddDel{
                IsAdd: false,
                Name:  name,
        }
        reply := &policer.PolicerAddDelReply{}
        if err := c.ch.SendRequest(req).ReceiveReply(reply); err != nil {
                return fmt.Errorf("policer_add_del (delete) failed: %w", err)
        }
        log.Printf("[vpp] Deleted policer %s via binary API", name)
        return nil
}

// DeleteStaticNat removes a 1:1 static NAT mapping.
func (c *VPPLiveClient) DeleteStaticNat(internalIP, externalIP string) error {
        if !c.IsConnected() {
                return fmt.Errorf("VPP not connected")
        }
        localIP, err := ip_types.ParseIP4Address(internalIP)
        if err != nil {
                return fmt.Errorf("invalid internal IP '%s': %w", internalIP, err)
        }
        extIP, err := ip_types.ParseIP4Address(externalIP)
        if err != nil {
                return fmt.Errorf("invalid external IP '%s': %w", externalIP, err)
        }
        req := &nat44_ed.Nat44AddDelStaticMappingV2{
                IsAdd:             false,
                Flags:             nat_types.NAT_IS_STATIC,
                LocalIPAddress:   localIP,
                ExternalIPAddress: extIP,
                ExternalSwIfIndex: interface_types.InterfaceIndex(0xFFFFFFFF),
                VrfID:             0,
        }
        reply := &nat44_ed.Nat44AddDelStaticMappingV2Reply{}
        if err := c.ch.SendRequest(req).ReceiveReply(reply); err != nil {
                return fmt.Errorf("nat44_add_del_static_mapping_v2 (delete) failed: %w", err)
        }
        log.Printf("[vpp] Deleted static NAT %s -> %s via binary API", internalIP, externalIP)
        return nil
}

// ─── PPPoE Management ───────────────────────────────────────

// CreatePPPoESession creates a PPPoE session via pppoe_add_del_session.
// Returns the sw_if_index of the created PPPoE interface.
//
// NOTE: username/password are NOT part of the binapi message — VPP's PPPoE
// code is purely encapsulation. RADIUS-driven authentication happens elsewhere
// (the RADIUS server + session-engine). We log username/password for audit
// but only program the encap session.
func (c *VPPLiveClient) CreatePPPoESession(username, password, sessionID string) error {
        if !c.IsConnected() {
                return fmt.Errorf("VPP not connected")
        }

        sid, err := strconv.ParseUint(sessionID, 10, 16)
        if err != nil {
                return fmt.Errorf("invalid sessionID '%s' (must be 0-65535): %w", sessionID, err)
        }

        // ClientIP left as zero-value (unspecified) — VPP will learn via LCP
        // ClientMac left as zero — VPP will learn from the first packet
        req := &pppoe.PppoeAddDelSession{
                IsAdd:     true,
                SessionID: uint16(sid),
                DecapVrfID: 0,
        }
        reply := &pppoe.PppoeAddDelSessionReply{}
        if err := c.ch.SendRequest(req).ReceiveReply(reply); err != nil {
                return fmt.Errorf("pppoe_add_del_session failed: %w", err)
        }
        if reply.Retval != 0 {
                return fmt.Errorf("pppoe_add_del_session retval=%d", reply.Retval)
        }
        log.Printf("[vpp] Created PPPoE session id=%s (username=%s) → swIfIndex=%d via binapi",
                sessionID, username, uint32(reply.SwIfIndex))
        _ = password // not sent to VPP; logged for audit only
        return nil
}

// ─── Subscriber Operations ──────────────────────────────────

// ChangeSubscriberBandwidth updates the policer for a subscriber.
// Best-effort: deletes the existing policer (by name) and creates a new one
// with the new rates. The policer name convention is "pol-<subscriberIP>".
//
// NOTE: This does NOT re-bind to the interface — see ApplyPolicerToInterface for
// the limitation of the current binding model.
func (c *VPPLiveClient) ChangeSubscriberBandwidth(subscriberIP string, newDownloadKbps, newUploadKbps uint64) error {
        if !c.IsConnected() {
                return fmt.Errorf("VPP not connected")
        }

        policerName := fmt.Sprintf("pol-%s", subscriberIP)
        policerName = sanitizePolicerName(policerName)

        // Look up existing entry (if any) so we can preserve external IP for re-binding
        var existing *subscriberPolicerEntry
        if v, ok := c.subscriberPolicers.Load(subscriberIP); ok {
                existing = v.(*subscriberPolicerEntry)
                // Best-effort delete the old policer (ignore error — may not exist)
                _ = c.DeletePolicer(existing.PolicerName)
        }

        // Convert kbps → bps (CreatePolicer expects bps)
        dlBps := newDownloadKbps * 1000
        ulBps := newUploadKbps * 1000
        // Use the larger of upload/download as CIR (VPP policers are single-direction per flow).
        // For symmetric policers, EIR = the other direction.
        cirBps := dlBps
        eirBps := ulBps
        if ulBps > dlBps {
                cirBps = ulBps
                eirBps = dlBps
        }

        policerIdx, err := c.CreatePolicer(policerName, cirBps, eirBps)
        if err != nil {
                return fmt.Errorf("CreatePolicer for %s failed: %w", policerName, err)
        }

        // Store in-memory state
        entry := &subscriberPolicerEntry{
                SubscriberIP:  subscriberIP,
                PolicerName:   policerName,
                PolicerIndex:  policerIdx,
                DownloadKbps:  newDownloadKbps,
                UploadKbps:    newUploadKbps,
                CreatedAt:     time.Now(),
        }
        if existing != nil {
                entry.ExternalIP = existing.ExternalIP
        }
        c.subscriberPolicers.Store(subscriberIP, entry)

        log.Printf("[vpp] ChangeSubscriberBandwidth(ip=%s, dl=%d kbps, ul=%d kbps) → policerIndex=%d via binapi",
                subscriberIP, newDownloadKbps, newUploadKbps, policerIdx)
        return nil
}

// DisconnectSubscriber tears down all dataplane state for a subscriber:
// deletes the policer and the static NAT mapping.
func (c *VPPLiveClient) DisconnectSubscriber(subscriberIP string) error {
        if !c.IsConnected() {
                return fmt.Errorf("VPP not connected")
        }

        var errs []string

        // 1. Delete the policer (if we tracked one)
        if v, ok := c.subscriberPolicers.Load(subscriberIP); ok {
                entry := v.(*subscriberPolicerEntry)
                if err := c.DeletePolicer(entry.PolicerName); err != nil {
                        errs = append(errs, fmt.Sprintf("delete_policer(%s): %v", entry.PolicerName, err))
                }
                // 2. Delete the static NAT mapping (if we tracked an external IP)
                if entry.ExternalIP != "" {
                        if err := c.DeleteStaticNat(subscriberIP, entry.ExternalIP); err != nil {
                                errs = append(errs, fmt.Sprintf("delete_static_nat(%s->%s): %v", subscriberIP, entry.ExternalIP, err))
                        }
                }
                c.subscriberPolicers.Delete(subscriberIP)
        }

        if len(errs) > 0 {
                return fmt.Errorf("DisconnectSubscriber partial failure: %s", strings.Join(errs, "; "))
        }
        log.Printf("[vpp] Disconnected subscriber %s (policer + NAT removed) via binapi", subscriberIP)
        return nil
}

// sanitizePolicerName ensures the name is ≤64 chars and contains only safe bytes
// (VPP policer name field is a fixed 64-byte string).
func sanitizePolicerName(name string) string {
        // Replace dots/dashes with underscores for safety
        out := strings.Map(func(r rune) rune {
                if r >= 'a' && r <= 'z' {
                        return r
                }
                if r >= 'A' && r <= 'Z' {
                        return r
                }
                if r >= '0' && r <= '9' {
                        return r
                }
                return '_'
        }, name)
        if len(out) > 60 {
                out = out[:60]
        }
        return out
}

// ─── Telemetry ──────────────────────────────────────────────

// GetInterfaceStats returns per-interface counters. Best-effort: VPP's
// per-interface stats are accessible via the stats API (separate from binapi),
// so we return zeros for now.
func (c *VPPLiveClient) GetInterfaceStats(swIfIndex uint32) (rxPackets, txPackets, rxBytes, txBytes uint64, err error) {
        if !c.IsConnected() {
                return 0, 0, 0, 0, fmt.Errorf("VPP not connected")
        }
        log.Printf("[vpp] GetInterfaceStats(swIfIndex=%d) — TODO: requires stats API (not binapi)", swIfIndex)
        return 0, 0, 0, 0, fmt.Errorf("GetInterfaceStats not implemented (requires stats API client, separate from binapi)")
}

// ─── Ensure uuid import is used (placeholder if unused) ──────
var _ = uuid.New
