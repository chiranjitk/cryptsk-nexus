"use client";

import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { apiFetch, cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ShieldCheck,
  ShieldAlert,
  Monitor,
  Smartphone,
  Tablet,
  LogIn,
  LogOut,
  KeyRound,
  Eye,
  UserX,
  AlertTriangle,
  Globe,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";

// ── Types ────────────────────────────────────────────────────────────

interface PostureSession {
  id: string;
  userName: string;
  userEmail: string;
  role: string;
  device: string;
  browser: string;
  ipAddress: string;
  location: string;
  loginAt: string;
}

interface PostureEvent {
  id: string;
  action: string;
  userName: string;
  userId: string;
  ipAddress: string;
  timestamp: string;
  email: string | null;
}

interface PostureData {
  stats: {
    activeSessions: number;
    distinctUsers: number;
    revokedLast7d: number;
    loginsLast24h: number;
    failedLogins7d: number;
    lockedUsers: number;
    suspendedUsers: number;
    inactiveUsers: number;
    totalStaffUsers: number;
  };
  sessions: PostureSession[];
  events: PostureEvent[];
  generatedAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  SUPER_ADMIN: { label: "Super Admin", cls: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/60" },
  ADMIN: { label: "Admin", cls: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60" },
  OPERATOR: { label: "Operator", cls: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/60" },
  AGENT: { label: "Agent", cls: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/60" },
  TECHNICIAN: { label: "Technician", cls: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800/60" },
  VIEWER: { label: "Viewer", cls: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700" },
  CUSTOMER: { label: "Customer", cls: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700" },
};

const AVATAR_HUES = [
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
];

function avatarStyle(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[hash % AVATAR_HUES.length];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";
}

function DeviceIcon({ device }: { device: string }) {
  const d = device.toLowerCase();
  if (d.includes("phone") || d.includes("android") || d.includes("ios") || d.includes("mobile"))
    return <Smartphone className="h-3.5 w-3.5" />;
  if (d.includes("tablet") || d.includes("ipad")) return <Tablet className="h-3.5 w-3.5" />;
  return <Monitor className="h-3.5 w-3.5" />;
}

function EventIcon({ action }: { action: string }) {
  const cls = "h-3.5 w-3.5";
  switch (action) {
    case "LOGIN":
      return <LogIn className={cn(cls, "text-emerald-600 dark:text-emerald-400")} />;
    case "LOGOUT":
      return <LogOut className={cn(cls, "text-slate-500 dark:text-slate-400")} />;
    case "LOGIN_FAILED":
      return <ShieldAlert className={cn(cls, "text-red-600 dark:text-red-400")} />;
    case "PASSWORD_CHANGE":
      return <KeyRound className={cn(cls, "text-amber-600 dark:text-amber-400")} />;
    case "API_KEY_ROTATE":
      return <KeyRound className={cn(cls, "text-amber-600 dark:text-amber-400")} />;
    default:
      return <ShieldCheck className={cn(cls, "text-slate-500")} />;
  }
}

const EVENT_LABEL: Record<string, string> = {
  LOGIN: "Signed in",
  LOGOUT: "Signed out",
  LOGIN_FAILED: "Failed sign-in",
  PASSWORD_CHANGE: "Password changed",
  API_KEY_ROTATE: "API key rotated",
};

// ── Sub components ───────────────────────────────────────────────────

function StatTile({
  label,
  value,
  tone,
  icon: Icon,
  title,
}: {
  label: string;
  value: number;
  tone: "emerald" | "teal" | "red" | "amber";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  const tones = {
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    teal: "text-teal-600 dark:text-teal-400 bg-teal-500/10",
    red: "text-red-600 dark:text-red-400 bg-red-500/10",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  } as const;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2.5 rounded-lg border bg-card/50 px-2.5 py-2 hover:bg-accent/40 transition-colors cursor-default">
            <span className={cn("flex h-7 w-7 items-center justify-center rounded-md shrink-0", tones[tone])}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-bold tabular-nums">{value}</p>
              <p className="text-[10px] text-muted-foreground truncate">{label}</p>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {title}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Main widget ──────────────────────────────────────────────────────

export function SecurityPostureWidget() {
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  const { data, isLoading, isError } = useQuery<PostureData>({
    queryKey: ["security-posture"],
    queryFn: () => apiFetch<PostureData>("/api/security/posture"),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const stats = data?.stats;
  const sessions = data?.sessions ?? [];
  const events = data?.events ?? [];

  return (
    <Card
      className="border shadow-sm animate-card-enter hover:shadow-md transition-all duration-200 rounded-xl overflow-hidden"
      style={{ animationDelay: "500ms" }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                Security Posture
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              </CardTitle>
              <CardDescription className="text-xs">
                Active sessions &amp; authentication events
              </CardDescription>
            </div>
          </div>
          {stats && stats.failedLogins7d > 0 && (
            <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 shrink-0">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {stats.failedLogins7d} failed login{stats.failedLogins7d !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* ── Stat tiles ── */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg skeleton-wave" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2.5 text-xs text-red-700 dark:text-red-300">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            Could not load security telemetry. Retrying…
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="Active Sessions"
              value={stats.activeSessions}
              tone="emerald"
              icon={ShieldCheck}
              title={`${stats.distinctUsers} distinct user${stats.distinctUsers !== 1 ? "s" : ""} currently signed in`}
            />
            <StatTile
              label="Logins (24h)"
              value={stats.loginsLast24h}
              tone="teal"
              icon={LogIn}
              title="Successful sign-ins in the last 24 hours"
            />
            <StatTile
              label="Failed (7d)"
              value={stats.failedLogins7d}
              tone="red"
              icon={UserX}
              title="Failed login attempts in the last 7 days — investigate if rising"
            />
            <StatTile
              label="Locked / Suspended"
              value={stats.lockedUsers + stats.suspendedUsers}
              tone="amber"
              icon={AlertTriangle}
              title={`${stats.lockedUsers} locked · ${stats.suspendedUsers} suspended · ${stats.inactiveUsers} inactive of ${stats.totalStaffUsers} staff accounts`}
            />
          </div>
        ) : null}

        {/* ── Active sessions ── */}
        {!isLoading && !isError && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Signed-in devices
              </p>
              <Badge variant="outline" className="h-4.5 px-1.5 text-[10px] text-muted-foreground">
                {sessions.length} shown
              </Badge>
            </div>
            {sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center rounded-lg border border-dashed">
                No active sessions right now.
              </p>
            ) : (
              <div className="max-h-52 overflow-y-auto -mx-1 px-1 space-y-1.5 nice-scroll">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="group flex items-center gap-2.5 rounded-lg border bg-card/60 px-2.5 py-2 hover:bg-accent/40 hover:border-emerald-500/30 transition-colors"
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                        avatarStyle(s.userName)
                      )}
                    >
                      {initials(s.userName)}
                    </span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="text-xs font-semibold truncate flex items-center gap-1.5">
                        {s.userName}
                        <Badge
                          variant="outline"
                          className={cn("h-3.5 px-1 text-[8.5px] font-semibold", ROLE_BADGE[s.role]?.cls ?? ROLE_BADGE.VIEWER.cls)}
                        >
                          {ROLE_BADGE[s.role]?.label ?? s.role}
                        </Badge>
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                        <DeviceIcon device={s.device} />
                        <span className="truncate">{s.browser || s.device}</span>
                        <span className="text-muted-foreground/50">·</span>
                        <Globe className="h-2.5 w-2.5 shrink-0" />
                        <span className="font-mono">{s.ipAddress}</span>
                      </p>
                    </div>
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0 tabular-nums">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            {formatDistanceToNow(new Date(s.loginAt), { addSuffix: true })}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-xs">
                          Signed in {new Date(s.loginAt).toLocaleString("en-IN")}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Recent auth events ── */}
        {!isLoading && !isError && events.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Recent auth events
            </p>
            <div className="max-h-40 overflow-y-auto -mx-1 px-1 space-y-1 nice-scroll">
              {events.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40 transition-colors text-xs"
                >
                  <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-md bg-muted/70">
                    <EventIcon action={e.action} />
                  </span>
                  <span
                    className={cn(
                      "font-medium truncate",
                      e.action === "LOGIN_FAILED" && "text-red-600 dark:text-red-400"
                    )}
                  >
                    {e.userName !== "System" ? e.userName : e.email || "Unknown"}
                  </span>
                  <span className="text-muted-foreground truncate hidden sm:inline">
                    {EVENT_LABEL[e.action] ?? e.action}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground shrink-0 tabular-nums flex items-center gap-1.5">
                    <span className="font-mono hidden md:inline text-[9.5px] text-muted-foreground/70">
                      {e.ipAddress !== "unknown" ? e.ipAddress : ""}
                    </span>
                    {formatDistanceToNow(new Date(e.timestamp), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Footer link ── */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60"
          onClick={() => setCurrentPage("Admin Users", "SETTINGS")}
        >
          <Eye className="h-3.5 w-3.5 mr-1.5" />
          Manage users &amp; sessions
        </Button>
      </CardContent>
    </Card>
  );
}
