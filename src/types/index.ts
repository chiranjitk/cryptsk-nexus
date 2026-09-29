import type { LucideIcon } from "lucide-react";

// ─── Navigation ───────────────────────────────────────────────

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
  badgeVariant?: "default" | "destructive" | "secondary" | "outline";
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

export interface SidebarState {
  open: boolean;
  openMobile: boolean;
  collapsedGroups: string[];
}

// ─── User ─────────────────────────────────────────────────────

export type UserRole = "SUPER_ADMIN" | "ADMIN" | "OPERATOR" | "AGENT" | "TECHNICIAN";

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  ispName?: string;
}

// ─── App ──────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "error" | "success";
  read: boolean;
  createdAt: string;
}

export interface AppPage {
  name: string;
  section: string;
  path: string;
}
