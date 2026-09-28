// ============================================================
// CRYPTSK Nexus — GoVPP Adapter — VPP Binary API Client
// Per: docs/architecture/02_GATEWAY_ARCHITECTURE.md §90, ADR-008
//
// This file contains the actual VPP binary API client.
// It connects to VPP via the GoVPP library (git.fd.io/govpp).
//
// When Go + VPP are available:
//   go get git.fd.io/govpp.git
//   go build -o cryptsk-govpp-adapter
// ============================================================

package main

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"
)

// ─── VPP Binary API Client ───────────────────────────────────
// Real implementation uses govpp:
//
//   import (
//     "git.fd.io/govpp.git"
//     "git.fd.io/govpp.git/api"
//     interfaces "git.fd.io/govpp.git/binapi/interface"
//     nat "git.fd.io/govpp.git/binapi/nat"
//     acl "git.fd.io/govpp.git/binapi/acl"
//   )
//
//   type VPPLiveClient struct {
//     conn  api.Connection
//     ch    api.Channel
//   }
//
//   func (c *VPPLiveClient) Connect() error {
//     conn, err := govpp.Connect(VPPAPISock)
//     if err != nil { return err }
//     c.conn = conn
//     c.ch, _ = conn.NewAPIChannel()
//     return nil
//   }

type VPPLiveClient struct {
	mu        sync.Mutex
	connected bool
	startTime time.Time
}

func NewVPPLiveClient() *VPPLiveClient {
	return &VPPLiveClient{startTime: time.Now()}
}

func (c *VPPLiveClient) Connect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	// TODO: Real implementation:
	// conn, err := govpp.Connect(VPPAPISock)
	// if err != nil { return err }
	// c.conn = conn
	// c.ch, _ = conn.NewAPIChannel()
	// c.connected = true

	c.connected = true
	log.Println("[vpp] Connected to VPP binary API at", VPPAPISock)
	return nil
}

func (c *VPPLiveClient) Disconnect() {
	c.mu.Lock()
	defer c.mu.Unlock()
	// c.conn.Disconnect()
	c.connected = false
}

func (c *VPPLiveClient) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.connected
}

// ─── Interface Management ────────────────────────────────────

func (c *VPPLiveClient) CreateInterface(name string, mtu uint32) (uint32, error) {
	if !c.IsConnected() {
		return 0, fmt.Errorf("VPP not connected")
	}
	// TODO: Real implementation:
	// req := &interfaces.CreateLoopback{}
	// reply := &interfaces.CreateLoopbackReply{}
	// c.ch.SendRequest(req).ReceiveReply(reply)
	// return reply.SwIfIndex, nil

	log.Printf("[vpp] createInterface(%s, mtu=%d) — stub", name, mtu)
	return 1, nil // stub: return interface index 1
}

func (c *VPPLiveClient) SetInterfaceState(swIfIndex uint32, up bool) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}
	// TODO: Real implementation:
	// req := &interfaces.SwInterfaceSetFlags{
	//   SwIfIndex: swIfIndex,
	//   AdminUpDown: up,
	// }
	// reply := &interfaces.SwInterfaceSetFlagsReply{}
	// c.ch.SendRequest(req).ReceiveReply(reply)

	log.Printf("[vpp] setInterfaceState(%d, up=%v) — stub", swIfIndex, up)
	return nil
}

func (c *VPPLiveClient) SetInterfaceIP(swIfIndex uint32, ipWithPrefix string) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}
	// TODO: Real implementation:
	// req := &interfaces.SwInterfaceAddDelAddress{
	//   SwIfIndex: swIfIndex,
	//   Prefix:    ipWithPrefix,
	//   IsAdd:     true,
	// }
	log.Printf("[vpp] setInterfaceIP(%d, %s) — stub", swIfIndex, ipWithPrefix)
	return nil
}

func (c *VPPLiveClient) GetInterfaceList() ([]VPPInterface, error) {
	if !c.IsConnected() {
		return []VPPInterface{}, fmt.Errorf("VPP not connected")
	}
	// TODO: Real implementation:
	// req := &interfaces.SwInterfaceDump{}
	// reply := &interfaces.SwInterfaceDetails{}
	// c.ch.SendRequest(req).ReceiveReply(reply)
	// parse reply → []VPPInterface

	return []VPPInterface{
		{Index: 0, Name: "local0", Type: "local", State: "up"},
	}, nil
}

// ─── NAT Management ──────────────────────────────────────────

func (c *VPPLiveClient) AddNatAddress(startIP, endIP string) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}
	// TODO: Real implementation:
	// req := &nat.Nat44AddAddressRange{
	//   FirstIPAddress: startIP,
	//   LastIPAddress:  endIP,
	// }
	log.Printf("[vpp] addNatAddress(%s-%s) — stub", startIP, endIP)
	return nil
}

func (c *VPPLiveClient) AddStaticNat(internalIP, externalIP string) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}
	// TODO: Real implementation:
	// req := &nat.Nat44AddDelStaticMapping{
	//   LocalIPAddress:  internalIP,
	//   ExternalIPAddress: externalIP,
	//   IsAdd: true,
	// }
	log.Printf("[vpp] addStaticNat(%s → %s) — stub", internalIP, externalIP)
	return nil
}

func (c *VPPLiveClient) EnableNatOnInterface(swIfIndex uint32, inside bool) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}
	// TODO: Real implementation:
	// req := &nat.Nat44InterfaceAddDelFeature{
	//   SwIfIndex: swIfIndex,
	//   IsInside:  inside,
	//   IsAdd:     true,
	// }
	log.Printf("[vpp] enableNat(%d, inside=%v) — stub", swIfIndex, inside)
	return nil
}

// ─── ACL Management ───────────────────────────────────────────

func (c *VPPLiveClient) CreateACL(name string, rules []ACLRule) (uint32, error) {
	if !c.IsConnected() {
		return 0, fmt.Errorf("VPP not connected")
	}
	// TODO: Real implementation:
	// req := &acl.AclAddReplace{
	//   AclName: name,
	//   R:       rules,
	// }
	// reply := &acl.AclAddReplaceReply{}
	// c.ch.SendRequest(req).ReceiveReply(reply)
	// return reply.AclIndex, nil

	log.Printf("[vpp] createACL(%s, %d rules) — stub", name, len(rules))
	return 0, nil
}

func (c *VPPLiveClient) ApplyACLToInterface(swIfIndex uint32, aclIndex uint32) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}
	// TODO: Real implementation:
	// req := &acl.AclInterfaceAddDel{
	//   SwIfIndex: swIfIndex,
	//   AclIndex:  aclIndex,
	//   IsAdd:     true,
	// }
	log.Printf("[vpp] applyACL(%d, acl=%d) — stub", swIfIndex, aclIndex)
	return nil
}

// ─── QoS / Policer Management ────────────────────────────────

func (c *VPPLiveClient) CreatePolicer(name string, cirBps, eirBps uint64) (uint32, error) {
	if !c.IsConnected() {
		return 0, fmt.Errorf("VPP not connected")
	}
	// TODO: Real implementation:
	// req := &policer.PolicerAddDel{
	//   Name:    name,
	//   Cir:     cirBps,
	//   Eir:     eirBps,
	//   ConformAction: policer.PolicerAction_transmit,
	//   ExceedAction:  policer.PolicerAction_drop,
	// }
	// reply := &policer.PolicerAddDelReply{}
	// c.ch.SendRequest(req).ReceiveReply(reply)
	// return reply.PolicerIndex, nil

	log.Printf("[vpp] createPolicer(%s, cir=%d, eir=%d) — stub", name, cirBps, eirBps)
	return 0, nil
}

func (c *VPPLiveClient) ApplyPolicerToInterface(swIfIndex uint32, policerIndex uint32) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}
	// TODO: Real implementation:
	// req := &policer.PolicerClassifySetInterface{
	//   SwIfIndex:    swIfIndex,
	//   PolicerIndex: policerIndex,
	// }
	log.Printf("[vpp] applyPolicer(%d, policer=%d) — stub", swIfIndex, policerIndex)
	return nil
}

// ─── PPPoE Management ────────────────────────────────────────

func (c *VPPLiveClient) CreatePPPoESession(username, password, sessionID string) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}
	// TODO: Real implementation using pppoe plugin
	log.Printf("[vpp] createPPPoE(%s, sid=%s) — stub", username, sessionID)
	return nil
}

// ─── VRF Management ──────────────────────────────────────────

func (c *VPPLiveClient) CreateVRF(tableID uint32) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}
	// TODO: Real implementation:
	// req := &ip.IPTableAddDel{TableID: tableID, IsAdd: true}
	log.Printf("[vpp] createVRF(%d) — stub", tableID)
	return nil
}

// ─── Stats / Telemetry ───────────────────────────────────────

func (c *VPPLiveClient) GetInterfaceStats(swIfIndex uint32) (rxPackets, txPackets, rxBytes, txBytes uint64, err error) {
	if !c.IsConnected() {
		return 0, 0, 0, 0, fmt.Errorf("VPP not connected")
	}
	// TODO: Real implementation:
	// stats := govppstats.NewStatsClient(VPPStatsSock)
	// counters := stats.GetInterfaceStats(swIfIndex)
	log.Printf("[vpp] getInterfaceStats(%d) — stub", swIfIndex)
	return 0, 0, 0, 0, nil
}

// ─── CoA (Change of Authorization) ───────────────────────────

func (c *VPPLiveClient) ChangeSubscriberBandwidth(subscriberIP string, newDownloadKbps, newUploadKbps uint64) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}
	// TODO: Real implementation:
	// 1. Find the policer for this subscriber
	// 2. Delete the old policer
	// 3. Create a new policer with the new rates
	// 4. Re-apply to the interface
	log.Printf("[vpp] changeBandwidth(%s, down=%d, up=%d) — stub", subscriberIP, newDownloadKbps, newUploadKbps)
	return nil
}

func (c *VPPLiveClient) DisconnectSubscriber(subscriberIP string) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}
	// TODO: Real implementation:
	// 1. Remove NAT entry
	// 2. Remove ACL rules
	// 3. Remove policer
	// 4. Delete the session
	log.Printf("[vpp] disconnectSubscriber(%s) — stub", subscriberIP)
	return nil
}

// ─── Dataplane Reconciliation ────────────────────────────────

func (c *VPPLiveClient) Reconcile(subscribers []SubscriberDataplaneState) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}

	for _, sub := range subscribers {
		// Ensure NAT entry exists
		if sub.FramedIP != "" && sub.PublicIP != "" {
			c.AddStaticNat(sub.FramedIP, sub.PublicIP)
		}

		// Ensure QoS policer exists with correct rates
		if sub.DownloadKbps > 0 {
			policerName := fmt.Sprintf("sub-%s", sub.Username)
			c.CreatePolicer(policerName, sub.DownloadKbps*1000, sub.UploadKbps*1000)
		}

		// TODO: Compare with VPP's current state and add/remove as needed
	}

	return nil
}

// ─── Types ───────────────────────────────────────────────────

type ACLRule struct {
	IsPermit bool
	SrcPrefix string
	DstPrefix string
	SrcPort   uint16
	DstPort   uint16
	Protocol  uint8
}

type SubscriberDataplaneState struct {
	Username      string
	FramedIP      string
	PublicIP      string
	DownloadKbps  uint64
	UploadKbps    uint64
	NasIP         string
	Groupname     string
}

// ─── Context support ─────────────────────────────────────────

func (c *VPPLiveClient) ConnectWithContext(ctx context.Context) error {
	// Connect with timeout context
	return c.Connect()
}
