"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, UserCheck, Award, Gift, Search, Copy, Check, Plus, Save,
  Star, Shield, Crown, Percent, HardDrive, ArrowUpCircle, Tag,
  IndianRupee, Loader2, Trash2, Download, QrCode, Eye, Edit2,
  BarChart3, TrendingUp, History, UsersRound, Settings2, X, Timer, Megaphone, AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";

// ─── Types ───────────────────────────────────────────────
interface ReferralSettings { referrerBonus: number; refereeBonus: number; validityDays: number; minInvoiceAmount: number; active: boolean; }
interface ReferralCode { id: string; subscriberName: string; code: string; totalReferred: number; convertedCount: number; totalEarned: number; status: string; createdAt: string; }
interface ReferralTracking { id: string; referrerName: string; refereeName: string; refereePhone: string; referralDate: string; conversionDate: string | null; bonusAmount: number; status: string; }
interface LoyaltySettings { pointsPerHundred: number; pointValueRupees: number; pointValueInr?: number; monthlyBonusPoints: number; active: boolean; }
interface LoyaltyMember { id: string; subscriberId: string; subscriberName: string; totalPoints: number; earnedThisMonth: number; redeemed: number; availableBalance: number; tier: string; createdAt: string; }
interface PointsHistory { id: string; subscriber: string; action: string; points: number; balanceAfter: number; date: string; description: string; }
interface Reward { id: string; name: string; description: string; pointsRequired: number; type: string; value: string; active: boolean; createdAt: string; stockLimit?: number; currentStock?: number; }
interface Redemption { id: string; subscriber: string; rewardName: string; pointsUsed: number; redeemedDate: string; status: string; }
interface ReferralAnalytics { conversionRate?: number; topReferrers?: { name: string; referrals: number; conversions: number; earned: number }[] }
interface ReferralCampaign { id: string; name: string; description: string; bonusType: string; bonusValue: number; bonusRecipient: string; maxReferrals: number | null; startDate: string; endDate: string | null; status: string; referralCount: number; bonusAwarded: number; createdAt: string; }
interface PointsExpiryData { settings: { expiryDays: number; autoExpiry: boolean }; expiringSoonCount: number; expiringSoon: { id: string; subscriber: string; points: number; date: string }[]; }

const REWARD_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  DISCOUNT: { icon: IndianRupee, color: "bg-emerald-100 text-emerald-600" },
  SPEED_BOOST: { icon: ArrowUpCircle, color: "bg-amber-100 text-amber-600" },
  DATA: { icon: HardDrive, color: "bg-sky-100 text-sky-600" },
  SERVICE: { icon: Crown, color: "bg-purple-100 text-purple-600" },
};
function mapRewardIcon(type: string): { icon: React.ElementType; color: string } { return REWARD_ICONS[type] || { icon: Tag, color: "bg-emerald-100 text-emerald-600" }; }

function formatDate(d: string) { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
function getTierBadge(tier: string) {
  switch (tier) {
    case "Platinum": return <Badge className="bg-slate-800 text-white text-[10px]"><Crown className="h-3 w-3 mr-1" />{tier}</Badge>;
    case "Gold": return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]"><Star className="h-3 w-3 mr-1" />{tier}</Badge>;
    case "Silver": return <Badge className="bg-gray-200 text-gray-700 border-gray-300 text-[10px]"><Shield className="h-3 w-3 mr-1" />{tier}</Badge>;
    default: return <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[10px]">{tier}</Badge>;
  }
}
function getReferralStatusBadge(s: string) {
  switch (s) {
    case "Converted": return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Converted</Badge>;
    case "Pending": return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">Pending</Badge>;
    case "Expired": return <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">Expired</Badge>;
    default: return <Badge variant="outline">{s}</Badge>;
  }
}
function getRedemptionStatusBadge(s: string) {
  switch (s) {
    case "Applied": return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Applied</Badge>;
    case "Pending": return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">Pending</Badge>;
    case "Expired": return <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">Expired</Badge>;
    default: return <Badge variant="outline">{s}</Badge>;
  }
}

function StatCard({ title, value, subtitle, icon: Icon, gradient, delay }: {
  title: string; value: string | number; subtitle: string; icon: React.ElementType; gradient: string; delay: number;
}) {
  return (
    <Card className={`${gradient} border-0 shadow-lg animate-card-enter`} style={{ animationDelay: `${delay}ms` }}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider opacity-80">{title}</p>
            <p className="text-2xl font-bold mt-2 tabular-nums">{value}</p>
            <p className="text-xs mt-1 opacity-75">{subtitle}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm"><Icon className="h-5 w-5" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Data mapping helpers ──────────────────────────────
function mapRefSettings(d: Record<string, unknown> | null): ReferralSettings {
  if (!d?.settings) return { referrerBonus: 100, refereeBonus: 50, validityDays: 30, minInvoiceAmount: 500, active: true };
  const s = d.settings as Record<string, unknown>;
  return { referrerBonus: (s.referrerBonus as number) ?? 100, refereeBonus: (s.refereeBonus as number) ?? 50, validityDays: (s.validityDays as number) ?? 30, minInvoiceAmount: (s.minInvoiceAmount as number) ?? 500, active: (s.enabled as boolean) ?? true };
}
function mapRefCodes(d: Record<string, unknown> | null): ReferralCode[] {
  if (!d?.codes) return [];
  return (d.codes as Record<string, unknown>[]).map((c) => ({ id: c.id as string, subscriberName: (c.subscriberName as string) || "Unknown", code: c.code as string, totalReferred: (c.totalReferred as number) ?? 0, convertedCount: (c.convertedCount as number) ?? 0, totalEarned: (c.totalEarned as number) ?? 0, status: (c.status as string) || "active", createdAt: c.createdAt as string }));
}
function mapRefTracking(d: Record<string, unknown> | null): ReferralTracking[] {
  if (!d?.tracking) return [];
  return (d.tracking as Record<string, unknown>[]).map((t) => ({ id: t.id as string, referrerName: (t.referrerName as string) || "Unknown", refereeName: (t.refereeName as string) || (t.refereePhone as string), refereePhone: t.refereePhone as string, bonusAmount: (t.bonusAmount as number) ?? 0, status: (t.status as string) || "Pending", referralDate: t.createdAt as string, conversionDate: (t.conversionDate as string) || null }));
}
function mapLoyaltySettings(d: Record<string, unknown> | null): LoyaltySettings {
  if (!d?.settings) return { pointsPerHundred: 10, pointValueRupees: 0.5, monthlyBonusPoints: 25, active: true };
  const s = d.settings as Record<string, unknown>;
  return { pointsPerHundred: (s.pointsPerHundred as number) ?? 10, pointValueRupees: (s.pointValueInr as number) ?? 0.5, monthlyBonusPoints: (s.monthlyBonusPoints as number) ?? 25, active: (s.enabled as boolean) ?? true };
}
function mapLoyaltyMembers(d: Record<string, unknown> | null, page: number, limit: number): { members: LoyaltyMember[]; total: number } {
  if (!d?.members) return { members: [], total: 0 };
  const all = d.members as Record<string, unknown>[];
  return { members: all.slice((page - 1) * limit, page * limit).map((m) => ({ id: m.id as string, subscriberId: m.subscriberId as string, subscriberName: (m.subscriberName as string) || "Unknown", totalPoints: (m.totalPoints as number) ?? 0, earnedThisMonth: (m.earnedMonth as number) ?? 0, redeemed: (m.redeemedPoints as number) ?? 0, availableBalance: (m.availablePoints as number) ?? 0, tier: (m.tier as string) || "Bronze", createdAt: m.createdAt as string })) as LoyaltyMember[], total: all.length };
}
function mapPointsHistory(d: Record<string, unknown> | null, page: number, limit: number): { history: PointsHistory[]; total: number } {
  if (!d?.history) return { history: [], total: 0 };
  const all = d.history as Record<string, unknown>[];
  return { history: all.slice((page - 1) * limit, page * limit).map((h) => ({ id: h.id as string, subscriber: (h.subscriber as string) || "Unknown", action: (h.actionType as string) || "", points: (h.points as number) ?? 0, balanceAfter: (h.balanceAfter as number) ?? 0, description: (h.description as string) || "", date: h.createdAt as string })), total: all.length };
}
function mapRewards(d: Record<string, unknown> | null): Reward[] {
  if (!d?.rewards) return [];
  return (d.rewards as Record<string, unknown>[]).map((rw) => { const ic = mapRewardIcon(rw.type as string); return { id: rw.id as string, name: rw.name as string, description: (rw.description as string) || "", type: (rw.type === "SPEED_BOOST" ? "Speed Boost" : rw.type === "DISCOUNT" ? "Discount" : rw.type) as Reward["type"], value: String(rw.value ?? ""), pointsRequired: (rw.pointsRequired as number) ?? 0, active: (rw.enabled as boolean) ?? true, createdAt: rw.createdAt as string, stockLimit: (rw.stockLimit as number) ?? null, currentStock: (rw.currentStock as number) ?? null }; });
}
function mapRedemptions(d: Record<string, unknown> | null, page: number, limit: number): { redemptions: Redemption[]; total: number } {
  if (!d?.redemptions) return { redemptions: [], total: 0 };
  const all = d.redemptions as Record<string, unknown>[];
  return { redemptions: all.slice((page - 1) * limit, page * limit).map((rd) => ({ id: rd.id as string, subscriber: (rd.subscriber as string) || "Unknown", rewardName: (rd.rewardName as string) || "", pointsUsed: (rd.pointsUsed as number) ?? 0, redeemedDate: rd.date as string, status: (rd.status as string) || "Pending" })), total: all.length };
}

const ITEMS_PER_PAGE = 10;

export default function ReferralPage() {
  const queryClient = useQueryClient();

  // ─── Referral state ───
  const [refSettingsLocal, setRefSettingsLocal] = useState<ReferralSettings>({ referrerBonus: 100, refereeBonus: 50, validityDays: 30, minInvoiceAmount: 500, active: true });
  const [refSearch, setRefSearch] = useState("");
  const [refStatusFilter, setRefStatusFilter] = useState("ALL");
  const [copied, setCopied] = useState<string>("");
  const [refPage, setRefPage] = useState(1);

  // ─── Loyalty state ───
  const [loyaltySettingsLocal, setLoyaltySettings] = useState<LoyaltySettings>({ pointsPerHundred: 10, pointValueRupees: 0.5, monthlyBonusPoints: 25, active: true });
  const [loyaltySearch, setLoyaltySearch] = useState("");
  const [loyaltyPage, setLoyaltyPage] = useState(1);

  // ─── History state ───
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);

  // ─── Rewards state ───
  const [rewardSearch, setRewardSearch] = useState("");
  const [createRewardOpen, setCreateRewardOpen] = useState(false);
  const [newReward, setNewReward] = useState({ name: "", description: "", pointsRequired: "", type: "Discount" as string, value: "", active: true });
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemRewardItem, setRedeemRewardItem] = useState<Reward | null>(null);
  const [redeemMemberId, setRedeemMemberId] = useState("");
  const [deleteRewardId, setDeleteRewardId] = useState<string | null>(null);
  const [editRewardOpen, setEditRewardOpen] = useState(false);
  const [editRewardItem, setEditRewardItem] = useState<Reward | null>(null);

  // ─── Redemptions state ───
  const [redemptionSearch, setRedemptionSearch] = useState("");
  const [redemptionPage, setRedemptionPage] = useState(1);

  // ─── Points adjustment ───
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustMemberId, setAdjustMemberId] = useState("");
  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustNote, setAdjustNote] = useState("");

  // ─── Tier config ───
  const [tierConfigOpen, setTierConfigOpen] = useState(false);
  const [tiers, setTiers] = useState([
    { name: "Bronze", minPoints: 0, color: "orange", maxDiscount: 0 },
    { name: "Silver", minPoints: 100, color: "gray", maxDiscount: 5 },
    { name: "Gold", minPoints: 500, color: "amber", maxDiscount: 10 },
    { name: "Platinum", minPoints: 1000, color: "slate", maxDiscount: 15 },
  ]);

  // ─── Campaigns state ───
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [editCampaignOpen, setEditCampaignOpen] = useState(false);
  const [campaignForm, setCampaignForm] = useState({ name: "", description: "", bonusType: "points", bonusValue: "100", bonusRecipient: "both", maxReferrals: "", startDate: "", endDate: "", status: "active" });
  const [editCampaignId, setEditCampaignId] = useState("");

  // ─── Points Expiry state ───
  const [expiryDays, setExpiryDays] = useState(365);
  const [autoExpiry, setAutoExpiry] = useState(false);

  // ─── Enrollment ───
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollMemberId, setEnrollMemberId] = useState("");

  // ─── Bulk operations ───
  const [selectedRewardIds, setSelectedRewardIds] = useState<string[]>([]);

  // ─── API queries ───
  const { data: refSettingsData } = useQuery({ queryKey: ["referral-settings"], queryFn: () => apiFetch("/api/referral?type=referral_settings") });
  const { data: refCodesData } = useQuery({ queryKey: ["referral-codes"], queryFn: () => apiFetch("/api/referral?type=referral_codes") });
  const { data: refTrackingData } = useQuery({ queryKey: ["referral-tracking"], queryFn: () => apiFetch("/api/referral?type=referral_tracking") });
  const { data: loyaltySettingsData } = useQuery({ queryKey: ["loyalty-settings"], queryFn: () => apiFetch("/api/referral?type=loyalty_settings") });
  const { data: loyaltyMembersData } = useQuery({ queryKey: ["loyalty-members"], queryFn: () => apiFetch("/api/referral?type=loyalty_members") });
  const { data: pointsHistoryData } = useQuery({ queryKey: ["points-history"], queryFn: () => apiFetch("/api/referral?type=points_history") });
  const { data: rewardsData } = useQuery({ queryKey: ["referral-rewards"], queryFn: () => apiFetch("/api/referral?type=rewards") });
  const { data: redemptionsData } = useQuery({ queryKey: ["referral-redemptions"], queryFn: () => apiFetch("/api/referral?type=redemptions") });
  const { data: referralAnalytics } = useQuery({ queryKey: ["referral-analytics"], queryFn: () => apiFetch("/api/referral?type=analytics") });
  const { data: campaignsData } = useQuery({ queryKey: ["referral-campaigns"], queryFn: () => apiFetch("/api/referral?type=campaigns") });
  const { data: pointsExpiryData } = useQuery({ queryKey: ["points-expiry"], queryFn: () => apiFetch("/api/referral?type=points_expiry") });
  const campaigns: ReferralCampaign[] = Array.isArray(campaignsData?.campaigns) ? campaignsData.campaigns : [];
  const pointsExpiry = pointsExpiryData as PointsExpiryData | null;

  // Derived
  const refCodes = mapRefCodes(refCodesData);
  const refTracking = mapRefTracking(refTrackingData);
  const { members: loyaltyMembers, total: loyaltyTotal } = mapLoyaltyMembers(loyaltyMembersData, loyaltyPage, ITEMS_PER_PAGE);
  const { history: pointsHistory, total: historyTotal } = mapPointsHistory(pointsHistoryData, historyPage, ITEMS_PER_PAGE);
  const rewards = mapRewards(rewardsData);
  const { redemptions, total: redemptionsTotal } = mapRedemptions(redemptionsData, redemptionPage, ITEMS_PER_PAGE);
  const isLoading = !refCodesData && !refTrackingData && !loyaltyMembersData;
  const totalReferrals = refTracking.length;
  const convertedReferrals = refTracking.filter((r) => r.status === "Converted").length;
  const activeLoyaltyMembers = loyaltyMembers.filter((m) => m.availableBalance > 0).length;
  const rewardsRedeemed = redemptions.filter((r) => r.status === "Applied").length;

  // Sync settings from API once loaded
  const refSettings = refSettingsData ? mapRefSettings(refSettingsData) : refSettingsLocal;
  const loyaltySettings = loyaltySettingsData ? mapLoyaltySettings(loyaltySettingsData) : loyaltySettingsLocal;

  // Derive expiry settings from query data or local state
  const effectiveExpiryDays = pointsExpiry?.settings?.expiryDays ?? expiryDays;
  const effectiveAutoExpiry = pointsExpiry?.settings?.autoExpiry ?? autoExpiry;

  function copyCode(code: string) { navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(""), 2000); toast.success("Copied"); }

  const saveRefMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => { const res = await apiFetch("/api/referral", { method: "POST", body: JSON.stringify(body) }); if (!res.success) throw new Error(res.error || "Failed"); return res; },
    onSuccess: () => { toast.success("Referral settings saved"); queryClient.invalidateQueries({ queryKey: ["referral-settings"] }); },
    onError: (err: Error) => toast.error(err.message),
  });
  const saveLoyaltyMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => { const res = await apiFetch("/api/referral", { method: "POST", body: JSON.stringify(body) }); if (!res.success) throw new Error(res.error || "Failed"); return res; },
    onSuccess: () => { toast.success("Loyalty settings saved"); queryClient.invalidateQueries({ queryKey: ["loyalty-settings"] }); },
    onError: (err: Error) => toast.error(err.message),
  });
  const createRewardMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => { const res = await apiFetch("/api/referral", { method: "POST", body: JSON.stringify(body) }); if (!res.success) throw new Error(res.error || "Failed"); return res; },
    onSuccess: () => { toast.success("Reward created"); setCreateRewardOpen(false); setNewReward({ name: "", description: "", pointsRequired: "", type: "Discount", value: "", active: true }); queryClient.invalidateQueries({ queryKey: ["referral-rewards"] }); },
    onError: (err: Error) => toast.error(err.message),
  });
  const redeemRewardMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => { const res = await apiFetch("/api/referral", { method: "POST", body: JSON.stringify(body) }); if (!res.success) throw new Error(res.error || "Failed"); return res; },
    onSuccess: () => { toast.success("Redeemed"); setRedeemOpen(false); queryClient.invalidateQueries({ queryKey: ["loyalty-members"] }); queryClient.invalidateQueries({ queryKey: ["referral-redemptions"] }); },
    onError: (err: Error) => toast.error(err.message),
  });
  const deleteRewardMutation = useMutation({
    mutationFn: async (rewardId: string) => { const res = await apiFetch("/api/referral", { method: "POST", body: JSON.stringify({ action: "delete_reward", rewardId }) }); if (!res.success) throw new Error(res.error || "Failed"); return res; },
    onSuccess: () => { toast.success("Reward deleted"); setDeleteRewardId(null); queryClient.invalidateQueries({ queryKey: ["referral-rewards"] }); },
    onError: (err: Error) => toast.error(err.message),
  });
  const adjustPointsMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => { const res = await apiFetch("/api/referral", { method: "POST", body: JSON.stringify(body) }); if (!res.success) throw new Error(res.error || "Failed"); return res; },
    onSuccess: () => { toast.success("Points adjusted"); setAdjustOpen(false); setAdjustPoints(""); setAdjustNote(""); queryClient.invalidateQueries({ queryKey: ["loyalty-members"] }); queryClient.invalidateQueries({ queryKey: ["points-history"] }); },
    onError: (err: Error) => toast.error(err.message),
  });
  const toggleRewardMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => { const res = await apiFetch("/api/referral", { method: "POST", body: JSON.stringify(body) }); if (!res.success) throw new Error(res.error || "Failed"); return res; },
    onSuccess: () => { toast.success("Reward updated"); setEditRewardOpen(false); queryClient.invalidateQueries({ queryKey: ["referral-rewards"] }); },
    onError: (err: Error) => toast.error(err.message),
  });
  const bulkRewardMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => { const res = await apiFetch("/api/referral", { method: "POST", body: JSON.stringify(body) }); if (!res.success) throw new Error(res.error || "Failed"); return res; },
    onSuccess: (d) => { toast.success(d.message || "Bulk action done"); setSelectedRewardIds([]); queryClient.invalidateQueries({ queryKey: ["referral-rewards"] }); },
    onError: (err: Error) => toast.error(err.message),
  });
  const enrollMemberMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => { const res = await apiFetch("/api/referral", { method: "POST", body: JSON.stringify(body) }); if (!res.success) throw new Error(res.error || "Failed"); return res; },
    onSuccess: () => { toast.success("Member enrolled"); setEnrollOpen(false); queryClient.invalidateQueries({ queryKey: ["loyalty-members"] }); },
    onError: (err: Error) => toast.error(err.message),
  });
  const saveExpiryMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => { const res = await apiFetch("/api/referral", { method: "POST", body: JSON.stringify(body) }); if (!res.success) throw new Error(res.error || "Failed"); return res; },
    onSuccess: () => { toast.success("Points expiry settings saved"); queryClient.invalidateQueries({ queryKey: ["points-expiry"] }); },
    onError: (err: Error) => toast.error(err.message),
  });
  const createCampaignMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => { const res = await apiFetch("/api/referral", { method: "POST", body: JSON.stringify(body) }); if (!res.success) throw new Error(res.error || "Failed"); return res; },
    onSuccess: () => { toast.success("Campaign created"); setCampaignOpen(false); setCampaignForm({ name: "", description: "", bonusType: "points", bonusValue: "100", bonusRecipient: "both", maxReferrals: "", startDate: "", endDate: "", status: "active" }); queryClient.invalidateQueries({ queryKey: ["referral-campaigns"] }); },
    onError: (err: Error) => toast.error(err.message),
  });
  const updateCampaignMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => { const res = await apiFetch("/api/referral", { method: "POST", body: JSON.stringify(body) }); if (!res.success) throw new Error(res.error || "Failed"); return res; },
    onSuccess: () => { toast.success("Campaign updated"); setEditCampaignOpen(false); queryClient.invalidateQueries({ queryKey: ["referral-campaigns"] }); },
    onError: (err: Error) => toast.error(err.message),
  });
  const deleteCampaignMutation = useMutation({
    mutationFn: async (campaignId: string) => { const res = await apiFetch("/api/referral", { method: "POST", body: JSON.stringify({ action: "delete_campaign", campaignId }) }); if (!res.success) throw new Error(res.error || "Failed"); return res; },
    onSuccess: () => { toast.success("Campaign deleted"); queryClient.invalidateQueries({ queryKey: ["referral-campaigns"] }); },
    onError: (err: Error) => toast.error(err.message),
  });
  const saveTiersMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => { const res = await apiFetch("/api/referral", { method: "POST", body: JSON.stringify(body) }); if (!res.success) throw new Error(res.error || "Failed"); return res; },
    onSuccess: () => { toast.success("Tier config saved"); setTierConfigOpen(false); },
    onError: (err: Error) => toast.error(err.message),
  });

  const filteredCodes = refCodes.filter((c) => {
    const matchSearch = c.subscriberName.toLowerCase().includes(refSearch.toLowerCase()) || c.code.toLowerCase().includes(refSearch.toLowerCase());
    const matchStatus = refStatusFilter === "ALL" || c.status === refStatusFilter;
    return matchSearch && matchStatus;
  });

  const filteredLoyalty = loyaltyMembers.filter((m) => m.subscriberName.toLowerCase().includes(loyaltySearch.toLowerCase()));

  const filteredRewards = rewards.filter((r) => r.name.toLowerCase().includes(rewardSearch.toLowerCase()));

  const filteredHistory = pointsHistory.filter((h) => h.subscriber.toLowerCase().includes(historySearch.toLowerCase()) || h.description.toLowerCase().includes(historySearch.toLowerCase()));

  const filteredRedemptions = redemptions.filter((r) => r.subscriber.toLowerCase().includes(redemptionSearch.toLowerCase()) || r.rewardName.toLowerCase().includes(redemptionSearch.toLowerCase()));

  const handleExportCSV = (data: Record<string, string>[], filename: string) => {
    if (data.length === 0) return;
    const header = Object.keys(data[0]).join(",");
    const rows = data.map((r) => Object.values(r).join(","));
    const csv = [header, ...rows].map((r) => `"${r}"`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${filename}.csv`; a.click();
    toast.success(`${filename}.csv exported`);
  };

  const analytics = referralAnalytics as ReferralAnalytics | null;

  const analyticsData = null;
  const pieChartData: { name: string; value: number }[] = analytics?.topReferrers?.map((r) => ({ name: r.name, value: r.referrals })) || [];

  if (isLoading) return (<div className="flex items-center justify-center py-32"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Referral & Loyalty</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage referral programs, loyalty points, and rewards catalog</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Referrals" value={totalReferrals} subtitle="All referral entries" icon={Users} gradient="stat-gradient-red" delay={0} />
        <StatCard title="Converted" value={convertedReferrals} subtitle="Successful referrals" icon={UserCheck} gradient="stat-gradient-green" delay={75} />
        <StatCard title="Loyalty Members" value={activeLoyaltyMembers} subtitle="Active members" icon={Award} gradient="stat-gradient-amber" delay={150} />
        <StatCard title="Rewards Redeemed" value={rewardsRedeemed} subtitle="Total applied" icon={Gift} gradient="stat-gradient-purple" delay={225} />
        <StatCard title="Expiring Points" value={pointsExpiry?.expiringSoonCount ?? 0} subtitle="Next 30 days" icon={Timer} gradient="stat-gradient-red" delay={300} />
      </div>

      <Tabs defaultValue="referral" className="space-y-4">
        <TabsList className="bg-muted p-1 h-auto flex flex-wrap">
          <TabsTrigger value="referral" className="text-xs sm:text-sm gap-1.5"><Users className="h-3.5 w-3.5" />Referral Program</TabsTrigger>
          <TabsTrigger value="loyalty" className="text-xs sm:text-sm gap-1.5"><Award className="h-3.5 w-3.5" />Loyalty Points</TabsTrigger>
          <TabsTrigger value="campaigns" className="text-xs sm:text-sm gap-1.5"><Megaphone className="h-3.5 w-3.5" />Campaigns</TabsTrigger>
          <TabsTrigger value="rewards" className="text-xs sm:text-sm gap-1.5"><Gift className="h-3.5 w-3.5" />Rewards</TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs sm:text-sm gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Analytics</TabsTrigger>
        </TabsList>

        {/* ── Referral Program ── */}
        <TabsContent value="referral" className="space-y-4">
          <Card className="border shadow-sm"><CardHeader className="pb-3"><div className="flex items-center justify-between"><div><CardTitle className="text-base flex items-center gap-2"><Percent className="h-5 w-5 text-[#DC2626]" />Program Settings</CardTitle><CardDescription>Configure referral bonus and rules</CardDescription></div><div className="flex items-center gap-2"><Label className="text-xs text-muted-foreground">Status</Label><Switch checked={refSettings.active} onCheckedChange={(v) => setRefSettingsLocal({ ...refSettings, active: v })} /></div></div></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div><Label className="text-xs text-muted-foreground">Referrer Bonus (₹)</Label><Input type="number" value={refSettings.referrerBonus} onChange={(e) => setRefSettingsLocal({ ...refSettings, referrerBonus: parseInt(e.target.value) || 0 })} className="mt-1 h-9" /></div>
                <div><Label className="text-xs text-muted-foreground">Referee Bonus (₹)</Label><Input type="number" value={refSettings.refereeBonus} onChange={(e) => setRefSettingsLocal({ ...refSettings, refereeBonus: parseInt(e.target.value) || 0 })} className="mt-1 h-9" /></div>
                <div><Label className="text-xs text-muted-foreground">Validity (Days)</Label><Input type="number" value={refSettings.validityDays} onChange={(e) => setRefSettingsLocal({ ...refSettings, validityDays: parseInt(e.target.value) || 0 })} className="mt-1 h-9" /></div>
                <div><Label className="text-xs text-muted-foreground">Min Invoice (₹)</Label><Input type="number" value={refSettings.minInvoiceAmount} onChange={(e) => setRefSettingsLocal({ ...refSettings, minInvoiceAmount: parseInt(e.target.value) || 0 })} className="mt-1 h-9" /></div>
              </div>
              <div className="mt-4 flex justify-end"><Button size="sm" className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => saveRefMutation.mutate({ action: "save_referral_settings", referrerBonus: refSettings.referrerBonus, refereeBonus: refSettings.refereeBonus, validityDays: refSettings.validityDays, minInvoiceAmount: refSettings.minInvoiceAmount, enabled: refSettings.active })} disabled={saveRefMutation.isPending}>{saveRefMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}Save Settings</Button></div>
            </CardContent>
          </Card>

          {/* Shareable Referral URL/QR */}
          <Card className="border shadow-sm bg-gradient-to-r from-emerald-50 to-green-50 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <QrCode className="h-8 w-8 text-green-700" />
                <div className="flex-1"><p className="text-sm font-semibold text-green-800">Shareable Referral Link</p><p className="text-xs text-green-700">Subscribers can use this link to sign up with your referral</p><code className="block mt-1 text-xs bg-white/60 px-2 py-1 rounded font-mono break-all text-green-800">{typeof window !== "undefined" ? window.location.origin : "https://app.cryptsk.com"}/referral/CODE</code></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">Referral Codes</CardTitle><CardDescription>Active referral codes for all subscribers</CardDescription></CardHeader><CardContent className="p-0">
            <div className="px-4 pb-3 flex flex-col sm:flex-row gap-2"><div className="relative flex-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search by name or code..." value={refSearch} onChange={(e) => setRefSearch(e.target.value)} className="pl-8 h-9" /></div><Select value={refStatusFilter} onValueChange={setRefStatusFilter}><SelectTrigger className="w-full sm:w-36 h-9"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="ALL">All</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div>
            <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="text-xs font-medium uppercase">Subscriber</TableHead><TableHead className="text-xs font-medium uppercase">Referral Code</TableHead><TableHead className="text-xs font-medium uppercase hidden md:table-cell">Referred</TableHead><TableHead className="text-xs font-medium uppercase hidden md:table-cell">Converted</TableHead><TableHead className="text-xs font-medium uppercase">Earned</TableHead><TableHead className="text-xs font-medium uppercase">Status</TableHead></TableRow></TableHeader><TableBody>{filteredCodes.length === 0 ? (<TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No referral codes</TableCell></TableRow>) : filteredCodes.map((code) => (<TableRow key={code.id} className="hover:bg-muted/50 transition-colors duration-150"><TableCell className="text-sm font-medium">{code.subscriberName}</TableCell><TableCell><div className="flex items-center gap-1.5"><code className="text-xs font-mono bg-muted px-2 py-1 rounded font-bold">{code.code}</code><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyCode(code.code)}>{copied === code.code ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}</Button></div></TableCell><TableCell className="text-sm tabular-nums hidden md:table-cell">{code.totalReferred}</TableCell><TableCell className="text-sm tabular-nums hidden md:table-cell">{code.convertedCount}</TableCell><TableCell className="text-sm font-medium text-emerald-600 tabular-nums">₹{code.totalEarned}</TableCell><TableCell><Badge variant={code.status === "active" ? "default" : "secondary"} className={`text-[10px] ${code.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>{code.status}</Badge></TableCell></TableRow>))}</TableBody></Table></div>
          </CardContent></Card>

          <Card className="border shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">Referral Tracking</CardTitle><CardDescription>Track all referrals and conversions</CardDescription></CardHeader><CardContent className="p-0"><div className="overflow-x-auto max-h-72 overflow-y-auto"><Table><TableHeader><TableRow><TableHead className="text-xs font-medium uppercase">Referrer</TableHead><TableHead className="text-xs font-medium uppercase">Referee</TableHead><TableHead className="text-xs font-medium uppercase hidden md:table-cell">Phone</TableHead><TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Date</TableHead><TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Conversion</TableHead><TableHead className="text-xs font-medium uppercase">Bonus</TableHead><TableHead className="text-xs font-medium uppercase">Status</TableHead></TableRow></TableHeader><TableBody>{refTracking.length === 0 ? (<TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No data</TableCell></TableRow>) : refTracking.map((t) => (<TableRow key={t.id} className="hover:bg-muted/50 transition-colors duration-150"><TableCell className="text-sm">{t.referrerName}</TableCell><TableCell className="text-sm font-medium">{t.refereeName}</TableCell><TableCell className="text-sm text-muted-foreground font-mono hidden md:table-cell">{t.refereePhone}</TableCell><TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{formatDate(t.referralDate)}</TableCell><TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{t.conversionDate ? formatDate(t.conversionDate) : "—"}</TableCell><TableCell className="text-sm font-medium">₹{t.bonusAmount}</TableCell><TableCell>{getReferralStatusBadge(t.status)}</TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card>
        </TabsContent>

        {/* ── Loyalty Points ── */}
        <TabsContent value="loyalty" className="space-y-4">
          {/* Points Expiry Settings */}
          <Card className="border shadow-sm bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Timer className="h-5 w-5 text-amber-600" />Points Expiry Rules</CardTitle><CardDescription>Configure when loyalty points expire</CardDescription></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div><Label className="text-xs text-muted-foreground">Expiry Period (Days)</Label><Input type="number" value={expiryDays} onChange={(e) => setExpiryDays(parseInt(e.target.value) || 365)} className="mt-1 h-9" /><p className="text-[10px] text-muted-foreground mt-1">Points expire after this many days of inactivity</p></div>
                <div className="flex items-center gap-3"><Switch checked={autoExpiry} onCheckedChange={setAutoExpiry} /><div><Label className="text-sm font-medium">Auto-Expiry</Label><p className="text-xs text-muted-foreground">Automatically expire points based on rules</p></div></div>
              </div>
              {pointsExpiry?.expiringSoonCount && pointsExpiry.expiringSoonCount > 0 && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs font-medium text-red-700"><AlertTriangle className="h-3.5 w-3.5 inline mr-1" />{pointsExpiry.expiringSoonCount} points entries expiring within 30 days</p>
                </div>
              )}
              <div className="mt-4 flex justify-end"><Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => saveExpiryMutation.mutate({ action: "save_points_expiry", expiryDays, autoExpiry })} disabled={saveExpiryMutation.isPending}>{saveExpiryMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}Save Expiry Rules</Button></div>
            </CardContent>
          </Card>

          <Card className="border shadow-sm"><CardHeader className="pb-3"><div className="flex items-center justify-between"><div><CardTitle className="text-base flex items-center gap-2"><Award className="h-5 w-5 text-[#DC2626]" />Program Settings</CardTitle><CardDescription>Points earning and redemption rules</CardDescription></div><div className="flex items-center gap-2"><Label className="text-xs text-muted-foreground">Status</Label><Switch checked={loyaltySettings.active} onCheckedChange={(v) => setLoyaltySettings({ ...loyaltySettings, active: v })} /></div></div></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><Label className="text-xs text-muted-foreground">Points per ₹100</Label><Input type="number" value={loyaltySettings.pointsPerHundred} onChange={(e) => setLoyaltySettings({ ...loyaltySettings, pointsPerHundred: parseInt(e.target.value) || 0 })} className="mt-1 h-9" /></div>
                <div><Label className="text-xs text-muted-foreground">Point Value (₹)</Label><Input type="number" step="0.1" value={loyaltySettings.pointValueRupees} onChange={(e) => setLoyaltySettings({ ...loyaltySettings, pointValueInr: parseFloat(e.target.value) || 0 })} className="mt-1 h-9" /><p className="text-[10px] text-muted-foreground mt-1">1 point = ₹{loyaltySettings.pointValueRupees}</p></div>
                <div><Label className="text-xs text-muted-foreground">Monthly Bonus</Label><Input type="number" value={loyaltySettings.monthlyBonusPoints} onChange={(e) => setLoyaltySettings({ ...loyaltySettings, monthlyBonusPoints: parseInt(e.target.value) || 0 })} className="mt-1 h-9" /></div>
              </div>
              <div className="mt-4 flex justify-end"><Button size="sm" className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => saveLoyaltyMutation.mutate({ action: "save_loyalty_settings", pointsPerHundred: loyaltySettings.pointsPerHundred, pointValueInr: loyaltySettings.pointValueRupees, monthlyBonusPoints: loyaltySettings.monthlyBonusPoints, enabled: loyaltySettings.active })} disabled={saveLoyaltyMutation.isPending}>{saveLoyaltyMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}Save</Button></div>
            </CardContent>
          </Card>

          {/* Tier Configuration */}
          <Card className="border shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4 text-purple-600" />Tier Configuration</CardTitle><Dialog open={tierConfigOpen} onOpenChange={setTierConfigOpen}><DialogTrigger asChild><Button variant="outline" size="sm"><Settings2 className="h-4 w-4 mr-1" />Configure</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Configure Tier Thresholds</DialogTitle></DialogHeader><div className="grid gap-3 py-4">{tiers.map((tier, i) => (<div key={i} className="flex items-center gap-3"><div className={`w-4 h-4 rounded-full ${tier.color === "orange" ? "bg-orange-100" : tier.color === "gray" ? "bg-gray-200" : tier.color === "amber" ? "bg-amber-100" : "bg-slate-700 text-white"}`} /><div className="flex-1"><Label className="text-xs font-medium">{tier.name}</Label><Input type="number" value={String(tier.minPoints)} onChange={(e) => setTiers((prev) => prev.map((t, idx) => idx === i ? { ...t, minPoints: parseInt(e.target.value) || 0 } : t))} className="h-8 text-xs" /><p className="text-[10px] text-muted-foreground">{tier.minPoints} pts min</p></div></div>))}</div><DialogFooter><Button variant="outline" onClick={() => setTierConfigOpen(false)}>Cancel</Button><Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => saveTiersMutation.mutate({ action: "save_tiers", tiers })}>Save Tiers</Button></DialogFooter></DialogContent></Dialog></CardHeader></Card>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 border border-orange-200"><Shield className="h-4 w-4 text-orange-600" /><span className="text-xs font-medium text-orange-700">Bronze &lt; 100</span></div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 border border-gray-300"><Shield className="h-4 w-4 text-gray-600" /><span className="text-xs font-medium text-gray-700">Silver 100–500</span></div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200"><Star className="h-4 w-4 text-amber-600" /><span className="text-xs font-medium text-amber-700">Gold 500–1000</span></div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 border border-slate-300"><Crown className="h-4 w-4 text-slate-700" /><span className="text-xs font-medium text-slate-700">Platinum 1000+</span></div>
          </div>

          {/* Loyalty Members with search + pagination */}
          <Card className="border shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">Loyalty Members ({loyaltyTotal})</CardTitle></CardHeader><CardContent className="p-0">
            <div className="px-4 pb-3"><div className="relative flex-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search member..." value={loyaltySearch} onChange={(e) => { setLoyaltySearch(e.target.value); setLoyaltyPage(1); }} className="pl-8 h-9" /></div></div>
            <div className="overflow-x-auto max-h-72 overflow-y-auto"><Table><TableHeader><TableRow><TableHead className="text-xs font-medium uppercase">Subscriber</TableHead><TableHead className="text-xs font-medium uppercase hidden md:table-cell">Total</TableHead><TableHead className="text-xs font-medium uppercase hidden md:table-cell">Month</TableHead><TableHead className="text-xs font-medium uppercase hidden md:table-cell">Redeemed</TableHead><TableHead className="text-xs font-medium uppercase">Balance</TableHead><TableHead className="text-xs font-medium uppercase">Tier</TableHead><TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{filteredLoyalty.length === 0 ? (<TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No members</TableCell></TableRow>) : filteredLoyalty.map((member) => (<TableRow key={member.id} className="hover:bg-muted/50 transition-colors duration-150"><TableCell className="text-sm font-medium">{member.subscriberName}</TableCell><TableCell className="text-sm tabular-nums hidden md:table-cell">{member.totalPoints.toLocaleString()}</TableCell><TableCell className="text-sm tabular-nums text-emerald-600 hidden md:table-cell">+{member.earnedThisMonth}</TableCell><TableCell className="text-sm tabular-nums text-red-500 hidden md:table-cell">-{member.redeemed}</TableCell><TableCell className="text-sm font-bold tabular-nums">{member.availableBalance.toLocaleString()}</TableCell><TableCell>{getTierBadge(member.tier)}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" className="h-7 w-7 text-teal-600" onClick={() => { setAdjustMemberId(member.id); setAdjustPoints(""); setAdjustNote(""); setAdjustOpen(true); }}><IndianRupee className="h-3.5 w-3.5" /></Button></TableCell></TableRow>))}</TableBody></Table></div>
            {loyaltyTotal > ITEMS_PER_PAGE && (<div className="flex items-center justify-between border-t px-4 py-3"><p className="text-xs text-muted-foreground">{(loyaltyPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(loyaltyPage * ITEMS_PER_PAGE, loyaltyTotal)} of {loyaltyTotal}</p><div className="flex items-center gap-1"><Button variant="outline" size="sm" disabled={loyaltyPage <= 1} onClick={() => setLoyaltyPage(loyaltyPage - 1)}>←</Button><span className="text-xs px-2">{loyaltyPage} / {Math.ceil(loyaltyTotal / ITEMS_PER_PAGE)}</span><Button variant="outline" size="sm" disabled={loyaltyPage >= Math.ceil(loyaltyTotal / ITEMS_PER_PAGE)} onClick={() => setLoyaltyPage(loyaltyPage + 1)}>→</Button></div></div>)}
          </CardContent></Card>

          {/* Points History with search + pagination */}
          <Card className="border shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base">Points History</CardTitle><CardDescription>Complete audit trail of all points transactions</CardDescription></CardHeader><CardContent className="p-0">
            <div className="px-4 pb-3"><div className="relative flex-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search history..." value={historySearch} onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }} className="pl-8 h-9" /></div></div>
            <div className="overflow-x-auto max-h-72 overflow-y-auto"><Table><TableHeader><TableRow><TableHead className="text-xs font-medium uppercase">Subscriber</TableHead><TableHead className="text-xs font-medium uppercase">Action</TableHead><TableHead className="text-xs font-medium uppercase">Points</TableHead><TableHead className="text-xs font-medium uppercase hidden md:table-cell">Balance</TableHead><TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Description</TableHead><TableHead className="text-xs font-medium uppercase">Date</TableHead></TableRow></TableHeader><TableBody>{filteredHistory.length === 0 ? (<TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No history</TableCell></TableRow>) : filteredHistory.map((h) => (<TableRow key={h.id} className="hover:bg-muted/50 transition-colors duration-150"><TableCell className="text-sm font-medium">{h.subscriber}</TableCell><TableCell><Badge variant="outline" className="text-[10px]">{h.action}</Badge></TableCell><TableCell className={`text-sm font-bold tabular-nums ${h.points > 0 ? "text-emerald-600" : "text-red-500"}`}>{h.points > 0 ? `+${h.points}` : h.points}</TableCell><TableCell className="text-sm tabular-nums hidden md:table-cell">{h.balanceAfter.toLocaleString()}</TableCell><TableCell className="text-xs text-muted-foreground max-w-[200px] truncate hidden lg:table-cell">{h.description}</TableCell><TableCell className="text-xs text-muted-foreground">{formatDate(h.date)}</TableCell></TableRow>))}</TableBody></Table></div>
            {historyTotal > ITEMS_PER_PAGE && (<div className="flex items-center justify-between border-t px-4 py-3"><p className="text-xs text-muted-foreground">{(historyPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(historyPage * ITEMS_PER_PAGE, historyTotal)} of {historyTotal}</p><div className="flex items-center gap-1"><Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage(historyPage - 1)}>←</Button><span className="text-xs px-2">{historyPage} / {Math.ceil(historyTotal / ITEMS_PER_PAGE)}</span><Button variant="outline" size="sm" disabled={historyPage >= Math.ceil(historyTotal / ITEMS_PER_PAGE)} onClick={() => setHistoryPage(historyPage + 1)}>→</Button></div></div>)}
          </CardContent></Card>
        </TabsContent>

        {/* ── Rewards ── */}
        <TabsContent value="rewards" className="space-y-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between mb-4">
              <div><h3 className="text-base font-semibold">Rewards Catalog</h3><p className="text-xs text-muted-foreground">Subscribers can redeem points for these rewards</p></div>
              <div className="flex items-center gap-2">
                {selectedRewardIds.length > 0 && (<><Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">{selectedRewardIds.length} selected</Badge><Button variant="ghost" size="sm" onClick={() => setSelectedRewardIds([])} className="ml-1"><X className="h-3 w-3" /></Button><Button variant="outline" size="sm" className="text-red-600" onClick={() => bulkRewardMutation.mutate({ action: "bulk_delete", ids: selectedRewardIds })}>Delete Selected</Button></>)}
                <Dialog open={createRewardOpen} onOpenChange={setCreateRewardOpen}><DialogTrigger asChild><Button size="sm" className="bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs h-8"><Plus className="h-3 w-3 mr-1" />Create Reward</Button></DialogTrigger>
                  <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Create New Reward</DialogTitle></DialogHeader><div className="grid gap-4 py-2">
                    <div><Label className="text-sm">Name *</Label><Input value={newReward.name} onChange={(e) => setNewReward((prev) => ({ ...prev, name: e.target.value }))} placeholder="e.g. ₹100 Bill Discount" className="mt-1" /></div>
                    <div><Label className="text-sm">Description</Label><Input value={newReward.description} onChange={(e) => setNewReward((prev) => ({ ...prev, description: e.target.value }))} placeholder="Describe this reward..." className="mt-1" /></div>
                    <div className="grid grid-cols-2 gap-4"><div><Label className="text-sm">Points Required *</Label><Input type="number" value={newReward.pointsRequired} onChange={(e) => setNewReward((prev) => ({ ...prev, pointsRequired: e.target.value }))} className="mt-1" /></div><div><Label className="text-sm">Stock Limit</Label><Input type="number" value={(newReward as any).stockLimit || ""} onChange={(e) => setNewReward((prev) => ({ ...prev, stockLimit: e.target.value }))} className="mt-1" placeholder="Unlimited" /></div></div>
                    <div className="grid grid-cols-2 gap-4"><div><Label className="text-sm">Type</Label><Select value={newReward.type} onValueChange={(v) => setNewReward((prev) => ({ ...prev, type: v }))}><SelectTrigger className="mt-1" /><SelectContent><SelectItem value="DISCOUNT">Discount</SelectItem><SelectItem value="SPEED_BOOST">Speed Boost</SelectItem><SelectItem value="DATA">Data</SelectItem><SelectItem value="SERVICE">Service</SelectItem></SelectContent></Select></div><div><Label className="text-sm">Value</Label><Input value={newReward.value} onChange={(e) => setNewReward((prev) => ({ ...prev, value: e.target.value }))} className="mt-1" /></div></div>
                  </div><DialogFooter><Button variant="outline" onClick={() => setCreateRewardOpen(false)}>Cancel</Button><Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => { if (!newReward.name || !newReward.pointsRequired) return; createRewardMutation.mutate({ action: "create_reward", name: newReward.name, description: newReward.description, pointsRequired: parseInt(newReward.pointsRequired), type: newReward.type, value: Number(newReward.value) || 0, active: true, stockLimit: (newReward as any).stockLimit ? parseInt((newReward as any).stockLimit) : null }); }} disabled={createRewardMutation.isPending}>{createRewardMutation.isPending ? "Creating..." : "Create Reward"}</Button></DialogFooter></DialogContent></Dialog>
                <Dialog open={editRewardOpen} onOpenChange={setEditRewardOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Edit Reward</DialogTitle></DialogHeader><div className="grid gap-4 py-2">
                    <div><Label className="text-sm">Name</Label><Input value={editRewardItem?.name || ""} onChange={(e) => setEditRewardItem((prev) => prev ? { ...prev, name: e.target.value } : prev)} className="mt-1" /></div>
                    <div><Label className="text-sm">Description</Label><Input value={editRewardItem?.description || ""} onChange={(e) => setEditRewardItem((prev) => prev ? { ...prev, description: e.target.value } : prev)} className="mt-1" /></div>
                    <div><Label className="text-sm">Points Required</Label><Input type="number" value={String(editRewardItem?.pointsRequired || "")} onChange={(e) => setEditRewardItem((prev: any) => prev ? { ...prev, pointsRequired: e.target.value } : prev)} className="mt-1" /></div>
                    <div className="flex items-center gap-2"><Label className="text-sm">Active</Label><Switch checked={editRewardItem?.active ?? true} onCheckedChange={(v) => setEditRewardItem((prev) => prev ? { ...prev, active: v } : prev)} /></div>
                  </div><DialogFooter><Button variant="outline" onClick={() => setEditRewardOpen(false)}>Cancel</Button><Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => { if (!editRewardItem) return; toggleRewardMutation.mutate({ action: "toggle_reward", rewardId: editRewardItem.id, active: !editRewardItem.active }); setEditRewardOpen(false); }} disabled={!editRewardItem}>Update</Button></DialogFooter></DialogContent></Dialog>
                <AlertDialog open={!!deleteRewardId} onOpenChange={() => setDeleteRewardId(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Reward</AlertDialogTitle><AlertDialogDescription>Permanently delete this reward? Pending redemptions will fail.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { if (!deleteRewardId) return; deleteRewardMutation.mutate(deleteRewardId); }}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
              </div>
            </div>
            <Card className="border shadow-sm"><CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table><TableHeader><TableRow><TableHead className="w-10"><input type="checkbox" checked={selectedRewardIds.length === rewards.length && rewards.length > 0} onChange={() => { if (selectedRewardIds.length === rewards.length) setSelectedRewardIds([]); else setSelectedRewardIds(rewards.filter((r) => r.active).map((r) => r.id)); }} /></TableHead><TableHead className="text-xs font-medium uppercase">Reward</TableHead><TableHead className="text-xs font-medium uppercase">Type</TableHead><TableHead className="text-xs font-medium uppercase">Points</TableHead><TableHead className="text-xs font-medium uppercase">Stock</TableHead><TableHead className="text-xs font-medium uppercase">Status</TableHead><TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{rewards.length === 0 ? (<TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No rewards</TableCell></TableRow>) : rewards.map((rw) => {
                  const ic = mapRewardIcon(rw.type);
                  return (<TableRow key={rw.id} className={`${rw.active ? "" : "opacity-50"} hover:bg-muted/50 transition-colors duration-150`}><TableCell><div className="flex items-center gap-1.5"><input type="checkbox" checked={selectedRewardIds.includes(rw.id)} onChange={() => { if (selectedRewardIds.includes(rw.id)) setSelectedRewardIds((prev) => prev.filter((x) => x !== rw.id)); else setSelectedRewardIds([...selectedRewardIds, rw.id]); }} className="rounded" /></div><div className="flex items-center gap-2"><div className={`p-1.5 rounded ${ic.color}`} style={{ minWidth: 28, height: 28 }}><ic.icon className="h-4 w-4" /></div><p className="text-xs font-medium">{rw.name}</p></div></TableCell><TableCell><Badge variant="outline" className="text-[10px]">{rw.type}</Badge></TableCell><TableCell className="tabular-nums text-xs">{rw.pointsRequired}</TableCell><TableCell className="tabular-nums text-xs">{rw.stockLimit ? `${rw.currentStock}/${rw.stockLimit}` : "—"}</TableCell><TableCell><Switch checked={rw.active} onCheckedChange={() => toggleRewardMutation.mutate({ action: "toggle_reward", rewardId: rw.id, active: !rw.active })} className="scale-75" /></TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={() => { setRedeemRewardItem(rw); setRedeemMemberId(""); setRedeemOpen(true); }}><Eye className="h-3 w-3" /></Button><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditRewardItem(rw); setEditRewardOpen(true); }}><Edit2 className="h-3.5 w-3.5" /></Button></TableCell></TableRow>);
                })}</TableBody></Table></div>
            </CardContent></Card>
          </div>
        </TabsContent>

        {/* ── Analytics ── */}
        <TabsContent value="analytics" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {analyticsData ? (analytics?.topReferrers || []).map((item: any, i: number) => (<Card key={i} className="border shadow-sm"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">{item.name}</p><p className="text-xl font-bold mt-1 tabular-nums">{item.referrals}</p></CardContent></Card>)) : null}
          </div>

          {/* Conversion rate chart */}
          {analytics?.conversionRate !== undefined && (
            <Card className="border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-red-600" />Conversion Rate</CardTitle></CardHeader>
              <CardContent className="pt-0"><div className="h-48"><ResponsiveContainer width="100%" height="100%"><LineChart data={[{ name: "Rate", rate: [0, Number(analytics?.conversionRate || 0), 0] }]}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fill: "#94A3B8", fontSize: 11 }} /><Tooltip /><Line type="monotone" dataKey="rate" stroke="#DC2626" strokeWidth={2.5} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div></CardContent>
            </Card>
          )}

          {/* Top Referrers chart */}
          {pieChartData.length > 0 && (
            <Card className="border shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4 text-teal-600" />Best Referrers</CardTitle></CardHeader><CardContent className="pt-0"><div className="h-56"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieChartData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value" nameKey="name" strokeWidth={2} stroke="#fff"><Tooltip formatter={(value: number, name: string) => [value.toLocaleString("en-IN"), name]} /><Legend layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: "11px" }} /></Pie></PieChart></ResponsiveContainer></div></CardContent></Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Points Adjustment Dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Manual Points Adjustment</DialogTitle><DialogDescription>Manually add or deduct points for a loyalty member.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2"><Label className="text-sm">Member ID</Label><Input value={adjustMemberId} onChange={(e) => setAdjustMemberId(e.target.value)} placeholder="Enter member ID" className="h-9" /></div>
            <div className="space-y-2"><Label className="text-sm">Points (can be negative)</Label><Input type="number" value={adjustPoints} onChange={(e) => setAdjustPoints(e.target.value)} placeholder="+100 or -50" className="h-9" /></div>
            <div className="space-y-2"><Label className="text-sm">Note</Label><Input value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="Reason for adjustment" className="h-9" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => { if (!adjustMemberId || !adjustPoints) return; adjustPointsMutation.mutate({ action: "adjust_points", memberId: adjustMemberId, points: Number(adjustPoints), description: adjustNote || "Admin adjustment" }); }}>
              {adjustPointsMutation.isPending ? "Adjusting..." : "Adjust"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enroll Member Dialog */}
      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Enroll in Loyalty Program</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2"><Label className="text-sm">Select Member</Label>
              <Select value={enrollMemberId} onValueChange={setEnrollMemberId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select member" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {loyaltyMembers.map((m) => (<SelectItem key={m.id} value={m.id}>{m.subscriberName} ({m.availableBalance} pts)</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollOpen(false)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => { if (!enrollMemberId) return; enrollMemberMutation.mutate({ action: "enroll_member", memberId: enrollMemberId }); }}>
              {enrollMemberMutation.isPending ? "Enrolling..." : "Enroll"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
