// ─── Voice Command Registry ────────────────────────────────────
// Maps page routes with keywords for LLM context parsing

export interface VoiceCommand {
  label: string;
  section: string;
  route: string;
  keywords: string[];
}

export const VOICE_COMMANDS: VoiceCommand[] = [
  // MAIN
  { label: "Dashboard", section: "MAIN", route: "/?page=dashboard", keywords: ["dashboard", "home", "overview", "main", "summary", "stats"] },
  { label: "Subscribers", section: "MAIN", route: "/?page=subscribers", keywords: ["subscriber", "customer", "client", "user", "users", "subscribers"] },
  { label: "Plans", section: "MAIN", route: "/?page=plans", keywords: ["plan", "package", "subscription", "plans", "tariff", "scheme"] },
  { label: "Billing", section: "MAIN", route: "/?page=billing", keywords: ["billing", "bill", "invoice", "charge", "payment history"] },
  { label: "Payments", section: "MAIN", route: "/?page=payments", keywords: ["payment", "pay", "transaction", "receipt", "payments", "collect"] },

  // NETWORK
  { label: "Devices", section: "NETWORK", route: "/?page=devices", keywords: ["device", "router", "switch", "ap", "access point", "devices", "hardware"] },
  { label: "Bandwidth", section: "NETWORK", route: "/?page=bandwidth", keywords: ["bandwidth", "speed", "throughput", "traffic", "usage", "data usage"] },
  { label: "AAA/RADIUS", section: "NETWORK", route: "/?page=aaa-radius", keywords: ["radius", "aaa", "authentication", "auth", "radius server"] },
  { label: "FTTH/GPON", section: "NETWORK", route: "/?page=ftth-gpon", keywords: ["ftth", "gpon", "fiber", "ont", "olt", "pon", "fiber optic"] },
  { label: "Sessions", section: "NETWORK", route: "/?page=sessions", keywords: ["session", "active session", "online user", "pppoe session", "login session"] },
  { label: "MultiWAN", section: "NETWORK", route: "/?page=multiwan", keywords: ["multiwan", "wan", "load balance", "failover", "multi wan", "internet link"] },
  { label: "IPAM", section: "NETWORK", route: "/?page=ipam", keywords: ["ipam", "ip address", "ip pool", "subnet", "ip management", "address plan"] },
  { label: "Network Alerts", section: "NETWORK", route: "/?page=network-alerts", keywords: ["alert", "alarm", "notification", "network alert", "warning", "threshold"] },
  { label: "Hotspot", section: "NETWORK", route: "/?page=hotspot", keywords: ["hotspot", "wifi", "captive", "guest wifi", "login page", "wifi portal"] },
  { label: "Diagnostic Tools", section: "NETWORK", route: "/?page=diagnostic-tools", keywords: ["diagnostic", "ping", "traceroute", "dns lookup", "tool", "debug", "troubleshoot"] },
  { label: "BW Reports", section: "NETWORK", route: "/?page=bw-reports", keywords: ["bandwidth report", "traffic report", "usage report", "bw report", "data report"] },
  { label: "Dynamic Routing", section: "NETWORK", route: "/?page=dynamic-routing", keywords: ["routing", "bgp", "ospf", "rip", "dynamic routing", "frr", "protocol"] },

  // GATEWAY
  { label: "Bandwidth Mgmt", section: "GATEWAY", route: "/?page=bandwidth-mgmt", keywords: ["bandwidth management", "qos", "traffic shaping", "tc", "queue", "limit", "throttle"] },
  { label: "System Interfaces", section: "GATEWAY", route: "/?page=system-interfaces", keywords: ["interface", "eth", "vlan", "bridge", "bond", "nic", "lan port", "network interface"] },
  { label: "PPPoE Server", section: "GATEWAY", route: "/?page=pppoe-server", keywords: ["pppoe", "ppp server", "dialup", "broadband server", "accel ppp"] },
  { label: "DHCP Server", section: "GATEWAY", route: "/?page=dhcp-server", keywords: ["dhcp", "dhcp server", "lease", "ip assignment", "dnsmasq", "kea"] },
  { label: "DNS Server", section: "GATEWAY", route: "/?page=dns-server", keywords: ["dns", "dns server", "domain", "resolver", "record", "forwarding"] },
  { label: "Captive Portal", section: "GATEWAY", route: "/?page=captive-portal", keywords: ["captive portal", "redirect", "guest access", "splash page", "login portal"] },
  { label: "Firewall Rules", section: "SECURITY", route: "/?page=firewall-rules", keywords: ["firewall", "rule", "filter", "block", "allow", "iptables", "nftables", "security rule"] },
  { label: "Security Profiles", section: "SECURITY", route: "/?page=security-profiles", keywords: ["security profile", "ips", "ids", "intrusion", "threat", "security policy"] },
  { label: "NAT Logs", section: "SECURITY", route: "/?page=nat-logs", keywords: ["nat", "nat log", "connection tracking", "conntrack", "nat table"] },
  { label: "DDoS Protection", section: "SECURITY", route: "/?page=ddos-protection", keywords: ["ddos", "dos", "flood", "attack", "protection", "mitigation"] },

  // SERVICES
  { label: "TR-069 ACS", section: "SERVICES", route: "/?page=tr069-acs", keywords: ["tr069", "acs", "cpe", "provisioning", "auto config", "genieacs", "cwmp"] },
  { label: "MikroTik Manager", section: "SERVICES", route: "/?page=mikrotik-manager", keywords: ["mikrotik", "routeros", "mikrotik manager", "router board"] },
  { label: "SSH Device Manager", section: "SERVICES", route: "/?page=ssh-device-manager", keywords: ["ssh", "remote", "terminal", "ssh manager", "device console"] },
  { label: "SNMP Manager", section: "SERVICES", route: "/?page=snmp-manager", keywords: ["snmp", "mib", "oid", "snmp manager", "monitoring protocol"] },
  { label: "VPN Server", section: "SECURITY", route: "/?page=vpn-server", keywords: ["vpn", "wireguard", "ipsec", "tunnel", "vpn server", "strongswan"] },
  { label: "Speed Test", section: "MONITORING", route: "/?page=speed-test", keywords: ["speed test", "speedtest", "speed check", "bandwidth test", "ookla"] },
  { label: "Uptime Monitor", section: "MONITORING", route: "/?page=uptime-monitor", keywords: ["uptime", "monitor", "monitoring", "availability", "health check", "ping monitor"] },
  { label: "Syslog Server", section: "MONITORING", route: "/?page=syslog-server", keywords: ["syslog", "log", "log server", "system log", "event log"] },
  { label: "Grafana Dashboards", section: "MONITORING", route: "/?page=grafana-dashboards", keywords: ["grafana", "dashboard", "graph", "chart", "visualization", "metrics"] },

  // OPERATIONS
  { label: "Complaints", section: "OPERATIONS", route: "/?page=complaints", keywords: ["complaint", "ticket", "support", "issue", "problem", "trouble"] },
  { label: "Technicians", section: "OPERATIONS", route: "/?page=technicians", keywords: ["technician", "engineer", "staff", "field worker", "tech"] },
  { label: "Agents", section: "OPERATIONS", route: "/?page=agents", keywords: ["agent", "dealer", "distributor", "reseller agent", "franchise"] },
  { label: "Installations", section: "OPERATIONS", route: "/?page=installations", keywords: ["installation", "setup", "new connection", "activation", "provisioning"] },
  { label: "Inventory", section: "OPERATIONS", route: "/?page=inventory", keywords: ["inventory", "stock", "warehouse", "equipment", "spare", "supply"] },
  { label: "Incidents", section: "OPERATIONS", route: "/?page=incidents", keywords: ["incident", "outage", "downtime", "fault", "emergency", "network down"] },
  { label: "Equipment", section: "OPERATIONS", route: "/?page=operations-equipment", keywords: ["equipment", "device inventory", "onu", "router", "cpe stock"] },

  // FINANCE
  { label: "Invoices", section: "FINANCE", route: "/?page=invoices", keywords: ["invoice", "invoicing", "bill generate", "receipt", "invoice list"] },
  { label: "Vouchers", section: "FINANCE", route: "/?page=vouchers", keywords: ["voucher", "coupon", "scratch card", "topup", "recharge code"] },
  { label: "Revenue Reports", section: "FINANCE", route: "/?page=revenue-reports", keywords: ["revenue", "income", "earnings", "profit", "revenue report", "financial"] },
  { label: "Collection", section: "FINANCE", route: "/?page=collection", keywords: ["collection", "due collect", "payment collect", "cash collection", "billing collect"] },
  { label: "Due Recovery", section: "FINANCE", route: "/?page=due-recovery", keywords: ["due recovery", "overdue", "pending payment", "outstanding", "arrears", "recovery"] },
  { label: "GST/Tax", section: "FINANCE", route: "/?page=gst-tax", keywords: ["gst", "tax", "vat", "gstin", "tax report", "tax filing"] },
  { label: "Referral", section: "FINANCE", route: "/?page=referral", keywords: ["referral", "refer", "reward", "commission", "referral program"] },
  { label: "Promotions", section: "FINANCE", route: "/?page=promotions", keywords: ["promotion", "offer", "discount", "campaign", "deal", "special offer"] },
  { label: "Leads", section: "FINANCE", route: "/?page=leads", keywords: ["lead", "prospect", "enquiry", "new customer", "lead management"] },
  { label: "Reseller", section: "FINANCE", route: "/?page=reseller", keywords: ["reseller", "wholesale", "bulk", "partner", "reseller management"] },
  { label: "Reports", section: "FINANCE", route: "/?page=reports", keywords: ["report", "analytics", "statistics", "data analysis", "business report"] },

  // AI INTELLIGENCE
  { label: "AI Advisor", section: "AI INTELLIGENCE", route: "/?page=ai-advisor", keywords: ["ai", "advisor", "assistant", "chatbot", "ai help", "ai chat"] },
  { label: "AI Diagnosis", section: "AI INTELLIGENCE", route: "/?page=ai-diagnosis", keywords: ["ai diagnosis", "auto diagnose", "ai detect", "ai troubleshoot", "network diagnosis"] },
  { label: "Churn Alerts", section: "AI INTELLIGENCE", route: "/?page=churn-alerts", keywords: ["churn", "attrition", "customer leaving", "churn prediction", "retention"] },
  { label: "Competitor Intel", section: "AI INTELLIGENCE", route: "/?page=competitor-intel", keywords: ["competitor", "competition", "market", "rival", "competitor analysis"] },
  { label: "WhatsApp Bot", section: "AI INTELLIGENCE", route: "/?page=whatsapp-bot", keywords: ["whatsapp", "bot", "chat bot", "messaging", "wa bot"] },

  // SETTINGS
  { label: "ISP Profile", section: "SETTINGS", route: "/?page=isp-profile", keywords: ["isp profile", "company", "settings", "organization", "branding", "company info"] },
  { label: "Users", section: "SETTINGS", route: "/?page=users", keywords: ["user", "admin", "staff", "user management", "account", "role"] },
  { label: "Areas", section: "SETTINGS", route: "/?page=areas", keywords: ["area", "zone", "region", "coverage", "area management", "location"] },
  { label: "Module Manager", section: "SETTINGS", route: "/?page=module-manager", keywords: ["module", "feature", "enable", "disable", "module manager", "plugin"] },
];

/** Build system prompt for LLM command parsing */
export function buildCommandSystemPrompt(): string {
  const commandList = VOICE_COMMANDS.map(
    (cmd) => `- "${cmd.label}" (section: ${cmd.section}, route: ${cmd.route}, keywords: ${cmd.keywords.join(", ")})`
  ).join("\n");

  return `You are an ISP platform voice assistant command parser. The user will speak or type a command, and you must determine what page or action they want.

Available pages and routes:
 ${commandList}

Respond in JSON format ONLY:
{
  "action": "navigate",
  "route": "/?page=<page_id>",
  "label": "<Page Name>",
  "description": "<brief description of what you're doing>"
}

If the user asks a general question (not navigation), respond with:
{
  "action": "chat",
  "message": "<your helpful response>"
}

If you cannot understand the command:
{
  "action": "unknown",
  "message": "I didn't understand that. Try saying something like 'show dashboard' or 'open subscribers'."
}

Rules:
- Match keywords loosely — users speak casually
- Prefer navigation actions when possible
- Be concise in descriptions
- Return ONLY valid JSON, no markdown or code blocks`;
}