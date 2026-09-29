"use client";

import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// ============================================================
// CRYPTSK Nexus — Forgot Password dialog (public, from LoginCard)
// POSTs /api/auth/forgot-password {email}. There is no e-mail
// transport in this deployment: a one-time reset link is created
// and the support desk hands it over after identity verification
// (see the staff "Password Resets" queue in Administration).
// ============================================================

const SUCCESS_FALLBACK =
  "If the account exists, a one-time reset link has been created. Our support desk will hand it to you after identity verification.";

export function ForgotPasswordDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const [emailValue, setEmailValue] = React.useState(email);
  const [loading, setLoading] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const emailRef = React.useRef<HTMLInputElement>(null);

  // On open, focus the email input (dialog mounts fresh each time)
  React.useEffect(() => {
    emailRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailValue }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body.error || "Something went wrong. Please try again.");
      } else {
        // Always a non-committal success (no account enumeration) —
        // show the exact server message.
        setSuccessMessage(body.message || SUCCESS_FALLBACK);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md cryptsk-card-load">
        <DialogHeader>
          <DialogTitle>Forgot your password?</DialogTitle>
          <DialogDescription>
            We&apos;ll create a one-time reset link — our support desk verifies your identity before handing it over.
          </DialogDescription>
        </DialogHeader>

        {successMessage ? (
          <div className="space-y-4 cryptsk-fade-in">
            <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="space-y-1">
                <p className="text-sm text-emerald-700 dark:text-emerald-400">{successMessage}</p>
                <p className="text-xs text-muted-foreground">
                  Request reference: this appears in the support desk&apos;s Password Resets queue.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forgot-email" className="text-xs font-medium">Email</Label>
              <Input
                id="forgot-email"
                ref={emailRef}
                type="email"
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
                placeholder="admin@cryptsk.com"
                required
                disabled={loading}
                autoComplete="email"
                className="h-11"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-600 dark:text-rose-400 cryptsk-card-load"
              >
                {error}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
              <Button
                type="submit"
                disabled={loading}
                className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {loading && <Loader2 className="size-4 cryptsk-spin" />}
                {loading ? "Creating request…" : "Request reset link"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
