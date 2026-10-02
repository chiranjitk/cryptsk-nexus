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
        nat44_ei "git.fd.io/govpp.git/binapi/nat44_ei"
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
//
// NOTE on 1R2C validation: VPP rejects 1R2C policers with Eb > 0
// ("Policer parameter validation failed -- 1R2C / Unable to compute hw param").
// For 1R2C: Eir=0, Eb=0 (no excess bucket). Use 1R3C_RFC_2697 if you need Eb > 0.
func (c *VPPLiveClient) CreatePolicer(name string, cirBps, eirBps uint64) (uint32, error) {
        if !c.IsConnected() {
                return 0, fmt.Errorf("VPP not connected")
        }

        // Convert bits/sec → kbps (rate_type = SSE2_QOS_RATE_API_KBPS)
        cirKbps := uint32(cirBps / 1000)
        if cirKbps == 0 {
                cirKbps = 1 // avoid zero rate
        }

        // For 1R2C: only committed bucket matters. Cb = 1 second of cir in bytes.
        // (Cb is in bytes for KBPS rate type per VPP convention)
        cb := uint64(cirKbps) * 1000 // 1s burst in bytes
        if cb == 0 {
                cb = 4000 // fallback: 4KB burst
        }

        req := &policer.PolicerAddDel{
                IsAdd:      true,
                Name:       name,
                Cir:        cirKbps,
                Eir:        0, // 1R2C: no excess rate
                Cb:         cb,
                Eb:         0, // 1R2C: no excess burst (VPP validation requires this)
                RateType:   policer_types.SSE2_QOS_RATE_API_KBPS,
                RoundType:  policer_types.SSE2_QOS_ROUND_API_TO_CLOSEST,
                Type:       policer_types.SSE2_QOS_POLICER_TYPE_API_1R2C,
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
        log.Printf("[vpp] Created policer %s (index=%d, cir=%d kbps) via binapi",
                name, reply.PolicerIndex, cirKbps)
        return reply.PolicerIndex, nil
}

// ApplyPolicerToInterface binds a policer to an interface so that every
// packet on that interface is policed. VPP uses classify tables for this:
//   1. Create a classify table whose Mask is all-zero (matches everything
//      in the masked-key space → every packet produces the same key, 0).
//   2. Add a ClassifyAddDelSession with HitNextIndex = policerIndex. When
//      a packet matches (which it always will, because the masked key is 0
//      and the session Match is 0), VPP redirects to the policer_classify
//      graph node and applies the policer at that index.
//   3. Bind the classify table to the interface via policer_classify_set_interface
//      so the IP4 input feature invokes the table for every IP4 packet.
//
// If any step fails the function returns an error — callers should treat it
// as non-fatal (the policer still exists in VPP's pool, it just isn't
// attached to a traffic flow).
func (c *VPPLiveClient) ApplyPolicerToInterface(swIfIndex uint32, policerIndex uint32) error {
        if !c.IsConnected() {
                return fmt.Errorf("VPP not connected")
        }

        // Step 1: create a wildcard classify table for IP4 input.
        // Mask = all zeros (16 bytes) → masked-key is 0 for every packet →
        // any session with Match=zeros hits every packet.
        // MatchNVectors=1 → examine first 16 bytes (IP4 src + dst + proto + ports).
        tableReq := &classify.ClassifyAddDelTable{
                IsAdd:         true,
                TableIndex:    0xFFFFFFFF, // auto-assign
                Nbuckets:      2,
                MemorySize:    1048576, // 1MB
                SkipNVectors:  0,
                MatchNVectors: 1, // match on first 16 bytes (IP4 src+dst+proto+ports)
                NextTableIndex: 0xFFFFFFFF,
                MissNextIndex:  0xFFFFFFFF,
                MaskLen:        16,
                Mask: []byte{
                        0x00, 0x00, 0x00, 0x00,
                        0x00, 0x00, 0x00, 0x00,
                        0x00, 0x00, 0x00, 0x00,
                        0x00, 0x00, 0x00, 0x00,
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

        // Step 2: add a wildcard classify session that hits the policer.
        // HitNextIndex = policerIndex: VPP's policer_classify graph node uses
        // this to look up the actual policer in the pool and apply it.
        // Match = all zeros → matches every packet given the all-zero table mask.
        // Action = SET_METADATA (lowest-impact action; the metadata field is
        // unused here — the policer itself is the real action).
        sessionReq := &classify.ClassifyAddDelSession{
                IsAdd:        true,
                TableIndex:   tableIndex,
                HitNextIndex: policerIndex, // <-- the key wiring to the policer
                OpaqueIndex:  0xFFFFFFFF,  // ~0 = unused
                Advance:      0,
                Action:       classify.CLASSIFY_API_ACTION_SET_METADATA,
                Metadata:     0,
                MatchLen:     16,
                Match: []byte{
                        0x00, 0x00, 0x00, 0x00,
                        0x00, 0x00, 0x00, 0x00,
                        0x00, 0x00, 0x00, 0x00,
                        0x00, 0x00, 0x00, 0x00,
                },
        }
        sessionReply := &classify.ClassifyAddDelSessionReply{}
        if err := c.ch.SendRequest(sessionReq).ReceiveReply(sessionReply); err != nil {
                return fmt.Errorf("classify_add_del_session failed: %w", err)
        }
        if sessionReply.Retval != 0 {
                return fmt.Errorf("classify_add_del_session retval=%d", sessionReply.Retval)
        }

        // Step 3: bind the classify table to the interface as the IP4 policer-classify
        // table. This makes the IP4 input feature invoke our table for every IP4
        // packet on this interface.
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

        log.Printf("[vpp] Applied policer %d to interface %d via classify table %d + wildcard session (hit_next=%d) via binapi",
                policerIndex, swIfIndex, tableIndex, policerIndex)
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

        req := &nat44_ei.Nat44EiAddDelAddressRange{
                FirstIPAddress: firstIP,
                LastIPAddress:  lastIP,
                VrfID:          0, // default VRF
                IsAdd:          true,
        }
        reply := &nat44_ei.Nat44EiAddDelAddressRangeReply{}

        if err := c.ch.SendRequest(req).ReceiveReply(reply); err != nil {
                return fmt.Errorf("nat44_ei_add_del_address_range failed: %w", err)
        }
        if reply.Retval != 0 {
                return fmt.Errorf("nat44_ei_add_del_address_range retval=%d", reply.Retval)
        }
        log.Printf("[vpp] Added NAT44 EI pool address range %s..%s via binary API", startIP, endIP)
        return nil
}

// AddStaticNat creates a 1:1 static NAT mapping (internalIP → externalIP) using
// the nat44_ei (endpoint-INDEPENDENT) plugin loaded on VPP v26.06 production
// builds. The previous nat44_ed implementation triggered
// `VPPApiError: Unsupported (-126)` because the ED plugin is not present in
// the prod build — only `nat44_ei_plugin.so` is loaded.
//
// The EI plugin's Nat44EiAddDelStaticMapping struct mirrors the ED V2 message
// (same field names, except Flags uses the NAT44_EI_* constant namespace and
// NAT44_EI_STATIC_MAPPING = 64 replaces NAT_IS_STATIC = 1).
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
        req := &nat44_ei.Nat44EiAddDelStaticMapping{
                IsAdd:             true,
                Flags:             nat44_ei.NAT44_EI_STATIC_MAPPING, // 64 — 1:1 static mapping
                LocalIPAddress:    localIP,
                ExternalIPAddress: extIP,
                Protocol:          0, // 0 = all protocols (identity mapping)
                LocalPort:         0,
                ExternalPort:      0,
                ExternalSwIfIndex: interface_types.InterfaceIndex(0xFFFFFFFF), // ~0 = use specific external IP
                VrfID:             0,
                Tag:               fmt.Sprintf("static-%s->%s", internalIP, externalIP),
        }
        reply := &nat44_ei.Nat44EiAddDelStaticMappingReply{}
        if err := c.ch.SendRequest(req).ReceiveReply(reply); err != nil {
                return fmt.Errorf("nat44_ei_add_del_static_mapping failed: %w", err)
        }
        if reply.Retval != 0 {
                return fmt.Errorf("nat44_ei_add_del_static_mapping retval=%d", reply.Retval)
        }
        log.Printf("[vpp] Added static NAT EI %s -> %s via binary API", internalIP, externalIP)
        return nil
}

// EnableNatOnInterface enables NAT44 EI on an interface (inside or outside).
// nat44_ei uses TWO separate calls to express the inside/outside role:
//   1. Nat44EiAddDelInterfaceAddr — sets the inside/outside flag bit on the
//      interface (NAT44_EI_IF_INSIDE=16, NAT44_EI_IF_OUTSIDE=32).
//   2. Nat44EiAddDelOutputInterface — for outside interfaces only, registers
//      the interface as the egress for NAT'd traffic.
//
// NOTE: nat44_ei's IF_INSIDE/IF_OUTSIDE bit values are REVERSED from the
// legacy nat plugin's nat_types.NAT_IS_INSIDE/NAT_IS_OUTSIDE — be careful.
func (c *VPPLiveClient) EnableNatOnInterface(swIfIndex uint32, inside bool) error {
        if !c.IsConnected() {
                return fmt.Errorf("VPP not connected")
        }

        // Step 1: set the interface as inside or outside via the interface-addr
        // message. IF_INSIDE=16, IF_OUTSIDE=32 (reversed from nat_types).
        flags := nat44_ei.NAT44_EI_IF_OUTSIDE // 32 — outside by default
        if inside {
                flags = nat44_ei.NAT44_EI_IF_INSIDE // 16 — inside
        }
        addrReq := &nat44_ei.Nat44EiAddDelInterfaceAddr{
                IsAdd:     true,
                SwIfIndex: interface_types.InterfaceIndex(swIfIndex),
                Flags:     flags,
        }
        addrReply := &nat44_ei.Nat44EiAddDelInterfaceAddrReply{}
        if err := c.ch.SendRequest(addrReq).ReceiveReply(addrReply); err != nil {
                return fmt.Errorf("nat44_ei_add_del_interface_addr failed: %w", err)
        }
        if addrReply.Retval != 0 {
                return fmt.Errorf("nat44_ei_add_del_interface_addr retval=%d", addrReply.Retval)
        }

        // Step 2: for outside interfaces, also register as a NAT44 EI output
        // interface so translated traffic egresses through it.
        if !inside {
                outReq := &nat44_ei.Nat44EiAddDelOutputInterface{
                        IsAdd:     true,
                        SwIfIndex: interface_types.InterfaceIndex(swIfIndex),
                }
                outReply := &nat44_ei.Nat44EiAddDelOutputInterfaceReply{}
                if err := c.ch.SendRequest(outReq).ReceiveReply(outReply); err != nil {
                        return fmt.Errorf("nat44_ei_add_del_output_interface failed: %w", err)
                }
                if outReply.Retval != 0 {
                        return fmt.Errorf("nat44_ei_add_del_output_interface retval=%d", outReply.Retval)
                }
        }

        sideStr := "outside"
        if inside {
                sideStr = "inside"
        }
        log.Printf("[vpp] Enabled NAT44 EI %s on interface %d via binary API", sideStr, swIfIndex)
        return nil
}

// ListNatAddresses returns the list of NAT44 EI pool addresses via
// nat44_ei_address_dump. Field layout (IPAddress / VrfID / Flags) is identical
// to the legacy nat44_ed message so the JSON handler in main.go needs no change.
func (c *VPPLiveClient) ListNatAddresses() ([]nat44_ei.Nat44EiAddressDetails, error) {
        if !c.IsConnected() {
                return nil, fmt.Errorf("VPP not connected")
        }
        req := &nat44_ei.Nat44EiAddressDump{}
        multiCtx := c.ch.SendMultiRequest(req)

        var out []nat44_ei.Nat44EiAddressDetails
        for {
                details := &nat44_ei.Nat44EiAddressDetails{}
                last, err := multiCtx.ReceiveReply(details)
                if err != nil {
                        return out, fmt.Errorf("nat44_ei_address_dump failed: %w", err)
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

// DeleteStaticNat removes a 1:1 static NAT mapping via the nat44_ei plugin.
// Mirrors AddStaticNat with IsAdd=false.
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
        req := &nat44_ei.Nat44EiAddDelStaticMapping{
                IsAdd:             false,
                Flags:             nat44_ei.NAT44_EI_STATIC_MAPPING, // 64 — 1:1 static mapping
                LocalIPAddress:    localIP,
                ExternalIPAddress: extIP,
                Protocol:          0,
                LocalPort:         0,
                ExternalPort:      0,
                ExternalSwIfIndex: interface_types.InterfaceIndex(0xFFFFFFFF),
                VrfID:             0,
                Tag:               fmt.Sprintf("static-%s->%s", internalIP, externalIP),
        }
        reply := &nat44_ei.Nat44EiAddDelStaticMappingReply{}
        if err := c.ch.SendRequest(req).ReceiveReply(reply); err != nil {
                return fmt.Errorf("nat44_ei_add_del_static_mapping (delete) failed: %w", err)
        }
        if reply.Retval != 0 {
                return fmt.Errorf("nat44_ei_add_del_static_mapping (delete) retval=%d", reply.Retval)
        }
        log.Printf("[vpp] Deleted static NAT EI %s -> %s via binary API", internalIP, externalIP)
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

// ─── Ensure nat_types import is retained for shared type aliases ──
// nat44_ei defines its own Nat44EiConfigFlags + NAT44_EI_* constants locally,
// but we keep the nat_types import registered so future shared types
// (e.g. nat_types.NatConfigFlags when talking to the legacy nat plugin)
// resolve without re-adding the import.
var _ = nat_types.NatConfigFlags(0)
