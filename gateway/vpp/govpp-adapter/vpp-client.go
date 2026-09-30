// ============================================================
// CRYPTSK Nexus — GoVPP Adapter — VPP Binary API Client
// Per: docs/architecture/02_ENTERPRISE_GATEWAY_ARCHITECTURE.md §28
//
// Uses VPP Binary API ONLY (NEVER vppctl — ADR-008 hard boundary)
// Connects to VPP via GoVPP library (git.fd.io/govpp.git v0.3.0)
// ============================================================

package main

import (
	"fmt"
	"log"
	"sync"
	"time"

	govpp "git.fd.io/govpp.git"
	"git.fd.io/govpp.git/api"
	interface_types "git.fd.io/govpp.git/binapi/interface_types"
	interfaces "git.fd.io/govpp.git/binapi/interface"
	ip_types "git.fd.io/govpp.git/binapi/ip_types"
)

type VPPLiveClient struct {
	mu        sync.Mutex
	conn      api.Connection
	ch        api.Channel
	connected bool
	startTime time.Time
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
			MacAddress:  fmt.Sprintf("%02x:%02x:%02x:%02x:%02x:%02x",
				details.L2Address[0], details.L2Address[1], details.L2Address[2],
				details.L2Address[3], details.L2Address[4], details.L2Address[5]),
		}
		if details.AdminUpDown > 0 {
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

	// CreateLoopback only has MacAddress field in GoVPP v0.3.0 (no MTU)
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

func (c *VPPLiveClient) CreateVRF(tableID uint32) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}
	// VRF creation via ip_table_add_del — requires binapi/ip or binapi/vrf_table
	// Not available in GoVPP v0.3.0 binapi/interface package
	// TODO: implement when binapi/ip package is available
	log.Printf("[vpp] CreateVRF(tableID=%d) — TODO: requires binapi/ip package", tableID)
	return fmt.Errorf("CreateVRF not yet implemented (requires binapi/ip package)")
}

// ─── ACL Management ────────────────────────────────────────

func (c *VPPLiveClient) CreateACL(name string, rules []ACLRule) (uint32, error) {
	if !c.IsConnected() {
		return 0, fmt.Errorf("VPP not connected")
	}
	// ACL creation via acl_add_replace — requires binapi/acl package
	// Not available in GoVPP v0.3.0 binapi/interface package
	log.Printf("[vpp] CreateACL(name=%s, rules=%d) — TODO: requires binapi/acl package", name, len(rules))
	return 0, fmt.Errorf("CreateACL not yet implemented (requires binapi/acl package)")
}

func (c *VPPLiveClient) ApplyACLToInterface(swIfIndex uint32, aclIndex uint32) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}
	log.Printf("[vpp] ApplyACLToInterface(swIfIndex=%d, aclIndex=%d) — TODO", swIfIndex, aclIndex)
	return fmt.Errorf("ApplyACLToInterface not yet implemented")
}

// ─── QoS / Policer Management ───────────────────────────────

func (c *VPPLiveClient) CreatePolicer(name string, cirBps, eirBps uint64) (uint32, error) {
	if !c.IsConnected() {
		return 0, fmt.Errorf("VPP not connected")
	}
	log.Printf("[vpp] CreatePolicer(name=%s, cir=%d, eir=%d) — TODO: requires binapi/policer", name, cirBps, eirBps)
	return 0, fmt.Errorf("CreatePolicer not yet implemented (requires binapi/policer package)")
}

func (c *VPPLiveClient) ApplyPolicerToInterface(swIfIndex uint32, policerIndex uint32) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}
	log.Printf("[vpp] ApplyPolicerToInterface(swIfIndex=%d, policerIndex=%d) — TODO", swIfIndex, policerIndex)
	return fmt.Errorf("ApplyPolicerToInterface not yet implemented")
}

// ─── NAT Management ────────────────────────────────────────

func (c *VPPLiveClient) AddNatAddress(startIP, endIP string) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}
	log.Printf("[vpp] AddNatAddress(start=%s, end=%s) — TODO: requires binapi/nat44", startIP, endIP)
	return fmt.Errorf("AddNatAddress not yet implemented (requires binapi/nat44 package)")
}

func (c *VPPLiveClient) AddStaticNat(internalIP, externalIP string) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}
	log.Printf("[vpp] AddStaticNat(internal=%s, external=%s) — TODO", internalIP, externalIP)
	return fmt.Errorf("AddStaticNat not yet implemented (requires binapi/nat44 package)")
}

func (c *VPPLiveClient) EnableNatOnInterface(swIfIndex uint32, inside bool) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}
	log.Printf("[vpp] EnableNatOnInterface(swIfIndex=%d, inside=%v) — TODO", swIfIndex, inside)
	return fmt.Errorf("EnableNatOnInterface not yet implemented")
}

// ─── PPPoE Management ───────────────────────────────────────

func (c *VPPLiveClient) CreatePPPoESession(username, password, sessionID string) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}
	log.Printf("[vpp] CreatePPPoESession(username=%s) — TODO", username)
	return fmt.Errorf("CreatePPPoESession not yet implemented")
}

// ─── Subscriber Operations ──────────────────────────────────

func (c *VPPLiveClient) ChangeSubscriberBandwidth(subscriberIP string, newDownloadKbps, newUploadKbps uint64) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}
	log.Printf("[vpp] ChangeSubscriberBandwidth(ip=%s, down=%d, up=%d) — TODO", subscriberIP, newDownloadKbps, newUploadKbps)
	return fmt.Errorf("ChangeSubscriberBandwidth not yet implemented (requires policer update)")
}

func (c *VPPLiveClient) DisconnectSubscriber(subscriberIP string) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}
	log.Printf("[vpp] DisconnectSubscriber(ip=%s) — TODO", subscriberIP)
	return fmt.Errorf("DisconnectSubscriber not yet implemented")
}

// ─── Telemetry ──────────────────────────────────────────────

func (c *VPPLiveClient) GetInterfaceStats(swIfIndex uint32) (rxPackets, txPackets, rxBytes, txBytes uint64, err error) {
	if !c.IsConnected() {
		return 0, 0, 0, 0, fmt.Errorf("VPP not connected")
	}
	log.Printf("[vpp] GetInterfaceStats(swIfIndex=%d) — TODO", swIfIndex)
	return 0, 0, 0, 0, fmt.Errorf("GetInterfaceStats not yet implemented")
}
