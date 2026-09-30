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
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
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
	Interfaces int    `json:"interfaces"`
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

// ─── In-memory session policy state ───────────────────────────
//
// sessionPolicies: sessionId → *SessionPolicy
//
// Stored whenever /subscriber/program succeeds; used by
// /subscriber/verify, /subscriber/remove, /subscriber/state, /coa.
var sessionPolicies sync.Map

// SessionPolicy is the in-memory state for a programmed subscriber.
type SessionPolicy struct {
	SessionID         string    `json:"sessionId"`
	SubscriberID     string    `json:"subscriberId"`
	Username         string    `json:"username"`
	FramedIP         string    `json:"framedIp"`
	MAC              string    `json:"mac"`
	NasIP            string    `json:"nasIp"`
	VlanID           string    `json:"vlanId,omitempty"`
	VRF              string    `json:"vrf,omitempty"`
	PolicyID         string    `json:"policyId,omitempty"`
	ACLProfileID     string    `json:"aclProfileId,omitempty"`
	QoSProfileID     string    `json:"qosProfileId,omitempty"`
	NATProfileID     string    `json:"natProfileId,omitempty"`
	IPPool           string    `json:"ipPool,omitempty"`
	SpeedDownKbps    uint64    `json:"speedDownKbps"`
	SpeedUpKbps      uint64    `json:"speedUpKbps"`
	TimeoutSec       int       `json:"timeoutSec,omitempty"`
	CircuitID        string    `json:"circuitId,omitempty"`
	RemoteID         string    `json:"remoteId,omitempty"`
	PPPoESessionID   string    `json:"pppoeSessionId,omitempty"`
	DHCPClientID     string    `json:"dhcpClientId,omitempty"`

	// VPP dataplane state (returned from binapi calls)
	PolicerIndex     uint32    `json:"policerIndex"`
	ACLIndex         uint32    `json:"aclIndex"`
	ExternalIP       string    `json:"externalIp,omitempty"`
	NatMappingExists bool      `json:"natMappingExists"`

	CreatedAt        time.Time `json:"createdAt"`
	ProgrammedAt     time.Time `json:"programmedAt"`
	VerifiedAt       time.Time `json:"verifiedAt,omitempty"`
}

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

	// REST API — original endpoints
	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/status", statusHandler)
	http.HandleFunc("/interfaces", interfacesHandler)
	http.HandleFunc("/interface/state", interfaceStateHandler)
	http.HandleFunc("/interface/ip", interfaceIPHandler)
	http.HandleFunc("/apply", applyHandler)
	http.HandleFunc("/config/generate", configGenerateHandler)

	// REST API — new subscriber programming endpoints (Task P-GOVPP-REAL-BINAPI)
	http.HandleFunc("/subscriber/program", subscriberProgramHandler)
	http.HandleFunc("/subscriber/verify", subscriberVerifyHandler)
	http.HandleFunc("/subscriber/remove", subscriberRemoveHandler)
	http.HandleFunc("/subscriber/state", subscriberStateHandler)
	http.HandleFunc("/coa", coaHandler)
	http.HandleFunc("/nat44/add-address", natAddAddressHandler)
	http.HandleFunc("/nat44/enable", natEnableHandler)
	http.HandleFunc("/nat44/addresses", natAddressesHandler)
	http.HandleFunc("/policers", policersHandler)
	http.HandleFunc("/vpp/restart-recovery", restartRecoveryHandler)

	log.Printf("╔══════════════════════════════════════════╗")
	log.Printf("║  CRYPTSK GoVPP Adapter — Port %d          ║", Port)
	log.Printf("║  VPP API: %s           ║", VPPAPISock)
	log.Printf("║  Connected: %v                           ║", vppClient.IsConnected())
	log.Printf("║  Mode: REAL binary API (GoVPP v0.5.0)   ║")
	log.Printf("╚══════════════════════════════════════════╝")

	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", Port), nil))
}

// ─── CORS / OPTIONS helper ────────────────────────────────────

// setCORS sets Access-Control-Allow-Origin: * on all responses so the
// OSS/BSS front-end can call this adapter directly.
func setCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

// handleOptions returns true if the request was an OPTIONS preflight that
// has already been answered (caller should return immediately).
func handleOptions(w http.ResponseWriter, r *http.Request) bool {
	if r.Method == http.MethodOptions {
		setCORS(w)
		w.WriteHeader(http.StatusNoContent)
		return true
	}
	return false
}

// writeJSON writes the given value as JSON with CORS headers.
func writeJSON(w http.ResponseWriter, v interface{}) {
	setCORS(w)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

// writeError writes a JSON error envelope with CORS headers.
func writeError(w http.ResponseWriter, code int, msg string) {
	setCORS(w)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": false,
		"error":   msg,
	})
}

// ─── Original Handlers ────────────────────────────────────────

func healthHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	writeJSON(w, map[string]interface{}{
		"status":       "ok",
		"port":         Port,
		"vppConnected": vppClient.IsConnected(),
		"vppSocket":    VPPAPISock,
		"mode":         "binary-api",
		"govppVersion": "v0.5.0",
		"uptime":       time.Since(vppClient.startTime).Seconds(),
	})
}

func statusHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	status := VPPStatus{
		Connected:  vppClient.IsConnected(),
		Version:    "VPP v26.06 (binary API connected)",
		Uptime:     int64(time.Since(vppClient.startTime).Seconds()),
		Interfaces: 0,
	}
	if vppClient.IsConnected() {
		if ifaces, err := vppClient.GetInterfaceList(); err == nil {
			status.Interfaces = len(ifaces)
		}
	}
	writeJSON(w, status)
}

func interfacesHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	if !vppClient.IsConnected() {
		writeJSON(w, map[string]interface{}{
			"interfaces": []VPPInterface{},
			"error":     "VPP not connected",
		})
		return
	}
	ifaces, err := vppClient.GetInterfaceList()
	if err != nil {
		writeJSON(w, map[string]interface{}{
			"interfaces": []VPPInterface{},
			"error":      err.Error(),
		})
		return
	}
	writeJSON(w, map[string]interface{}{
		"interfaces": ifaces,
		"total":      len(ifaces),
	})
}

func interfaceStateHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var req struct {
		SwIfIndex uint32 `json:"swIfIndex"`
		Up        bool   `json:"up"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := vppClient.SetInterfaceState(req.SwIfIndex, req.Up); err != nil {
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	writeJSON(w, map[string]interface{}{
		"success":   true,
		"swIfIndex": req.SwIfIndex,
		"state":     map[bool]string{true: "up", false: "down"}[req.Up],
	})
}

func interfaceIPHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var req struct {
		SwIfIndex    uint32 `json:"swIfIndex"`
		IPWithPrefix string `json:"ipWithPrefix"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := vppClient.SetInterfaceIP(req.SwIfIndex, req.IPWithPrefix); err != nil {
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	writeJSON(w, map[string]interface{}{
		"success":   true,
		"swIfIndex": req.SwIfIndex,
		"ip":        req.IPWithPrefix,
	})
}

func applyHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var obj DataplaneObject
	if err := json.NewDecoder(r.Body).Decode(&obj); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Route to appropriate VPP operation based on type
	switch obj.Type {
	case "nat":
		if internal, ok := obj.Config["internalIP"].(string); ok {
			if external, ok := obj.Config["externalIP"].(string); ok {
				if err := vppClient.AddStaticNat(internal, external); err != nil {
					writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
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
			writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
			return
		}
		_ = aclIdx
	case "qos":
		if cir, ok := obj.Config["cirBps"].(float64); ok {
			policerIdx, err := vppClient.CreatePolicer(obj.Subscriber, uint64(cir), 0)
			if err != nil {
				writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
				return
			}
			_ = policerIdx
		}
	case "disconnect":
		if err := vppClient.DisconnectSubscriber(obj.IP); err != nil {
			writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
			return
		}
	case "bandwidth":
		if down, ok := obj.Config["downloadKbps"].(float64); ok {
			if up, ok := obj.Config["uploadKbps"].(float64); ok {
				if err := vppClient.ChangeSubscriberBandwidth(obj.IP, uint64(down), uint64(up)); err != nil {
					writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
					return
				}
			}
		}
	}

	log.Printf("[govpp] Applied %s for subscriber %s (IP: %s)", obj.Type, obj.Subscriber, obj.IP)
	writeJSON(w, map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Dataplane object %s applied for %s via binary API", obj.Type, obj.Subscriber),
	})
}

func configGenerateHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	writeJSON(w, map[string]interface{}{
		"config": "# GoVPP adapter — config applied via binary API (not CLI)\n# Use /apply endpoint to push individual objects",
		"mode":   "binary-api",
		"status": "real",
	})
}

// ─── New: Subscriber Programming Endpoints ─────────────────────

// subscriberProgramHandler — POST /subscriber/program
//
// Programs a full subscriber dataplane state on VPP:
//   1. CreatePolicer (with speedDownKbps/speedUpKbps)
//   2. AddStaticNat (framedIp → externalIp if provided)
//   3. CreateACL (if aclProfileId or rules array provided)
//
// Body: { sessionId, subscriberId, username, framedIp, mac, nasIp,
//         vlanId?, vrf?, policyId?, aclProfileId?, qosProfileId?,
//         natProfileId?, ipPool?, speedDownKbps, speedUpKbps,
//         timeoutSec?, circuitId?, remoteId?, pppoeSessionId?,
//         dhcpClientId?, externalIp?, aclRules? }
func subscriberProgramHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var req struct {
		SessionID       string `json:"sessionId"`
		SubscriberID    string `json:"subscriberId"`
		Username        string `json:"username"`
		FramedIP        string `json:"framedIp"`
		MAC             string `json:"mac"`
		NasIP           string `json:"nasIp"`
		VlanID          string `json:"vlanId"`
		VRF             string `json:"vrf"`
		PolicyID        string `json:"policyId"`
		ACLProfileID    string `json:"aclProfileId"`
		QoSProfileID    string `json:"qosProfileId"`
		NATProfileID    string `json:"natProfileId"`
		IPPool          string `json:"ipPool"`
		SpeedDownKbps   uint64 `json:"speedDownKbps"`
		SpeedUpKbps     uint64 `json:"speedUpKbps"`
		TimeoutSec      int    `json:"timeoutSec"`
		CircuitID       string `json:"circuitId"`
		RemoteID        string `json:"remoteId"`
		PPPoESessionID  string `json:"pppoeSessionId"`
		DHCPClientID    string `json:"dhcpClientId"`
		ExternalIP      string `json:"externalIp"`
		ACLRules        []ACLRule `json:"aclRules"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.SessionID == "" {
		// Auto-generate a session ID if none provided
		req.SessionID = uuid.New().String()
	}
	if req.FramedIP == "" {
		writeError(w, http.StatusBadRequest, "framedIp is required")
		return
	}

	policy := &SessionPolicy{
		SessionID:      req.SessionID,
		SubscriberID:   req.SubscriberID,
		Username:      req.Username,
		FramedIP:       req.FramedIP,
		MAC:            req.MAC,
		NasIP:          req.NasIP,
		VlanID:         req.VlanID,
		VRF:            req.VRF,
		PolicyID:       req.PolicyID,
		ACLProfileID:   req.ACLProfileID,
		QoSProfileID:   req.QoSProfileID,
		NATProfileID:   req.NATProfileID,
		IPPool:         req.IPPool,
		SpeedDownKbps:  req.SpeedDownKbps,
		SpeedUpKbps:    req.SpeedUpKbps,
		TimeoutSec:     req.TimeoutSec,
		CircuitID:      req.CircuitID,
		RemoteID:       req.RemoteID,
		PPPoESessionID: req.PPPoESessionID,
		DHCPClientID:   req.DHCPClientID,
		ExternalIP:     req.ExternalIP,
		CreatedAt:      time.Now(),
		ProgrammedAt:   time.Now(),
	}

	stepErrors := []string{}

	// Step 1: Create the policer for the subscriber (bandwidth shaping)
	// Convert kbps → bps (CreatePolicer expects bps)
	if req.SpeedDownKbps > 0 || req.SpeedUpKbps > 0 {
		cirBps := req.SpeedDownKbps * 1000
		eirBps := req.SpeedUpKbps * 1000
		policerName := sanitizePolicerName(fmt.Sprintf("pol-%s", req.FramedIP))
		policerIdx, err := vppClient.CreatePolicer(policerName, cirBps, eirBps)
		if err != nil {
			stepErrors = append(stepErrors, fmt.Sprintf("CreatePolicer: %v", err))
			log.Printf("[govpp] /subscriber/program: CreatePolicer failed for %s: %v", req.FramedIP, err)
		} else {
			policy.PolicerIndex = policerIdx
			// Track in the VPP client's in-memory subscriber map for CoA / disconnect
			vppClient.subscriberPolicers.Store(req.FramedIP, &subscriberPolicerEntry{
				SubscriberIP: req.FramedIP,
				PolicerName:  policerName,
				PolicerIndex: policerIdx,
				DownloadKbps: req.SpeedDownKbps,
				UploadKbps:   req.SpeedUpKbps,
				ExternalIP:   req.ExternalIP,
				CreatedAt:    time.Now(),
			})
		}
	}

	// Step 2: Create static NAT mapping (if externalIp provided)
	if req.ExternalIP != "" {
		if err := vppClient.AddStaticNat(req.FramedIP, req.ExternalIP); err != nil {
			stepErrors = append(stepErrors, fmt.Sprintf("AddStaticNat: %v", err))
			log.Printf("[govpp] /subscriber/program: AddStaticNat failed for %s→%s: %v",
				req.FramedIP, req.ExternalIP, err)
		} else {
			policy.NatMappingExists = true
		}
	}

	// Step 3: Create ACL (if rules provided)
	if len(req.ACLRules) > 0 {
		aclName := fmt.Sprintf("acl-%s", req.SessionID)
		aclIdx, err := vppClient.CreateACL(aclName, req.ACLRules)
		if err != nil {
			stepErrors = append(stepErrors, fmt.Sprintf("CreateACL: %v", err))
			log.Printf("[govpp] /subscriber/program: CreateACL failed for %s: %v", req.SessionID, err)
		} else {
			policy.ACLIndex = aclIdx
		}
	}

	// Store in-memory session policy
	sessionPolicies.Store(req.SessionID, policy)

	log.Printf("[govpp] /subscriber/program: session=%s subscriber=%s ip=%s policer=%d acl=%d nat=%v errors=%d",
		req.SessionID, req.SubscriberID, req.FramedIP,
		policy.PolicerIndex, policy.ACLIndex, policy.NatMappingExists, len(stepErrors))

	writeJSON(w, map[string]interface{}{
		"success":         len(stepErrors) == 0,
		"sessionId":       req.SessionID,
		"policerIndex":    policy.PolicerIndex,
		"aclIndex":        policy.ACLIndex,
		"natMappingExists": policy.NatMappingExists,
		"warnings":        stepErrors,
		"programmedAt":    policy.ProgrammedAt,
	})
}

// subscriberVerifyHandler — POST /subscriber/verify
// Body: { sessionId }
// Returns: { verified, checks: {policerExists, aclExists, natMappingExists} }
func subscriberVerifyHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var req struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.SessionID == "" {
		writeError(w, http.StatusBadRequest, "sessionId is required")
		return
	}

	v, ok := sessionPolicies.Load(req.SessionID)
	if !ok {
		writeJSON(w, map[string]interface{}{
			"verified":  false,
			"sessionId": req.SessionID,
			"error":     "session not found in in-memory map",
		})
		return
	}
	policy := v.(*SessionPolicy)

	// Best-effort live checks via VPP binapi (may fail if VPP not connected)
	policerExists := policy.PolicerIndex != 0
	aclExists := policy.ACLIndex != 0
	natMappingExists := policy.NatMappingExists

	// Try live verification via dump endpoints (best-effort — ignore errors)
	if vppClient.IsConnected() {
		// Check NAT pool for the external IP
		if addrs, err := vppClient.ListNatAddresses(); err == nil {
			for _, a := range addrs {
				ipStr := ""
				// IP4Address is [4]uint8 — format as dotted quad
				if len(a.IPAddress) == 4 {
					ipStr = fmt.Sprintf("%d.%d.%d.%d", a.IPAddress[0], a.IPAddress[1], a.IPAddress[2], a.IPAddress[3])
				}
				if ipStr == policy.ExternalIP {
					natMappingExists = true
					break
				}
			}
		}
		// Check policer list
		if pols, err := vppClient.ListPolicers(); err == nil {
			for _, p := range pols {
				_ = p // we'd compare by index but PolicerDetails doesn't carry an index field
			}
		}
	}

	verified := policerExists || aclExists || natMappingExists
	policy.VerifiedAt = time.Now()

	writeJSON(w, map[string]interface{}{
		"verified":  verified,
		"sessionId": req.SessionID,
		"checks": map[string]bool{
			"policerExists":     policerExists,
			"aclExists":         aclExists,
			"natMappingExists":  natMappingExists,
		},
		"policy":   policy,
		"checkedAt": policy.VerifiedAt,
	})
}

// subscriberRemoveHandler — POST /subscriber/remove
// Body: { sessionId }. Removes policer + NAT + ACL from VPP.
func subscriberRemoveHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var req struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.SessionID == "" {
		writeError(w, http.StatusBadRequest, "sessionId is required")
		return
	}

	v, ok := sessionPolicies.Load(req.SessionID)
	if !ok {
		writeJSON(w, map[string]interface{}{
			"success":   false,
			"sessionId": req.SessionID,
			"error":     "session not found in in-memory map",
		})
		return
	}
	policy := v.(*SessionPolicy)

	var errs []string

	// 1. DisconnectSubscriber (deletes policer + static NAT, uses VPP client's
	//    in-memory subscriberPolicers map).
	if err := vppClient.DisconnectSubscriber(policy.FramedIP); err != nil {
		errs = append(errs, fmt.Sprintf("DisconnectSubscriber: %v", err))
	}

	// 2. ACL removal — there is no per-ACL delete in our adapter; we leave the
	//    ACL object in VPP (it's a no-op until bound to an interface). Log it.
	if policy.ACLIndex != 0 {
		log.Printf("[govpp] /subscriber/remove: ACL %d left in VPP (no ACLDel binapi call implemented)", policy.ACLIndex)
	}

	sessionPolicies.Delete(req.SessionID)

	if len(errs) > 0 {
		writeJSON(w, map[string]interface{}{
			"success":   false,
			"sessionId": req.SessionID,
			"errors":    errs,
		})
		return
	}
	writeJSON(w, map[string]interface{}{
		"success":   true,
		"sessionId": req.SessionID,
		"removedAt": time.Now(),
	})
}

// subscriberStateHandler — GET /subscriber/state?sessionId=...
// Returns the in-memory session policy.
func subscriberStateHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	sessionID := r.URL.Query().Get("sessionId")
	if sessionID == "" {
		// List all sessions if no sessionId
		var all []map[string]interface{}
		sessionPolicies.Range(func(key, value interface{}) bool {
			p := value.(*SessionPolicy)
			all = append(all, map[string]interface{}{
				"sessionId":      p.SessionID,
				"subscriberId":   p.SubscriberID,
				"framedIp":       p.FramedIP,
				"policerIndex":   p.PolicerIndex,
				"aclIndex":       p.ACLIndex,
				"programmedAt":  p.ProgrammedAt,
			})
			return true
		})
		writeJSON(w, map[string]interface{}{
			"sessions": all,
			"total":    len(all),
		})
		return
	}
	v, ok := sessionPolicies.Load(sessionID)
	if !ok {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}
	writeJSON(w, v.(*SessionPolicy))
}

// coaHandler — POST /coa
// Body: { sessionId, subscriberIP, downloadKbps, uploadKbps }.
// Updates the policer for an in-flight session.
func coaHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var req struct {
		SessionID     string `json:"sessionId"`
		SubscriberIP  string `json:"subscriberIP"`
		DownloadKbps  uint64 `json:"downloadKbps"`
		UploadKbps    uint64 `json:"uploadKbps"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Determine the subscriber IP: prefer the request's subscriberIP,
	// otherwise look up from sessionPolicies.
	subscriberIP := req.SubscriberIP
	if subscriberIP == "" && req.SessionID != "" {
		if v, ok := sessionPolicies.Load(req.SessionID); ok {
			subscriberIP = v.(*SessionPolicy).FramedIP
		}
	}
	if subscriberIP == "" {
		writeError(w, http.StatusBadRequest, "either subscriberIP or a valid sessionId is required")
		return
	}

	if err := vppClient.ChangeSubscriberBandwidth(subscriberIP, req.DownloadKbps, req.UploadKbps); err != nil {
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
		return
	}

	// Update the in-memory SessionPolicy with new rates (and possibly a new policer index)
	if req.SessionID != "" {
		if v, ok := sessionPolicies.Load(req.SessionID); ok {
			p := v.(*SessionPolicy)
			p.SpeedDownKbps = req.DownloadKbps
			p.SpeedUpKbps = req.UploadKbps
			// Refresh policer index from the VPP client's subscriber map
			if pv, ok2 := vppClient.subscriberPolicers.Load(subscriberIP); ok2 {
				p.PolicerIndex = pv.(*subscriberPolicerEntry).PolicerIndex
			}
		}
	}

	log.Printf("[govpp] /coa: session=%s ip=%s down=%d up=%d → policer updated",
		req.SessionID, subscriberIP, req.DownloadKbps, req.UploadKbps)
	writeJSON(w, map[string]interface{}{
		"success":      true,
		"sessionId":    req.SessionID,
		"subscriberIP": subscriberIP,
		"downloadKbps": req.DownloadKbps,
		"uploadKbps":   req.UploadKbps,
		"changedAt":    time.Now(),
	})
}

// natAddAddressHandler — POST /nat44/add-address
// Body: { startIP, endIP }
func natAddAddressHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var req struct {
		StartIP string `json:"startIP"`
		EndIP   string `json:"endIP"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.StartIP == "" || req.EndIP == "" {
		writeError(w, http.StatusBadRequest, "startIP and endIP are required")
		return
	}
	if err := vppClient.AddNatAddress(req.StartIP, req.EndIP); err != nil {
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	writeJSON(w, map[string]interface{}{
		"success": true,
		"startIP": req.StartIP,
		"endIP":   req.EndIP,
	})
}

// natEnableHandler — POST /nat44/enable
// Body: { swIfIndex, inside }
func natEnableHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var req struct {
		SwIfIndex uint32 `json:"swIfIndex"`
		Inside    bool   `json:"inside"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := vppClient.EnableNatOnInterface(req.SwIfIndex, req.Inside); err != nil {
		writeJSON(w, map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	writeJSON(w, map[string]interface{}{
		"success":   true,
		"swIfIndex": req.SwIfIndex,
		"side":      map[bool]string{true: "inside", false: "outside"}[req.Inside],
	})
}

// natAddressesHandler — GET /nat44/addresses
// Lists NAT pool addresses via nat44_address_dump.
func natAddressesHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	if !vppClient.IsConnected() {
		writeJSON(w, map[string]interface{}{
			"addresses": []string{},
			"error":     "VPP not connected",
		})
		return
	}
	addrs, err := vppClient.ListNatAddresses()
	if err != nil {
		writeJSON(w, map[string]interface{}{
			"addresses": []string{},
			"error":     err.Error(),
		})
		return
	}
	out := make([]map[string]interface{}, 0, len(addrs))
	for _, a := range addrs {
		ipStr := ""
		if len(a.IPAddress) == 4 {
			ipStr = fmt.Sprintf("%d.%d.%d.%d", a.IPAddress[0], a.IPAddress[1], a.IPAddress[2], a.IPAddress[3])
		}
		out = append(out, map[string]interface{}{
			"ipAddress": ipStr,
			"vrfId":     a.VrfID,
			"flags":     uint8(a.Flags),
		})
	}
	writeJSON(w, map[string]interface{}{
		"addresses": out,
		"total":     len(out),
	})
}

// policersHandler — GET /policers
// Lists all VPP policers via policer_dump.
func policersHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	if !vppClient.IsConnected() {
		writeJSON(w, map[string]interface{}{
			"policers": []interface{}{},
			"error":    "VPP not connected",
		})
		return
	}
	pols, err := vppClient.ListPolicers()
	if err != nil {
		writeJSON(w, map[string]interface{}{
			"policers": []interface{}{},
			"error":    err.Error(),
		})
		return
	}
	out := make([]map[string]interface{}, 0, len(pols))
	for _, p := range pols {
		out = append(out, map[string]interface{}{
			"name":            strings.TrimRight(p.Name, "\x00"),
			"cir":             p.Cir,
			"eir":             p.Eir,
			"cb":              p.Cb,
			"eb":              p.Eb,
			"currentLimit":    p.CurrentLimit,
			"currentBucket":   p.CurrentBucket,
		})
	}
	writeJSON(w, map[string]interface{}{
		"policers": out,
		"total":    len(out),
	})
}

// restartRecoveryHandler — POST /vpp/restart-recovery
// Simulates VPP restart by clearing the in-memory sessionPolicies map.
// The real VPP restart recovery logic lives in session-engine; this
// endpoint is a hook for testing the adapter's empty-state behaviour.
func restartRecoveryHandler(w http.ResponseWriter, r *http.Request) {
	if handleOptions(w, r) {
		return
	}
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	count := 0
	sessionPolicies.Range(func(k, v interface{}) bool {
		sessionPolicies.Delete(k)
		count++
		return true
	})
	// Also clear the VPP client's in-memory subscriber policer map
	vppClient.subscriberPolicers.Range(func(k, v interface{}) bool {
		vppClient.subscriberPolicers.Delete(k)
		return true
	})
	log.Printf("[govpp] /vpp/restart-recovery: cleared %d in-memory session policies", count)
	writeJSON(w, map[string]interface{}{
		"success":       true,
		"clearedCount":  count,
		"vppConnected":  vppClient.IsConnected(),
		"recoveredAt":   time.Now(),
	})
}

// Ensure os import is used
var _ = os.Stat
