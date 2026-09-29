"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, LifeBuoy, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ResetLinkDialog } from "@/components/admin/reset-link-dialog";

// ============================================================
// CRYPTSK Nexus — Administration · Password Resets (helpdesk queue)
// Self-service Forgot? requests from the sign-in page land here.
// No e-mail transport exists in this deployment: staff verify the
// requester's identity out-of-band, then hand over the one-time
// reset link (POST /api/auth/reset-requests/[id]/deliver → {link, expiresAt}).
// ============================================================

type ResetRequestRow = {
  id: string;
  actorType: "staff" | "portal";
  email: string;
  accountName: string | null;
  accountCode: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  deliveredAt: string | null;
  status: "pending" | "delivered" | "used" | "expired";
};

function rel(date: string | null | undefined): string {
  if (!date) return "Never";
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return "—";
  }
}

function fmtLocal(date: string | null | undefined): string {
  if (!date) return "—";
  try {
    return new Date(date).toLocaleString("en-IN", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

const TYPE_BADGE: Record<ResetRequestRow["actorType"], { label: string; className: string }> = {
  staff: { label: "Staff", className: "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  portal: { label: "Customer", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
};

const STATUS_BADGE: Record<ResetRequestRow["status"], { label: string; className: string }> = {
  pending: { label: "Pending", className: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  delivered: { label: "Delivered", className: "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  used: { label: "Used", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  expired: { label: "Expired", className: "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-400" },
};

export function PasswordResetsTab() {
  const qc = useQueryClient();
  const [handover, setHandover] = React.useState<ResetRequestRow | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["password-resets"],
    queryFn: async () => {
      const res = await fetch("/api/auth/reset-requests");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load reset requests");
      }
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Pinned T10-a contract returns rows {id, actorType, email, …}; accept a
  // bare array or a wrapped payload at the boundary.
  const requests: ResetRequestRow[] = React.useMemo(() => {
    if (Array.isArray(data)) return data as ResetRequestRow[];
    return (data?.requests as ResetRequestRow[] | undefined) ?? [];
  }, [data]);

  function closeHandover() {
    setHandover(null);
    // deliveredAt changed on success — refresh the queue
    qc.invalidateQueries({ queryKey: ["password-resets"] });
  }

  return (
    <Card className="cryptsk-card-load">
      <CardHeader>
        <CardTitle className="text-base">Password Resets</CardTitle>
        <CardDescription>
          Self-service requests from the sign-in page&apos;s Forgot? action land here. Verify the
          requester&apos;s identity out-of-band (phone/SMS), then hand over the one-time link —
          there is no e-mail transport in this deployment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" /> Couldn&apos;t load reset requests.
            </span>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => refetch()}>
              <RefreshCw className="size-3" /> Retry
            </Button>
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <LifeBuoy className="size-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No reset requests yet</p>
            <p className="text-xs text-muted-foreground">
              Customers reach this via Forgot? on the sign-in page.
            </p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto cryptsk-scrollbar rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Requested</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => {
                  const type = TYPE_BADGE[r.actorType] || TYPE_BADGE.portal;
                  const status = STATUS_BADGE[r.status] || STATUS_BADGE.pending;
                  const handoverReady = r.status === "pending" || r.status === "delivered";
                  return (
                    <TableRow key={r.id} className="hover:bg-muted/50">
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap" title={fmtLocal(r.createdAt)}>
                        {rel(r.createdAt)}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{r.email}</p>
                        {(r.accountName || r.accountCode) && (
                          <p className="text-xs text-muted-foreground">
                            {r.accountName}
                            {r.accountName && r.accountCode ? " · " : ""}
                            {r.accountCode}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${type.className}`}>
                          {type.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${status.className}`}>
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.status === "pending" && fmtLocal(r.expiresAt)}
                        {r.status === "delivered" && `link ready until ${fmtLocal(r.expiresAt)}`}
                        {(r.status === "used" || r.status === "expired") && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {handoverReady ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setHandover(r)}
                          >
                            Hand over link
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {handover && (
        <ResetLinkDialog
          title="Hand over reset link"
          description="Verify the requester's identity, then share this one-time link. The request is marked delivered."
          endpoint={`/api/auth/reset-requests/${handover.id}/deliver`}
          email={handover.email}
          onClose={closeHandover}
        />
      )}
    </Card>
  );
}
