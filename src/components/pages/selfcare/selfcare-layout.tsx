"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSubscriberAuthStore } from "@/store/subscriber-auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LayoutDashboard,
  Activity,
  Receipt,
  HelpCircle,
  User,
  Wifi,
  LogOut,
  Bell,
  Menu,
  X,
  Loader2,
  Eye,
  EyeOff,
  Lock,
  UserCircle,
  CircleDot,
  ChevronRight,
  Shield,
  CreditCard,
  Gauge,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/store/app-store";

// ─── Sub Pages (lazy) ─────────────────────────────────────────
import SelfcareDashboard from "@/components/pages/selfcare/selfcare-dashboard";
import SelfcareUsage from "@/components/pages/selfcare/selfcare-usage";
import SelfcareBilling from "@/components/pages/selfcare/selfcare-billing";
import SelfcareSupport from "@/components/pages/selfcare/selfcare-support";
import SelfcareProfile from "@/components/pages/selfcare/selfcare-profile";
import SelfcareServices from "@/components/pages/selfcare/selfcare-services";
import SelfcarePayments from "@/components/pages/selfcare/selfcare-payments";
import SelfcarePlanCompare from "@/components/pages/selfcare/selfcare-plan-compare";
import SelfcareSpeedHistory from "@/components/pages/selfcare/selfcare-speed-history";

// ─── Navigation Items ─────────────────────────────────────────

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "usage", label: "My Usage", icon: Activity },
  { id: "billing", label: "Billing", icon: Receipt },
  { id: "support", label: "Support", icon: HelpCircle },
  { id: "profile", label: "My Profile", icon: User },
  { id: "services", label: "Service Status", icon: Wifi },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "speed-history", label: "Speed History", icon: Gauge },
  { id: "plan-compare", label: "Plan Comparison", icon: BarChart3 },
] as const;

export type NavPage = (typeof NAV_ITEMS)[number]["id"];

// ─── Subscriber Login Form ────────────────────────────────────

function SubscriberLoginForm() {
  const { login, isLoggingIn, error, clearError } = useSubscriberAuthStore();
  const [serviceUsername, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceUsername.trim() || !password.trim()) {
      toast.error("Missing fields", {
        description: "Please enter both username and password.",
        style: { background: "#FFFFFF", color: "#111827", border: "1px solid #FCA5A5" },
      });
      return;
    }

    const success = await login(serviceUsername.trim(), password.trim());
    if (success) {
      const sub = useSubscriberAuthStore.getState().subscriber;
      toast.success("Welcome!", {
        description: `Signed in as ${sub?.name || serviceUsername}`,
        style: { background: "#FFFFFF", color: "#111827", border: "1px solid #D1FAE5" },
      });
    } else {
      toast.error("Login failed", {
        description:
          useSubscriberAuthStore.getState().error || "Invalid credentials",
        style: { background: "#FFFFFF", color: "#111827", border: "1px solid #FCA5A5" },
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
      {/* Decorative elements */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="sc-hex-grid" width="60" height="52" patternUnits="userSpaceOnUse" patternTransform="rotate(15)">
            <path d="M30 0L60 15V37L30 52L0 37V15Z" fill="none" stroke="#DC2626" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sc-hex-grid)" />
      </svg>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full" style={{ background: "radial-gradient(circle, rgba(220, 38, 38, 0.08) 0%, transparent 60%)" }} />
      {/* Top status bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-center gap-4 py-3 px-4 text-[10px] font-medium tracking-wider uppercase" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 100%)" }}>
        <div className="flex items-center gap-1.5 text-green-400/70">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span>All Systems Operational</span>
        </div>
        <span className="text-white/20">|</span>
        <div className="flex items-center gap-1.5 text-white/40">
          <Shield className="w-3 h-3" />
          Secured Connection
        </div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Branding */}
        <div className="text-center mb-8">
          {/* Logo with glow */}
          <div className="relative inline-block mb-5">
            <div className="absolute -inset-4 rounded-2xl border border-red-500/10" />
            <div className="absolute -inset-2 rounded-xl border border-red-500/[0.06]" />
            <div className="inline-flex items-center justify-center w-18 h-18 p-4 rounded-2xl bg-gradient-to-br from-red-500 to-red-700 shadow-lg shadow-red-500/30 relative" style={{ boxShadow: "0 0 30px rgba(220, 38, 38, 0.2)" }}>
              <CircleDot className="w-9 h-9 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Subscriber Portal
          </h1>
          <div className="flex items-center justify-center gap-2 mt-1.5">
            <div className="w-5 h-px bg-red-500/50" />
            <p className="text-[10px] font-semibold tracking-[0.3em] text-red-400/80 uppercase">
              Self-Care Access
            </p>
            <div className="w-5 h-px bg-red-500/50" />
          </div>
        </div>

        {/* Login card with glass effect */}
        <div className="rounded-2xl p-[1px] bg-gradient-to-b from-red-500/20 via-red-500/5 to-transparent">
          <Card className="rounded-2xl border-0 shadow-2xl relative overflow-hidden" style={{ background: "linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(8, 12, 24, 0.98) 100%)", borderColor: "rgba(220, 38, 38, 0.08)" }}>
            {/* Top accent line */}
            <div className="absolute top-0 left-8 right-8 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(220, 38, 38, 0.4) 50%, transparent 100%)" }} />
            <CardHeader className="pb-4 relative z-10">
              <CardTitle className="text-lg text-white">Sign In to Your Account</CardTitle>
              <CardDescription className="text-slate-400">
                Enter your service credentials to manage your internet connection
              </CardDescription>
            </CardHeader>
            <CardContent className="relative z-10">
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {error && (
                  <div className="rounded-lg px-3 py-2.5 text-sm text-red-300" style={{ background: "rgba(220, 38, 38, 0.08)", borderColor: "rgba(220, 38, 38, 0.25)", border: "1px solid" }}>
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="sc-username" className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Service Username
                  </Label>
                  <div className="relative">
                    <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                      id="sc-username"
                      type="text"
                      placeholder="e.g. user001"
                      value={serviceUsername}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (error) clearError();
                      }}
                      className="pl-10 h-12 rounded-xl text-white placeholder:text-slate-600 border-slate-700/50 focus:border-red-500/50"
                      style={{ background: "rgba(15, 23, 42, 0.6)" }}
                      disabled={isLoggingIn}
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sc-password" className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                      id="sc-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) clearError();
                      }}
                      className="pl-10 pr-10 h-12 rounded-xl text-white placeholder:text-slate-600 border-slate-700/50 focus:border-red-500/50"
                      style={{ background: "rgba(15, 23, 42, 0.6)" }}
                      disabled={isLoggingIn}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl font-semibold text-sm tracking-wide text-white border-0 transition-all duration-200 relative overflow-hidden"
                  style={{ background: "linear-gradient(135deg, #DC2626 0%, #991B1B 100%)", boxShadow: "0 4px 15px rgba(220, 38, 38, 0.3)" }}
                  disabled={isLoggingIn}
                >
                  {isLoggingIn ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Authenticating…
                    </>
                  ) : (
                    "Sign In to Portal"
                  )}
                </Button>
              </form>
            </CardContent>
            {/* Bottom accent line */}
            <div className="absolute bottom-0 left-8 right-8 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(220, 38, 38, 0.12) 50%, transparent 100%)" }} />
          </Card>
        </div>

        <div className="mt-6 flex items-center justify-center gap-4 text-slate-500">
          <button
            type="button"
            onClick={() => {
              useAppStore.getState().setCurrentPage("Dashboard", "MAIN");
            }}
            className="inline-flex items-center gap-1.5 text-slate-500 hover:text-red-400 transition-colors text-xs"
          >
            <Shield className="w-3 h-3" />
            Back to Admin Login
          </button>
          <span className="text-slate-700">·</span>
          <span className="text-xs">
            © {new Date().getFullYear()} Cryptsk Pvt Ltd
          </span>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 z-20" style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.5) 0%, transparent 100%)" }}>
        <div className="flex items-center justify-center gap-6 py-4 text-[10px] text-white/30 uppercase tracking-wider">
          <span>TLS 1.3</span>
          <span className="text-white/10">|</span>
          <span>256-bit Encryption</span>
          <span className="text-white/10">|</span>
          <span>v6.4</span>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar Navigation ───────────────────────────────────────

function SidebarNav({
  currentPage,
  onNavigate,
  isOpen,
  onClose,
}: {
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center backdrop-blur-sm">
                <CircleDot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-sm tracking-wide">CRYPTSK</h2>
                <p className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">
                  Self-Care
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="lg:hidden p-1 rounded-md hover:bg-white/10 transition-colors"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Nav items */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {NAV_ITEMS.map((item) => {
              const isActive = currentPage === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    onClose();
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-white/20 text-white shadow-sm"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="w-4.5 h-4.5 flex-shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {isActive && (
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="px-4 py-4 border-t border-white/10">
            <p className="text-[10px] text-slate-500 text-center">
              v6.4 · Cryptsk ISP Platform
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Page Renderer ────────────────────────────────────────────

function PageContent({ page, onNavigate }: { page: NavPage; onNavigate: (page: NavPage) => void }) {
  switch (page) {
    case "dashboard":
      return <SelfcareDashboard onNavigate={onNavigate} />;
    case "usage":
      return <SelfcareUsage />;
    case "billing":
      return <SelfcareBilling />;
    case "support":
      return <SelfcareSupport />;
    case "profile":
      return <SelfcareProfile />;
    case "services":
      return <SelfcareServices />;
    case "payments":
      return <SelfcarePayments />;
    case "speed-history":
      return <SelfcareSpeedHistory onNavigate={onNavigate} />;
    case "plan-compare":
      return <SelfcarePlanCompare onNavigate={onNavigate} />;
    default:
      return <SelfcareDashboard />;
  }
}

// ─── Main Layout ──────────────────────────────────────────────

export default function SelfcareLayout() {
  const {
    subscriber,
    isAuthenticated,
    isLoading,
    logout,
    checkAuth,
  } = useSubscriberAuthStore();
  const [currentPage, setCurrentPage] = useState<NavPage>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleLogout = useCallback(async () => {
    await logout();
    toast.info("Signed out", {
      description: "You have been signed out of the portal.",
    });
  }, [logout]);

  // Loading state
  if (isLoading && !isAuthenticated) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 text-red-500 animate-spin" />
          <p className="text-sm text-muted-foreground">
            Verifying session…
          </p>
        </div>
      </div>
    );
  }

  // Not authenticated — show login
  if (!isAuthenticated) {
    return <SubscriberLoginForm />;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sidebar */}
      <SidebarNav
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main area */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/50">
          <div className="flex items-center justify-between px-4 sm:px-6 h-14">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="hidden sm:block">
                <h1 className="text-sm font-semibold text-foreground">
                  {NAV_ITEMS.find((i) => i.id === currentPage)?.label || "Dashboard"}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {/* Notification bell */}
              <button
                className="relative p-2 rounded-lg hover:bg-muted transition-colors"
                aria-label="Notifications"
                onClick={() =>
                  toast.info("Notifications", {
                    description: "No new notifications.",
                  })
                }
              >
                <Bell className="w-4.5 h-4.5 text-muted-foreground" />
              </button>

              {/* Subscriber info */}
              <div className="hidden sm:flex items-center gap-2.5 pl-2 border-l border-border/50">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white text-xs font-bold">
                  {subscriber?.name?.charAt(0)?.toUpperCase() || "U"}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-foreground leading-tight">
                    {subscriber?.name || "Subscriber"}
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-tight">
                    {subscriber?.plan?.name || "No Plan"}
                  </span>
                </div>
              </div>

              {/* Logout */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-muted-foreground hover:text-destructive ml-1"
              >
                <LogOut className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 p-4 sm:p-6">
          <PageContent page={currentPage} onNavigate={setCurrentPage} />
        </main>

        {/* Footer */}
        <footer className="border-t border-border/50 bg-background/60 backdrop-blur-sm mt-auto">
          <div className="px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-1.5 text-xs text-muted-foreground">
            <span>© {new Date().getFullYear()} Cryptsk Intelligent ISP Platform</span>
            <span>Subscriber Self-Care Portal · v6.4</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
