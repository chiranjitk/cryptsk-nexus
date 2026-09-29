// ─── Single Source of Truth for Navigation ────────────────────────
// Both desktop sidebar and mobile sidebar import from here.
// NEVER maintain separate nav lists — it causes drift and mismatches.
//
// Architecture: Pure OSS/BSS + Internet Gateway (like 24online / Hight8)
// FreeRADIUS is backend AAA — NOT exposed in GUI.
// Subscriber profile = RADIUS user. Plan = RADIUS group.
// All provisioning happens through Subscriber/Plan management.

import {
  LayoutDashboard,
  Users,
  CreditCard,
  Receipt,
  Wallet,
  Router,
  Activity,
  Network,
  AlertTriangle,
  Wrench,
  UserCog,
  PackagePlus,
  Boxes,
  FileText,
  Ticket,
  TrendingUp,
  HandCoins,
  Brain,
  Stethoscope,
  AlertCircle,
  Radar,
  MessageCircle,
  Building2,
  UserCircle,
  MapPin,
  HardHat,
  Megaphone,
  Layers,
  Bell,
  KeyRound,
  ScrollText,
  Server,
  Shield,
  ShieldAlert,
  FileSpreadsheet,
  Gauge,
  Cable,
  BarChart3,
  Terminal as TerminalIcon,
  BrainCircuit,
  RefreshCw,
  RotateCcw,
  Clock,
  PlusCircle,
  PieChart,
  Sliders,
  Lock,
  Zap,
  Radio,
  RadioTower,
  Eye,
  Scroll,
  MonitorSmartphone,
  FileSearch,
  ClipboardList,
  ScanEye,
  Timer,
  Target,
  GitCompare,
  ShieldCheck as ShieldCheckIcon,
  History,
  MonitorDot,
  Siren,
  Heart,
  Trophy,
  UserPlus,
  Handshake,
  DollarSign,
  Calculator,
  Gift,
  DatabaseBackup,
  Plug,
  BookOpen,
  Globe,
  MapPinned,
  Wifi,
} from "lucide-react";

import type { NavGroup } from "@/types";

export const navGroups: NavGroup[] = [
  // ══════════════════════════════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════════════════════════════
  {
    id: "DASHBOARD",
    label: "DASHBOARD",
    defaultOpen: true,
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // SUBSCRIBERS — The core user management (creates RADIUS entries
  // behind the scenes. Subscriber = RADIUS user, Plan = RADIUS group.)
  // ══════════════════════════════════════════════════════════════
  {
    id: "SUBSCRIBERS",
    label: "SUBSCRIBERS",
    defaultOpen: true,
    items: [
      { label: "Subscribers", href: "/subscribers", icon: Users },
      { label: "Plans", href: "/plans", icon: CreditCard },
      { label: "360° Customer View", href: "/subscriber-360", icon: Eye },
      { label: "Batch Provisioning", href: "/batch-provisioning", icon: UserPlus },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // NETWORK — Infrastructure (NAS, IPAM, DHCP, DNS, routing)
  // ══════════════════════════════════════════════════════════════
  {
    id: "NETWORK",
    label: "NETWORK",
    defaultOpen: true,
    items: [
      { label: "NAS Clients", href: "/nas-clients", icon: RadioTower },
      { label: "NAS Devices", href: "/nas-devices", icon: Server },
      { label: "Subnets (IPAM)", href: "/ipam", icon: MapPinned },
      { label: "System Interfaces", href: "/system-interfaces", icon: Cable },
      { label: "DHCP Server", href: "/dhcp", icon: Server },
      { label: "DNS Server", href: "/dns", icon: Globe },
      { label: "PPPoE Server", href: "/pppoe-server", icon: Cable },
      { label: "Captive Portal", href: "/captive-portal", icon: Lock },
      { label: "MultiWAN", href: "/multiwan", icon: Globe },
      { label: "Dynamic Routing", href: "/dynamic-routing", icon: Network },
      { label: "FTTH/GPON", href: "/ftth-gpon", icon: Network },
      { label: "Network Health", href: "/network-health", icon: Heart },
      { label: "DHCPv6 Server", href: "/dhcpv6", icon: Globe },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // POLICY — Bandwidth, firewall, security controls
  // ══════════════════════════════════════════════════════════════
  {
    id: "POLICY",
    label: "POLICY",
    defaultOpen: true,
    items: [
      { label: "Bandwidth Mgmt", href: "/bandwidth-mgmt", icon: Gauge },
      { label: "Time Access", href: "/time-access", icon: Timer },
      { label: "QoS Monitor", href: "/qos-monitor", icon: Gauge },
      { label: "Firewall Rules", href: "/firewall", icon: ShieldAlert },
      { label: "IPS / Anomaly Detection", href: "/ips", icon: ScanEye },
      { label: "DDoS Protection", href: "/ddos-protection", icon: ShieldAlert },
      { label: "VPN Server", href: "/vpn-server", icon: Lock },
      { label: "Security Profiles", href: "/security", icon: Shield },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // MONITORING — Live sessions, bandwidth, traffic, alerts
  // (Active Sessions / Auth Log are here — they're operational
  // views of the RADIUS backend, not user management.)
  // ══════════════════════════════════════════════════════════════
  {
    id: "MONITORING",
    label: "MONITORING",
    defaultOpen: false,
    items: [
      { label: "Active Sessions", href: "/sessions", icon: MonitorDot },
      { label: "Session History", href: "/session-history", icon: History },
      { label: "Authentication Log", href: "/auth-log", icon: Shield },
      { label: "Bandwidth", href: "/bandwidth", icon: Activity },
      { label: "Traffic Analytics", href: "/traffic-analytics", icon: BarChart3 },
      { label: "BW Reports", href: "/bw-reports", icon: BarChart3 },
      { label: "App Awareness", href: "/app-awareness", icon: ScanEye },
      { label: "Uptime Monitor", href: "/uptime-monitor", icon: Eye },
      { label: "Latency Monitor", href: "/latency-monitor", icon: Timer },
      { label: "Speed Test", href: "/speed-test", icon: Zap },
      { label: "Syslog Server", href: "/syslog-server", icon: Scroll },
      { label: "Diagnostic Tools", href: "/diagnostic-tools", icon: TerminalIcon },
      { label: "IP-MAC History", href: "/ip-mac-history", icon: FileSearch },
      { label: "Zone Budgets", href: "/zone-budgets", icon: PieChart },
      { label: "NAT Logs", href: "/nat-logs", icon: FileSearch },
      { label: "Network Alerts", href: "/network-alerts", icon: Siren },
      { label: "Grafana Dashboards", href: "/grafana-dashboards", icon: BarChart3 },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // SERVICES — Device management, TR-069, SNMP, enterprise
  // ══════════════════════════════════════════════════════════════
  {
    id: "SERVICES",
    label: "SERVICES",
    defaultOpen: false,
    items: [
      { label: "TR-069 ACS", href: "/tr069-acs", icon: MonitorSmartphone },
      { label: "MikroTik Manager", href: "/mikrotik-manager", icon: Router },
      { label: "SSH Device Manager", href: "/ssh-device-manager", icon: TerminalIcon },
      { label: "SNMP Manager", href: "/snmp-manager", icon: Activity },
      { label: "RADIUS Proxy", href: "/radius-proxy", icon: Radio },
      { label: "RADIUS Attributes", href: "/radius-attributes", icon: Sliders },
      { label: "Enterprise Auth", href: "/enterprise-auth", icon: Building2 },
      { label: "WiFi Offload", href: "/wifi-offload", icon: Radio },
      { label: "Hotspot", href: "/hotspot", icon: Wifi },
      { label: "Tech Performance", href: "/technician-performance", icon: Trophy },
      { label: "CoA Tracking", href: "/coa-tracking", icon: RefreshCw },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // OPERATIONS — Billing, complaints, field work, CRM
  // ══════════════════════════════════════════════════════════════
  {
    id: "OPERATIONS",
    label: "OPERATIONS",
    defaultOpen: false,
    items: [
      { label: "Billing", href: "/billing", icon: Receipt },
      { label: "Invoices", href: "/invoices", icon: FileText },
      { label: "Payments", href: "/payments", icon: Wallet },
      { label: "Vouchers", href: "/vouchers", icon: Ticket },
      { label: "Complaints", href: "/complaints", icon: AlertTriangle, badgeVariant: "destructive" },
      { label: "Technicians", href: "/technicians", icon: Wrench },
      { label: "Agents", href: "/agents", icon: UserCog },
      { label: "Installations", href: "/installations", icon: PackagePlus },
      { label: "Inventory", href: "/inventory", icon: Boxes },
      { label: "Incidents", href: "/incidents", icon: Siren },
      { label: "Leads", href: "/leads", icon: UserPlus },
      { label: "Reseller", href: "/reseller", icon: Handshake },
      { label: "Action History", href: "/action-history", icon: ClipboardList },
      { label: "Announcements", href: "/announcements", icon: Megaphone },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // FINANCE
  // ══════════════════════════════════════════════════════════════
  {
    id: "FINANCE",
    label: "FINANCE",
    defaultOpen: false,
    items: [
      { label: "Reports", href: "/reports", icon: ClipboardList },
      { label: "Revenue Reports", href: "/revenue-reports", icon: TrendingUp },
      { label: "Revenue Forecast", href: "/revenue-forecast", icon: BarChart3 },
      { label: "Collection", href: "/collection", icon: HandCoins },
      { label: "Due Recovery", href: "/due-recovery", icon: DollarSign },
      { label: "GST/Tax", href: "/gst-tax", icon: Calculator },
      { label: "Referral", href: "/referral", icon: Gift },
      { label: "Loyalty Gamification", href: "/loyalty-gamification", icon: Trophy },
      { label: "Charge Override", href: "/charge-override", icon: DollarSign },
      { label: "Cyclic Billing", href: "/cyclic-billing", icon: RotateCcw },
      { label: "Grace Periods", href: "/grace-periods", icon: Clock },
      { label: "Add-on Services", href: "/add-on-services", icon: PackagePlus },
      { label: "Top-Ups", href: "/top-ups", icon: PlusCircle },
      { label: "Smart Collections", href: "/smart-collections", icon: Target },
      { label: "Revenue Leakage", href: "/revenue-leakage", icon: AlertTriangle },
      { label: "Compliance & SLA", href: "/compliance-sla", icon: ShieldCheckIcon },
      { label: "Reseller Intelligence", href: "/reseller-intelligence", icon: Radar },
      { label: "Data Export", href: "/data-export", icon: FileSpreadsheet },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // AI INTELLIGENCE
  // ══════════════════════════════════════════════════════════════
  {
    id: "AI INTELLIGENCE",
    label: "AI INTELLIGENCE",
    defaultOpen: false,
    items: [
      { label: "AI Advisor", href: "/ai-advisor", icon: Brain },
      { label: "AI Diagnosis", href: "/ai-diagnosis", icon: Stethoscope },
      { label: "Churn Alerts", href: "/churn-alerts", icon: AlertCircle, badgeVariant: "destructive" },
      { label: "Churn Prediction", href: "/churn-prediction", icon: BrainCircuit },
      { label: "Competitor Intel", href: "/competitor-intel", icon: Radar },
      { label: "Competitor Analysis", href: "/competitor-analysis", icon: GitCompare },
      { label: "WhatsApp Bot", href: "/whatsapp-bot", icon: MessageCircle },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // SETTINGS
  // ══════════════════════════════════════════════════════════════
  {
    id: "SETTINGS",
    label: "SETTINGS",
    defaultOpen: false,
    items: [
      { label: "Dashboard Widgets", href: "/dashboard-widgets", icon: LayoutDashboard },
      { label: "ISP Profile", href: "/isp-profile", icon: Building2 },
      { label: "Admin Users", href: "/admin-users", icon: UserCircle },
      { label: "Areas", href: "/areas", icon: MapPin },
      { label: "Equipment", href: "/equipment", icon: HardHat },
      { label: "Promotions", href: "/promotions", icon: Megaphone },
      { label: "Notifications", href: "/notifications", icon: Bell, badgeVariant: "secondary" },
      { label: "API Keys", href: "/api-keys", icon: KeyRound },
      { label: "Audit Log", href: "/audit-log", icon: ScrollText },
      { label: "Backup", href: "/backup", icon: DatabaseBackup },
      { label: "Integrations", href: "/integrations", icon: Plug },
      { label: "Knowledge Base", href: "/knowledge-base", icon: BookOpen },
      { label: "Module Manager", href: "/module-manager", icon: Layers },
    ],
  },
];
