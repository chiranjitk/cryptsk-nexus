// ─── Module Registry ────────────────────────────────────────────
// Defines all available modules, their pages, and relationships.
// Core modules are always loaded; optional modules can be toggled.

export type ModuleCategory = "core" | "network" | "gateway" | "operations" | "finance" | "ai" | "communication" | "addon";

export interface ModulePage {
  label: string;       // Page label (matches sidebar + PAGE_MAP)
  section: string;     // Sidebar section group (e.g., "NETWORK", "GATEWAY")
  required?: boolean;  // If true, always shown when module is enabled
}

export interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;          // Lucide icon name
  category: ModuleCategory;
  version: string;
  pages: ModulePage[];
  dependencies: string[];  // Other module IDs required
  defaultEnabled: boolean;
  miniServices?: string[]; // Required mini-service names
  settings?: Record<string, unknown>;
}

// ─── All Module Definitions ────────────────────────────────────

export const MODULES: ModuleDefinition[] = [
  // ══════════════════════════════════════════════════════════════
  // CORE — Always loaded, cannot be disabled
  // ══════════════════════════════════════════════════════════════
  {
    id: "core",
    name: "Core Platform",
    description: "Essential platform features — Dashboard, Subscriber CRM, Plans, Billing, Payments, and System Settings",
    icon: "LayoutDashboard",
    category: "core",
    version: "1.0.0",
    defaultEnabled: true,
    pages: [
      { label: "Dashboard", section: "DASHBOARD", required: true },
      { label: "Subscribers", section: "SUBSCRIBERS", required: true },
      { label: "Plans", section: "SUBSCRIBERS", required: true },
      { label: "360° Customer View", section: "SUBSCRIBERS", required: true },
      { label: "Batch Provisioning", section: "SUBSCRIBERS", required: true },
      { label: "Billing", section: "OPERATIONS", required: true },
      { label: "Payments", section: "OPERATIONS", required: true },
      { label: "ISP Profile", section: "SETTINGS", required: true },
      { label: "Admin Users", section: "SETTINGS", required: true },
      { label: "Areas", section: "SETTINGS", required: true },
      { label: "Notifications", section: "SETTINGS", required: true },
      { label: "API Keys", section: "SETTINGS", required: true },
      { label: "Audit Log", section: "REPORTS", required: true },
      { label: "Automation Jobs", section: "SETTINGS", required: true },
      { label: "Backup", section: "SETTINGS", required: true },
      { label: "Integrations", section: "SETTINGS", required: true },
      { label: "Knowledge Base", section: "SETTINGS", required: true },
      { label: "Equipment", section: "SETTINGS", required: true },
      { label: "Promotions", section: "SETTINGS", required: true },
      { label: "Module Manager", section: "SETTINGS", required: true },
      { label: "Dashboard Widgets", section: "SETTINGS", required: true },
      { label: "System Health", section: "SETTINGS", required: true },
      { label: "VPP Gateway", section: "NETWORK", required: true },
    ],
    dependencies: [],
  },

  // ══════════════════════════════════════════════════════════════
  // NETWORK INFRASTRUCTURE
  // ══════════════════════════════════════════════════════════════
  {
    id: "network-infra",
    name: "Network Infrastructure",
    description: "Network device monitoring, bandwidth tracking, AAA/RADIUS authentication, FTTH/GPON, sessions, IPAM, and alerts",
    icon: "Network",
    category: "network",
    version: "1.0.0",
    defaultEnabled: true,
    pages: [
      { label: "NAS Clients", section: "NETWORK" },
      { label: "NAS Devices", section: "NETWORK" },
      { label: "Subnets (IPAM)", section: "NETWORK" },
      { label: "Bandwidth", section: "MONITORING" },
      { label: "FTTH/GPON", section: "NETWORK" },
      { label: "Active Sessions", section: "MONITORING" },
      { label: "Session History", section: "MONITORING" },
      { label: "Authentication Log", section: "MONITORING" },
      { label: "RADIUS Attributes", section: "SERVICES" },
      { label: "MultiWAN", section: "NETWORK" },
      { label: "Hotspot", section: "SERVICES" },
      { label: "Diagnostic Tools", section: "MONITORING" },
      { label: "BW Reports", section: "REPORTS" },
      { label: "Dynamic Routing", section: "NETWORK" },
      { label: "Network Health", section: "NETWORK" },
      { label: "RADIUS Proxy", section: "SERVICES" },
      { label: "Zone Budgets", section: "MONITORING" },
      { label: "Time Access", section: "POLICY" },
      { label: "IP-MAC History", section: "MONITORING" },
    ],
    dependencies: ["core"],
  },

  // ══════════════════════════════════════════════════════════════
  // SERVICES
  // ══════════════════════════════════════════════════════════════
  {
    id: "services",
    name: "Service Integrations",
    description: "TR-069 ACS, MikroTik Manager, SSH Device Manager, SNMP Manager, VPN Server, and monitoring tools",
    icon: "Shield",
    category: "addon",
    version: "1.0.0",
    defaultEnabled: true,
    pages: [
      { label: "TR-069 ACS", section: "SERVICES" },
      { label: "MikroTik Manager", section: "SERVICES" },
      { label: "SSH Device Manager", section: "SERVICES" },
      { label: "SNMP Manager", section: "SERVICES" },
      { label: "VPN Server", section: "POLICY" },
      { label: "Speed Test", section: "MONITORING" },
      { label: "Uptime Monitor", section: "MONITORING" },
      { label: "Syslog Server", section: "MONITORING" },
      { label: "Grafana Dashboards", section: "MONITORING" },
    ],
    dependencies: ["core", "network-infra"],
  },

  // ══════════════════════════════════════════════════════════════
  // GATEWAY
  // ══════════════════════════════════════════════════════════════
  {
    id: "gateway",
    name: "Gateway Controller",
    description: "Full gateway management — System interfaces, DHCP server, DNS server, Captive Portal, Firewall, Security, NAT logging, Bandwidth management",
    icon: "Server",
    category: "gateway",
    version: "1.0.0",
    defaultEnabled: true,
    pages: [
      { label: "Bandwidth Mgmt", section: "POLICY", required: true },
      { label: "System Interfaces", section: "NETWORK" },
      { label: "PPPoE Server", section: "NETWORK" },
      { label: "DHCP Server", section: "NETWORK" },
      { label: "DNS Server", section: "NETWORK" },
      { label: "Captive Portal", section: "NETWORK" },
      { label: "Firewall Rules", section: "POLICY" },
      { label: "Security Profiles", section: "POLICY" },
      { label: "NAT Logs", section: "MONITORING" },
      { label: "DDoS Protection", section: "POLICY" },
    ],
    dependencies: ["core", "network-infra"],
    miniServices: ["gateway-service"],
  },

  // ══════════════════════════════════════════════════════════════
  // IPS — Intrusion Prevention System
  // ══════════════════════════════════════════════════════════════
  {
    id: "ips",
    name: "IPS / Anomaly Detection",
    description: "Intrusion Prevention System — port scan detection, DDoS mitigation, brute force blocking, threat scoring, auto-block with nftables",
    icon: "ScanEye",
    category: "addon",
    version: "1.0.0",
    defaultEnabled: true,
    pages: [
      { label: "IPS / Anomaly Detection", section: "POLICY" },
    ],
    dependencies: ["core", "gateway"],
    miniServices: ["ips-daemon"],
  },

  // ══════════════════════════════════════════════════════════════
  // APP AWARENESS — nDPI L7 Application Detection
  // ══════════════════════════════════════════════════════════════
  {
    id: "app-awareness",
    name: "Application Awareness",
    description: "L7 application detection with nDPI — per-subscriber app usage (YouTube, Netflix, TikTok), application-wise QoS rules, block/limit by app, nftables mark-based filtering",
    icon: "Eye",
    category: "addon",
    version: "1.0.0",
    defaultEnabled: true,
    pages: [
      { label: "App Awareness", section: "MONITORING" },
    ],
    dependencies: ["core", "network-infra"],
    miniServices: ["ndpi-service"],
  },

  // ══════════════════════════════════════════════════════════════
  // TRAFFIC ANALYTICS — Deep traffic insights
  // ══════════════════════════════════════════════════════════════
  {
    id: "traffic-analytics",
    name: "Traffic Analytics",
    description: "Deep traffic analysis — top talkers, protocol distribution, geographic traffic, per-interface utilization, 24h trends",
    icon: "BarChartBig",
    category: "addon",
    version: "1.0.0",
    defaultEnabled: true,
    pages: [
      { label: "Traffic Analytics", section: "MONITORING" },
    ],
    dependencies: ["core", "network-infra"],
  },

  // ══════════════════════════════════════════════════════════════
  // QoS MONITOR — Queue & traffic shaping monitoring
  // ══════════════════════════════════════════════════════════════
  {
    id: "qos-monitor",
    name: "QoS Monitor",
    description: "QoS queue monitoring — queue statistics, congestion heatmap, traffic class breakdown, shaping events, real-time utilization",
    icon: "Gauge",
    category: "addon",
    version: "1.0.0",
    defaultEnabled: true,
    pages: [
      { label: "QoS Monitor", section: "POLICY" },
    ],
    dependencies: ["core", "network-infra", "gateway"],
  },

  // ══════════════════════════════════════════════════════════════
  // LATENCY MONITOR — Network quality monitoring
  // ══════════════════════════════════════════════════════════════
  {
    id: "latency-monitor",
    name: "Latency/Jitter Monitor",
    description: "Network quality monitoring — link health, latency/jitter tracking, packet loss, threshold alerts, 24h timeline, event history",
    icon: "Timer",
    category: "addon",
    version: "1.0.0",
    defaultEnabled: true,
    pages: [
      { label: "Latency Monitor", section: "MONITORING" },
    ],
    dependencies: ["core", "network-infra"],
  },

  // ══════════════════════════════════════════════════════════════
  // IPv6 SUPPORT — DHCPv6, Prefix Delegation, Dual-Stack
  // ══════════════════════════════════════════════════════════════
  {
    id: "ipv6",
    name: "IPv6 Support",
    description: "Full IPv6 support — DHCPv6 server, prefix delegation (IA_PD), SLAAC/DHCPv6 hybrid, RA configuration, dual-stack management",
    icon: "Globe",
    category: "network",
    version: "1.0.0",
    defaultEnabled: false,
    pages: [
      { label: "DHCPv6 Server", section: "NETWORK" },
    ],
    dependencies: ["core", "gateway"],
  },

  // ══════════════════════════════════════════════════════════════
  // ENTERPRISE AUTH — AD/LDAP Authentication
  // ══════════════════════════════════════════════════════════════
  {
    id: "enterprise-ldap",
    name: "Enterprise Authentication",
    description: "Enterprise subscriber AD/LDAP authentication — per-company LDAP config, employee session management, per-user bandwidth & quota tracking",
    icon: "Building2",
    category: "addon",
    version: "1.0.0",
    defaultEnabled: false,
    pages: [
      { label: "Enterprise Auth", section: "SERVICES" },
    ],
    dependencies: ["core", "network-infra", "services"],
  },

  // ══════════════════════════════════════════════════════════════
  // FIELD OPERATIONS
  // ══════════════════════════════════════════════════════════════
  {
    id: "field-ops",
    name: "Field Operations",
    description: "Complaints & support tickets, technician dispatch, agents, installations scheduling, equipment/inventory management",
    icon: "Wrench",
    category: "operations",
    version: "1.0.0",
    defaultEnabled: true,
    pages: [
      { label: "Complaints", section: "OPERATIONS" },
      { label: "Technicians", section: "OPERATIONS" },
      { label: "Agents", section: "OPERATIONS" },
      { label: "Installations", section: "OPERATIONS" },
      { label: "Inventory", section: "OPERATIONS" },
      { label: "Incidents", section: "OPERATIONS" },
      { label: "Equipment", section: "SETTINGS" },
      { label: "Batch Provisioning", section: "OPERATIONS" },
      { label: "Action History", section: "OPERATIONS" },
      { label: "Tech Performance", section: "REPORTS" },
      { label: "360° Customer View", section: "SUBSCRIBERS" },
      { label: "CoA Tracking", section: "SERVICES" },
    ],
    dependencies: ["core"],
  },

  // ══════════════════════════════════════════════════════════════
  // FINANCE
  // ══════════════════════════════════════════════════════════════
  {
    id: "finance",
    name: "Finance Suite",
    description: "Invoicing, payment collection, revenue reports, GST/Tax compliance, due recovery, promotions, referrals, and reseller management",
    icon: "DollarSign",
    category: "finance",
    version: "1.0.0",
    defaultEnabled: true,
    pages: [
      { label: "Invoices", section: "OPERATIONS" },
      { label: "Vouchers", section: "OPERATIONS" },
      { label: "Announcements", section: "OPERATIONS" },
      { label: "Revenue Reports", section: "REPORTS" },
      { label: "Collection", section: "REPORTS" },
      { label: "Due Recovery", section: "REPORTS" },
      { label: "GST/Tax", section: "REPORTS" },
      { label: "Referral", section: "FINANCE" },
      { label: "Promotions", section: "SETTINGS" },
      { label: "Leads", section: "OPERATIONS" },
      { label: "Reseller", section: "OPERATIONS" },
      { label: "Reports", section: "REPORTS" },
      { label: "Invoice Register", section: "REPORTS" },
      { label: "AR Aging", section: "REPORTS" },
      { label: "Subscriber Lifecycle Report", section: "REPORTS" },
      { label: "Statement of Account", section: "REPORTS" },
      { label: "Collection Register", section: "REPORTS" },
      { label: "Expiry & Renewal", section: "REPORTS" },
      { label: "Side Revenue", section: "REPORTS" },
      { label: "Plan & Area MIS", section: "REPORTS" },
      { label: "Report Snapshots", section: "REPORTS" },
      { label: "Charge Override", section: "FINANCE" },
      { label: "Cyclic Billing", section: "FINANCE" },
      { label: "Grace Periods", section: "FINANCE" },
      { label: "Add-on Services", section: "FINANCE" },
      { label: "Top-Ups", section: "FINANCE" },
      { label: "Smart Collections", section: "REPORTS" },
      { label: "Revenue Leakage", section: "REPORTS" },
      { label: "Compliance & SLA", section: "REPORTS" },
      { label: "Data Export", section: "REPORTS" },
      { label: "Reseller Intelligence", section: "REPORTS" },
      { label: "Revenue Forecast", section: "REPORTS" },
      { label: "Loyalty Gamification", section: "FINANCE" },
    ],
    dependencies: ["core"],
  },

  // ══════════════════════════════════════════════════════════════
  // AI INTELLIGENCE — Voice Assistant + AI features
  // ══════════════════════════════════════════════════════════════
  {
    id: "voice-assistant",
    name: "Voice Assistant",
    description: "AI-powered voice and chat assistant — speak or type commands to navigate, query data, and control your ISP platform",
    icon: "Mic",
    category: "ai",
    version: "1.0.0",
    defaultEnabled: true,
    pages: [],
    dependencies: ["core"],
  },

  // ══════════════════════════════════════════════════════════════
  // WiFi OFFLOAD — Seamless carrier-grade WiFi offload with Diameter
  // ══════════════════════════════════════════════════════════════
  {
    id: "wifi-offload",
    name: "WiFi Offload",
    description: "Seamless carrier-grade WiFi Offload — Diameter Gy/Gx/SWa simulation, EAP-AKA auth, credit control, QoS policy push, built-in PCRF/OCS/HSS simulators, load testing",
    icon: "Radio",
    category: "network",
    version: "1.0.0",
    defaultEnabled: false,
    pages: [
      { label: "WiFi Offload", section: "SERVICES" },
    ],
    dependencies: ["core", "network-infra"],
    miniServices: ["diameter-service"],
  },

  {
    id: "ai-intelligence",
    name: "AI Intelligence",
    description: "AI Advisor chatbot, AI network diagnosis, churn prediction, competitor intelligence, and WhatsApp automation",
    icon: "Brain",
    category: "ai",
    version: "1.0.0",
    defaultEnabled: true,
    pages: [
      { label: "AI Advisor", section: "AI INTELLIGENCE" },
      { label: "AI Diagnosis", section: "AI INTELLIGENCE" },
      { label: "Churn Alerts", section: "AI INTELLIGENCE" },
      { label: "Competitor Intel", section: "AI INTELLIGENCE" },
      { label: "WhatsApp Bot", section: "AI INTELLIGENCE" },
      { label: "Churn Prediction", section: "REPORTS" },
      { label: "Competitor Analysis", section: "REPORTS" },
    ],
    dependencies: ["core"],
  },

  // ══════════════════════════════════════════════════════════════
  // INTEGRATIONS — Payment / SMS / Email / WhatsApp-Push / Webhooks / Logs
  // (split out of Settings → Integrations into a dedicated module)
  // ══════════════════════════════════════════════════════════════
  {
    id: "integrations",
    name: "Integrations Hub",
    description: "Dedicated integrations module — Payment Gateways (Razorpay, PhonePe, Stripe…), SMS Gateway (MSG91), Email/SMTP, WhatsApp & Push (FCM), Webhooks, and global integration logs",
    icon: "PlugZap",
    category: "communication",
    version: "1.0.0",
    defaultEnabled: true,
    pages: [
      { label: "Payment Gateways", section: "INTEGRATIONS", required: true },
      { label: "SMS Gateway", section: "INTEGRATIONS" },
      { label: "Email Gateway", section: "INTEGRATIONS" },
      { label: "WhatsApp & Push", section: "INTEGRATIONS" },
      { label: "Webhooks", section: "INTEGRATIONS" },
      { label: "Integration Logs", section: "INTEGRATIONS" },
    ],
    dependencies: ["core"],
  },

  // ══════════════════════════════════════════════════════════════
  // ALERT MANAGEMENT — Center, Live Alerts, Rules, Suppressions,
  // History, Notification Rules (split out of Network Alerts page)
  // ══════════════════════════════════════════════════════════════
  {
    id: "alert-management",
    name: "Alert Management",
    description: "Dedicated alert operations — Alert Center dashboard, live network alert stream, alert rules engine, suppressions, alert history with export, and notification routing rules",
    icon: "BellRing",
    category: "operations",
    version: "1.0.0",
    defaultEnabled: true,
    pages: [
      { label: "Alert Center", section: "ALERT MANAGEMENT", required: true },
      { label: "Live Alerts", section: "ALERT MANAGEMENT", required: true },
      { label: "Alert Rules", section: "ALERT MANAGEMENT" },
      { label: "Suppressions", section: "ALERT MANAGEMENT" },
      { label: "Alert History", section: "ALERT MANAGEMENT" },
      { label: "Notification Rules", section: "ALERT MANAGEMENT" },
    ],
    dependencies: ["core"],
  },

  // ══════════════════════════════════════════════════════════════
  // PARTNER MANAGEMENT — ISP → Distribution Hub → Partner → Subscriber
  // ══════════════════════════════════════════════════════════════
  {
    id: "partner-management",
    name: "Partner Management",
    description: "Multi-tier partner hierarchy — Distribution Hubs, Partners, Partner Users with scoped RBAC, partner-wise billing/reports/IP pools/captive portal mapping",
    icon: "Handshake",
    category: "core",
    version: "1.0.0",
    defaultEnabled: true,
    pages: [
      { label: "Distribution Hubs", section: "PARTNER MANAGEMENT", required: true },
      { label: "Partners", section: "PARTNER MANAGEMENT", required: true },
      { label: "Partner Users", section: "PARTNER MANAGEMENT" },
      { label: "Partner Reports", section: "REPORTS" },
    ],
    dependencies: ["core"],
  },
];

// ─── Helpers ──────────────────────────────────────────────────

export function getModule(id: string): ModuleDefinition | undefined {
  return MODULES.find((m) => m.id === id);
}

export function getEnabledPages(enabledModules: string[]): ModulePage[] {
  return MODULES.filter((m) => enabledModules.includes(m.id)).flatMap((m) => m.pages);
}

export function getEnabledSections(enabledModules: string[]): string[] {
  const pages = getEnabledPages(enabledModules);
  return [...new Set(pages.map((p) => p.section))];
}

export function isPageEnabled(pageLabel: string, enabledModules: string[]): boolean {
  const pages = getEnabledPages(enabledModules);
  return pages.some((p) => p.label === pageLabel);
}

export function getSectionPages(section: string, enabledModules: string[]): ModulePage[] {
  return getEnabledPages(enabledModules).filter((p) => p.section === section);
}

export function getModulesForSection(section: string, enabledModules: string[]): string[] {
  return MODULES.filter((m) =>
    enabledModules.includes(m.id) && m.pages.some((p) => p.section === section)
  ).map((m) => m.id);
}

export function getDefaultEnabledModules(): string[] {
  return MODULES.filter((m) => m.defaultEnabled).map((m) => m.id);
}

export function checkDependencies(moduleId: string, enabledModules: string[]): { met: boolean; missing: string[] } {
  const mod = getModule(moduleId);
  if (!mod) return { met: false, missing: [moduleId] };
  const missing = mod.dependencies.filter((d) => !enabledModules.includes(d));
  return { met: missing.length === 0, missing };
}

export type DeploymentPreset = "isp" | "education" | "hospital" | "hotel" | "campus" | "enterprise" | "full";

export interface PresetConfig {
  id: DeploymentPreset;
  name: string;
  description: string;
  icon: string;
  enabledModules: string[];
}

export const DEPLOYMENT_PRESETS: PresetConfig[] = [
  {
    id: "isp",
    name: "ISP / WISP",
    description: "Full ISP management with network infrastructure, gateway, and all operational features",
    icon: "Radio",
    enabledModules: ["core", "network-infra", "services", "gateway", "ips", "app-awareness", "traffic-analytics", "qos-monitor", "latency-monitor", "field-ops", "finance", "ai-intelligence", "voice-assistant", "integrations", "alert-management"],
  },
  {
    id: "education",
    name: "Education / Campus",
    description: "Campus network management for schools, colleges, and universities with student-friendly controls",
    icon: "GraduationCap",
    enabledModules: ["core", "network-infra", "services", "gateway", "field-ops", "finance"],
  },
  {
    id: "hospital",
    name: "Hospital / Healthcare",
    description: "Healthcare network management with IoT device support, department segmentation, and compliance logging",
    icon: "Heart",
    enabledModules: ["core", "network-infra", "services", "gateway", "field-ops", "finance"],
  },
  {
    id: "hotel",
    name: "Hotel / Hospitality",
    description: "Guest WiFi management with captive portal, voucher system, and per-room billing",
    icon: "Building",
    enabledModules: ["core", "network-infra", "services", "gateway", "field-ops", "finance"],
  },
  {
    id: "campus",
    name: "Corporate Campus",
    description: "Enterprise campus network with advanced security, firewall, and bandwidth management",
    icon: "Building2",
    enabledModules: ["core", "network-infra", "gateway", "field-ops", "finance"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Core CRM, billing, and operations without network infrastructure (for managed service providers)",
    icon: "Briefcase",
    enabledModules: ["core", "field-ops", "finance", "ai-intelligence", "services", "integrations", "alert-management"],
  },
  {
    id: "full",
    name: "Full Platform",
    description: "All modules enabled — complete platform with every feature available",
    icon: "Layers",
    enabledModules: MODULES.map((m) => m.id),
  },
];
