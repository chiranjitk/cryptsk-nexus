import { create } from "zustand";
import type { NavGroup, UserInfo, UserRole } from "@/types";

// ─── Default (unauthenticated) user state ─────────────────────
// Used only for non-auth-dependent UI before login.
// Login page's setUser() replaces this with real user data from auth store.

const DEFAULT_USER: UserInfo = {
  id: "",
  name: "",
  email: "",
  role: "OPERATOR" as UserRole,
  avatarUrl: undefined,
  ispName: "",
};

// ─── Store Interface ──────────────────────────────────────────

interface AppStore {
  // Navigation
  currentPage: string;
  currentSection: string;
  setCurrentPage: (page: string, section?: string) => void;

  // Sidebar groups
  collapsedGroups: string[];
  toggleGroup: (groupId: string) => void;
  isGroupCollapsed: (groupId: string) => boolean;

  // Notifications
  unreadNotificationCount: number;
  setUnreadNotificationCount: (count: number) => void;

  // User — starts as DEFAULT_USER (unauthenticated state)
  // Login page's setUser() replaces this with real user data from auth store.
  user: UserInfo;
  setUser: (user: Partial<UserInfo>) => void;

  // Open complaint count (for badge)
  openComplaintCount: number;
  setOpenComplaintCount: (count: number) => void;

  // Command palette open state (shared between header button & Ctrl+K)
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
}

// ─── Zustand Store ────────────────────────────────────────────

export const useAppStore = create<AppStore>((set, get) => ({
  // Navigation
  currentPage: "Dashboard",
  currentSection: "MAIN",
  setCurrentPage: (page, section) =>
    set({
      currentPage: page,
      currentSection: section ?? get().currentSection,
    }),

  // Sidebar groups
  collapsedGroups: [],
  toggleGroup: (groupId) =>
    set((state) => ({
      collapsedGroups: state.collapsedGroups.includes(groupId)
        ? state.collapsedGroups.filter((id) => id !== groupId)
        : [...state.collapsedGroups, groupId],
    })),
  isGroupCollapsed: (groupId) => get().collapsedGroups.includes(groupId),

  // Notifications (fetched from API via useBadgeCounts hook)
  unreadNotificationCount: 0,
  setUnreadNotificationCount: (count) => set({ unreadNotificationCount: count }),

  // User — default to empty (unauthenticated); login overwrites via setUser()
  user: DEFAULT_USER,
  setUser: (userData) =>
    set((state) => ({
      user: { ...state.user, ...userData },
    })),

  // Complaint count (fetched from API via useBadgeCounts hook)
  openComplaintCount: 0,
  setOpenComplaintCount: (count) => set({ openComplaintCount: count }),

  // Command palette (shared between Ctrl+K shortcut and header search button)
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
}));

// ─── Navigation Configuration ─────────────────────────────────

// Helper to build nav groups lazily (avoids circular imports with lucide-react)
// The icons are imported directly in the sidebar component.
export const NAV_GROUPS: Omit<NavGroup, "items">[] = [
  { id: "MAIN", label: "MAIN", defaultOpen: true },
  { id: "NETWORK", label: "NETWORK", defaultOpen: true },
  { id: "OPERATIONS", label: "OPERATIONS", defaultOpen: true },
  { id: "FINANCE", label: "FINANCE", defaultOpen: true },
  { id: "AI INTELLIGENCE", label: "AI INTELLIGENCE", defaultOpen: true },
  { id: "SETTINGS", label: "SETTINGS", defaultOpen: true },
];
