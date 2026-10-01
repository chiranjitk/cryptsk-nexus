"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChartBig, Box, CheckCircle2, ChevronDown, ChevronRight, CircleDot,
  Brain, DollarSign, Eye, Gauge, Globe, GraduationCap, Heart, Layers, LucideIcon,
  Network, Radio, ScanEye, Server, Shield, ShieldCheck, Timer, ToggleLeft,
  ToggleRight, Wrench, X, Zap, Info, RotateCcw, Save
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useModuleStore, MODULE_CATEGORY_META } from "@/store/module-store";
import { MODULES, DEPLOYMENT_PRESETS, checkDependencies } from "@/lib/modules/registry";
import type { ModuleDefinition, ModuleCategory, DeploymentPreset } from "@/lib/modules/registry";
import PageHeader from "@/components/page-header";
import { cn } from "@/lib/utils";

// ─── Icon resolver ─────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard: Box,
  Network,
  Server,
  Wrench,
  DollarSign,
  Brain,
  Radio,
  GraduationCap,
  Heart,
  Building2: Heart,
  Briefcase: Box,
  Layers,
  Shield,
  ShieldCheck,
  ScanEye,
  Eye,
  Zap,
  CircleDot,
  BarChartBig,
  Globe,
  Gauge,
  Timer,
};

function ModuleIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] || CircleDot;
  return <Icon className={className} />;
}

// ─── Module Card ───────────────────────────────────────────────

function ModuleCard({
  module,
  isEnabled,
  canDisable,
  dependencyStatus,
  onToggle,
}: {
  module: ModuleDefinition;
  isEnabled: boolean;
  canDisable: boolean;
  dependencyStatus: { met: boolean; missing: string[] };
  onToggle: () => void;
}) {
  const catMeta = MODULE_CATEGORY_META[module.category];
  const totalPages = module.pages.length;

  return (
    <Card
      className={cn(
        "relative transition-all duration-200 hover:shadow-md",
        isEnabled ? "ring-1 ring-primary/20" : "opacity-70 hover:opacity-90"
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-xl shrink-0 transition-all duration-200",
              isEnabled ? catMeta.bg + " shadow-sm" : "bg-muted/50"
            )}
          >
            <ModuleIcon name={module.icon} className={cn("w-5 h-5", isEnabled ? catMeta.color : "text-muted-foreground")} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-sm text-foreground truncate">{module.name}</h3>
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-5", catMeta.border, catMeta.bg, catMeta.color)}>
                {catMeta.icon} {catMeta.label}
              </Badge>
              {module.category === "core" && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-slate-200 text-slate-600">
                  Required
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{module.description}</p>

            {/* Meta */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Box className="w-3 h-3" /> {totalPages} pages
              </span>
              {module.miniServices && module.miniServices.length > 0 && (
                <span className="flex items-center gap-1">
                  <Server className="w-3 h-3" /> {module.miniServices.length} service{module.miniServices.length > 1 ? "s" : ""}
                </span>
              )}
              {module.dependencies.length > 0 && (
                <span className="flex items-center gap-1">
                  <Shield className="w-3 h-3" /> {module.dependencies.length} dep{module.dependencies.length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Dependencies warning */}
            {!dependencyStatus.met && !isEnabled && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <Info className="w-3 h-3 shrink-0" />
                <span>Requires: {dependencyStatus.missing.join(", ")}</span>
              </div>
            )}
          </div>

          {/* Toggle */}
          <button
            onClick={onToggle}
            disabled={!canDisable && !isEnabled}
            className={cn(
              "shrink-0 p-1 rounded-md transition-all duration-200",
              canDisable ? "hover:bg-muted cursor-pointer" : "cursor-not-allowed opacity-50"
            )}
            aria-label={isEnabled ? "Disable module" : "Enable module"}
          >
            {isEnabled ? (
              <ToggleRight className="w-8 h-8 text-primary" />
            ) : (
              <ToggleLeft className="w-8 h-8 text-muted-foreground" />
            )}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Preset Card ───────────────────────────────────────────────

function PresetCard({
  preset,
  isActive,
  onSelect,
}: {
  preset: typeof DEPLOYMENT_PRESETS[number];
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-xl border p-4 transition-all duration-200 hover:shadow-md",
        isActive
          ? "border-primary ring-1 ring-primary/20 bg-primary/5"
          : "border-border hover:border-primary/30"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "flex items-center justify-center w-10 h-10 rounded-xl shrink-0",
          isActive ? "bg-primary/10" : "bg-muted"
        )}>
          <ModuleIcon name={preset.icon} className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground")} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-sm">{preset.name}</h3>
            {isActive && (
              <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0 h-5">
                Active
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">{preset.description}</p>
          <p className="text-[10px] text-muted-foreground/70 mt-1.5">
            {preset.enabledModules.length} modules enabled
          </p>
        </div>
      </div>
    </button>
  );
}

// ─── Main Page ─────────────────────────────────────────────────

export default function ModuleManagerPage() {
  const queryClient = useQueryClient();
  const { deploymentType } = useModuleStore();

  // Fetch modules from API
  const { data, isLoading } = useQuery({
    queryKey: ["modules"],
    queryFn: async () => {
      const res = await fetch("/api/modules");
      if (!res.ok) throw new Error("Failed to fetch modules");
      return res.json();
    },
    refetchOnWindowFocus: false,
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (body: { enabledModules: string[]; deploymentType: string } | { applyPreset: string }) => {
      const res = await fetch("/api/modules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["modules"] });
      useModuleStore.getState().initialize(result.enabledModules, result.deploymentType);
      toast.success(result.message);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Toggle handler
  const handleToggle = (moduleId: string, currentlyEnabled: boolean) => {
    if (!data) return;
    const current = data.enabledModules as string[];
    const next = currentlyEnabled
      ? current.filter((id: string) => id !== moduleId)
      : [...current, moduleId];
    updateMutation.mutate({ enabledModules: next, deploymentType: data.deploymentType });
  };

  // Preset handler
  const handlePreset = (presetId: string) => {
    updateMutation.mutate({ applyPreset: presetId } as any);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 bg-muted rounded" />
        <div className="h-32 bg-muted rounded-xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-24 bg-muted rounded-xl" />
          <div className="h-24 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  const modules = (data?.modules || []) as (ModuleDefinition & { isEnabled: boolean; canDisable: boolean; dependencyStatus: { met: boolean; missing: string[] } })[];
  const presets = (data?.presets || []) as (typeof DEPLOYMENT_PRESETS[number] & { isActive: boolean })[];

  // Group modules by category
  const categories = ["core", "network", "gateway", "addon", "communication", "operations", "finance", "ai"] as ModuleCategory[];
  const categoryLabels: Record<string, string> = {
    core: "Core Platform",
    network: "Network Infrastructure",
    gateway: "Gateway Controller",
    addon: "Add-on Modules",
    communication: "Communication & Integrations",
    operations: "Field Operations",
    finance: "Finance Suite",
    ai: "AI Intelligence",
  };

  // Build sidebar preview: which pages are visible per section
  const enabledModules = data?.enabledModules || [];
  const gatewayModeEnabled = data?.gatewayModeEnabled ?? false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Module Manager"
        description="Control which features and modules are active. Toggle modules to customize the platform for your deployment."
      />

      {/* ── Gateway Mode Banner (Real Flag) ──────────────── */}
      <Card className={cn(
        "border-2 transition-all duration-300",
        gatewayModeEnabled
          ? "border-green-500/50 bg-green-50/50 dark:bg-green-950/20"
          : "border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20"
      )}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className={cn(
              "flex items-center justify-center w-12 h-12 rounded-xl shrink-0 transition-all",
              gatewayModeEnabled
                ? "bg-green-100 dark:bg-green-900/40 shadow-sm shadow-green-500/20"
                : "bg-amber-100 dark:bg-amber-900/40 shadow-sm shadow-amber-500/20"
            )}>
              {gatewayModeEnabled
                ? <ToggleRight className="w-7 h-7 text-green-600 dark:text-green-400" />
                : <ToggleLeft className="w-7 h-7 text-amber-600 dark:text-amber-400" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-bold text-base text-foreground">Gateway Mode</h3>
                <Badge className={cn(
                  "text-xs px-2 py-0 h-5",
                  gatewayModeEnabled
                    ? "bg-green-600 text-white"
                    : "bg-amber-500 text-white"
                )}>
                  {gatewayModeEnabled ? "ACTIVE" : "INACTIVE"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {gatewayModeEnabled
                  ? "Gateway is running. All TC/QoS, DHCP, DNS, Firewall, and Bandwidth Management features are active."
                  : "Gateway is OFF. Toggle the Gateway Controller module below to activate. No traffic shaping or gateway services will run."
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Stats Bar ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center">
              <Layers className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <p className="text-lg font-bold">{data?.totalModules || 0}</p>
              <p className="text-[11px] text-muted-foreground">Total Modules</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-lg font-bold">{data?.enabledCount || 0}</p>
              <p className="text-[11px] text-muted-foreground">Active Modules</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Box className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-lg font-bold">
                {modules.reduce((sum: number, m) => sum + m.pages.length, 0)}
              </p>
              <p className="text-[11px] text-muted-foreground">Active Pages</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <Zap className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-lg font-bold capitalize">{deploymentType}</p>
              <p className="text-[11px] text-muted-foreground">Deployment Type</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="modules" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="presets">Presets</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        {/* ── Modules Tab ─────────────────────────────────── */}
        <TabsContent value="modules" className="space-y-6">
          {categories.map((cat) => {
            const catModules = modules.filter((m) => m.category === cat);
            if (catModules.length === 0) return null;
            const catMeta = MODULE_CATEGORY_META[cat];

            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">{catMeta.icon}</span>
                  <h2 className="font-bold text-sm uppercase tracking-wider text-foreground">{categoryLabels[cat]}</h2>
                  <Badge variant="outline" className={cn("text-[10px]", catMeta.bg, catMeta.color, catMeta.border)}>
                    {catModules.filter((m) => m.isEnabled).length}/{catModules.length} enabled
                  </Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {catModules.map((mod) => (
                    <ModuleCard
                      key={mod.id}
                      module={mod}
                      isEnabled={mod.isEnabled}
                      canDisable={mod.canDisable}
                      dependencyStatus={mod.dependencyStatus}
                      onToggle={() => handleToggle(mod.id, mod.isEnabled)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </TabsContent>

        {/* ── Presets Tab ──────────────────────────────────── */}
        <TabsContent value="presets" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select a deployment preset to quickly configure modules for your use case. You can further customize individual modules after applying a preset.
          </p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {presets.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                isActive={preset.isActive}
                onSelect={() => handlePreset(preset.id)}
              />
            ))}
          </div>
        </TabsContent>

        {/* ── Preview Tab ──────────────────────────────────── */}
        <TabsContent value="preview" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Preview of the sidebar sections and pages that will be visible based on your current module configuration.
          </p>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Sidebar Navigation Preview
              </CardTitle>
              <CardDescription className="text-xs">
                {enabledModules.length} modules active → showing {modules.reduce((sum, m) => sum + m.pages.length, 0)} pages
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 space-y-1">
              {(() => {
                // Build sections from enabled modules
                const sectionMap: Record<string, { pages: string[]; moduleNames: string[] }> = {};
                modules.filter((m) => m.isEnabled).forEach((mod) => {
                  mod.pages.forEach((page) => {
                    if (!sectionMap[page.section]) {
                      sectionMap[page.section] = { pages: [], moduleNames: [] };
                    }
                    sectionMap[page.section].pages.push(page.label);
                    if (!sectionMap[page.section].moduleNames.includes(mod.name)) {
                      sectionMap[page.section].moduleNames.push(mod.name);
                    }
                  });
                });

                return Object.entries(sectionMap).map(([section, data]) => (
                  <div key={section} className="space-y-0.5">
                    <div className="flex items-center gap-2 py-1">
                      <ChevronDown className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{section}</span>
                      <span className="text-[10px] text-muted-foreground/60">({data.moduleNames.join(", ")})</span>
                    </div>
                    <div className="ml-5 pl-3 border-l border-border/50 space-y-0.5">
                      {data.pages.map((page) => (
                        <div key={page} className="flex items-center gap-2 py-0.5 text-xs text-foreground/80">
                          <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/50" />
                          {page}
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </CardContent>
          </Card>

          {/* Disabled modules info */}
          {(() => {
            const disabled = modules.filter((m) => !m.isEnabled && m.category !== "core");
            if (disabled.length === 0) return null;
            return (
              <Card className="border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2 mb-2">
                    <X className="w-4 h-4" />
                    {disabled.length} Module{disabled.length > 1 ? "s" : ""} Disabled
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {disabled.map((m) => (
                      <Badge key={m.id} variant="outline" className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                        {m.name} ({m.pages.length} pages hidden)
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>
      </Tabs>

      {/* ── Info Banner ────────────────────────────────────── */}
      <Card className="bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
              <p className="font-semibold">How Module System Works</p>
              <ul className="list-disc ml-4 space-y-0.5 text-blue-700 dark:text-blue-400">
                <li><strong>Core modules</strong> are always enabled and cannot be disabled</li>
                <li><strong>Gateway module</strong> requires both Core and Network Infrastructure to be enabled</li>
                <li>Disabling a module hides its pages from the sidebar and navigation</li>
                <li>Deployment presets provide one-click configuration for common use cases (ISP, Education, Hospital, etc.)</li>
                <li>Module settings are persisted across server restarts</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
