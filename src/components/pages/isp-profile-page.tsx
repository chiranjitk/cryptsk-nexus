"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth-store";
import {
  Building2, Save, Loader2, Receipt, Server, Mail, Palette,
  Eye, AlertTriangle, Plug, MessageSquare, CreditCard, Send,
  Plus, Pencil, Trash2, Star, FileText, Image, Lock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────

interface IspProfile {
  companyName: string;
  tagline: string;
  logo: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  panNumber: string;
  cinNumber: string;
  primaryColor: string;
  currency: string;
  timezone: string;
  language: string;
  dateFormat: string;
  gracePeriodDays: number;
  lateFeeType: string;
  lateFeeValue: number;
  invoicePrefix: string;
  invoiceNumberPadding: number;
  invoiceStartNumber: number;
  customerCodePrefix: string;
  receiptFooterText: string;
  radiusServerIp: string;
  radiusServerPort: number;
  radiusSecret: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFromEmail: string;
  smsGateway: string;
  smsAuthKey: string;
  smsSenderId: string;
  whatsappApiToken: string;
  whatsappPhoneNumberId: string;
  whatsappEnabled: boolean;
  whatsappAutoReply: boolean;
  whatsappGreetingMessage: string;
  whatsappAwayMessage: string;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  paymentGatewayMode: string;
}

// ─── Constants ────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "\u20B9", USD: "$", EUR: "\u20AC", GBP: "\u00A3",
  AUD: "A$", CAD: "C$", SGD: "S$", AED: "\u062F.\u0625", SAR: "\uFDFC",
};

const CURRENCIES = [
  { value: "INR", label: "INR (\u20B9) \u2014 Indian Rupee" },
  { value: "USD", label: "USD ($) \u2014 US Dollar" },
  { value: "EUR", label: "EUR (\u20AC) \u2014 Euro" },
  { value: "GBP", label: "GBP (\u00A3) \u2014 British Pound" },
  { value: "AUD", label: "AUD (A$) \u2014 Australian Dollar" },
  { value: "CAD", label: "CAD (C$) \u2014 Canadian Dollar" },
  { value: "SGD", label: "SGD (S$) \u2014 Singapore Dollar" },
  { value: "AED", label: "AED (\u062F.\u0625) \u2014 UAE Dirham" },
  { value: "SAR", label: "SAR (\uFDFC) \u2014 Saudi Riyal" },
];

const TIMEZONES = [
  "Asia/Kolkata", "Asia/Dhaka", "Asia/Riyadh", "Asia/Dubai",
  "Asia/Singapore", "Asia/Bangkok", "Europe/London", "Europe/Berlin",
  "Europe/Paris", "America/New_York", "America/Chicago",
  "America/Los_Angeles", "America/Toronto", "Australia/Sydney", "UTC",
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "mr", label: "Marathi" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "bn", label: "Bengali" },
  { value: "gu", label: "Gujarati" },
  { value: "kn", label: "Kannada" },
];

const DATE_FORMATS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (31/12/2024)" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (12/31/2024)" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (2024-12-31)" },
  { value: "DD-MMM-YYYY", label: "DD-MMM-YYYY (31-Dec-2024)" },
];

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const PINCODE_RE = /^[1-9][0-9]{5}$/;
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

interface SmtpProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  encryption: string;
  isDefault: boolean;
  enabled: boolean;
}

const emptySmtpProfile: Omit<SmtpProfile, "id"> = {
  name: "", host: "", port: 587, username: "", password: "",
  fromEmail: "", fromName: "", encryption: "tls", isDefault: false, enabled: true,
};

const emptyProfile: IspProfile = {
  companyName: "My ISP", tagline: "", logo: "", address: "", city: "",
  state: "", pincode: "", phone: "", email: "", website: "https://cryptsk.com",
  gstin: "", panNumber: "", cinNumber: "", primaryColor: "#DC2626",
  currency: "INR", timezone: "Asia/Kolkata", language: "en",
  dateFormat: "DD/MM/YYYY", gracePeriodDays: 5, lateFeeType: "PERCENTAGE",
  lateFeeValue: 0, invoicePrefix: "INV", invoiceNumberPadding: 4, invoiceStartNumber: 1001, customerCodePrefix: "CRY",
  receiptFooterText: "Thank you for choosing us!", radiusServerIp: "",
  radiusServerPort: 1812, radiusSecret: "", smtpHost: "", smtpPort: 587,
  smtpUser: "", smtpPass: "", smtpFromEmail: "", smsGateway: "",
  smsAuthKey: "", smsSenderId: "", whatsappApiToken: "",
  whatsappPhoneNumberId: "", whatsappEnabled: false, whatsappAutoReply: false,
  whatsappGreetingMessage: "", whatsappAwayMessage: "", razorpayKeyId: "",
  razorpayKeySecret: "", paymentGatewayMode: "test",
};

// ─── Component ────────────────────────────────────────────────

export default function IspProfilePage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const canEdit = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
  const disabled = !canEdit;

  // Track whether the user has made any edits since last load/save.
  // Set inside event handlers (not during render), so no lint issues.
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);
  const hasChangesRef = useRef(false);

  // ── Fetch ISP profile; form = query cache (user edits mutate cache) ──
  const { data: serverData, isLoading } = useQuery<IspProfile>({
    queryKey: ["isp-profile"],
    queryFn: async () => {
      const res = await apiFetch<{ success: boolean; settings: IspProfile }>(
        "/api/settings/isp-profile",
      );
      return res.settings;
    },
    // Prevent background re-fetches from overwriting user edits
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // "form" is always the latest value in the query cache (or emptyProfile
  // while loading). User edits update the cache via queryClient.setQueryData,
  // which causes a re-render with the updated form values.
  // Merge with emptyProfile so missing DB fields (e.g. invoiceNumberPadding) get safe defaults
  const form: IspProfile = { ...emptyProfile, ...(serverData || {}) };

  // ── Update handler: mutate query cache + mark as edited ──
  const update = useCallback(
    (key: keyof IspProfile, value: string | number | boolean) => {
      setHasUnsavedEdits(true);
      queryClient.setQueryData<IspProfile>(["isp-profile"], (prev) => {
        if (!prev) return { ...emptyProfile, [key]: value };
        return { ...prev, [key]: value };
      });
    },
    [queryClient],
  );

  // ── Sync hasChanges into ref for beforeunload listener ──
  useEffect(() => {
    hasChangesRef.current = hasUnsavedEdits;
  }, [hasUnsavedEdits]);

  // ── Warn before navigating with unsaved changes ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasChangesRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ── Save mutation ──
  const saveMutation = useMutation({
    mutationFn: async (profile: IspProfile) => {
      return apiFetch("/api/settings/isp-profile", {
        method: "PUT",
        body: JSON.stringify(profile),
      });
    },
    onSuccess: () => {
      toast.success("ISP profile saved successfully!");
      setHasUnsavedEdits(false);
      queryClient.invalidateQueries({ queryKey: ["isp-profile"] });
    },
    onError: (err) => toast.error(err.message || "Failed to save ISP profile"),
  });

  // ── Test SMTP mutation ──
  const testSmtpMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ success: boolean; message: string }>(
        "/api/settings/isp-profile/test-smtp",
        { method: "POST", body: JSON.stringify({}) },
      ),
    onSuccess: (res) =>
      toast.success(res.message || "SMTP connection successful!"),
    onError: (err) => toast.error(err.message || "SMTP test failed"),
  });

  // ── SMTP Profiles ──
  const [smtpDialogOpen, setSmtpDialogOpen] = useState(false);
  const [smtpEditing, setSmtpEditing] = useState<SmtpProfile | null>(null);
  const [smtpDeleteId, setSmtpDeleteId] = useState<string | null>(null);
  const [smtpForm, setSmtpForm] = useState(emptySmtpProfile);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: smtpProfiles = [] } = useQuery<SmtpProfile[]>({
    queryKey: ["smtp-profiles"],
    queryFn: async () => apiFetch("/api/smtp-profiles"),
  });

  const smtpCreateMutation = useMutation({
    mutationFn: async (data: typeof emptySmtpProfile) =>
      apiFetch("/api/smtp-profiles", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { toast.success("SMTP profile created"); setSmtpDialogOpen(false); setSmtpForm(emptySmtpProfile); setSmtpEditing(null); queryClient.invalidateQueries({ queryKey: ["smtp-profiles"] }); },
    onError: (err: Error) => toast.error(err.message || "Failed to create SMTP profile"),
  });

  const smtpUpdateMutation = useMutation({
    mutationFn: async (data: SmtpProfile) =>
      apiFetch("/api/smtp-profiles", { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { toast.success("SMTP profile updated"); setSmtpDialogOpen(false); setSmtpForm(emptySmtpProfile); setSmtpEditing(null); queryClient.invalidateQueries({ queryKey: ["smtp-profiles"] }); },
    onError: (err: Error) => toast.error(err.message || "Failed to update SMTP profile"),
  });

  const smtpDeleteMutation = useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/api/smtp-profiles?id=${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("SMTP profile deleted"); setSmtpDeleteId(null); queryClient.invalidateQueries({ queryKey: ["smtp-profiles"] }); },
    onError: (err: Error) => toast.error(err.message || "Failed to delete SMTP profile"),
  });

  const openSmtpCreate = () => { setSmtpForm(emptySmtpProfile); setSmtpEditing(null); setSmtpDialogOpen(true); };
  const openSmtpEdit = (p: SmtpProfile) => { setSmtpForm({ name: p.name, host: p.host, port: p.port, username: p.username, password: p.password, fromEmail: p.fromEmail, fromName: p.fromName, encryption: p.encryption, isDefault: p.isDefault, enabled: p.enabled }); setSmtpEditing(p); setSmtpDialogOpen(true); };
  const handleSmtpSave = () => { if (!smtpForm.name.trim()) { toast.error("Profile name is required."); return; } if (!smtpForm.host.trim()) { toast.error("SMTP host is required."); return; } if (smtpEditing) { smtpUpdateMutation.mutate({ ...smtpEditing, ...smtpForm }); } else { smtpCreateMutation.mutate(smtpForm); } };

  // ── Validation + Save ──
  const validateAndSave = useCallback(() => {
    if (!form.companyName.trim()) {
      toast.error("Company name is required.");
      return;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error("Invalid email format.");
      return;
    }
    if (form.pincode && !PINCODE_RE.test(form.pincode)) {
      toast.error("Invalid pincode (must be 6 digits, starting with 1-9).");
      return;
    }
    if (form.gstin && !GSTIN_RE.test(form.gstin)) {
      toast.error("Invalid GSTIN format (e.g., 22AAAAA0000A1Z5).");
      return;
    }
    if (form.panNumber && !PAN_RE.test(form.panNumber)) {
      toast.error("Invalid PAN format (e.g., AAAAA0000A).");
      return;
    }
    if (form.gracePeriodDays < 0 || form.gracePeriodDays > 90) {
      toast.error("Grace period must be 0\u201390 days.");
      return;
    }
    if (
      form.lateFeeType === "PERCENTAGE" &&
      (form.lateFeeValue < 0 || form.lateFeeValue > 100)
    ) {
      toast.error("Late fee percentage must be 0\u2013100.");
      return;
    }
    if (form.primaryColor && !HEX_COLOR_RE.test(form.primaryColor)) {
      toast.error("Invalid color (use #RRGGBB hex format).");
      return;
    }
    if (form.radiusServerPort < 1 || form.radiusServerPort > 65535) {
      toast.error("RADIUS port must be 1\u201365535.");
      return;
    }
    if (form.smtpPort < 1 || form.smtpPort > 65535) {
      toast.error("SMTP port must be 1\u201365535.");
      return;
    }
    saveMutation.mutate(form);
  }, [form, saveMutation]);

  // ── Derived values ──
  const hasChanges = hasUnsavedEdits;
  const currencySymbol = CURRENCY_SYMBOLS[form.currency] || form.currency;
  const gstinValid = !form.gstin || GSTIN_RE.test(form.gstin);
  const panValid = !form.panNumber || PAN_RE.test(form.panNumber);
  const pincodeValid = !form.pincode || PINCODE_RE.test(form.pincode);
  const colorValid = !form.primaryColor || HEX_COLOR_RE.test(form.primaryColor);

  // ── Loading skeleton ──
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-48" />
        <Skeleton className="skeleton-wave h-10 w-full" />
        <Skeleton className="skeleton-wave h-96" />
      </div>
    );
  }

  // ── Save button helper (called in JSX, not a component definition) ──
  const saveBtn = (label: string) =>
    canEdit ? (
      <div className="flex justify-end pt-2">
        <Button
          className="bg-red-600 hover:bg-red-700 text-white"
          disabled={saveMutation.isPending || !hasChanges}
          onClick={validateAndSave}
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-1.5" />
              {label}
            </>
          )}
        </Button>
      </div>
    ) : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">ISP Profile</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage company details, branding, billing, infrastructure, and
          integrations.
        </p>
      </div>

      {/* ── Unsaved changes banner ── */}
      {hasChanges && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950/30">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
            You have unsaved changes
          </span>
          {canEdit && (
            <Button
              size="sm"
              className="ml-auto bg-red-600 hover:bg-red-700 text-white"
              onClick={validateAndSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1" />
              )}
              Save Now
            </Button>
          )}
        </div>
      )}

      {/* ── View-only banner ── */}
      {!canEdit && (
        <div className="flex items-center gap-3 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 dark:border-teal-800 dark:bg-teal-950/30">
          <Eye className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0" />
          <span className="text-sm font-medium text-teal-800 dark:text-teal-200">
            You have view-only access to settings
          </span>
          <Badge variant="secondary" className="ml-auto">
            {user?.role}
          </Badge>
        </div>
      )}

      {/* ── Tabs ── */}
      <Tabs defaultValue="company" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="company">
            <Building2 className="h-3.5 w-3.5 mr-1.5" />Company
          </TabsTrigger>
          <TabsTrigger value="branding">
            <Palette className="h-3.5 w-3.5 mr-1.5" />Branding
          </TabsTrigger>
          <TabsTrigger value="billing">
            <Receipt className="h-3.5 w-3.5 mr-1.5" />Billing
          </TabsTrigger>
          <TabsTrigger value="infra">
            <Server className="h-3.5 w-3.5 mr-1.5" />
            <span className="hidden md:inline">RADIUS &amp; SMTP</span>
            <span className="md:hidden">Infra</span>
          </TabsTrigger>
          <TabsTrigger value="integrations">
            <Plug className="h-3.5 w-3.5 mr-1.5" />
            <span className="hidden md:inline">Integrations</span>
            <span className="md:hidden">APIs</span>
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════════════════
            TAB 1 — Company
            ══════════════════════════════════════════════════════ */}
        <TabsContent value="company">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-red-600" />
                Company Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Company Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={form.companyName}
                    onChange={(e) => update("companyName", e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tagline</Label>
                  <Input
                    value={form.tagline}
                    onChange={(e) => update("tagline", e.target.value)}
                    placeholder="Your ISP tagline"
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs">Logo URL</Label>
                  <Input
                    value={form.logo}
                    onChange={(e) => update("logo", e.target.value)}
                    placeholder="https://example.com/logo.png"
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs">Address</Label>
                  <Input
                    value={form.address}
                    onChange={(e) => update("address", e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">City</Label>
                  <Input
                    value={form.city}
                    onChange={(e) => update("city", e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">State</Label>
                  <Input
                    value={form.state}
                    onChange={(e) => update("state", e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Pincode</Label>
                  <Input
                    value={form.pincode}
                    onChange={(e) => update("pincode", e.target.value)}
                    placeholder="400001"
                    maxLength={6}
                    disabled={disabled}
                  />
                  {form.pincode && !pincodeValid && (
                    <p className="text-xs text-red-500 mt-1">
                      Must be 6 digits starting with 1-9
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Website</Label>
                  <Input
                    value={form.website}
                    onChange={(e) => update("website", e.target.value)}
                    disabled={disabled}
                  />
                </div>
              </div>

              <Separator />

              {/* Tax & Registration */}
              <div>
                <p className="text-sm font-semibold mb-3">
                  Tax &amp; Registration
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">GSTIN</Label>
                    <Input
                      value={form.gstin}
                      onChange={(e) =>
                        update("gstin", e.target.value.toUpperCase())
                      }
                      placeholder="22AAAAA0000A1Z5"
                      maxLength={15}
                      disabled={disabled}
                    />
                    {form.gstin && !gstinValid && (
                      <p className="text-xs text-red-500 mt-1">
                        Format: 2 digits + 5 letters + 4 digits + 1 letter + 1
                        char + Z + 1 char
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">PAN Number</Label>
                    <Input
                      value={form.panNumber}
                      onChange={(e) =>
                        update("panNumber", e.target.value.toUpperCase())
                      }
                      placeholder="AAAAA0000A"
                      maxLength={10}
                      disabled={disabled}
                    />
                    {form.panNumber && !panValid && (
                      <p className="text-xs text-red-500 mt-1">
                        Format: 5 letters + 4 digits + 1 letter
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">CIN Number</Label>
                    <Input
                      value={form.cinNumber}
                      onChange={(e) =>
                        update("cinNumber", e.target.value.toUpperCase())
                      }
                      placeholder="U74999MH2020PTC123456"
                      disabled={disabled}
                    />
                  </div>
                </div>
              </div>

              {saveBtn("Save Company Details")}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════
            TAB 2 — Branding
            ══════════════════════════════════════════════════════ */}
        <TabsContent value="branding">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Palette className="h-4 w-4 text-red-600" />
                Branding &amp; Localization
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Primary Color with live swatch */}
              <div className="space-y-1.5">
                <Label className="text-xs">Primary Brand Color</Label>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Input
                      value={form.primaryColor}
                      onChange={(e) => update("primaryColor", e.target.value)}
                      placeholder="#DC2626"
                      maxLength={7}
                      disabled={disabled}
                    />
                    {form.primaryColor && !colorValid && (
                      <p className="text-xs text-red-500 mt-1">
                        Use hex format: #RRGGBB
                      </p>
                    )}
                  </div>
                  <div
                    className="h-10 w-10 rounded-lg border shrink-0 shadow-sm"
                    style={{
                      backgroundColor: colorValid
                        ? form.primaryColor
                        : "#e5e7eb",
                    }}
                    title={colorValid ? form.primaryColor : "Invalid color"}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Currency */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Currency</Label>
                  <Select
                    value={form.currency}
                    onValueChange={(v) => update("currency", v)}
                    disabled={disabled}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Active symbol: {currencySymbol}
                  </p>
                </div>

                {/* Timezone */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Timezone</Label>
                  <Select
                    value={form.timezone}
                    onValueChange={(v) => update("timezone", v)}
                    disabled={disabled}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Language */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Language</Label>
                  <Select
                    value={form.language}
                    onValueChange={(v) => update("language", v)}
                    disabled={disabled}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Format */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Date Format</Label>
                  <Select
                    value={form.dateFormat}
                    onValueChange={(v) => update("dateFormat", v)}
                    disabled={disabled}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select date format" />
                    </SelectTrigger>
                    <SelectContent>
                      {DATE_FORMATS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                {saveBtn("Save Branding Settings")}
                <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                  <Eye className="h-3.5 w-3.5 mr-1.5" /> Preview Branding
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════
            TAB 3 — Billing
            ══════════════════════════════════════════════════════ */}
        <TabsContent value="billing">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Receipt className="h-4 w-4 text-red-600" />
                Invoice &amp; Billing Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Invoice Prefix</Label>
                  <Input
                    value={form.invoicePrefix}
                    onChange={(e) => update("invoicePrefix", e.target.value)}
                    placeholder="INV"
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Invoice Number Padding</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={form.invoiceNumberPadding}
                    onChange={(e) =>
                      update("invoiceNumberPadding", Number(e.target.value))
                    }
                    placeholder="4"
                    disabled={disabled}
                  />
                  <p className="text-xs text-muted-foreground">
                    E.g. 4 → INV0001
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Invoice Start Number</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.invoiceStartNumber}
                    onChange={(e) =>
                      update("invoiceStartNumber", Number(e.target.value))
                    }
                    placeholder="1001"
                    disabled={disabled}
                  />
                  <p className="text-xs text-muted-foreground">
                    First invoice sequence number
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Customer Code Prefix</Label>
                  <Input
                    value={form.customerCodePrefix}
                    onChange={(e) =>
                      update("customerCodePrefix", e.target.value)
                    }
                    placeholder="CRY"
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Grace Period (days)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    value={form.gracePeriodDays}
                    onChange={(e) =>
                      update("gracePeriodDays", Number(e.target.value))
                    }
                    disabled={disabled}
                  />
                  <p className="text-xs text-muted-foreground">
                    0\u201390 days after due date
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Late Fee Type</Label>
                  <Select
                    value={form.lateFeeType}
                    onValueChange={(v) => update("lateFeeType", v)}
                    disabled={disabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENTAGE">
                        Percentage (%)
                      </SelectItem>
                      <SelectItem value="FLAT">Flat Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Late Fee Value{" "}
                    {form.lateFeeType === "PERCENTAGE"
                      ? "(%)"
                      : `(${currencySymbol})`}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={form.lateFeeType === "PERCENTAGE" ? 100 : undefined}
                    value={form.lateFeeValue}
                    onChange={(e) =>
                      update("lateFeeValue", Number(e.target.value))
                    }
                    disabled={disabled}
                  />
                  {form.lateFeeType === "PERCENTAGE" && (
                    <p className="text-xs text-muted-foreground">
                      0\u2013100% of invoice amount
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Receipt Footer Text</Label>
                <Textarea
                  value={form.receiptFooterText}
                  onChange={(e) => update("receiptFooterText", e.target.value)}
                  placeholder="Thank you for choosing us!"
                  rows={2}
                  disabled={disabled}
                />
              </div>

              {saveBtn("Save Billing Settings")}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════
            TAB 4 — RADIUS & SMTP (Infrastructure)
            ══════════════════════════════════════════════════════ */}
        <TabsContent value="infra">
          <div className="space-y-4">
            {/* RADIUS Card */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Server className="h-4 w-4 text-red-600" />
                  RADIUS Configuration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">RADIUS Server IP</Label>
                    <Input
                      value={form.radiusServerIp}
                      onChange={(e) =>
                        update("radiusServerIp", e.target.value)
                      }
                      placeholder="192.168.1.1"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Port</Label>
                    <Input
                      type="number"
                      min={1}
                      max={65535}
                      value={form.radiusServerPort}
                      onChange={(e) =>
                        update("radiusServerPort", Number(e.target.value))
                      }
                      disabled={disabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      Default: 1812
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Shared Secret</Label>
                    <Input
                      type="password"
                      value={form.radiusSecret}
                      onChange={(e) =>
                        update("radiusSecret", e.target.value)
                      }
                      disabled={disabled}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* SMTP Profiles Card */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Mail className="h-4 w-4 text-red-600" />
                    SMTP Profiles
                  </CardTitle>
                  {canEdit && (
                    <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white h-8" onClick={openSmtpCreate}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Profile
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {smtpProfiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No SMTP profiles configured. Add one to send email notifications.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Name</TableHead>
                          <TableHead className="text-xs">Host</TableHead>
                          <TableHead className="text-xs">Port</TableHead>
                          <TableHead className="text-xs">Encryption</TableHead>
                          <TableHead className="text-xs">From</TableHead>
                          <TableHead className="text-xs text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {smtpProfiles.map((p) => (
                          <TableRow key={p.id} className="hover:bg-muted/50 transition-colors duration-150">
                            <TableCell className="text-sm font-medium">
                              <div className="flex items-center gap-1.5">
                                {p.name}
                                {p.isDefault && <Badge className="bg-green-100 text-green-700 text-[9px] px-1.5 py-0">DEFAULT</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm font-mono">{p.host}:{p.port}</TableCell>
                            <TableCell className="text-sm">{p.port}</TableCell>
                            <TableCell className="text-sm"><Badge variant="outline" className="text-[10px]">{p.encryption.toUpperCase()}</Badge></TableCell>
                            <TableCell className="text-sm">{p.fromName ? `${p.fromName} <${p.fromEmail || p.username}>` : (p.fromEmail || p.username || "\u2014")}</TableCell>
                            <TableCell>
                              <div className="flex gap-1 justify-end">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => openSmtpEdit(p)}><Pencil className="h-3 w-3" /></Button>
                                {!p.isDefault && canEdit && (
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:text-red-700" title="Delete" onClick={() => setSmtpDeleteId(p.id)}><Trash2 className="h-3 w-3" /></Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════
            TAB 5 — Integrations (SMS / WhatsApp / Payment)
            ══════════════════════════════════════════════════════ */}
        <TabsContent value="integrations">
          <div className="space-y-4">
            {/* SMS Gateway */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-red-600" />
                  SMS Gateway
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">SMS Gateway Provider</Label>
                    <Input
                      value={form.smsGateway}
                      onChange={(e) => update("smsGateway", e.target.value)}
                      placeholder="e.g., MSG91, Twilio, Kaleyra"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Auth Key / API Key</Label>
                    <Input
                      type="password"
                      value={form.smsAuthKey}
                      onChange={(e) => update("smsAuthKey", e.target.value)}
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Sender ID</Label>
                    <Input
                      value={form.smsSenderId}
                      onChange={(e) => update("smsSenderId", e.target.value)}
                      placeholder="e.g., CRYPTSK"
                      maxLength={6}
                      disabled={disabled}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* WhatsApp Business */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <svg
                      className="h-4 w-4 text-red-600"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    WhatsApp Business API
                  </CardTitle>
                  <div className="flex items-center gap-3">
                    <Label
                      htmlFor="wa-enabled"
                      className="text-xs text-muted-foreground"
                    >
                      Enabled
                    </Label>
                    <Switch
                      id="wa-enabled"
                      checked={form.whatsappEnabled}
                      onCheckedChange={(v) => update("whatsappEnabled", v)}
                      disabled={disabled}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">API Token</Label>
                    <Input
                      type="password"
                      value={form.whatsappApiToken}
                      onChange={(e) =>
                        update("whatsappApiToken", e.target.value)
                      }
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Phone Number ID</Label>
                    <Input
                      value={form.whatsappPhoneNumberId}
                      onChange={(e) =>
                        update("whatsappPhoneNumberId", e.target.value)
                      }
                      placeholder="From Meta Business Manager"
                      disabled={disabled}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Label htmlFor="wa-auto-reply" className="text-xs">
                    Auto-Reply Enabled
                  </Label>
                  <Switch
                    id="wa-auto-reply"
                    checked={form.whatsappAutoReply}
                    onCheckedChange={(v) => update("whatsappAutoReply", v)}
                    disabled={disabled}
                  />
                </div>

                {form.whatsappAutoReply && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Greeting Message</Label>
                      <Textarea
                        value={form.whatsappGreetingMessage}
                        onChange={(e) =>
                          update(
                            "whatsappGreetingMessage",
                            e.target.value,
                          )
                        }
                        placeholder="Hello! Welcome to our ISP. How can we help you today?"
                        rows={3}
                        disabled={disabled}
                      />
                      <p className="text-xs text-muted-foreground">
                        Sent when a customer starts a new conversation
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Away Message</Label>
                      <Textarea
                        value={form.whatsappAwayMessage}
                        onChange={(e) =>
                          update(
                            "whatsappAwayMessage",
                            e.target.value,
                          )
                        }
                        placeholder="We are currently away. We will get back to you soon!"
                        rows={3}
                        disabled={disabled}
                      />
                      <p className="text-xs text-muted-foreground">
                        Sent when team is unavailable
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Payment Gateway */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-red-600" />
                  Payment Gateway (Razorpay)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Key ID</Label>
                    <Input
                      value={form.razorpayKeyId}
                      onChange={(e) =>
                        update("razorpayKeyId", e.target.value)
                      }
                      placeholder="rzp_live_..."
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Key Secret</Label>
                    <Input
                      type="password"
                      value={form.razorpayKeySecret}
                      onChange={(e) =>
                        update("razorpayKeySecret", e.target.value)
                      }
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Gateway Mode</Label>
                    <Select
                      value={form.paymentGatewayMode}
                      onValueChange={(v) => update("paymentGatewayMode", v)}
                      disabled={disabled}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="test">Test</SelectItem>
                        <SelectItem value="live">Live</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {form.paymentGatewayMode === "live" && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/30">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                    <span className="text-xs font-medium text-red-800 dark:text-red-200">
                      Live mode is active. Payment transactions will charge
                      real money.
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {saveBtn("Save Integration Settings")}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── SMTP Profile Create/Edit Dialog ── */}
      <Dialog open={smtpDialogOpen} onOpenChange={setSmtpDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base">{smtpEditing ? "Edit" : "Add"} SMTP Profile</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label className="text-xs">Profile Name *</Label><Input value={smtpForm.name} onChange={(e) => setSmtpForm({ ...smtpForm, name: e.target.value })} placeholder="e.g. Gmail, SendGrid" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Host *</Label><Input value={smtpForm.host} onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })} placeholder="smtp.gmail.com" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Port</Label><Input type="number" min={1} max={65535} value={smtpForm.port} onChange={(e) => setSmtpForm({ ...smtpForm, port: Number(e.target.value) })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Username</Label><Input value={smtpForm.username} onChange={(e) => setSmtpForm({ ...smtpForm, username: e.target.value })} placeholder="user@gmail.com" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Password</Label><Input type="password" value={smtpForm.password} onChange={(e) => setSmtpForm({ ...smtpForm, password: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">From Email</Label><Input type="email" value={smtpForm.fromEmail} onChange={(e) => setSmtpForm({ ...smtpForm, fromEmail: e.target.value })} placeholder="billing@example.com" /></div>
              <div className="space-y-1.5"><Label className="text-xs">From Name</Label><Input value={smtpForm.fromName} onChange={(e) => setSmtpForm({ ...smtpForm, fromName: e.target.value })} placeholder="My ISP" /></div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Encryption</Label>
              <Select value={smtpForm.encryption} onValueChange={(v) => setSmtpForm({ ...smtpForm, encryption: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="tls">TLS (STARTTLS)</SelectItem>
                  <SelectItem value="ssl">SSL (Implicit TLS)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={smtpForm.isDefault} onCheckedChange={(v) => setSmtpForm({ ...smtpForm, isDefault: v })} />
              <Label className="text-xs">Set as default profile</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setSmtpDialogOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={smtpCreateMutation.isPending || smtpUpdateMutation.isPending} onClick={handleSmtpSave}>
                {(smtpCreateMutation.isPending || smtpUpdateMutation.isPending) ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving...</> : smtpEditing ? "Update" : "Create Profile"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── SMTP Profile Delete Dialog ── */}
      <AlertDialog open={!!smtpDeleteId} onOpenChange={() => setSmtpDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete SMTP Profile</AlertDialogTitle><AlertDialogDescription>Are you sure? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => smtpDeleteId && smtpDeleteMutation.mutate(smtpDeleteId)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      {/* ── Branding Preview Dialog ── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base">Branding Preview</DialogTitle><DialogDescription>Live preview of how your ISP branding appears on invoices, receipts, and email notifications.</DialogDescription></DialogHeader>
          <div className="space-y-6">
            {/* Mock Invoice */}
            <div className="border rounded-lg p-5 space-y-4" style={{ borderColor: form.primaryColor }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {form.logo ? <img src={form.logo} alt="Logo" className="h-10 w-10 rounded object-cover" /> : <div className="h-10 w-10 rounded flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: form.primaryColor }}>{(form.companyName || 'I').charAt(0)}</div>}
                  <div>
                    <p className="font-bold text-base" style={{ color: form.primaryColor }}>{form.companyName}</p>
                    {form.tagline && <p className="text-xs text-muted-foreground">{form.tagline}</p>}
                  </div>
                </div>
                <Badge className="text-xs" style={{ backgroundColor: form.primaryColor, color: "#fff" }}>INVOICE</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs border-t pt-3">
                <div><span className="text-muted-foreground">Invoice #:</span> <span className="font-mono font-medium">INV0001</span></div>
                <div className="text-right"><span className="text-muted-foreground">Date:</span> <span className="font-medium">{new Date().toLocaleDateString("en-IN")}</span></div>
                <div><span className="text-muted-foreground">Bill To:</span> <span className="font-medium">John Doe</span></div>
                <div className="text-right"><span className="text-muted-foreground">Due:</span> <span className="font-medium">{new Date(Date.now() + 30 * 86400000).toLocaleDateString("en-IN")}</span></div>
              </div>
              <div className="border rounded overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr style={{ backgroundColor: form.primaryColor }} className="text-white"><th className="text-left p-2">Description</th><th className="text-right p-2">Amount</th></tr></thead>
                  <tbody><tr className="border-t"><td className="p-2">Internet Plan - Fiber 100 Mbps</td><td className="p-2 text-right font-mono">799.00</td></tr><tr className="border-t"><td className="p-2">CGST (9%)</td><td className="p-2 text-right font-mono">71.91</td></tr><tr className="border-t"><td className="p-2">SGST (9%)</td><td className="p-2 text-right font-mono">71.91</td></tr></tbody>
                  <tfoot><tr className="border-t-2" style={{ borderColor: form.primaryColor }}><td className="p-2 font-bold">Total</td><td className="p-2 text-right font-mono font-bold">942.82</td></tr></tfoot>
                </table>
              </div>
              <div className="text-xs text-muted-foreground border-t pt-3 space-y-0.5">
                {form.address && <p>{form.address}</p>}
                {(form.city || form.state || form.pincode) && <p>{[form.city, form.state, form.pincode].filter(Boolean).join(", ")}</p>}
                {form.phone && <p>Phone: {form.phone}</p>}
                {form.email && <p>Email: {form.email}</p>}
                {form.gstin && <p>GSTIN: {form.gstin}</p>}
                {form.receiptFooterText && <p className="italic mt-1">{form.receiptFooterText}</p>}
              </div>
            </div>

            {/* Mock Receipt */}
            <div className="border rounded-lg p-5 space-y-3">
              <div className="text-center">
                <p className="font-bold text-sm" style={{ color: form.primaryColor }}>PAYMENT RECEIPT</p>
                <p className="text-xs text-muted-foreground">Receipt #RCT-001</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs border-t pt-3">
                <div><span className="text-muted-foreground">Received From:</span> <span className="font-medium">John Doe</span></div>
                <div className="text-right"><span className="text-muted-foreground">Date:</span> <span className="font-medium">{new Date().toLocaleDateString("en-IN")}</span></div>
                <div><span className="text-muted-foreground">Amount:</span> <span className="font-bold text-green-600">799.00</span></div>
                <div className="text-right"><span className="text-muted-foreground">Mode:</span> <span className="font-medium">UPI</span></div>
              </div>
              <div className="text-center text-xs text-muted-foreground border-t pt-3">
                <p>{form.companyName}</p>
                {form.phone && <p>{form.phone}</p>}
                {form.receiptFooterText && <p className="italic mt-1">{form.receiptFooterText}</p>}
              </div>
            </div>

            {/* Mock Email Notification */}
            <div className="border rounded-lg p-5 space-y-3">
              <p className="text-xs text-muted-foreground">Email Notification Preview</p>
              <div className="space-y-1 text-xs border rounded-lg p-3 bg-muted/30">
                <p><span className="font-semibold">From:</span> {form.companyName} &lt;{form.smtpFromEmail || form.email || "billing@example.com"}&gt;</p>
                <p><span className="font-semibold">To:</span> john@example.com</p>
                <p><span className="font-semibold">Subject:</span> <span style={{ color: form.primaryColor }}>Payment Received - {form.companyName}</span></p>
              </div>
              <div className="text-xs border-t pt-3 space-y-2">
                <p>Dear Subscriber,</p>
                <p>We have received your payment of <strong>799.00</strong>. Thank you for choosing <strong style={{ color: form.primaryColor }}>{form.companyName}</strong>.</p>
                <p className="text-muted-foreground">If you have any questions, contact us at {form.phone || form.email}.</p>
                <div className="border-t pt-2 mt-2">
                  <p className="font-medium">{form.companyName}</p>
                  {form.address && <p className="text-muted-foreground">{form.address}</p>}
                  {form.website && <p className="text-muted-foreground">{form.website}</p>}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
