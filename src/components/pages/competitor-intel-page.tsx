"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3, Plus, Pencil, Trash2, Loader2, TrendingUp, DollarSign, Search,
  Download, ChevronLeft, ChevronRight, GitCompare, X, History, TrendingDown,
  UserMinus, Brain, Target, ArrowUpRight, ArrowDownRight, Minus, Lightbulb, ShieldAlert, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { apiFetch, formatINR } from "@/lib/utils";

interface Competitor {
  id: string;
  name: string;
  planName: string;
  speed: string;
  dataLimit: string;
  price: number;
  validity: string;
  category: string;
  notes: string;
  priceHistory?: CompetitorPriceHistoryItem[];
  lossRate?: number;
}

interface CompetitorPriceHistoryItem {
  id: string;
  oldPrice: number;
  newPrice: number;
  notes: string;
  createdAt: string;
}

interface WinLossRecord {
  id: string;
  subscriberName: string;
  competitorName: string;
  result: string;
  reason: string;
  notes: string;
  createdAt: string;
}

interface PriceTrendDataPoint {
  month: string;
  price: number;
}

interface AIAnalysis {
  summary: string;
  recommendations: string[];
  positioning: string;
  threats: string[];
  opportunities: string[];
}

const CATEGORIES = ["FTTH", "Wireless", "Cable", "Leased Line"];
const COLORS = ["#DC2626", "#16A34A", "#2563EB", "#D97706", "#7C3AED", "#EC4899", "#0891B2", "#EA580C"];

function parseSpeedMbps(speedStr: string): number {
  if (!speedStr) return 0;
  const match = speedStr.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

function getLastMonths(count: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(d.toLocaleString("en-US", { month: "short" }));
  }
  return result;
}

function getTrendDirection(prices: number[]): "up" | "down" | "stable" {
  if (prices.length < 3) return "stable";
  const recent = prices.slice(-3);
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (last > first * 1.01) return "up";
  if (last < first * 0.99) return "down";
  return "stable";
}

function generateSampleTrends(comps: Competitor[]): Record<string, PriceTrendDataPoint[]> {
  const months = getLastMonths(12);
  const result: Record<string, PriceTrendDataPoint[]> = {};

  // Our ISP baseline price
  result["Our ISP"] = months.map((month, i) => ({
    month,
    price: 699 + Math.round(Math.sin(i * 0.5) * 25),
  }));

  // Each unique competitor
  const names = [...new Set(comps.map(c => c.name))];
  names.forEach((name, ni) => {
    const plans = comps.filter(c => c.name === name);
    const avgPrice = plans.reduce((s, p) => s + p.price, 0) / Math.max(1, plans.length);
    result[name] = months.map((month, i) => ({
      month,
      price: Math.round(avgPrice + Math.sin(i * 0.7 + ni * 2.1) * (avgPrice * 0.06)),
    }));
  });

  return result;
}

function generateMockAnalysis(comps: Competitor[]): AIAnalysis {
  const avgPrice = comps.reduce((s, c) => s + c.price, 0) / Math.max(1, comps.length);
  const categories = [...new Set(comps.map(c => c.category))];
  const uniqueNames = [...new Set(comps.map(c => c.name))];
  const sorted = [...comps].sort((a, b) => a.price - b.price);
  const cheapest = sorted[0];
  const expensive = sorted[sorted.length - 1];

  const bestValue = comps.reduce((best, c) => {
    const ratio = parseSpeedMbps(c.speed) / Math.max(1, c.price);
    const bestRatio = parseSpeedMbps(best.speed) / Math.max(1, best.price);
    return ratio > bestRatio ? c : best;
  }, comps[0]);

  const priceRange = expensive.price - cheapest.price;

  return {
    summary: `The competitive landscape consists of ${uniqueNames.length} unique competitors across ${categories.length} categories (${categories.join(", ")}). Average plan pricing is ${formatINR(Math.round(avgPrice))}, ranging from ${formatINR(cheapest.price)} (${cheapest.name}) to ${formatINR(expensive.price)} (${expensive.name}). The price spread of ${formatINR(priceRange)} indicates a diverse market with both budget and premium segments.`,
    recommendations: [
      `Position your mid-tier plans within 10% of ${formatINR(Math.round(avgPrice))} to remain competitive against the market average while maintaining margins.`,
      `${cheapest.name} leads on price at ${formatINR(cheapest.price)} — counter with superior speed, reliability guarantees, or bundled services to justify premium pricing.`,
      `The ${categories[0]} segment has ${comps.filter(c => c.category === categories[0]).length} tracked plans. Consider if this segment needs more aggressive pricing or differentiated features.`,
      `${bestValue.name} offers the best Mbps/₹ value. Study their speed delivery claims and customer reviews to identify potential weaknesses in their offering.`,
      `Gaps exist above ${formatINR(Math.round(avgPrice * 1.3))} — explore premium tier plans with guaranteed uptime SLAs for business customers.`,
    ],
    positioning: `With ${comps.length} competitor plans tracked across ${uniqueNames.length} providers, your market intelligence is strong. ${uniqueNames.length <= 3 ? "The market is relatively concentrated — monitor these key players closely." : "The market is fragmented — focus on your strongest differentiators rather than competing on price alone."} ${categories.includes("FTTH") ? "FTTH competition is significant; ensure your fiber infrastructure quality is a key selling point." : ""}`,
    threats: [
      `${cheapest.name} undercuts the market at ${formatINR(cheapest.price)} and may attract price-sensitive subscribers, especially in new connection acquisitions.`,
      `${bestValue.name} (${bestValue.name} — ${bestValue.planName}) offers the best Mbps/₹ ratio, appealing to tech-savvy customers who compare plans online.`,
      uniqueNames.length > 4 ? `With ${uniqueNames.length} competitors, subscriber churn risk increases. Focus on retention through service quality and loyalty programs.` : `The concentrated competition from ${uniqueNames.slice(0, 3).join(", ")} requires constant vigilance on their pricing moves.`,
    ],
    opportunities: [
      `Average competitor speed is ${Math.round(comps.reduce((s, c) => s + parseSpeedMbps(c.speed), 0) / comps.length)} Mbps — if you offer significantly higher speeds, market this gap aggressively.`,
      `Only ${categories.length} technology categories tracked. Explore underserved segments for potential expansion.`,
      `Bundle OTT subscriptions, smart home devices, or priority support to increase perceived value beyond pure speed/price comparisons.`,
      `${comps.filter(c => c.category === "Wireless").length > 0 ? "Wireless competitors often struggle with consistent speeds — emphasize your wired reliability." : "No wireless competitors tracked — consider if fixed wireless access could complement your offering."}`,
    ],
  };
}

function estimateCompetitorSubscribers(
  comps: Competitor[],
  totalMarket: number,
  ourSubscribers: number
): Record<string, number> {
  const remaining = Math.max(0, totalMarket - ourSubscribers);
  const names = [...new Set(comps.map(c => c.name))];
  if (names.length === 0) return {};

  const scores = names.map(name => {
    const plans = comps.filter(c => c.name === name);
    const avgPrice = plans.reduce((s, p) => s + p.price, 0) / Math.max(1, plans.length);
    const avgMbps = plans.reduce((s, p) => s + parseSpeedMbps(p.speed), 0) / Math.max(1, plans.length);
    return { name, score: (avgMbps / Math.max(1, avgPrice)) * Math.max(1, plans.length) };
  });

  const totalScore = scores.reduce((s, c) => s + c.score, 0);
  const result: Record<string, number> = {};
  scores.forEach(({ name, score }) => {
    result[name] = Math.round((score / Math.max(0.001, totalScore)) * remaining);
  });
  return result;
}

const emptyForm = { name: "", planName: "", speed: "", dataLimit: "", price: 0, validity: "30 days", category: "FTTH", notes: "" };

export default function CompetitorIntelPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: "", name: "" });
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [priceRange, setPriceRange] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  // Win/Loss dialog
  const [lossDialog, setLossDialog] = useState<{ open: boolean; competitorId: string; competitorName: string }>({ open: false, competitorId: "", competitorName: "" });
  const [lossForm, setLossForm] = useState<{ subscriberName: string; reason: string; notes: string }>({ subscriberName: "", reason: "", notes: "" });
  // Price history dialog
  const [priceHistoryDialog, setPriceHistoryDialog] = useState<{ open: boolean; competitorId: string; competitorName: string; history: CompetitorPriceHistoryItem[] }>({ open: false, competitorId: "", competitorName: "", history: [] });

  // === Feature 1: AI Analysis State ===
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // === Feature 2: Market Share State ===
  const [totalMarketSize, setTotalMarketSize] = useState(10000);
  const [ourSubscribers, setOurSubscribers] = useState(2500);

  // === Feature 3: Price Trends State ===
  const [priceTrends, setPriceTrends] = useState<Record<string, PriceTrendDataPoint[]>>({});
  const [addDataPointOpen, setAddDataPointOpen] = useState(false);
  const [dataPointForm, setDataPointForm] = useState({ competitor: "", month: "", price: 0 });

  const { data: competitors, isLoading } = useQuery<Competitor[]>({
    queryKey: ["competitors"],
    queryFn: () => apiFetch<Competitor[]>("/api/competitors"),
  });

  // Fetch win/loss data
  interface WinLossSummary { total: number; lost: number }
  interface WinLossResponse { records: WinLossRecord[]; summary: Record<string, WinLossSummary> }

  const { data: winLossData } = useQuery<WinLossResponse>({
    queryKey: ["competitors-win-loss"],
    queryFn: () => apiFetch("/api/competitors/win-loss"),
  });

  // Load / init price trend data from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("competitor-price-trends");
    if (stored) {
      try {
        setPriceTrends(JSON.parse(stored));
        return;
      } catch {
        // fall through to generate
      }
    }
    if (competitors && competitors.length > 0) {
      const sample = generateSampleTrends(competitors);
      setPriceTrends(sample);
      localStorage.setItem("competitor-price-trends", JSON.stringify(sample));
    }
  }, [competitors]);

  const createMutation = useMutation({
    mutationFn: async (body: typeof emptyForm) => {
      const res = await fetch("/api/competitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => { toast.success("Competitor plan added"); setDialogOpen(false); setForm(emptyForm); setEditingId(null); queryClient.invalidateQueries({ queryKey: ["competitors"] }); queryClient.invalidateQueries({ queryKey: ["competitors-win-loss"] }); },
    onError: () => toast.error("Failed to add competitor plan"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: typeof emptyForm & { id: string }) => {
      const res = await fetch(`/api/competitors/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => { toast.success("Competitor plan updated"); setDialogOpen(false); setForm(emptyForm); setEditingId(null); queryClient.invalidateQueries({ queryKey: ["competitors"] }); queryClient.invalidateQueries({ queryKey: ["competitors-win-loss"] }); },
    onError: () => toast.error("Failed to update competitor plan"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/competitors/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => { toast.success("Competitor plan deleted"); setDeleteConfirm({ open: false, id: "", name: "" }); queryClient.invalidateQueries({ queryKey: ["competitors"] }); queryClient.invalidateQueries({ queryKey: ["competitors-win-loss"] }); },
    onError: () => toast.error("Failed to delete"),
  });

  // Report loss mutation
  const reportLossMutation = useMutation({
    mutationFn: async (body: { competitorId: string; subscriberName: string; reason: string; notes: string }) => {
      return apiFetch("/api/competitors/win-loss", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { toast.success("Loss reported!"); setLossDialog({ ...lossDialog, open: false }); setLossForm({ subscriberName: "", reason: "", notes: "" }); queryClient.invalidateQueries({ queryKey: ["competitors-win-loss"] }); },
    onError: () => toast.error("Failed to report loss"),
  });

  const handleSubmit = () => {
    if (!form.name || !form.planName || form.price <= 0) { toast.error("Please fill in name, plan name, and price."); return; }
    if (editingId) updateMutation.mutate({ id: editingId, ...form });
    else createMutation.mutate(form);
  };

  const openEdit = (c: Competitor) => {
    setForm({ name: c.name, planName: c.planName, speed: c.speed, dataLimit: c.dataLimit, price: c.price, validity: c.validity, category: c.category, notes: c.notes });
    setEditingId(c.id);
    setDialogOpen(true);
  };

  const openCreate = () => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); };

  // No useMemo — compute directly
  const filtered = (competitors || []).filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.planName.toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === "ALL" || c.category === categoryFilter;
    const matchPrice = priceRange === "ALL" || (priceRange === "0-500" && c.price <= 500) || (priceRange === "500-1000" && c.price > 500 && c.price <= 1000) || (priceRange === "1000+" && c.price > 1000);
    return matchSearch && matchCat && matchPrice;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const showingFrom = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, filtered.length);

  const chartData = competitors ? competitors.reduce<Record<string, { name: string; min: number; max: number; avg: number; count: number }>>((acc, c) => {
    if (!acc[c.category]) acc[c.category] = { name: c.category, min: c.price, max: c.price, avg: c.price, count: 1 };
    else { acc[c.category].min = Math.min(acc[c.category].min, c.price); acc[c.category].max = Math.max(acc[c.category].max, c.price); acc[c.category].avg = (acc[c.category].avg * acc[c.category].count + c.price) / (acc[c.category].count + 1); acc[c.category].count++; }
    return acc;
  }, {}) : {};
  const chartArr = Object.values(chartData);

  const compareItems = (competitors || []).filter(c => compareIds.has(c.id));

  const toggleCompare = (id: string) => {
    setCompareIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else if (next.size < 5) next.add(id); else toast.error("Max 5 competitors for comparison"); return next; });
  };

  const handleExport = () => {
    if (filtered.length === 0) { toast.error("No data to export"); return; }
    const headers = ["Competitor", "Plan Name", "Speed", "Mbps/₹", "Data Limit", "Price", "Validity", "Category"];
    const rows = filtered.map(c => {
      const mbps = parseSpeedMbps(c.speed);
      const ratio = c.price > 0 && mbps > 0 ? (mbps / c.price).toFixed(2) : "N/A";
      return [c.name, c.planName, c.speed, ratio, c.dataLimit, c.price, c.validity, c.category].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `competitor-intel-${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} records`);
  };

  const handlePriceHistory = (c: Competitor) => {
    setPriceHistoryDialog({ open: true, competitorId: c.id, competitorName: c.name, history: c.priceHistory || [] });
  };

  const PAGE_SIZES = [10, 25, 50];

  // Get price trend direction
  const getPriceTrend = (competitor: Competitor): "up" | "down" | null => {
    const history = competitor.priceHistory;
    if (!history || history.length < 2) return null;
    return history[history.length - 1].newPrice > history[0].oldPrice ? "up" : "down";
  };

  // === Feature 1: AI Analysis Handler ===
  const handleAIAnalyze = async () => {
    if (!competitors || competitors.length === 0) {
      toast.error("No competitor data available for analysis");
      return;
    }
    setAiDialogOpen(true);
    setAiLoading(true);
    setAiAnalysis(null);
    try {
      const prompt = `Analyze these ISP competitors and provide strategic insights: ${JSON.stringify(competitors.map(c => ({ name: c.name, plan: c.planName, speed: c.speed, price: c.price, category: c.category })))}`;
      const result = await apiFetch<{ analysis: string }>("/api/ai", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      });
      if (result?.analysis) {
        setAiAnalysis({ summary: result.analysis, strengths: [], weaknesses: [], recommendations: [], pricingInsights: [] });
      } else {
        toast.error("AI analysis returned no data");
      }
    } catch {
      toast.error("AI analysis failed — the AI service may be unavailable");
    } finally {
      setAiLoading(false);
    }
  };

  // === Feature 3: Add Data Point Handler ===
  const handleAddDataPoint = () => {
    if (!dataPointForm.competitor || !dataPointForm.month || dataPointForm.price <= 0) {
      toast.error("Please fill all fields");
      return;
    }
    const newTrends = { ...priceTrends };
    const existing = newTrends[dataPointForm.competitor] || [];
    const updated = [...existing.filter(d => d.month !== dataPointForm.month), { month: dataPointForm.month, price: dataPointForm.price }];
    const months = getLastMonths(12);
    updated.sort((a, b) => months.indexOf(a.month) - months.indexOf(b.month));
    newTrends[dataPointForm.competitor] = updated;
    setPriceTrends(newTrends);
    localStorage.setItem("competitor-price-trends", JSON.stringify(newTrends));
    setAddDataPointOpen(false);
    setDataPointForm({ competitor: "", month: "", price: 0 });
    toast.success("Price data point added");
  };

  // === Feature 2: Market Share computed values ===
  const competitorNames = [...new Set((competitors || []).map(c => c.name))];
  const estimatedSubscribers = estimateCompetitorSubscribers(competitors || [], totalMarketSize, ourSubscribers);
  const ourPercentage = totalMarketSize > 0 ? (ourSubscribers / totalMarketSize) * 100 : 0;
  const marketPosition = ourPercentage >= 30 ? "Leader" : ourPercentage >= 15 ? "Challenger" : ourPercentage >= 5 ? "Follower" : "Niche";

  const pieData = [
    { name: "Our ISP", value: ourSubscribers, color: "#DC2626" },
    ...competitorNames.map((name, i) => ({
      name,
      value: estimatedSubscribers[name] || 0,
      color: COLORS[(i + 1) % COLORS.length],
    })),
  ];

  const barCompareData = [
    {
      name: "Our ISP",
      subscribers: ourSubscribers,
      avgPrice: 699,
      plans: 3,
      color: "#DC2626",
    },
    ...competitorNames.map((name, i) => {
      const plans = (competitors || []).filter(c => c.name === name);
      return {
        name,
        subscribers: estimatedSubscribers[name] || 0,
        avgPrice: Math.round(plans.reduce((s, p) => s + p.price, 0) / Math.max(1, plans.length)),
        plans: plans.length,
        color: COLORS[(i + 1) % COLORS.length],
      };
    }),
  ];

  // === Feature 3: Trend chart data ===
  const trendMonths = getLastMonths(12);
  const allTrendNames = Object.keys(priceTrends);

  const lineChartData = trendMonths.map(month => {
    const point: Record<string, string | number> = { month };
    allTrendNames.forEach(name => {
      const dp = priceTrends[name]?.find(d => d.month === month);
      point[name] = dp ? dp.price : 0;
    });
    return point;
  });

  const trendIndicators = allTrendNames.map((name, i) => {
    const prices = (priceTrends[name] || []).map(d => d.price);
    const direction = getTrendDirection(prices);
    return { name, direction, color: COLORS[i % COLORS.length] };
  });

  // Available names for data point form
  const availableTrendCompetitors = allTrendNames.length > 0
    ? allTrendNames
    : ["Our ISP", ...competitorNames];
  const availableMonths = getLastMonths(12);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Competitor Intel</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track competitor plans, pricing, and market positioning.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50" onClick={handleAIAnalyze}>
            <Brain className="h-3.5 w-3.5" /> AI Analyze
          </Button>
          {compareIds.size >= 2 && <Button variant="outline" className="gap-1.5" onClick={() => setCompareOpen(true)}><GitCompare className="h-3.5 w-3.5" /> Compare ({compareIds.size})</Button>}
          <Button variant="outline" className="gap-1.5" onClick={handleExport}><Download className="h-3.5 w-3.5" /> Export</Button>
          <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> Add Competitor Plan</Button>
        </div>
      </div>

      {/* ============================================ */}
      {/* Feature 1: Competitor Intelligence Report    */}
      {/* ============================================ */}
      {aiAnalysis && (
        <Card className="border border-purple-200 bg-gradient-to-r from-purple-50 to-rose-50 dark:from-purple-950/20 dark:to-rose-950/20 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-600" />
                Competitor Intelligence Report
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setAiAnalysis(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{aiAnalysis.summary}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Recommendations */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold flex items-center gap-1.5 text-emerald-700">
                  <Lightbulb className="h-3.5 w-3.5" /> Strategic Recommendations
                </h4>
                <ul className="space-y-1.5">
                  {aiAnalysis.recommendations.map((r, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                      <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {/* Threats */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold flex items-center gap-1.5 text-red-700">
                  <ShieldAlert className="h-3.5 w-3.5" /> Threat Assessment
                </h4>
                <ul className="space-y-1.5">
                  {aiAnalysis.threats.map((t, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                      <span className="text-red-500 mt-0.5 shrink-0">⚠</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {/* Opportunities */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold flex items-center gap-1.5 text-amber-700">
                  <Target className="h-3.5 w-3.5" /> Opportunities
                </h4>
                <ul className="space-y-1.5">
                  {aiAnalysis.opportunities.map((o, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                      <span className="text-amber-500 mt-0.5 shrink-0">★</span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-background/60 border">
              <p className="text-xs font-medium text-foreground mb-1">Market Positioning</p>
              <p className="text-xs text-muted-foreground">{aiAnalysis.positioning}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================ */}
      {/* Tabs Container                               */}
      {/* ============================================ */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <DollarSign className="h-3.5 w-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="market-share" className="gap-1.5">
            <Target className="h-3.5 w-3.5" /> Market Share
          </TabsTrigger>
          <TabsTrigger value="trends" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Trends
          </TabsTrigger>
        </TabsList>

        {/* ========================================== */}
        {/* OVERVIEW TAB                               */}
        {/* ========================================== */}
        <TabsContent value="overview">
          {isLoading ? (
            <div className="space-y-4"><Skeleton className="skeleton-wave h-64" /><Skeleton className="skeleton-wave h-48" /></div>
          ) : (
            <>
              {/* Win/Loss Analysis Summary */}
              {winLossData && winLossData.summary && Object.keys(winLossData.summary).length > 0 && (
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><History className="h-4 w-4 text-red-600" />Win/Loss Analysis</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead className="text-xs">Competitor</TableHead><TableHead className="text-xs text-right">Total</TableHead><TableHead className="text-xs text-right">Lost</TableHead><TableHead className="text-xs text-right">Loss Rate</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {Object.entries(winLossData.summary).sort((a, b) => b[1].lost - a[1].lost).map(([name, data]) => {
                            const rate = data.total > 0 ? Math.round((data.lost / data.total) * 100) : 0;
                            return (
                              <TableRow key={name} className="hover:bg-muted/50 transition-colors duration-150">
                                <TableCell className="text-sm font-medium">{name}</TableCell>
                                <TableCell className="text-sm text-right">{data.total}</TableCell>
                                <TableCell className="text-sm text-right text-red-600 font-semibold">{data.lost}</TableCell>
                                <TableCell className="text-sm text-right"><Badge variant="outline" className={`text-[10px] ${rate > 30 ? "bg-red-50 text-red-700" : rate > 10 ? "bg-yellow-50 text-yellow-700" : "bg-green-50 text-green-700"}`}>{rate}%</Badge></TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {chartArr.length > 0 && (
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4 text-red-600" />Price Range by Category</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartArr}><CartesianGrid strokeDasharray="3 3" className="stroke-border/50" /><XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 12 }} /><YAxis tick={{ fill: "#94A3B8", fontSize: 12 }} tickFormatter={(v) => `₹${v}`} /><Tooltip formatter={(value: number) => formatINR(value)} /><Bar dataKey="min" name="Min Price" fill="#16A34A" radius={[0, 0, 0, 0]} barSize={20} /><Bar dataKey="avg" name="Avg Price" fill="#DC2626" radius={[0, 0, 0, 0]} barSize={20} /><Bar dataKey="max" name="Max Price" fill="#D97706" radius={[4, 4, 0, 0]} barSize={20} /></BarChart></ResponsiveContainer></div>
                  </CardContent>
                </Card>
              )}

              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-red-600" /> Competitor Plans <Badge variant="outline" className="text-xs">{filtered.length}</Badge>
                    </CardTitle>
                    <div className="flex gap-2 flex-wrap">
                      <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Search..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-8 h-8 text-xs w-[180px]" /></div>
                      <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
                        <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue placeholder="Category" /></SelectTrigger>
                        <SelectContent><SelectItem value="ALL">All Categories</SelectItem>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select value={priceRange} onValueChange={(v) => { setPriceRange(v); setPage(1); }}>
                        <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue placeholder="Price" /></SelectTrigger>
                        <SelectContent><SelectItem value="ALL">All Prices</SelectItem><SelectItem value="0-500">₹0 - ₹500</SelectItem><SelectItem value="500-1000">₹500 - ₹1,000</SelectItem><SelectItem value="1000+">₹1,000+</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs w-8"></TableHead>
                          <TableHead className="text-xs">Competitor</TableHead>
                          <TableHead className="text-xs">Plan Name</TableHead>
                          <TableHead className="text-xs">Speed</TableHead>
                          <TableHead className="text-xs">Mbps/₹</TableHead>
                          <TableHead className="text-xs">Data Limit</TableHead>
                          <TableHead className="text-xs">Price</TableHead>
                          <TableHead className="text-xs">Trend</TableHead>
                          <TableHead className="text-xs">Validity</TableHead>
                          <TableHead className="text-xs">Category</TableHead>
                          <TableHead className="text-xs text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paged.length === 0 ? (
                          <TableRow><TableCell colSpan={12} className="text-center py-8 text-sm text-muted-foreground">No competitor plans found.</TableCell></TableRow>
                        ) : (
                          paged.map((c) => {
                            const mbps = parseSpeedMbps(c.speed);
                            const ratio = c.price > 0 && mbps > 0 ? (mbps / c.price).toFixed(2) : "-";
                            const trend = getPriceTrend(c);
                            return (
                              <TableRow key={c.id} className={`${compareIds.has(c.id) ? "bg-muted/50" : ""} hover:bg-muted/50 transition-colors duration-150`}>
                                <TableCell><Checkbox checked={compareIds.has(c.id)} onCheckedChange={() => toggleCompare(c.id)} /></TableCell>
                                <TableCell className="text-sm font-medium">{c.name}</TableCell>
                                <TableCell className="text-sm">{c.planName}</TableCell>
                                <TableCell className="text-sm">{c.speed || "-"}</TableCell>
                                <TableCell className="text-sm font-mono font-semibold text-emerald-600">{ratio}</TableCell>
                                <TableCell className="text-sm">{c.dataLimit || "-"}</TableCell>
                                <TableCell className="text-sm font-semibold tabular-nums">{formatINR(c.price)}</TableCell>
                                <TableCell>
                                  {trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-red-600" />}
                                  {trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-green-600" />}
                                  {!trend && <span className="text-[10px] text-muted-foreground">—</span>}
                                </TableCell>
                                <TableCell className="text-sm">{c.validity}</TableCell>
                                <TableCell><Badge variant="outline" className="text-xs">{c.category}</Badge></TableCell>
                                <TableCell>
                                  <div className="flex gap-1 justify-end">
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setLossDialog({ open: true, competitorId: c.id, competitorName: c.name })} title="Report Loss"><UserMinus className="h-3.5 w-3.5" /></Button>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handlePriceHistory(c)} title="Price History"><History className="h-3.5 w-3.5" /></Button>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteConfirm({ open: true, id: c.id, name: `${c.name} - ${c.planName}` })}><Trash2 className="h-3.5 w-3.5" /></Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 border-t mt-3">
                      <div className="flex items-center gap-3">
                        <p className="text-xs text-muted-foreground">Showing {showingFrom}–{showingTo} of {filtered.length}</p>
                        <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                          <SelectTrigger className="h-7 text-xs w-[70px]"><SelectValue /></SelectTrigger>
                          <SelectContent>{PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}/page</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pn: number;
                          if (totalPages <= 5) pn = i + 1; else if (page <= 3) pn = i + 1; else if (page >= totalPages - 2) pn = totalPages - 4 + i; else pn = page - 2 + i;
                          return <Button key={pn} variant={page === pn ? "default" : "outline"} size="sm" className="h-7 w-7 p-0 text-xs" onClick={() => setPage(pn)}>{pn}</Button>;
                        })}
                        <Button variant="outline" size="sm" className="h-7 px-2" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ========================================== */}
        {/* MARKET SHARE TAB                           */}
        {/* ========================================== */}
        <TabsContent value="market-share">
          <div className="space-y-6">
            {/* Configuration */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Target className="h-4 w-4 text-red-600" /> Market Configuration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Total Market Size (subscribers)</Label>
                    <Input
                      type="number"
                      value={totalMarketSize}
                      onChange={(e) => setTotalMarketSize(Math.max(1, Number(e.target.value)))}
                      className="h-8 text-sm w-[200px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Our Subscribers</Label>
                    <Input
                      type="number"
                      value={ourSubscribers}
                      onChange={(e) => setOurSubscribers(Math.max(0, Number(e.target.value)))}
                      className="h-8 text-sm w-[200px]"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Metrics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Our Market Share</p>
                  <p className="text-2xl font-bold text-red-600">{ourPercentage.toFixed(1)}%</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Total Market Size</p>
                  <p className="text-2xl font-bold text-foreground">{totalMarketSize.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Our Subscribers</p>
                  <p className="text-2xl font-bold text-emerald-600">{ourSubscribers.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Market Position</p>
                  <Badge className={`text-sm px-3 py-0.5 ${marketPosition === "Leader" ? "bg-red-600 text-white" : marketPosition === "Challenger" ? "bg-amber-500 text-white" : marketPosition === "Follower" ? "bg-teal-600 text-white" : "bg-gray-500 text-white"}`}>
                    {marketPosition}
                  </Badge>
                </CardContent>
              </Card>
            </div>

            {/* Donut Chart + Bar Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Donut Chart */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Market Share Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={95}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={index} fill={entry.color} stroke="transparent" />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number, name: string) => [value.toLocaleString(), name]}
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 11 }}
                          formatter={(value: string) => (
                            <span className="text-xs">{value}</span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Horizontal Bar Chart — Subscriber Comparison */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Subscriber Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barCompareData} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                        <XAxis type="number" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                        <YAxis dataKey="name" type="category" tick={{ fill: "#94A3B8", fontSize: 11 }} width={80} />
                        <Tooltip
                          formatter={(value: number) => [value.toLocaleString(), "Subscribers"]}
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        />
                        <Bar dataKey="subscribers" radius={[0, 4, 4, 0]} barSize={18}>
                          {barCompareData.map((entry, index) => (
                            <Cell key={index} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Avg Price Comparison Bar Chart */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-red-600" /> Average Plan Price Comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barCompareData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
                      <Tooltip formatter={(value: number) => formatINR(value)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar dataKey="avgPrice" name="Avg Price" radius={[4, 4, 0, 0]} barSize={28}>
                        {barCompareData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ========================================== */}
        {/* TRENDS TAB                                 */}
        {/* ========================================== */}
        <TabsContent value="trends">
          <div className="space-y-6">
            {/* Trend Indicators */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-red-600" /> Price Trend Indicators
                  </CardTitle>
                  <Button size="sm" className="gap-1.5 h-7 text-xs bg-red-600 hover:bg-red-700 text-white" onClick={() => setAddDataPointOpen(true)}>
                    <Plus className="h-3 w-3" /> Add Data Point
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {trendIndicators.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No trend data yet. Click &quot;Add Data Point&quot; to start tracking.</p>
                  ) : (
                    trendIndicators.map((t) => (
                      <div key={t.name} className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                        <span className="text-xs font-medium">{t.name}</span>
                        {t.direction === "up" && (
                          <span className="flex items-center gap-0.5 text-xs text-red-600 font-semibold">
                            <ArrowUpRight className="h-3 w-3" /> Increasing
                          </span>
                        )}
                        {t.direction === "down" && (
                          <span className="flex items-center gap-0.5 text-xs text-green-600 font-semibold">
                            <ArrowDownRight className="h-3 w-3" /> Decreasing
                          </span>
                        )}
                        {t.direction === "stable" && (
                          <span className="flex items-center gap-0.5 text-xs text-gray-500 font-semibold">
                            <Minus className="h-3 w-3" /> Stable
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Line Chart */}
            {lineChartData.length > 0 && allTrendNames.length > 0 && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Average Plan Price — Last 12 Months</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={lineChartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                        <XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => `₹${v}`} domain={["auto", "auto"]} />
                        <Tooltip formatter={(value: number) => formatINR(value)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {allTrendNames.map((name, i) => (
                          <Line
                            key={name}
                            type="monotone"
                            dataKey={name}
                            stroke={COLORS[i % COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Stored trend data table */}
            {allTrendNames.length > 0 && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Trend Data Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-72">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Competitor</TableHead>
                          <TableHead className="text-xs text-right">Latest Price</TableHead>
                          <TableHead className="text-xs text-right">3-Month Avg</TableHead>
                          <TableHead className="text-xs text-center">Trend</TableHead>
                          <TableHead className="text-xs text-right">Data Points</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allTrendNames.map((name, i) => {
                          const points = priceTrends[name] || [];
                          const prices = points.map(p => p.price);
                          const latest = prices.length > 0 ? prices[prices.length - 1] : 0;
                          const last3 = prices.slice(-3);
                          const avg3 = last3.length > 0 ? Math.round(last3.reduce((a, b) => a + b, 0) / last3.length) : 0;
                          const dir = getTrendDirection(prices);
                          return (
                            <TableRow key={name} className="hover:bg-muted/50 transition-colors duration-150">
                              <TableCell className="text-sm font-medium flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                {name}
                              </TableCell>
                              <TableCell className="text-sm text-right font-semibold tabular-nums">{formatINR(latest)}</TableCell>
                              <TableCell className="text-sm text-right tabular-nums text-muted-foreground">{formatINR(avg3)}</TableCell>
                              <TableCell className="text-center">
                                {dir === "up" && <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">↑ Increasing</Badge>}
                                {dir === "down" && <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">↓ Decreasing</Badge>}
                                {dir === "stable" && <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-700 border-gray-200">→ Stable</Badge>}
                              </TableCell>
                              <TableCell className="text-sm text-right text-muted-foreground">{points.length}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ============================================ */}
      {/* AI Analysis Dialog                          */}
      {/* ============================================ */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-600" /> AI Competitor Analysis
            </DialogTitle>
          </DialogHeader>
          {aiLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
              <p className="text-sm text-muted-foreground">Analyzing competitor data…</p>
            </div>
          ) : aiAnalysis ? (
            <div className="space-y-5">
              <div className="p-4 rounded-lg bg-muted/50 border">
                <h4 className="text-sm font-semibold mb-2">Executive Summary</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{aiAnalysis.summary}</p>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-1.5 text-emerald-700">
                  <Lightbulb className="h-3.5 w-3.5" /> Strategic Recommendations
                </h4>
                <ul className="space-y-2">
                  {aiAnalysis.recommendations.map((r, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2 p-2 rounded-md bg-emerald-50/50 border border-emerald-100">
                      <span className="text-emerald-600 font-semibold shrink-0">{i + 1}.</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-1.5 text-red-700">
                  <ShieldAlert className="h-3.5 w-3.5" /> Threat Assessment
                </h4>
                <ul className="space-y-2">
                  {aiAnalysis.threats.map((t, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2 p-2 rounded-md bg-red-50/50 border border-red-100">
                      <span className="text-red-500 shrink-0">⚠</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-1.5 text-amber-700">
                  <Target className="h-3.5 w-3.5" /> Market Opportunities
                </h4>
                <ul className="space-y-2">
                  {aiAnalysis.opportunities.map((o, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2 p-2 rounded-md bg-amber-50/50 border border-amber-100">
                      <span className="text-amber-500 shrink-0">★</span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-lg bg-purple-50/50 border border-purple-100">
                <h4 className="text-sm font-semibold text-purple-700 mb-1">Market Positioning</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{aiAnalysis.positioning}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No analysis generated yet.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Data Point Dialog */}
      <Dialog open={addDataPointOpen} onOpenChange={setAddDataPointOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4 text-red-600" /> Add Price Data Point
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Competitor</Label>
              <Select value={dataPointForm.competitor} onValueChange={(v) => setDataPointForm({ ...dataPointForm, competitor: v })}>
                <SelectTrigger><SelectValue placeholder="Select competitor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Our ISP">Our ISP</SelectItem>
                  {competitorNames.map(n => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Month</Label>
              <Select value={dataPointForm.month} onValueChange={(v) => setDataPointForm({ ...dataPointForm, month: v })}>
                <SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger>
                <SelectContent>
                  {availableMonths.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Average Plan Price (₹)</Label>
              <Input
                type="number"
                value={dataPointForm.price || ""}
                onChange={(e) => setDataPointForm({ ...dataPointForm, price: Number(e.target.value) })}
                placeholder="e.g. 699"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAddDataPointOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleAddDataPoint}>Add Data Point</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base">{editingId ? "Edit" : "Add"} Competitor Plan</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs">Competitor Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. JioFiber" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Plan Name</Label><Input value={form.planName} onChange={(e) => setForm({ ...form, planName: e.target.value })} placeholder="e.g. 100 Mbps Plan" /></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5"><Label className="text-xs">Speed</Label><Input value={form.speed} onChange={(e) => setForm({ ...form, speed: e.target.value })} placeholder="100 Mbps" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Data Limit</Label><Input value={form.dataLimit} onChange={(e) => setForm({ ...form, dataLimit: e.target.value })} placeholder="Unlimited" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Price (₹)</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Validity</Label><Input value={form.validity} onChange={(e) => setForm({ ...form, validity: e.target.value })} placeholder="30 days" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any additional notes" /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={createMutation.isPending || updateMutation.isPending} onClick={handleSubmit}>
                {(createMutation.isPending || updateMutation.isPending) ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving...</> : editingId ? "Update" : "Add Plan"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(open) => { if (!open) setDeleteConfirm({ open: false, id: "", name: "" }); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Competitor Plan</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete <span className="font-semibold">{deleteConfirm.name}</span>?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleteConfirm.id)}>{deleteMutation.isPending ? "Deleting..." : "Delete"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Side-by-Side Comparison Dialog */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><GitCompare className="h-4 w-4 text-red-600" />Plan Comparison</DialogTitle></DialogHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead className="text-xs font-semibold">Feature</TableHead>{compareItems.map(c => <TableHead key={c.id} className="text-xs font-semibold text-center">{c.name}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                <TableRow><TableCell className="text-xs font-medium">Plan</TableCell>{compareItems.map(c => <TableCell key={c.id} className="text-sm text-center">{c.planName}</TableCell>)}</TableRow>
                <TableRow><TableCell className="text-xs font-medium">Category</TableCell>{compareItems.map(c => <TableCell key={c.id} className="text-center"><Badge variant="outline" className="text-xs">{c.category}</Badge></TableCell>)}</TableRow>
                <TableRow><TableCell className="text-xs font-medium">Speed</TableCell>{compareItems.map(c => <TableCell key={c.id} className="text-sm text-center">{c.speed || "-"}</TableCell>)}</TableRow>
                <TableRow><TableCell className="text-xs font-medium">Data Limit</TableCell>{compareItems.map(c => <TableCell key={c.id} className="text-sm text-center">{c.dataLimit || "-"}</TableCell>)}</TableRow>
                <TableRow><TableCell className="text-xs font-medium">Price</TableCell>
                  {compareItems.map(c => {
                    const minPrice = Math.min(...compareItems.map(x => x.price));
                    return <TableCell key={c.id} className={`text-sm text-center font-semibold ${c.price === minPrice ? "text-green-600" : ""}`}>{formatINR(c.price)}{c.price === minPrice ? " ✓" : ""}</TableCell>;
                  })}
                </TableRow>
                <TableRow><TableCell className="text-xs font-medium">Validity</TableCell>{compareItems.map(c => <TableCell key={c.id} className="text-sm text-center">{c.validity}</TableCell>)}</TableRow>
                <TableRow>
                  <TableCell className="text-xs font-medium">Mbps/₹</TableCell>
                  {compareItems.map(c => {
                    const mbps = parseSpeedMbps(c.speed);
                    const ratio = c.price > 0 && mbps > 0 ? (mbps / c.price).toFixed(2) : "N/A";
                    const maxRatio = Math.max(...compareItems.map(x => { const m = parseSpeedMbps(x.speed); return x.price > 0 && m > 0 ? m / x.price : 0; }));
                    const isMax = c.price > 0 && mbps > 0 && mbps / c.price === maxRatio;
                    return <TableCell key={c.id} className={`text-sm text-center font-mono font-semibold ${isMax ? "text-emerald-600" : ""}`}>{ratio}{isMax ? " ✓" : ""}</TableCell>;
                  })}
                </TableRow>
                <TableRow><TableCell className="text-xs font-medium">Notes</TableCell>{compareItems.map(c => <TableCell key={c.id} className="text-xs text-center text-muted-foreground">{c.notes || "-"}</TableCell>)}</TableRow>
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end pt-2"><Button variant="outline" size="sm" onClick={() => setCompareIds(new Set())}>Clear Selection</Button></div>
        </DialogContent>
      </Dialog>

      {/* Price History Dialog */}
      <Dialog open={priceHistoryDialog.open} onOpenChange={(open) => { if (!open) setPriceHistoryDialog({ ...priceHistoryDialog, open: false }); }}>
        <DialogContent className="max-w-md max-h-[70vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><History className="h-4 w-4 text-teal-600" />Price History — {priceHistoryDialog.competitorName}</DialogTitle></DialogHeader>
          {priceHistoryDialog.history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No price history recorded.</p>
          ) : (
            <div className="space-y-2">
              {priceHistoryDialog.history.map((h) => (
                <div key={h.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-semibold text-red-600 line-through">{formatINR(h.oldPrice)}</span>
                      <span className="text-xs text-muted-foreground">→</span>
                      <span className="text-sm font-semibold text-green-600">{formatINR(h.newPrice)}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${h.newPrice > h.oldPrice ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                    {h.newPrice > h.oldPrice ? `+${((h.newPrice - h.oldPrice) / h.oldPrice * 100).toFixed(1)}%` : `-${((h.oldPrice - h.newPrice) / h.oldPrice * 100).toFixed(1)}%`}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Report Loss Dialog */}
      <Dialog open={lossDialog.open} onOpenChange={(open) => { if (!open) setLossDialog({ ...lossDialog, open: false }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base">Report Loss to {lossDialog.competitorName}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label className="text-xs">Subscriber Name</Label><Input value={lossForm.subscriberName} onChange={(e) => setLossForm({ ...lossForm, subscriberName: e.target.value })} placeholder="Subscriber who was lost" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Loss Reason</Label>
              <Select value={lossForm.reason} onValueChange={(v) => setLossForm({ ...lossForm, reason: v })}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="price">Price Too High</SelectItem>
                  <SelectItem value="speed">Better Speed</SelectItem>
                  <SelectItem value="service">Better Service</SelectItem>
                  <SelectItem value="coverage">Better Coverage</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Additional Notes</Label><Textarea value={lossForm.notes} onChange={(e) => setLossForm({ ...lossForm, notes: e.target.value })} placeholder="Any additional details..." rows={3} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLossDialog({ ...lossDialog, open: false })}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={reportLossMutation.isPending} onClick={() => reportLossMutation.mutate({ competitorId: lossDialog.competitorId, subscriberName: lossForm.subscriberName, reason: lossForm.reason, notes: lossForm.notes })}>
                {reportLossMutation.isPending ? "Reporting..." : "Report Loss"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
