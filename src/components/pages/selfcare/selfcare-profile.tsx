"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useSubscriberAuthStore, type SubscriberProfile } from "@/store/subscriber-auth-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  User,
  Shield,
  Globe,
  Save,
  Loader2,
  Eye,
  EyeOff,
  Lock,
  Zap,
  Copy,
  Check,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function passwordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: "Weak", color: "bg-red-500" };
  if (score <= 2) return { score, label: "Fair", color: "bg-amber-500" };
  if (score <= 3) return { score, label: "Good", color: "bg-red-500" };
  return { score, label: "Strong", color: "bg-red-500" };
}

// ─── Info Row ─────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  badge,
  badgeClass,
}: {
  label: string;
  value: string;
  badge?: boolean;
  badgeClass?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      {badge ? (
        <Badge className={`text-[10px] ${badgeClass || ""}`}>{value}</Badge>
      ) : (
        <span className="font-medium text-foreground">{value}</span>
      )}
    </div>
  );
}

// ─── Gradient Icon Circle ───────────────────────────────────

function GradientIcon({ icon: Icon, from, to }: { icon: React.ElementType; from?: string; to?: string }) {
  return (
    <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${from || "from-red-500"} ${to || "to-red-700"} flex items-center justify-center flex-shrink-0`}>
      <Icon className="w-3.5 h-3.5 text-white" />
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  description,
  from,
  to,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  from?: string;
  to?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <GradientIcon icon={Icon} from={from} to={to} />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

// ─── Profile Section ──────────────────────────────────────────

function ProfileForm({ profile, onSaved }: { profile: SubscriberProfile; onSaved: (p: SubscriberProfile) => void }) {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [altPhone, setAltPhone] = useState(profile.altPhone);
  const [address, setAddress] = useState(profile.address);
  const [landmark, setLandmark] = useState(profile.landmark);
  const [pincode, setPincode] = useState(profile.pincode);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { toast.error("Invalid email format"); return; }
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(phone)) { toast.error("Phone must be 10 digits"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/subscriber-auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          altPhone,
          address,
          landmark,
          pincode,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Profile updated", {
          description: "Your contact information has been saved.",
        });
        if (data.subscriber) onSaved(data.subscriber);
      } else {
        toast.error("Update failed", {
          description: data.error || "Please try again.",
        });
      }
    } catch {
      toast.error("Network error", {
        description: "Could not save profile. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    name !== profile.name ||
    email !== profile.email ||
    phone !== profile.phone ||
    altPhone !== profile.altPhone ||
    address !== profile.address ||
    landmark !== profile.landmark ||
    pincode !== profile.pincode;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sc-name" className="text-xs font-medium">Full Name</Label>
          <Input id="sc-name" value={name} onChange={(e) => setName(e.target.value)} className="h-10" disabled={saving} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sc-email" className="text-xs font-medium">Email</Label>
          <Input id="sc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" disabled={saving} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sc-phone" className="text-xs font-medium">Phone</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">+91</span>
            <Input id="sc-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="pl-11 h-10" disabled={saving} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sc-altphone" className="text-xs font-medium">Alternate Phone</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">+91</span>
            <Input id="sc-altphone" value={altPhone} onChange={(e) => setAltPhone(e.target.value)} className="pl-11 h-10" disabled={saving} placeholder="Optional" />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="sc-address" className="text-xs font-medium">Address</Label>
        <Input id="sc-address" value={address} onChange={(e) => setAddress(e.target.value)} className="h-10" disabled={saving} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sc-landmark" className="text-xs font-medium">Landmark</Label>
          <Input id="sc-landmark" value={landmark} onChange={(e) => setLandmark(e.target.value)} className="h-10" disabled={saving} placeholder="Optional" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sc-pincode" className="text-xs font-medium">Pincode</Label>
          <Input id="sc-pincode" value={pincode} onChange={(e) => setPincode(e.target.value)} className="h-10" disabled={saving} maxLength={6} />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-sm shadow-red-500/20"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Password Change ──────────────────────────────────────────

function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [changing, setChanging] = useState(false);

  const strength = passwordStrength(newPassword);

  const handleChange = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Missing fields", {
        description: "Please fill in all password fields.",
      });
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Weak password", {
        description: "New password must be at least 8 characters.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Password mismatch", {
        description: "New password and confirmation do not match.",
      });
      return;
    }

    setChanging(true);
    try {
      const res = await fetch("/api/subscriber-auth/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Password changed", {
          description: "Your service password has been updated.",
        });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast.error("Failed", {
          description: data.error || "Could not change password.",
        });
      }
    } catch {
      toast.error("Network error", {
        description: "Could not change password. Please try again.",
      });
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="sc-current-pw" className="text-xs font-medium">Current Password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="sc-current-pw"
            type={showCurrent ? "text" : "password"}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="pl-10 pr-10 h-10"
            disabled={changing}
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowCurrent(!showCurrent)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
            aria-label={showCurrent ? "Hide password" : "Show password"}
          >
            {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sc-new-pw" className="text-xs font-medium">New Password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="sc-new-pw"
            type={showNew ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="pl-10 pr-10 h-10"
            disabled={changing}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowNew(!showNew)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
            aria-label={showNew ? "Hide password" : "Show password"}
          >
            {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {newPassword.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i <= strength.score ? strength.color : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Password strength: <span className="font-medium">{strength.label}</span>
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="sc-confirm-pw" className="text-xs font-medium">Confirm New Password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="sc-confirm-pw"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="pl-10 h-10"
            disabled={changing}
            autoComplete="new-password"
          />
          {confirmPassword.length > 0 && newPassword.length > 0 && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {confirmPassword === newPassword ? (
                <Check className="w-4 h-4 text-red-500" />
              ) : (
                <span className="text-xs text-destructive">✗</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button
          onClick={handleChange}
          disabled={changing || !currentPassword || !newPassword || !confirmPassword}
          className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-sm shadow-violet-500/20"
        >
          {changing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Changing…
            </>
          ) : (
            <>
              <Shield className="w-4 h-4 mr-2" />
              Change Password
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────

export default function SelfcareProfile() {
  const { subscriber, isAuthenticated } = useSubscriberAuthStore();
  const [profile, setProfile] = useState<SubscriberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/subscriber-auth/me");
      const data = await res.json();
      if (data.success && data.subscriber) {
        setProfile(data.subscriber);
      } else {
        setError(data.error || "Failed to fetch profile");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) fetchProfile();
  }, [isAuthenticated, fetchProfile]);

  const sub = profile || subscriber;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !sub) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <User className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">{error || "No profile data available"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Avatar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 via-red-500 to-red-600 flex items-center justify-center text-white text-2xl font-bold ring-4 ring-red-500/20 shadow-lg shadow-red-500/20">
          {sub.name?.charAt(0)?.toUpperCase() || "U"}
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <User className="w-5 h-5 text-red-600" />
            My Profile
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your account information and security settings
          </p>
        </div>
      </div>

      {/* Account Information */}
      <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-3">
          <SectionHeader
            icon={User}
            title="Account Information"
            description="Your account details and plan information"
            from="from-red-500"
            to="to-red-700"
          />
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow label="Subscriber Code" value={sub.code} />
          <Separator />
          <InfoRow label="Service Username" value={sub.serviceUsername} />
          <Separator />
          <InfoRow
            label="Account Status"
            value={sub.status}
            badge
            badgeClass={
              sub.status === "ACTIVE"
                ? "bg-red-100 text-red-700 hover:bg-red-100 border-0"
                : sub.status === "SUSPENDED"
                  ? "bg-amber-100 text-amber-700 hover:bg-amber-100 border-0"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-100 border-0"
            }
          />
          <Separator />
          <InfoRow
            label="Current Plan"
            value={sub.plan?.name || "No Plan"}
          />
          <Separator />
          <InfoRow
            label="Speeds"
            value={sub.plan ? `↓${sub.plan.speedDown} / ↑${sub.plan.speedUp} Mbps` : "N/A"}
          />
          <Separator />
          <InfoRow
            label="Data Limit"
            value={sub.plan ? `${sub.plan.dataLimitGb} GB` : "N/A"}
          />
        </CardContent>
      </Card>

      {/* Contact Information */}
      <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-3">
          <SectionHeader
            icon={Mail}
            title="Contact Information"
            description="Update your contact details"
            from="from-amber-500"
            to="to-orange-600"
          />
        </CardHeader>
        <CardContent>
          <ProfileForm
            profile={sub}
            onSaved={(p) => {
              setProfile(p);
              if (useSubscriberAuthStore.getState().subscriber) {
                useSubscriberAuthStore.setState({ subscriber: p });
              }
            }}
          />
        </CardContent>
      </Card>

      {/* Connection Details */}
      <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-3">
          <SectionHeader
            icon={Globe}
            title="Connection Details"
            description="Your network connection information (read-only)"
            from="from-red-500"
            to="to-cyan-600"
          />
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow label="Connection Type" value={sub.connectionType || "N/A"} />
          <Separator />
          <InfoRow label="IP Type" value={sub.ipType || "Dynamic"} />
          <Separator />
          <InfoRow label="IP Address" value={sub.ipAddress || "N/A"} />
          <Separator />
          <InfoRow label="MAC Address" value={sub.macAddress || "N/A"} />
          <Separator />
          <InfoRow label="Activation Date" value={formatDate(sub.activationDate)} />
          <Separator />
          <InfoRow label="Billing Start" value={formatDate(sub.billingStartDate)} />
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-3">
          <SectionHeader
            icon={Shield}
            title="Security"
            description="Change your service password"
            from="from-violet-500"
            to="to-purple-600"
          />
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
