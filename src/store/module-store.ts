import { create } from "zustand";
import { MODULES, getDefaultEnabledModules } from "@/lib/modules/registry";
import type { ModuleCategory } from "@/lib/modules/registry";

interface ModuleStore {
  // ─── State ──────────────────────────────────────────────────
  enabledModules: string[];
  deploymentType: string;
  isLoaded: boolean;

  // ─── Actions ────────────────────────────────────────────────
  initialize: (enabled: string[], type: string) => void;
  enableModule: (moduleId: string) => void;
  disableModule: (moduleId: string) => void;
  toggleModule: (moduleId: string) => void;
  setEnabledModules: (modules: string[]) => void;
  setDeploymentType: (type: string) => void;
  isModuleEnabled: (moduleId: string) => boolean;
  applyPreset: (modules: string[], type: string) => void;
}

export const useModuleStore = create<ModuleStore>((set, get) => ({
  // ─── Default state ──────────────────────────────────────────
  enabledModules: getDefaultEnabledModules(),
  deploymentType: "isp",
  isLoaded: false,

  // ─── Initialize from DB/API ─────────────────────────────────
  initialize: (enabled, type) => {
    const validTypes = ["isp", "education", "hospital", "hotel", "campus", "enterprise", "full"];
    const safeType = validTypes.includes(type) ? type : "isp";
    set({
      enabledModules: enabled.length > 0 ? enabled : getDefaultEnabledModules(),
      deploymentType: safeType,
      isLoaded: true,
    });
  },

  // ─── Enable a single module ─────────────────────────────────
  enableModule: (moduleId) => {
    set((state) => ({
      enabledModules: state.enabledModules.includes(moduleId)
        ? state.enabledModules
        : [...state.enabledModules, moduleId],
    }));
  },

  // ─── Disable a single module ────────────────────────────────
  disableModule: (moduleId) => {
    // Core modules cannot be disabled
    const mod = MODULES.find((m) => m.id === moduleId);
    if (mod?.category === "core") return;

    set((state) => ({
      enabledModules: state.enabledModules.filter((id) => id !== moduleId),
    }));
  },

  // ─── Toggle a module ────────────────────────────────────────
  toggleModule: (moduleId) => {
    const { enabledModules } = get();
    if (enabledModules.includes(moduleId)) {
      get().disableModule(moduleId);
    } else {
      get().enableModule(moduleId);
    }
  },

  // ─── Set all enabled modules at once ────────────────────────
  setEnabledModules: (modules) => {
    // Always include core modules
    const coreIds = MODULES.filter((m) => m.category === "core").map((m) => m.id);
    const withCore = [...new Set([...coreIds, ...modules])];
    set({ enabledModules: withCore });
  },

  // ─── Set deployment type ────────────────────────────────────
  setDeploymentType: (type) => {
    set({ deploymentType: type });
  },

  // ─── Check if a module is enabled ───────────────────────────
  isModuleEnabled: (moduleId) => {
    return get().enabledModules.includes(moduleId);
  },

  // ─── Apply a deployment preset ──────────────────────────────
  applyPreset: (modules, type) => {
    // Always include core modules when applying a preset
    const coreIds = MODULES.filter((m) => m.category === "core").map((m) => m.id);
    const withCore = [...new Set([...coreIds, ...modules])];
    set({
      enabledModules: withCore,
      deploymentType: type,
    });
  },
}));

// ─── Module category metadata for UI ──────────────────────────

export const MODULE_CATEGORY_META: Record<ModuleCategory, { label: string; color: string; bg: string; border: string; icon: string }> = {
  core: { label: "Core Platform", color: "text-slate-700 dark:text-slate-300", bg: "bg-slate-100 dark:bg-slate-800/50", border: "border-slate-200 dark:border-slate-700", icon: "📦" },
  network: { label: "Network", color: "text-cyan-700 dark:text-cyan-300", bg: "bg-cyan-100 dark:bg-cyan-900/30", border: "border-cyan-200 dark:border-cyan-800", icon: "📡" },
  gateway: { label: "Gateway", color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-100 dark:bg-emerald-900/30", border: "border-emerald-200 dark:border-emerald-800", icon: "🖥️" },
  operations: { label: "Operations", color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-100 dark:bg-amber-900/30", border: "border-amber-200 dark:border-amber-800", icon: "🛠️" },
  finance: { label: "Finance", color: "text-violet-700 dark:text-violet-300", bg: "bg-violet-100 dark:bg-violet-900/30", border: "border-violet-200 dark:border-violet-800", icon: "💰" },
  ai: { label: "AI Intelligence", color: "text-rose-700 dark:text-rose-300", bg: "bg-rose-100 dark:bg-rose-900/30", border: "border-rose-200 dark:border-rose-800", icon: "🤖" },
  communication: { label: "Communication", color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-100 dark:bg-blue-900/30", border: "border-blue-200 dark:border-blue-800", icon: "💬" },
  addon: { label: "Add-on", color: "text-orange-700 dark:text-orange-300", bg: "bg-orange-100 dark:bg-orange-900/30", border: "border-orange-200 dark:border-orange-800", icon: "🧩" },
};
