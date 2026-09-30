"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Radio,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Users,
  Shield,
  Server,
} from "lucide-react";

interface SyncStatus {
  status: "synced" | "minor_drift" | "drifted" | "error";
  app: { radiusEnabledSubscribers: number };
  radius: {
    users: number;
    replies: number;
    userGroups: number;
    groupReplies: number;
    groupChecks: number;
  };
  drift: {
    total: number;
    orphanedRadiusUsers: string[];
    missingRadiusUsers: string[];
    missingGroupAttributes: string[];
  };
  error?: string;
}

const statusConfig = {
  synced: {
    label: "Synced",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    icon: CheckCircle2,
    dot: "bg-emerald-500",
  },
  minor_drift: {
    label: "Minor Drift",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    icon: AlertTriangle,
    dot: "bg-amber-500",
  },
  drifted: {
    label: "Drifted",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    icon: XCircle,
    dot: "bg-red-500",
  },
  error: {
    label: "Error",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    icon: XCircle,
    dot: "bg-red-500",
  },
};

function MetricRow({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-60" />
        {label}
      </div>
      <div className="text-right">
        <span className="text-xs font-semibold tabular-nums text-foreground/90">
          {value.toLocaleString()}
        </span>
        {sub && (
          <span className="ml-1.5 text-[10px] text-muted-foreground/60">{sub}</span>
        )}
      </div>
    </div>
  );
}

export function RadiusSyncStatusWidget() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<SyncStatus>({
    queryKey: ["radius-sync-status"],
    queryFn: () => fetch("/api/freeradius/sync-status").then((r) => r.json()),
    refetchInterval: 120_000,
    staleTime: 90_000,
    retry: 1,
  });

  const config = data ? statusConfig[data.status] : statusConfig.error;
  const StatusIcon = config.icon;

  if (isError) {
    return (
      <Card className="border-border/40">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Radio className="h-4 w-4 text-red-500" />
              RADIUS Sync
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-xs text-muted-foreground">Unable to check sync status</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card className="border-border/40">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" />
              RADIUS Sync
            </CardTitle>
            <div className="flex items-center gap-2">
              {data && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-1.5 py-0 h-5 gap-1 border",
                    config.bg,
                    config.color
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
                  {config.label}
                </Badge>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => refetch()}
                    className="p-1 rounded-md hover:bg-muted/50 transition-colors"
                    disabled={isFetching}
                  >
                    <RefreshCw
                      className={cn(
                        "h-3.5 w-3.5 text-muted-foreground/60",
                        isFetching && "animate-spin"
                      )}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Refresh sync status</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full rounded" />
              ))}
            </div>
          ) : data ? (
            <>
              <div className="rounded-lg border border-border/30 overflow-hidden">
                <MetricRow
                  icon={Users}
                  label="App RADIUS Subs"
                  value={data.app.radiusEnabledSubscribers}
                  sub="enabled"
                />
                <MetricRow
                  icon={Shield}
                  label="RADIUS Users"
                  value={data.radius.users}
                  sub="radcheck"
                />
                <MetricRow
                  icon={Server}
                  label="User Groups"
                  value={data.radius.userGroups}
                  sub="radusergroup"
                />
                <MetricRow
                  icon={Radio}
                  label="Group Replies"
                  value={data.radius.groupReplies}
                  sub="radgroupreply"
                />
                <MetricRow
                  icon={Shield}
                  label="Group Checks"
                  value={data.radius.groupChecks}
                  sub="radgroupcheck"
                />
              </div>

              {data.drift.total > 0 && (
                <div className="mt-3 space-y-2">
                  {data.drift.orphanedRadiusUsers.length > 0 && (
                    <div className="text-[10px]">
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                        {data.drift.orphanedRadiusUsers.length} orphaned:
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {data.drift.orphanedRadiusUsers.slice(0, 5).join(", ")}
                        {data.drift.orphanedRadiusUsers.length > 5 && " …"}
                      </span>
                    </div>
                  )}
                  {data.drift.missingRadiusUsers.length > 0 && (
                    <div className="text-[10px]">
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        {data.drift.missingRadiusUsers.length} missing:
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {data.drift.missingRadiusUsers.slice(0, 5).join(", ")}
                        {data.drift.missingRadiusUsers.length > 5 && " …"}
                      </span>
                    </div>
                  )}
                  {data.drift.missingGroupAttributes.length > 0 && (
                    <div className="text-[10px]">
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                        {data.drift.missingGroupAttributes.length} groups missing attrs:
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {data.drift.missingGroupAttributes.join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
