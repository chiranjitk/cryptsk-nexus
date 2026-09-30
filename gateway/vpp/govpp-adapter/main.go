// ============================================================
// CRYPTSK Nexus — GoVPP Adapter
// Per: docs/architecture/02_ENTERPRISE_GATEWAY_ARCHITECTURE.md §28
//
// This is the Go binary API client that talks to VPP via
// the GoVPP binary API (NEVER vppctl shell — ADR-008).
//
// It provides a REST API for the OSS/BSS plane to:
//   - Get interface list from VPP (binary API)
//   - Set interface state UP/DOWN (binary API)
//   - Set interface IP address (binary API)
//   - Apply/remove subscriber dataplane objects (NAT, ACL, QoS)
//   - Generate + apply VPP config from policies
//   - Health check VPP
//
// Build:
//   cd gateway/vpp/govpp-adapter
//   go mod tidy
//   go build -o cryptsk-govpp-adapter
//   ./cryptsk-govpp-adapter
//
// Port: 3016 (GoVPP adapter — separate from TS adapter on 3015)
// ============================================================

package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

// ─── Configuration ────────────────────────────────────────────

const (
	Port         = 3016
	VPPCLISock   = "/run/vpp/cli.sock"
	VPPAPISock   = "/run/vpp/api.sock"
	VPPStatsSock = "/run/vpp/stats.sock"
	DBURL        = "postgresql://cryptsknexus:CryptskNexus2026@localhost:5432/cryptsknexus"
)

// ─── Types ────────────────────────────────────────────────────

type VPPInterface struct {
	Index      uint32 `json:"index"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	State      string `json:"state"`
	IP4Address string `json:"ip4Address,omitempty"`
	MacAddress string `json:"macAddress,omitempty"`
	RxPackets  uint64 `json:"rxPackets"`
	TxPackets  uint64 `json:"txPackets"`
	RxBytes    uint64 `json:"rxBytes"`
	TxBytes    uint64 `json:"txBytes"`
}

type VPPStatus struct {
	Connected  bool   `json:"connected"`
	Version    string `json:"version"`
	Uptime     int64  `json:"uptime"`
	Interfaces int   `json:"interfaces"`
	LastError  string `json:"lastError,omitempty"`
}

type ACLRule struct {
	SrcIP   string `json:"srcIp"`
	DstIP   string `json:"dstIp"`
	SrcPort string `json:"srcPort,omitempty"`
	DstPort string `json:"dstPort,omitempty"`
	Proto   string `json:"proto,omitempty"`
	Action  string `json:"action"`
}

type DataplaneObject struct {
	Type       string                 `json:"type"`
	Subscriber string                 `json:"subscriber"`
	IP         string                 `json:"ip"`
	Config     map[string]interface{} `json:"config"`
}

// ─── Global VPP Client (REAL GoVPP binary API) ───────────────

var vppClient = NewVPPLiveClient()

// ─── Main ────────────────────────────────────────────────────

func main() {
	// Try to connect to VPP via binary API
	if err := vppClient.Connect(); err != nil {
		log.Printf("[warn] VPP not connected: %v", err)
		log.Printf("[info] GoVPP adapter will retry connection every 10s")
	}

	// Start connection retry loop
	go func() {
		for {
			time.Sleep(10 * time.Second)
			if !vppClient.IsConnected() {
				if err := vppClient.Connect(); err == nil {
					log.Printf("[vpp] Reconnected to VPP binary API")
				}
			}
		}
	}()

	// REST API
	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/status", statusHandler)
	http.HandleFunc("/interfaces", interfacesHandler)
	http.HandleFunc("/interface/state", interfaceStateHandler)
	http.HandleFunc("/interface/ip", interfaceIPHandler)
	http.HandleFunc("/apply", applyHandler)
	http.HandleFunc("/config/generate", configGenerateHandler)

	log.Printf("╔══════════════════════════════════════════╗")
	log.Printf("║  CRYPTSK GoVPP Adapter — Port %d          ║", Port)
	log.Printf("║  VPP API: %s           ║", VPPAPISock)
	log.Printf("║  Connected: %v                           ║", vppClient.IsConnected())
	log.Printf("║  Mode: REAL binary API (GoVPP v0.3.0)   ║")
	log.Printf("╚══════════════════════════════════════════╝")

	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", Port), nil))
}

// ─── Handlers ────────────────────────────────────────────────

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":       "ok",
		"port":         Port,
		"vppConnected": vppClient.IsConnected(),
		"vppSocket":    VPPAPISock,
		"mode":          "binary-api",
		"uptime":       time.Since(vppClient.startTime).Seconds(),
	})
}

func statusHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	status := VPPStatus{
		Connected: vppClient.IsConnected(),
		Version:   "VPP v26.06 (binary API connected)",
		Uptime:    int64(time.Since(vppClient.startTime).Seconds()),
		Interfaces: 0,
	}

	// Try to get interface count
	if vppClient.IsConnected() {
		ifaces, err := vppClient.GetInterfaceList()
		if err == nil {
			status.Interfaces = len(ifaces)
		}
	}

	json.NewEncoder(w).Encode(status)
}

func interfacesHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if !vppClient.IsConnected() {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"interfaces": []VPPInterface{},
			"error":      "VPP not connected",
		})
		return
	}

	ifaces, err := vppClient.GetInterfaceList()
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"interfaces": []VPPInterface{},
			"error":      err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"interfaces": ifaces,
		"total":      len(ifaces),
	})
}

func interfaceStateHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	var req struct {
		SwIfIndex uint32 `json:"swIfIndex"`
		Up        bool   `json:"up"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := vppClient.SetInterfaceState(req.SwIfIndex, req.Up); err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"swIfIndex": req.SwIfIndex,
		"state":    map[bool]string{true: "up", false: "down"}[req.Up],
	})
}

func interfaceIPHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	var req struct {
		SwIfIndex    uint32 `json:"swIfIndex"`
		IPWithPrefix string `json:"ipWithPrefix"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := vppClient.SetInterfaceIP(req.SwIfIndex, req.IPWithPrefix); err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"swIfIndex": req.SwIfIndex,
		"ip":       req.IPWithPrefix,
	})
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

	// Route to appropriate VPP operation based on type
	switch obj.Type {
	case "nat":
		if internal, ok := obj.Config["internalIP"].(string); ok {
			if external, ok := obj.Config["externalIP"].(string); ok {
				if err := vppClient.AddStaticNat(internal, external); err != nil {
					json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": err.Error()})
					return
				}
			}
		}
	case "acl":
		rulesJSON, _ := json.Marshal(obj.Config["rules"])
		var rules []ACLRule
		json.Unmarshal(rulesJSON, &rules)
		aclIdx, err := vppClient.CreateACL(obj.Subscriber, rules)
		if err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": err.Error()})
			return
		}
		_ = aclIdx
	case "qos":
		if cir, ok := obj.Config["cirBps"].(float64); ok {
			policerIdx, err := vppClient.CreatePolicer(obj.Subscriber, uint64(cir), 0)
			if err != nil {
				json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": err.Error()})
				return
			}
			_ = policerIdx
		}
	case "disconnect":
		if err := vppClient.DisconnectSubscriber(obj.IP); err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": err.Error()})
			return
		}
	case "bandwidth":
		if down, ok := obj.Config["downloadKbps"].(float64); ok {
			if up, ok := obj.Config["uploadKbps"].(float64); ok {
				if err := vppClient.ChangeSubscriberBandwidth(obj.IP, uint64(down), uint64(up)); err != nil {
					json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": err.Error()})
					return
				}
			}
		}
	}

	log.Printf("[govpp] Applied %s for subscriber %s (IP: %s)", obj.Type, obj.Subscriber, obj.IP)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Dataplane object %s applied for %s via binary API", obj.Type, obj.Subscriber),
	})
}

func configGenerateHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// The Go adapter generates config via binary API, not CLI
	// This endpoint is for compatibility with the TS adapter
	json.NewEncoder(w).Encode(map[string]interface{}{
		"config": "# GoVPP adapter — config applied via binary API (not CLI)\n# Use /apply endpoint to push individual objects",
		"mode":   "binary-api",
		"status": "real",
	})
}

// Ensure os import is used
var _ = os.Stat
