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
  // (Other menu groups intentionally hidden during incremental port.
  //  Will be re-enabled in subsequent batches per user direction.)
  // ══════════════════════════════════════════════════════════════
];
