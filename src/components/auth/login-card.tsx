"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function LoginCard() {
  const router = useRouter();
  const [email, setEmail] = React.useState("admin@cryptsk.com");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password");
      setLoading(false);
    } else if (result?.ok || result?.url) {
      // Force a full page reload so SessionProvider picks up the new cookie
      window.location.href = "/";
    } else {
      setError("Login failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 relative overflow-hidden">
      {/* Animated gradient background */}
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
              CRYPTSK Nexus
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-1">
              Enterprise ISP Platform · Sign in to continue
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@cryptsk.com"
                required
                disabled={loading}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-medium">Password</Label>
                <button type="button" className="text-[10px] text-muted-foreground hover:text-primary">
                  Forgot?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-600 dark:text-rose-400 cryptsk-card-load">
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
                  Signing in…
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" />
                  Sign In
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t text-center">
            <p className="text-[10px] text-muted-foreground">
              Default admin: <code className="font-mono bg-muted px-1.5 py-0.5 rounded">admin@cryptsk.com</code> / <code className="font-mono bg-muted px-1.5 py-0.5 rounded">Admin@2026</code>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
