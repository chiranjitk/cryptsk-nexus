"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// ============================================================
// CRYPTSK Nexus — Reset Password card (public)
// One-time reset-link landing: rendered INSTEAD of LoginCard
// when the URL carries ?reset=<token> (see LoginCard branch).
// POSTs /api/auth/reset-password {token, password}.
// ============================================================

export function ResetPasswordCard({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<{ password?: string; confirm?: string }>({});
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  function validate(): boolean {
    const errs: { password?: string; confirm?: string } = {};
    if (password.length < 8) errs.password = "Password must be at least 8 characters.";
    if (confirmPassword !== password) errs.confirm = "Passwords do not match.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body.error || "Could not reset the password. Please try again.");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleBackToSignIn() {
    // Clearing the ?reset param brings LoginCard back
    router.replace("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 relative overflow-hidden">
      {/* Animated gradient background (matches LoginCard) */}
      <div className="absolute inset-0 login-gradient-spin opacity-90" />
      <div className="absolute inset-0 bg-black/20" />

      {/* Floating shapes */}
      <div className="absolute top-20 left-20 size-64 rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute bottom-20 right-20 size-72 rounded-full bg-violet-500/20 blur-3xl" />

      <Card className="relative w-full max-w-md cryptsk-card-load border-2 border-white/20 bg-white/95 backdrop-blur-xl dark:bg-slate-900/95 shadow-2xl">
        <CardHeader className="space-y-3 text-center pb-6">
          <div className="flex justify-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-primary sidebar-logo-glow">
              <span className="text-primary-foreground font-bold text-3xl">C</span>
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-gradient-red">
              Set a new password
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-1">
              This one-time link securely identifies your account
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          {success ? (
            <div className="space-y-4 cryptsk-fade-in">
              <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  Password updated — you can now sign in with your new password.
                </p>
              </div>
              <Button
                type="button"
                onClick={handleBackToSignIn}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground gap-2 font-medium"
              >
                <ShieldCheck className="size-4" />
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="reset-password" className="text-xs font-medium">New password</Label>
                <div className="relative">
                  <Input
                    id="reset-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
                    }}
                    placeholder="••••••••"
                    required
                    disabled={loading}
                    autoComplete="new-password"
                    aria-invalid={!!fieldErrors.password}
                    aria-describedby={fieldErrors.password ? "reset-password-error" : undefined}
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p id="reset-password-error" className="text-xs text-rose-600 dark:text-rose-400">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="reset-confirm" className="text-xs font-medium">Confirm password</Label>
                <div className="relative">
                  <Input
                    id="reset-confirm"
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (fieldErrors.confirm) setFieldErrors((p) => ({ ...p, confirm: undefined }));
                    }}
                    placeholder="••••••••"
                    required
                    disabled={loading}
                    autoComplete="new-password"
                    aria-invalid={!!fieldErrors.confirm}
                    aria-describedby={fieldErrors.confirm ? "reset-confirm-error" : undefined}
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {fieldErrors.confirm && (
                  <p id="reset-confirm-error" className="text-xs text-rose-600 dark:text-rose-400">
                    {fieldErrors.confirm}
                  </p>
                )}
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-600 dark:text-rose-400 cryptsk-card-load"
                >
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground gap-2 font-medium"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 cryptsk-spin" />
                    Updating password…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-4" />
                    Update password
                  </>
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
