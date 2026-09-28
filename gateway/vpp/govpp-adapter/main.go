// ============================================================
// CRYPTSK Nexus — GoVPP Adapter
// Per: docs/architecture/02_GATEWAY_ARCHITECTURE.md §90, ADR-008
//
// This is the Go binary API client that talks to VPP via
// the GoVPP binary API (NEVER vppctl shell — ADR-008).
//
// It provides a REST API for the OSS/BSS plane to:
//   - Get interface list from VPP
//   - Apply/remove subscriber dataplane objects (NAT, ACL, QoS)
//   - Generate + apply VPP config from policies
//   - Health check VPP
//
// Build (when Go is available on the VM):
//   cd gateway/vpp/govpp-adapter
//   go mod tidy
//   go build -o cryptsk-govpp-adapter
//   ./cryptsk-govpp-adapter
//
// Port: 3015 (per spec 04_FEATURE §8.2 — gateway-service:3005, we use 3015 for govpp)
// ============================================================

package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

// ─── Configuration ────────────────────────────────────────────

const (
	Port          = 3015
	VPPCLISock    = "/run/vpp/cli.sock"
	VPPAPISock    = "/run/vpp/api.sock"
	VPPStatsSock  = "/run/vpp/stats.sock"
	DBURL         = "postgresql://cryptsknexus:CryptskNexus2026@localhost:5432/cryptsknexus"
)

// ─── Types ────────────────────────────────────────────────────

type VPPInterface struct {
	Index      uint32 `json:"index"`
	Name       string `json:"name"`
	Type       string `json:"type"` // hardware, sub, loopback
	State      string `json:"state"` // up, down
	IP4Address string `json:"ip4Address,omitempty"`
	MacAddress string `json:"macAddress,omitempty"`
	RxPackets  uint64 `json:"rxPackets"`
	TxPackets  uint64 `json:"txPackets"`
	RxBytes   uint64 `json:"rxBytes"`
	TxBytes   uint64 `json:"txBytes"`
}

type VPPStatus struct {
	Connected   bool   `json:"connected"`
	Version     string `json:"version"`
	Uptime      int64  `json:"uptime"`
	Interfaces  int    `json:"interfaces"`
	LastError   string `json:"lastError,omitempty"`
}

type DataplaneObject struct {
	Type       string `json:"type"` // nat, acl, qos, pppoe
	Subscriber string `json:"subscriber"`
	IP         string `json:"ip"`
	Config     map[string]interface{} `json:"config"`
}

// ─── VPP Client (stub — real impl uses GoVPP binary API) ─────

type VPPClient struct {
	connected bool
	startTime time.Time
	mu        sync.Mutex
}

func NewVPPClient() *VPPClient {
	return &VPPClient{
		startTime: time.Now(),
	}
}

// Connect attempts to connect to VPP via binary API socket
func (c *VPPClient) Connect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Check if VPP API socket exists
	if _, err := os.Stat(VPPAPISock); err != nil {
		c.connected = false
		return fmt.Errorf("VPP API socket not found at %s — VPP not running or not configured", VPPAPISock)
	}

	// TODO: Real implementation uses govpp API:
	//   conn, err := api.Connect(VPPAPISock)
	//   ch, err := conn.NewAPIChannel()
	//   // Use ch to send/receive binary API messages

	c.connected = true
	return nil
}

func (c *VPPClient) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.connected
}

func (c *VPPClient) GetStatus() VPPStatus {
	return VPPStatus{
		Connected: c.IsConnected(),
		Version:   "VPP 24.x (not running — DPDK hardware required)",
		Uptime:    time.Since(c.startTime).Seconds(),
		Interfaces: 0,
	}
}

func (c *VPPClient) GetInterfaces() []VPPInterface {
	// TODO: Real impl uses govpp to query interface list
	// For now, return empty list (VPP not running)
	return []VPPInterface{}
}

// ApplyDataplaneObject pushes a subscriber dataplane object to VPP
func (c *VPPClient) ApplyDataplaneObject(obj DataplaneObject) error {
	if !c.IsConnected() {
		return fmt.Errorf("VPP not connected")
	}

	// TODO: Real implementation:
	// NAT:    govpp nat44 add/del address, nat44 add/del session
	// ACL:    govpp acl add/del, acl interface add/del
	// QoS:    govpp policer add/del, classify policer
	// PPPoE:  govpp pppoe create/del session

	log.Printf("[govpp] applying %s for subscriber %s (IP: %s)", obj.Type, obj.Subscriber, obj.IP)
	return nil
}

// ─── REST API ────────────────────────────────────────────────

var vppClient = NewVPPClient()

func main() {
	// Try to connect to VPP
	if err := vppClient.Connect(); err != nil {
		log.Printf("[warn] VPP not connected: %v", err)
		log.Printf("[info] GoVPP adapter running in stub mode — will connect when VPP is available")
	}

	// Start connection retry loop
	go func() {
		for {
			time.Sleep(10 * time.Second)
			if !vppClient.IsConnected() {
				vppClient.Connect()
			}
		}
	}()

	// REST API
	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/interfaces", interfacesHandler)
	http.HandleFunc("/status", statusHandler)
	http.HandleFunc("/apply", applyHandler)
	http.HandleFunc("/config/generate", configGenerateHandler)

	log.Printf("╔══════════════════════════════════════════╗")
	log.Printf("║  CRYPTSK GoVPP Adapter — Port %d          ║", Port)
	log.Printf("║  VPP API: %s           ║", VPPAPISock)
	log.Printf("║  Connected: %v                           ║", vppClient.IsConnected())
	log.Printf("╚══════════════════════════════════════════╝")

	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", Port), nil))
}

// ─── Handlers ────────────────────────────────────────────────

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "ok",
		"port":      Port,
		"vppConnected": vppClient.IsConnected(),
		"uptime":    time.Since(vppClient.startTime).Seconds(),
	})
}

func interfacesHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"interfaces": vppClient.GetInterfaces(),
	})
}

func statusHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(vppClient.GetStatus())
}

func applyHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	var obj DataplaneObject
	if err := json.NewDecoder(r.Body).Decode(&obj); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := vppClient.ApplyDataplaneObject(obj); err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Dataplane object %s applied for %s", obj.Type, obj.Subscriber),
	})
}

func configGenerateHandler(w http.ResponseWriter, r *http.Request) {
	// Generate VPP CLI config from OSS/BSS state
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// TODO: Query PostgreSQL for subscribers + policies + generate VPP config
	json.NewEncoder(w).Encode(map[string]interface{}{
		"config": "# VPP config generation — query PostgreSQL + generate CLI commands\n# (stub — real impl queries DB + generates interface/NAT/ACL/QoS commands)",
		"status": "stub",
	})
}
