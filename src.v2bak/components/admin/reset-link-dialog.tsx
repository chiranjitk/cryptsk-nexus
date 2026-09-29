"use client";

import * as React from "react";
import { AlertTriangle, Copy, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

// ============================================================
// CRYPTSK Nexus — shared reset-link dialog (staff, admin chrome)
// POSTs to `endpoint` on open (no body — the id is in the URL) and
// displays the resulting one-time link: copy, open, expiry. Used by
// UsersPanel (/api/users/[id]/reset-link), Customer 360 portal users
// (/api/portal-users/[id]/reset-link) and the Password Resets queue
// (/api/auth/reset-requests/[id]/deliver). All return {link, expiresAt}.
// ============================================================

type ResetLinkResult = { link: string; expiresAt: string };

function formatExpiry(expiresAt: string): string {
  try {
    return new Date(expiresAt).toLocaleString("en-IN", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return expiresAt;
  }
}

export function ResetLinkDialog({
  title,
  description,
  endpoint,
  email,
  onClose,
}: {
  title: string;
  description: string;
  endpoint: string;
  email: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [result, setResult] = React.useState<ResetLinkResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `Request failed (${res.status})`);
        setResult(null);
      } else {
        setResult({ link: body.link, expiresAt: body.expiresAt });
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // POST as soon as the dialog opens
  React.useEffect(() => {
    generate();
  }, [endpoint]);

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.link);
      toast({ title: "Reset link copied" });
    } catch {
      toast({ title: "Could not copy link", description: "Select the link text and copy it manually.", variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md cryptsk-card-load">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description}
            {email && <span className="block font-mono text-xs mt-1">{email}</span>}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3" aria-busy="true">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Generating one-time reset link…
            </div>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : error ? (
          <div className="space-y-3">
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-600 dark:text-rose-400 cryptsk-card-load"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Close</Button>
              <Button type="button" onClick={generate}>Try again</Button>
            </DialogFooter>
          </div>
        ) : result ? (
          <div className="space-y-3 cryptsk-fade-in">
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={result.link}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="One-time reset link"
                className="h-9 flex-1 font-mono text-xs"
              />
              <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 shrink-0" onClick={handleCopy}>
                <Copy className="size-3.5" /> Copy
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <a
                href={result.link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline underline-offset-2"
              >
                <ExternalLink className="size-3.5" /> Open link
              </a>
              <span className="text-muted-foreground">
                One-time use · expires {formatExpiry(result.expiresAt)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this only after verifying the requester&apos;s identity — anyone holding it can set a new password.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
