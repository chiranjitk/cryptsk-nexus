"use client";

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Search,
  LayoutDashboard,
  Users,
  CreditCard,
  Receipt,
  Wallet,
  Router,
  Radio,
  Activity,
  ShieldCheck,
  Network,
  MonitorDot,
  Globe,
  MapPinned,
  Wifi,
  Siren,
  AlertTriangle,
  Wrench,
  UserCog,
  PackagePlus,
  Boxes,
  UserPlus,
  Handshake,
  FileText,
  Ticket,
  TrendingUp,
  HandCoins,
  DollarSign,
  Calculator,
  Gift,
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
  Bell,
  KeyRound,
  ScrollText,
  DatabaseBackup,
  Plug,
  BookOpen,
  Sparkles,
  Clock,
  ArrowRight,
  FilePlus,
  Banknote,
  TicketPlus,
  FileBarChart,
  Loader2,
  Server,
  Sliders,
  Eye,
  Zap,
  WifiOff,
  User,
  Phone,
  type LucideIcon,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";

// ─── Types ─────────────────────────────────────────────────────

interface PageEntry {
  label: string;
  section: string;
  icon: LucideIcon;
  keywords?: string[];
}

interface QuickAction {
  label: string;
  section: string;
  targetPage: string;
  icon: LucideIcon;
  description: string;
}

interface SubscriberResult {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  connectionType: string;
  area: { id: string; name: string } | null;
  plan: { id: string; name: string; priceMonthly: number } | null;
}

// ─── Page Registry (mirrors sidebar navigation) ────────────────

const PAGE_REGISTRY: Record<string, PageEntry[]> = {
  DASHBOARD: [
    { label: "Dashboard", section: "DASHBOARD", icon: LayoutDashboard, keywords: ["home", "overview", "stats", "metrics"] },
  ],
  SUBSCRIBERS: [
    { label: "Subscribers", section: "SUBSCRIBERS", icon: Users, keywords: ["customers", "clients", "users", "accounts"] },
    { label: "Plans", section: "SUBSCRIBERS", icon: CreditCard, keywords: ["packages", "tariffs", "pricing", "speed"] },
    { label: "360° Customer View", section: "SUBSCRIBERS", icon: User, keywords: ["customer", "profile", "detail", "view"] },
    { label: "Batch Provisioning", section: "SUBSCRIBERS", icon: UserPlus, keywords: ["bulk", "create", "import", "register"] },
  ],
  NETWORK: [
    { label: "NAS Clients", section: "NETWORK", icon: Radio, keywords: ["radius", "nas", "auth", "server"] },
    { label: "Network Devices", section: "MONITORING", icon: Router, keywords: ["routers", "switches", "hardware", "equipment", "devices"] },
    { label: "IP Pool Management", section: "NETWORK", icon: MapPinned, keywords: ["ip", "addresses", "subnets", "dns", "ipam", "allocation"] },
    { label: "System Interfaces", section: "NETWORK", icon: Router, keywords: ["ethernet", "vlan", "interface", "port"] },
    { label: "DHCP Server", section: "NETWORK", icon: Server, keywords: ["dhcp", "ip", "lease", "pool"] },
    { label: "DNS Server", section: "NETWORK", icon: Globe, keywords: ["dns", "domain", "records", "resolve"] },
    { label: "PPPoE Server", section: "NETWORK", icon: Router, keywords: ["pppoe", "ppp", "dial", "authentication"] },
    { label: "Captive Portal", section: "NETWORK", icon: Wifi, keywords: ["hotspot", "wifi", "guest", "voucher", "login"] },
    { label: "MultiWAN", section: "NETWORK", icon: Globe, keywords: ["wan", "load balancing", "failover", "isp", "redundancy"] },
    { label: "Dynamic Routing", section: "NETWORK", icon: Network, keywords: ["ospf", "bgp", "routing", "protocol"] },
    { label: "FTTH/GPON", section: "NETWORK", icon: Network, keywords: ["fiber", "ftth", "gpon", "olt", "onu", "pon"] },
    { label: "Network Health", section: "NETWORK", icon: Sparkles, keywords: ["health", "status", "monitoring", "overview"] },
    { label: "DHCPv6 Server", section: "NETWORK", icon: Globe, keywords: ["dhcpv6", "ipv6", "prefix", "delegation"] },
  ],
  POLICY: [
    { label: "Bandwidth Mgmt", section: "POLICY", icon: Activity, keywords: ["bandwidth", "throttle", "limit", "qos", "speed"] },
    { label: "Time Access", section: "POLICY", icon: Clock, keywords: ["schedule", "time", "access", "policy", "hours"] },
    { label: "QoS Monitor", section: "POLICY", icon: Activity, keywords: ["qos", "quality", "service", "monitor"] },
    { label: "Firewall Rules", section: "POLICY", icon: ShieldCheck, keywords: ["firewall", "rules", "filter", "block", "allow"] },
    { label: "IPS / Anomaly Detection", section: "POLICY", icon: AlertTriangle, keywords: ["ips", "intrusion", "anomaly", "detection", "ids"] },
    { label: "DDoS Protection", section: "POLICY", icon: Siren, keywords: ["ddos", "protection", "attack", "mitigation"] },
    { label: "VPN Server", section: "POLICY", icon: Wifi, keywords: ["vpn", "tunnel", "wireguard", "ipsec"] },
    { label: "Security Profiles", section: "POLICY", icon: ShieldCheck, keywords: ["security", "profile", "policy", "settings"] },
  ],
  MONITORING: [
    { label: "Active Sessions", section: "MONITORING", icon: MonitorDot, keywords: ["sessions", "active", "online", "connections", "pppoe"] },
    { label: "Session History", section: "MONITORING", icon: Clock, keywords: ["history", "past", "disconnected", "logs"] },
    { label: "Authentication Log", section: "MONITORING", icon: ShieldCheck, keywords: ["auth", "login", "log", "radius", "access"] },
    { label: "Sessions", section: "MONITORING", icon: MonitorDot, keywords: ["session", "connection", "active"] },
    { label: "Bandwidth", section: "MONITORING", icon: Activity, keywords: ["bandwidth", "traffic", "usage", "speed", "monitoring"] },
    { label: "Traffic Analytics", section: "MONITORING", icon: TrendingUp, keywords: ["traffic", "analytics", "protocol", "application"] },
    { label: "BW Reports", section: "MONITORING", icon: FileText, keywords: ["bandwidth", "report", "usage", "statistics"] },
    { label: "App Awareness", section: "MONITORING", icon: Eye, keywords: ["app", "application", "ndpi", "protocol", "usage"] },
    { label: "Uptime Monitor", section: "MONITORING", icon: Eye, keywords: ["uptime", "monitor", "availability", "ping"] },
    { label: "Latency Monitor", section: "MONITORING", icon: Clock, keywords: ["latency", "ping", "delay", "jitter", "rtt"] },
    { label: "Speed Test", section: "MONITORING", icon: Zap, keywords: ["speed", "test", "bandwidth", "throughput"] },
    { label: "Syslog Server", section: "MONITORING", icon: ScrollText, keywords: ["syslog", "log", "server", "messages"] },
    { label: "Diagnostic Tools", section: "MONITORING", icon: Loader2, keywords: ["diagnostic", "tools", "ping", "traceroute", "tcpdump"] },
    { label: "IP-MAC History", section: "MONITORING", icon: FileText, keywords: ["ip", "mac", "history", "binding", "arp"] },
    { label: "Zone Budgets", section: "MONITORING", icon: MapPinned, keywords: ["zone", "budget", "area", "allocation"] },
    { label: "NAT Logs", section: "MONITORING", icon: FileText, keywords: ["nat", "log", "translation", "port"] },
    { label: "Network Alerts", section: "MONITORING", icon: Siren, keywords: ["alert", "alarm", "warning", "notification"] },
    { label: "Grafana Dashboards", section: "MONITORING", icon: TrendingUp, keywords: ["grafana", "dashboard", "graph", "chart"] },
  ],
  SERVICES: [
    { label: "RADIUS Proxy", section: "SERVICES", icon: Radio, keywords: ["radius", "proxy", "forward", "relay"] },
    { label: "RADIUS Attributes", section: "SERVICES", icon: Sliders, keywords: ["radius", "attribute", "vendor", "dictionary"] },
    { label: "Enterprise Auth", section: "SERVICES", icon: Building2, keywords: ["enterprise", "ldap", "auth", "sso", "active directory"] },
    { label: "WiFi Offload", section: "SERVICES", icon: Wifi, keywords: ["wifi", "offload", "carrier", "wifi calling"] },
    { label: "TR-069 ACS", section: "SERVICES", icon: Router, keywords: ["tr069", "acs", "cpe", "auto-config", "provisioning"] },
    { label: "Hotspot", section: "SERVICES", icon: Wifi, keywords: ["hotspot", "wifi", "guest", "billing"] },
    { label: "MikroTik Manager", section: "SERVICES", icon: Router, keywords: ["mikrotik", "routeros", "device", "manage"] },
    { label: "SSH Device Manager", section: "SERVICES", icon: Loader2, keywords: ["ssh", "device", "terminal", "remote"] },
    { label: "CoA Tracking", section: "SERVICES", icon: Activity, keywords: ["coa", "change of authorization", "disconnect", "session"] },
    { label: "Tech Performance", section: "SERVICES", icon: Sparkles, keywords: ["technician", "performance", "stats", "leaderboard"] },
  ],
  OPERATIONS: [
    { label: "Complaints", section: "OPERATIONS", icon: AlertTriangle, keywords: ["tickets", "support", "issues", "troubles", "help"] },
    { label: "Technicians", section: "OPERATIONS", icon: Wrench, keywords: ["engineers", "staff", "field", "workers"] },
    { label: "Billing", section: "OPERATIONS", icon: Receipt, keywords: ["bills", "billing", "charges", "cycle"] },
    { label: "Invoices", section: "OPERATIONS", icon: FileText, keywords: ["invoices", "bills", "receipts", "generate"] },
    { label: "Payments", section: "OPERATIONS", icon: Wallet, keywords: ["payments", "transactions", "receipts", "money", "collect"] },
    { label: "Vouchers", section: "OPERATIONS", icon: Ticket, keywords: ["vouchers", "coupons", "codes", "topup", "recharge"] },
    { label: "Reseller", section: "OPERATIONS", icon: Handshake, keywords: ["reseller", "partners", "distributors", "wholesale"] },
    { label: "Agents", section: "OPERATIONS", icon: UserCog, keywords: ["collection agents", "field agents", "sales"] },
    { label: "Installations", section: "OPERATIONS", icon: PackagePlus, keywords: ["setup", "new connection", "provisioning", "install"] },
    { label: "Inventory", section: "OPERATIONS", icon: Boxes, keywords: ["stock", "warehouse", "materials", "parts"] },
    { label: "Incidents", section: "OPERATIONS", icon: Siren, keywords: ["outages", "downtime", "emergency", "maintenance"] },
    { label: "Leads", section: "OPERATIONS", icon: UserPlus, keywords: ["prospects", "sales", "pipeline", "crm"] },
    { label: "Action History", section: "OPERATIONS", icon: FileText, keywords: ["history", "audit", "activity", "log"] },
    { label: "Announcements", section: "OPERATIONS", icon: Megaphone, keywords: ["announcement", "notice", "broadcast", "news"] },
    { label: "Tech Performance", section: "OPERATIONS", icon: Sparkles, keywords: ["technician", "performance", "analytics"] },
  ],
  FINANCE: [
    { label: "Reports", section: "FINANCE", icon: FileText, keywords: ["reports", "analytics", "statistics", "data"] },
    { label: "Revenue Reports", section: "FINANCE", icon: TrendingUp, keywords: ["revenue", "earnings", "income", "analytics"] },
    { label: "Collection", section: "FINANCE", icon: HandCoins, keywords: ["pending", "dues", "recovery", "agents"] },
    { label: "Due Recovery", section: "FINANCE", icon: DollarSign, keywords: ["overdue", "pending payments", "follow up", "legal"] },
    { label: "Data Export", section: "FINANCE", icon: FileText, keywords: ["export", "download", "csv", "excel"] },
    { label: "Reseller Intelligence", section: "FINANCE", icon: Eye, keywords: ["reseller", "analytics", "intelligence", "commission"] },
    { label: "Revenue Forecast", section: "FINANCE", icon: TrendingUp, keywords: ["forecast", "prediction", "trend", "future"] },
    { label: "GST/Tax", section: "FINANCE", icon: Calculator, keywords: ["tax", "gst", "returns", "compliance"] },
    { label: "Referral", section: "FINANCE", icon: Gift, keywords: ["referrals", "loyalty", "rewards", "program"] },
    { label: "Loyalty Gamification", section: "FINANCE", icon: Sparkles, keywords: ["loyalty", "gamification", "points", "rewards", "badge"] },
    { label: "Charge Override", section: "FINANCE", icon: DollarSign, keywords: ["charge", "override", "custom", "adjustment"] },
    { label: "Cyclic Billing", section: "FINANCE", icon: Clock, keywords: ["cyclic", "billing", "auto", "recurring", "generate"] },
    { label: "Grace Periods", section: "FINANCE", icon: Clock, keywords: ["grace", "period", "extension", "due date"] },
    { label: "Add-on Services", section: "FINANCE", icon: PackagePlus, keywords: ["addon", "add-on", "extra", "service", "boost"] },
    { label: "Top-Ups", section: "FINANCE", icon: DollarSign, keywords: ["topup", "top-up", "recharge", "balance", "wallet"] },
    { label: "Smart Collections", section: "FINANCE", icon: ArrowRight, keywords: ["smart", "collection", "auto", "ai", "reminder"] },
    { label: "Revenue Leakage", section: "FINANCE", icon: AlertTriangle, keywords: ["leakage", "revenue", "loss", "gap"] },
    { label: "Compliance & SLA", section: "FINANCE", icon: ShieldCheck, keywords: ["compliance", "sla", "regulatory", "audit"] },
  ],
  "AI INTELLIGENCE": [
    { label: "AI Advisor", section: "AI INTELLIGENCE", icon: Brain, keywords: ["ai", "assistant", "chat", "help", "copilot"] },
    { label: "AI Diagnosis", section: "AI INTELLIGENCE", icon: Stethoscope, keywords: ["ai", "troubleshoot", "diagnose", "analyze", "detect"] },
    { label: "Churn Alerts", section: "AI INTELLIGENCE", icon: AlertCircle, keywords: ["churn", "attrition", "retention", "prediction", "risk"] },
    { label: "Churn Prediction", section: "AI INTELLIGENCE", icon: Brain, keywords: ["churn", "predict", "ml", "model", "forecast"] },
    { label: "Competitor Intel", section: "AI INTELLIGENCE", icon: Radar, keywords: ["competitors", "market", "pricing", "analysis", "intel"] },
    { label: "Competitor Analysis", section: "AI INTELLIGENCE", icon: Eye, keywords: ["competitor", "analysis", "compare", "benchmark"] },
    { label: "WhatsApp Bot", section: "AI INTELLIGENCE", icon: MessageCircle, keywords: ["whatsapp", "bot", "chatbot", "messaging"] },
  ],
  SETTINGS: [
    { label: "ISP Profile", section: "SETTINGS", icon: Building2, keywords: ["company", "profile", "settings", "brand", "config"] },
    { label: "Admin Users", section: "SETTINGS", icon: UserCircle, keywords: ["staff", "admin", "users", "roles", "permissions"] },
    { label: "Areas", section: "SETTINGS", icon: MapPin, keywords: ["zones", "locations", "coverage", "regions"] },
    { label: "Equipment", section: "SETTINGS", icon: HardHat, keywords: ["hardware", "devices", "tools", "stock", "category"] },
    { label: "Promotions", section: "SETTINGS", icon: Megaphone, keywords: ["offers", "deals", "campaigns", "marketing", "discount"] },
    { label: "Notifications", section: "SETTINGS", icon: Bell, keywords: ["alerts", "email", "sms", "push", "template"] },
    { label: "API Keys", section: "SETTINGS", icon: KeyRound, keywords: ["api", "tokens", "webhooks", "integration"] },
    { label: "Audit Log", section: "SETTINGS", icon: ScrollText, keywords: ["logs", "activity", "history", "trail", "audit"] },
    { label: "Backup", section: "SETTINGS", icon: DatabaseBackup, keywords: ["database", "restore", "export", "snapshot"] },
    { label: "Integrations", section: "SETTINGS", icon: Plug, keywords: ["third-party", "apps", "connectors", "zapier", "webhook"] },
    { label: "Knowledge Base", section: "SETTINGS", icon: BookOpen, keywords: ["docs", "help", "articles", "faq", "wiki"] },
    { label: "Module Manager", section: "SETTINGS", icon: Sliders, keywords: ["module", "plugin", "enable", "disable", "feature"] },
    { label: "Dashboard Widgets", section: "SETTINGS", icon: LayoutDashboard, keywords: ["widget", "dashboard", "customize", "layout"] },
  ],
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Generate Invoices",
    section: "FINANCE",
    targetPage: "Invoices",
    icon: FilePlus,
    description: "Bulk generate invoices for subscribers",
  },
  {
    label: "Add Subscriber",
    section: "MAIN",
    targetPage: "Subscribers",
    icon: UserPlus,
    description: "Register a new subscriber",
  },
  {
    label: "Collect Payment",
    section: "MAIN",
    targetPage: "Payments",
    icon: Banknote,
    description: "Record a new payment collection",
  },
  {
    label: "Create Complaint",
    section: "OPERATIONS",
    targetPage: "Complaints",
    icon: TicketPlus,
    description: "Log a new support ticket",
  },
  {
    label: "View Reports",
    section: "FINANCE",
    targetPage: "Revenue Reports",
    icon: FileBarChart,
    description: "Open revenue & analytics reports",
  },
];

// ─── Section label → color mapping ─────────────────────────────

function sectionBadgeColor(section: string): string {
  switch (section) {
    case "DASHBOARD":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400";
    case "SUBSCRIBERS":
      return "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400";
    case "NETWORK":
      return "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400";
    case "POLICY":
      return "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400";
    case "MONITORING":
      return "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400";
    case "SERVICES":
      return "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400";
    case "OPERATIONS":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
    case "FINANCE":
      return "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400";
    case "AI INTELLIGENCE":
      return "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400";
    case "SETTINGS":
      return "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400";
    default:
      return "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400";
  }
}

// ─── Subscriber status helpers ─────────────────────────────────

const SUBSCRIBER_STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800",
  SUSPENDED: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800",
  PENDING_ACTIVATION: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800",
  TRIAL: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/50 dark:text-teal-400 dark:border-teal-800",
  DISCONNECTED: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900/50 dark:text-gray-400 dark:border-gray-800",
};

const SUBSCRIBER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  PENDING_ACTIVATION: "Pending",
  TRIAL: "Trial",
  DISCONNECTED: "Disconnected",
};

const SUBSCRIBER_STATUS_ICONS: Record<string, typeof Wifi> = {
  ACTIVE: Wifi,
  SUSPENDED: WifiOff,
  PENDING_ACTIVATION: Clock,
  TRIAL: Zap,
  DISCONNECTED: AlertCircle,
};

// ─── Recent Pages helpers ──────────────────────────────────────

const RECENT_PAGES_KEY = "cryptsk-recent-pages";
const MAX_RECENT_PAGES = 5;

interface RecentPageEntry {
  label: string;
  section: string;
  timestamp: number;
}

function getRecentPages(): RecentPageEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(RECENT_PAGES_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as RecentPageEntry[];
  } catch {
    return [];
  }
}

function addRecentPage(label: string, section: string) {
  try {
    const existing = getRecentPages();
    // Remove duplicate if exists
    const filtered = existing.filter(
      (p) => !(p.label === label && p.section === section)
    );
    // Add to front
    filtered.unshift({ label, section, timestamp: Date.now() });
    // Keep only max entries
    const trimmed = filtered.slice(0, MAX_RECENT_PAGES);
    localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore localStorage errors
  }
}

// ─── Stable no-op subscribe for useSyncExternalStore ──────────
const emptySubscribe = () => () => {};

// ─── Main Command Palette Component ────────────────────────────

export function CommandPalette() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    toggleCommandPalette,
    currentPage,
    currentSection,
    setCurrentPage,
    setPendingSubscriberAction,
  } = useAppStore();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const recentPages: RecentPageEntry[] = mounted ? getRecentPages() : [];

  // Subscriber search state
  const [query, setQuery] = useState("");
  const [subscriberResults, setSubscriberResults] = useState<SubscriberResult[]>([]);
  const [subscriberTotal, setSubscriberTotal] = useState(0);
  const [subscriberLoading, setSubscriberLoading] = useState(false);
  const [subscriberError, setSubscriberError] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const hasQuery = query.trim().length >= 2;
  const showSubscriberResults = hasQuery && (subscriberResults.length > 0 || subscriberLoading || subscriberError);

  // Keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        e.stopPropagation();
        toggleCommandPalette();
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [toggleCommandPalette]);

  // Reset state when dialog closes
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setCommandPaletteOpen(nextOpen);
      if (!nextOpen) {
        // Reset subscriber search state when closing
        setQuery("");
        setSubscriberResults([]);
        setSubscriberTotal(0);
        setSubscriberLoading(false);
        setSubscriberError(false);
      }
    },
    [setCommandPaletteOpen]
  );

  // Debounced subscriber search (300ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setSubscriberResults([]);
      setSubscriberTotal(0);
      setSubscriberLoading(false);
      setSubscriberError(false);
      return;
    }

    setSubscriberLoading(true);
    setSubscriberError(false);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/subscribers?search=${encodeURIComponent(query.trim())}&limit=5`,
          { credentials: "include" }
        );
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setSubscriberResults(data.subscribers ?? []);
        setSubscriberTotal(data.total ?? 0);
      } catch {
        setSubscriberError(true);
        setSubscriberResults([]);
      } finally {
        setSubscriberLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Navigate to a page and record it in recent pages
  const handleNavigate = useCallback(
    (pageLabel: string, section: string) => {
      setCurrentPage(pageLabel, section);
      addRecentPage(pageLabel, section);
      setCommandPaletteOpen(false);
    },
    [setCurrentPage, setCommandPaletteOpen]
  );

  // Handle subscriber selection → navigate to subscribers page with specific ID
  const handleSubscriberSelect = useCallback(
    (subscriber: SubscriberResult) => {
      setCommandPaletteOpen(false);
      // SPA routing: hand the subscriber id to the Subscribers page,
      // which opens the detail view (hash URLs are not routed in this app)
      setPendingSubscriberAction({ id: subscriber.id, action: "view" });
      setCurrentPage("Subscribers", "SUBSCRIBERS");
      toast.success(`Viewing ${subscriber.name}`);
    },
    [setCommandPaletteOpen, setCurrentPage, setPendingSubscriberAction]
  );

  // Handle quick action
  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      setCurrentPage(action.targetPage, action.section);
      addRecentPage(action.targetPage, action.section);
      setCommandPaletteOpen(false);
    },
    [setCurrentPage, setCommandPaletteOpen]
  );

  // Build the value string for cmdk fuzzy matching
  const pageValue = useCallback(
    (page: PageEntry) => {
      const kw = page.keywords?.join(" ") ?? "";
      return `${page.label} ${page.section} ${kw}`.toLowerCase();
    },
    []
  );

  // Resolve icon from page label
  const resolvePageIcon = useCallback((label: string, section: string): LucideIcon => {
    const sectionPages = PAGE_REGISTRY[section];
    if (sectionPages) {
      const found = sectionPages.find((p) => p.label === label);
      if (found) return found.icon;
    }
    return FileText;
  }, []);

  return (
    <Dialog open={commandPaletteOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={false}
        a11yTitle="Command Palette"
      >
        <Command
          shouldFilter={true}
          className="[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
          <CommandInput
            placeholder="Search subscribers, pages, actions..."
            value={query}
            onValueChange={setQuery}
          />

          {/* ── Subscriber Search Results (shown when query has 2+ chars) ── */}
          {showSubscriberResults && (
            <div className="border-b border-border/50">
              {/* Section heading */}
              <div className="flex items-center justify-between px-3 py-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Search Subscribers
                </p>
                {subscriberTotal > 5 && !subscriberLoading && (
                  <span className="text-[10px] text-muted-foreground/60">
                    {subscriberTotal} found — showing top 5
                  </span>
                )}
              </div>

              {/* Loading state */}
              {subscriberLoading && (
                <div className="flex items-center gap-3 px-3 py-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span className="text-sm">Searching subscribers...</span>
                </div>
              )}

              {/* Error state */}
              {subscriberError && !subscriberLoading && (
                <div className="flex items-center gap-3 px-3 py-3 text-muted-foreground">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                  <span className="text-sm">Search failed. Try again.</span>
                </div>
              )}

              {/* Results */}
              {!subscriberLoading && !subscriberError && subscriberResults.length > 0 && (
                <div className="divide-y divide-border/30">
                  {subscriberResults.map((subscriber) => {
                    const StatusIcon =
                      SUBSCRIBER_STATUS_ICONS[subscriber.status] || Wifi;
                    const statusStyle =
                      SUBSCRIBER_STATUS_STYLES[subscriber.status] ||
                      SUBSCRIBER_STATUS_STYLES.DISCONNECTED;
                    const statusLabel =
                      SUBSCRIBER_STATUS_LABELS[subscriber.status] ||
                      subscriber.status;

                    return (
                      <div
                        key={subscriber.id}
                        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => handleSubscriberSelect(subscriber)}
                      >
                        {/* Subscriber avatar */}
                        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-red-50 dark:bg-red-950/30 shrink-0">
                          <User className="h-4 w-4 text-red-600 dark:text-red-400" />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground truncate">
                              {subscriber.name}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[9px] px-1.5 py-0 leading-none shrink-0 font-medium h-4",
                                statusStyle
                              )}
                            >
                              <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
                              {statusLabel}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                            <span className="font-mono text-[10px]">
                              {subscriber.code}
                            </span>
                            {subscriber.plan && (
                              <span className="flex items-center gap-1 truncate">
                                <Zap className="h-3 w-3" />
                                {subscriber.plan.name}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground/70">
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {subscriber.phone}
                            </span>
                            {subscriber.area && (
                              <span className="flex items-center gap-1 truncate">
                                <MapPin className="h-3 w-3" />
                                {subscriber.area.name}
                              </span>
                            )}
                          </div>
                        </div>

                        <ArrowRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* No subscriber results */}
              {!subscriberLoading && !subscriberError && subscriberResults.length === 0 && (
                <div className="flex items-center gap-3 px-3 py-3 text-muted-foreground">
                  <Users className="h-4 w-4 shrink-0 opacity-40" />
                  <span className="text-sm">
                    No subscribers match &ldquo;{query}&rdquo;
                  </span>
                </div>
              )}
            </div>
          )}

          <CommandList className="max-h-[420px]">
            <CommandEmpty className="py-8">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <div className="p-3 rounded-2xl bg-muted/50 text-muted-foreground/40">
                  <Search className="h-8 w-8" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium">No results found</p>
                  <p className="text-xs text-muted-foreground/60">
                    Try a different search term or browse pages below
                  </p>
                </div>
              </div>
            </CommandEmpty>

            {/* ── Recent Pages (shown when search is empty) ── */}
            {recentPages.length > 0 && (
              <CommandGroup heading="Recent" className="command-palette-recent">
                {recentPages.map((recent) => {
                  const Icon = resolvePageIcon(recent.label, recent.section);
                  return (
                    <CommandItem
                      key={`recent-${recent.label}-${recent.section}`}
                      value={`${recent.label} ${recent.section}`}
                      onSelect={() => handleNavigate(recent.label, recent.section)}
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-muted/80 shrink-0">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground">
                          {recent.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                            sectionBadgeColor(recent.section)
                          )}
                        >
                          {recent.section}
                        </span>
                        <Clock className="h-3 w-3 text-muted-foreground/50" />
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            <CommandSeparator />

            {/* ── Quick Actions ── */}
            <CommandGroup heading="Quick Actions">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <CommandItem
                    key={`action-${action.label}`}
                    value={`${action.label} ${action.description} quick action`}
                    onSelect={() => handleQuickAction(action)}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-red-50 dark:bg-red-950/30 shrink-0">
                      <Icon className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {action.label}
                        </span>
                        <Sparkles className="h-3 w-3 text-red-500" />
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {action.description}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                  </CommandItem>
                );
              })}
            </CommandGroup>

            <CommandSeparator />

            {/* ── All Pages grouped by section ── */}
            {Object.entries(PAGE_REGISTRY).map(([section, pages]) => (
              <CommandGroup key={section} heading={section}>
                {pages.map((page) => {
                  const Icon = page.icon;
                  const isActive =
                    page.label === currentPage && page.section === currentSection;
                  return (
                    <CommandItem
                      key={`${section}-${page.label}`}
                      value={pageValue(page)}
                      onSelect={() => handleNavigate(page.label, page.section)}
                      className={cn(
                        "flex items-center gap-3 cursor-pointer",
                        isActive && "bg-red-50 dark:bg-red-950/20"
                      )}
                    >
                      <div
                        className={cn(
                          "flex items-center justify-center h-8 w-8 rounded-lg shrink-0 transition-colors",
                          isActive
                            ? "bg-red-100 dark:bg-red-950/40"
                            : "bg-muted/80"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 transition-colors",
                            isActive
                              ? "text-red-600 dark:text-red-400"
                              : "text-muted-foreground"
                          )}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span
                          className={cn(
                            "text-sm font-medium",
                            isActive
                              ? "text-red-700 dark:text-red-400"
                              : "text-foreground"
                          )}
                        >
                          {page.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isActive && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
                            Current
                          </span>
                        )}
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                            sectionBadgeColor(section)
                          )}
                        >
                          {section}
                        </span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>

          {/* ── Footer with keyboard hints ── */}
          <div className="border-t bg-muted/30 px-4 py-2.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="inline-flex items-center px-1 py-0.5 text-[10px] font-medium bg-muted rounded border border-border">
                    ↑↓
                  </kbd>
                  <span>Navigate</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="inline-flex items-center px-1 py-0.5 text-[10px] font-medium bg-muted rounded border border-border">
                    ↵
                  </kbd>
                  <span>Open</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="inline-flex items-center px-1 py-0.5 text-[10px] font-medium bg-muted rounded border border-border">
                    esc
                  </kbd>
                  <span>Close</span>
                </span>
              </div>
              <span className="flex items-center gap-1 text-muted-foreground/60">
                <kbd className="inline-flex items-center gap-0.5 px-1 py-0.5 text-[10px] font-medium bg-muted rounded border border-border">
                  <span className="text-xs">⌘</span>K
                </kbd>
                <span>Toggle</span>
              </span>
            </div>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export default CommandPalette;
