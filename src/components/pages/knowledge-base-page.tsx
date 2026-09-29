"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useRef, useEffect } from "react";
import {
  BookOpen,
  Search,
  FileText,
  FolderOpen,
  Eye,
  Plus,
  Edit2,
  Trash2,
  HelpCircle,
  RefreshCw,
  MessageCircle,
  Tag,
  Loader2,
  GripVertical,
  History,
  ThumbsUp,
  ThumbsDown,
  Upload,
  ChevronRight,
  X,
  ArrowDownUp,
  BarChart3,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from "recharts";

// ─── Types ─────────────────────────────────────────
interface Article {
  id: string;
  title: string;
  content: string;
  categoryId: string | null;
  status: string;
  tags: string;
  views: number;
  helpfulVotes: number;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  version: number;
  category?: { id: string; name: string; parentId: string | null; children?: Category[] } | null;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  description: string;
  sortOrder: number;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { articles: number };
  children?: Category[];
}

interface Faq {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface KbStats {
  totalArticles: number;
  published: number;
  categories: number;
  totalViews: number;
  totalHelpful: number;
}

interface ArticleVersion {
  id: string;
  articleId: string;
  version: number;
  title: string;
  content: string;
  tags: string;
  changeNote: string;
  createdAt: string;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Info: BookOpen, CreditCard: Tag, Wrench: FileText, Package: FolderOpen, User: MessageCircle,
};

const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: "badge-active", DRAFT: "badge-pending", ARCHIVED: "badge-disconnected",
};

// ─── KB Analytics localStorage ─────────────────────
const KB_ANALYTICS_KEY = "kb-analytics";

interface KbAnalytics {
  totalViews: number;
  totalSearches: number;
  articleViews: { title: string; views: number }[];
  topSearches: { term: string; count: number }[];
}

function loadKbAnalytics(): KbAnalytics {
  if (typeof window === "undefined") return { totalViews: 0, totalSearches: 0, articleViews: [], topSearches: [] };
  try {
    const saved = localStorage.getItem(KB_ANALYTICS_KEY);
    return saved ? JSON.parse(saved) : getDefaultAnalytics();
  } catch { return getDefaultAnalytics(); }
}

function getDefaultAnalytics(): KbAnalytics {
  return {
    totalViews: 1247,
    totalSearches: 892,
    articleViews: [
      { title: "Getting Started Guide", views: 342 },
      { title: "Network Troubleshooting", views: 287 },
      { title: "Plan Upgrades FAQ", views: 198 },
      { title: "Payment Setup", views: 156 },
      { title: "Router Configuration", views: 134 },
      { title: "Speed Test Guide", views: 98 },
      { title: "Service Outage Info", views: 67 },
      { title: "Account Settings", views: 45 },
      { title: "Mobile App Guide", views: 32 },
      { title: "Security Best Practices", views: 21 },
    ],
    topSearches: [
      { term: "slow internet", count: 145 },
      { term: "payment failed", count: 112 },
      { term: "router setup", count: 89 },
      { term: "plan change", count: 76 },
      { term: "outage", count: 65 },
      { term: "password reset", count: 54 },
      { term: "speed test", count: 43 },
      { term: "wifi extender", count: 38 },
      { term: "refund policy", count: 29 },
      { term: "new connection", count: 24 },
    ],
  };
}

function saveKbAnalytics(a: KbAnalytics) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KB_ANALYTICS_KEY, JSON.stringify(a)); } catch { /* ignore */ }
}

// ─── Stat Card ──────────────────────────────────────
function StatCard({ title, value, subtitle, icon: Icon, gradient, delay }: {
  title: string; value: string | number; subtitle: string;
  icon: React.ElementType; gradient: string; delay: number;
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

// ─── Knowledge Base Page ────────────────────────────
export function KnowledgeBasePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("articles");
  const [articleDialogOpen, setArticleDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [faqDialogOpen, setFaqDialogOpen] = useState(false);
  const [searchFaq, setSearchFaq] = useState("");
  const [editingItem, setEditingItem] = useState<any>(null);

  // Article form
  const [articleForm, setArticleForm] = useState({ title: "", category: "General", content: "", status: "DRAFT", tags: "", slug: "", metaTitle: "", metaDescription: "" });
  const [tagInput, setTagInput] = useState("");
  const [tagSuggestionsOpen, setTagSuggestionsOpen] = useState(false);

  // Category form
  const [categoryForm, setCategoryForm] = useState({ name: "", icon: "Info", description: "", parentCategory: "" });

  // FAQ form
  const [faqForm, setFaqForm] = useState({ question: "", answer: "", category: "General", order: "1", status: "PUBLISHED" });

  // Drag-and-drop state for FAQ reorder
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Delete confirmations
  const [deleteArticleTarget, setDeleteArticleTarget] = useState<Article | null>(null);
  const [deleteFaqTarget, setDeleteFaqTarget] = useState<Faq | null>(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<Category | null>(null);

  // Category edit form
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCategoryForm, setEditCategoryForm] = useState({ name: "", icon: "Info", description: "", parentCategory: "" });

  // Preview dialog
  const [previewArticle, setPreviewArticle] = useState<Article | null>(null);

  // Version history dialog
  const [versionHistoryArticle, setVersionHistoryArticle] = useState<Article | null>(null);

  // Import dialog
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importContent, setImportContent] = useState("");
  const [importTitle, setImportTitle] = useState("");
  const [importFormat, setImportFormat] = useState("markdown");
  const [importCategory, setImportCategory] = useState("");

  // Tag suggestions ref
  const tagInputRef = useRef<HTMLDivElement>(null);

  // KB Analytics state
  const [kbAnalytics, setKbAnalytics] = useState<KbAnalytics>(() => loadKbAnalytics());

  const incrementArticleView = (articleTitle: string) => {
    setKbAnalytics(prev => {
      const existing = prev.articleViews.find(a => a.title === articleTitle);
      let newViews: { title: string; views: number }[];
      if (existing) {
        newViews = prev.articleViews.map(a => a.title === articleTitle ? { ...a, views: a.views + 1 } : a);
      } else {
        newViews = [...prev.articleViews, { title: articleTitle, views: 1 }];
      }
      const updated = { ...prev, totalViews: prev.totalViews + 1, articleViews: newViews.sort((a, b) => b.views - a.views) };
      saveKbAnalytics(updated);
      return updated;
    });
  };

  // ── Fetch all data ──
  const { data, isLoading, refetch } = useQuery<{
    articles: Article[];
    categories: Category[];
    faqs: Faq[];
    stats: KbStats;
    tags: string[];
  }>({
    queryKey: ["knowledge-base"],
    queryFn: () => apiFetch("/api/knowledge-base"),
  });

  // Version history query
  const { data: versionData, isLoading: versionsLoading } = useQuery<{ versions: ArticleVersion[] }>({
    queryKey: ["article-versions", versionHistoryArticle?.id],
    queryFn: () => apiFetch(`/api/knowledge-base?type=article-versions&articleId=${versionHistoryArticle!.id}`),
    enabled: !!versionHistoryArticle,
  });

  const stats = data?.stats || { totalArticles: 0, published: 0, categories: 0, totalViews: 0, totalHelpful: 0 };
  const articles = data?.articles || [];
  const categories = data?.categories || [];
  const faqs = data?.faqs || [];
  const allTags = data?.tags || [];

  // Build hierarchical categories
  const rootCategories = categories.filter((c) => !c.parentId);
  const getChildren = (parentId: string) => categories.filter((c) => c.parentId === parentId);

  const filteredFaqs = searchFaq
    ? faqs.filter((f) => f.question.toLowerCase().includes(searchFaq.toLowerCase()) || f.answer.toLowerCase().includes(searchFaq.toLowerCase()))
    : faqs;

  // Tag suggestions
  const currentTags = articleForm.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  const tagSuggestions = tagInput.length > 0
    ? allTags.filter((t) => t.toLowerCase().includes(tagInput.toLowerCase()) && !currentTags.includes(t.toLowerCase())).slice(0, 8)
    : [];

  // Click outside to close tag suggestions
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (tagInputRef.current && !tagInputRef.current.contains(e.target as Node)) {
        setTagSuggestionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function addTag(tag: string) {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !currentTags.includes(trimmed)) {
      setArticleForm((prev) => ({ ...prev, tags: prev.tags ? `${prev.tags}, ${trimmed}` : trimmed }));
    }
    setTagInput("");
    setTagSuggestionsOpen(false);
  }

  function removeTag(tag: string) {
    setArticleForm((prev) => ({
      ...prev,
      tags: prev.tags.split(",").map((t) => t.trim()).filter((t) => t.toLowerCase() !== tag.toLowerCase()).join(", "),
    }));
  }

  // ── Mutations ──
  const articleMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch("/api/knowledge-base", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => { if (!r.ok) throw new Error(`API error: ${r.status}`); return r.json(); }),
    onSuccess: () => {
      toast.success(editingItem ? "Article updated" : "Article created");
      setArticleDialogOpen(false); setEditingItem(null);
      setArticleForm({ title: "", category: "General", content: "", status: "DRAFT", tags: "", slug: "", metaTitle: "", metaDescription: "" });
      queryClient.invalidateQueries({ queryKey: ["knowledge-base"] });
    },
    onError: () => toast.error("Failed to save article"),
  });

  const categoryMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch("/api/knowledge-base", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => { if (!r.ok) throw new Error(`API error: ${r.status}`); return r.json(); }),
    onSuccess: () => {
      toast.success(editingCategory ? "Category updated" : "Category created");
      setCategoryDialogOpen(false); setEditingCategory(null);
      setCategoryForm({ name: "", icon: "Info", description: "", parentCategory: "" });
      queryClient.invalidateQueries({ queryKey: ["knowledge-base"] });
    },
    onError: () => toast.error("Failed to save category"),
  });

  const faqMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch("/api/knowledge-base", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => { if (!r.ok) throw new Error(`API error: ${r.status}`); return r.json(); }),
    onSuccess: () => {
      toast.success(editingItem ? "FAQ updated" : "FAQ created");
      setFaqDialogOpen(false); setEditingItem(null);
      setFaqForm({ question: "", answer: "", category: "General", order: "1", status: "PUBLISHED" });
      queryClient.invalidateQueries({ queryKey: ["knowledge-base"] });
    },
    onError: () => toast.error("Failed to save FAQ"),
  });

  const reorderFaqMutation = useMutation({
    mutationFn: (faqIds: string[]) =>
      fetch("/api/knowledge-base", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reorder-faqs", type: "faq", faqIds }) }).then(async (r) => { if (!r.ok) throw new Error(`API error: ${r.status}`); return r.json(); }),
    onSuccess: () => { toast.success("FAQ order updated"); queryClient.invalidateQueries({ queryKey: ["knowledge-base"] }); },
    onError: () => toast.error("Failed to reorder FAQs"),
  });

  const deleteMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch("/api/knowledge-base", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => { if (!r.ok) throw new Error(`API error: ${r.status}`); return r.json(); }),
    onSuccess: () => { toast.success("Deleted successfully"); queryClient.invalidateQueries({ queryKey: ["knowledge-base"] }); },
    onError: () => toast.error("Failed to delete"),
  });

  const importMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch("/api/knowledge-base", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => { if (!r.ok) throw new Error(`API error: ${r.status}`); return r.json(); }),
    onSuccess: () => {
      toast.success("Article imported successfully");
      setImportDialogOpen(false); setImportContent(""); setImportTitle("");
      queryClient.invalidateQueries({ queryKey: ["knowledge-base"] });
    },
    onError: () => toast.error("Failed to import article"),
  });

  const voteMutation = useMutation({
    mutationFn: (body: { action: string; id: string; voteType: string }) =>
      fetch("/api/knowledge-base", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => { if (!r.ok) throw new Error(); return r.json(); }),
    onSuccess: (_, variables) => {
      toast.success(variables.voteType === "up" ? "Marked as helpful" : "Vote removed");
      queryClient.invalidateQueries({ queryKey: ["knowledge-base"] });
    },
  });

  const incrementViewsMutation = useMutation({
    mutationFn: (id: string) =>
      fetch("/api/knowledge-base", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "increment-views", id }) }).then(() => {}),
  });

  // ── Drag-and-drop handlers ──
  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, index: number) => { setDragIndex(index); e.dataTransfer.effectAllowed = "move"; const img = new Image(); img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs="; e.dataTransfer.setDragImage(img, 0, 0); }, []);
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, index: number) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverIndex(index); }, []);
  const handleDragLeave = useCallback(() => { setOverIndex(null); }, []);
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault(); setOverIndex(null);
    if (dragIndex === null || dragIndex === dropIndex) { setDragIndex(null); return; }
    const currentIds = filteredFaqs.map((f) => f.id);
    const [movedId] = currentIds.splice(dragIndex, 1);
    currentIds.splice(dropIndex, 0, movedId);
    reorderFaqMutation.mutate(currentIds);
    setDragIndex(null);
  }, [dragIndex, filteredFaqs, reorderFaqMutation]);
  const handleDragEnd = useCallback(() => { setDragIndex(null); setOverIndex(null); }, []);

  const getCategoryByName = (name: string) => categories.find((c) => c.name === name);

  // ── Dialog openers ──
  function openArticleDialog(article?: Article) {
    if (article) {
      setEditingItem(article);
      const tags = (() => { try { return JSON.parse(article.tags || "[]"); } catch { return []; } })();
      setArticleForm({ title: article.title, category: article.category?.name || "General", content: article.content, status: article.status, tags: tags.join(", "), slug: article.slug || "", metaTitle: article.metaTitle || "", metaDescription: article.metaDescription || "" });
    } else {
      setEditingItem(null);
      setArticleForm({ title: "", category: "General", content: "", status: "DRAFT", tags: "", slug: "", metaTitle: "", metaDescription: "" });
    }
    setArticleDialogOpen(true);
  }

  function openCategoryDialog(cat?: Category) {
    if (cat) {
      setEditingCategory(cat);
      setEditCategoryForm({ name: cat.name, icon: cat.icon, description: cat.description, parentCategory: cat.parentId || "" });
    } else {
      setEditingCategory(null);
      setEditCategoryForm({ name: "", icon: "Info", description: "", parentCategory: "" });
    }
    setCategoryDialogOpen(true);
  }

  function openFaqDialog(faq?: Faq) {
    if (faq) {
      setEditingItem(faq);
      setFaqForm({ question: faq.question, answer: faq.answer, category: faq.category, order: String(faq.sortOrder), status: faq.status });
    } else {
      setEditingItem(null);
      setFaqForm({ question: "", answer: "", category: "General", order: String(faqs.length + 1), status: "PUBLISHED" });
    }
    setFaqDialogOpen(true);
  }

  if (isLoading) {
    return (<div className="space-y-6"><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => (<Card key={i}><CardContent className="p-5"><Skeleton className="skeleton-wave h-4 w-24 mb-3" /><Skeleton className="skeleton-wave h-8 w-16" /></CardContent></Card>))}</div><Skeleton className="skeleton-wave h-96 w-full" /></div>);
  }

  // ─── Render hierarchy ──
  function renderCategoryTree(catList: Category[], level: number = 0): React.ReactNode[] {
    return catList.flatMap((cat) => [
      <div key={cat.id} style={{ paddingLeft: `${level * 20}px` }} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer group">
        <div className="flex items-center gap-2 flex-1 min-w-0" onClick={() => openCategoryDialog(cat)}>
          {level > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
          <div className="p-1.5 rounded bg-red-50"><Tag className="h-3.5 w-3.5 text-[#DC2626]" /></div>
          <span className="text-sm font-medium truncate">{cat.name}</span>
          <Badge variant="outline" className="text-[10px]">{cat._count?.articles || 0}</Badge>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openCategoryDialog(cat)}><Edit2 className="h-3 w-3" /></Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-red-600" onClick={() => setDeleteCategoryTarget(cat)}><Trash2 className="h-3 w-3" /></Button>
        </div>
      </div>,
      ...renderCategoryTree(getChildren(cat.id), level + 1),
    ]);
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Articles, FAQs & self-service documentation</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard title="Total Articles" value={stats.totalArticles} subtitle="All articles" icon={BookOpen} gradient="stat-gradient-red" delay={0} />
        <StatCard title="Published" value={stats.published} subtitle="Live articles" icon={FileText} gradient="stat-gradient-green" delay={75} />
        <StatCard title="Categories" value={stats.categories} subtitle="Topic categories" icon={FolderOpen} gradient="stat-gradient-amber" delay={150} />
        <StatCard title="Total Views" value={stats.totalViews.toLocaleString()} subtitle="All time" icon={Eye} gradient="stat-gradient-purple" delay={225} />
        <StatCard title="Helpful Votes" value={stats.totalHelpful} subtitle="Community feedback" icon={ThumbsUp} gradient="stat-gradient-blue" delay={300} />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="articles">Articles</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* ── Articles Tab ── */}
        <TabsContent value="articles" className="mt-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">{articles.length} article(s)</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => { setImportTitle(""); setImportContent(""); setImportCategory(""); setImportDialogOpen(true); }}><Upload className="h-3 w-3 mr-1" />Import</Button>
              <Dialog open={articleDialogOpen} onOpenChange={(open) => { setArticleDialogOpen(open); if (!open) setEditingItem(null); }}>
                <DialogTrigger asChild>
                  <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => openArticleDialog()}><Plus className="h-4 w-4 mr-2" />Add Article</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>{editingItem ? "Edit Article" : "Add Article"}</DialogTitle></DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div><Label>Title</Label><Input value={articleForm.title} onChange={(e) => setArticleForm({ ...articleForm, title: e.target.value, metaTitle: articleForm.metaTitle || e.target.value })} placeholder="Article title" className="mt-1" /></div>
                    {/* SEO Fields */}
                    <div className="grid grid-cols-2 gap-4">
                      <div><Label>Slug</Label><Input value={articleForm.slug} onChange={(e) => setArticleForm({ ...articleForm, slug: e.target.value })} placeholder="article-url-slug" className="mt-1" /></div>
                      <div><Label>Category</Label>
                        <Select value={articleForm.category} onValueChange={(v) => setArticleForm({ ...articleForm, category: v })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div><Label>Meta Title</Label><Input value={articleForm.metaTitle} onChange={(e) => setArticleForm({ ...articleForm, metaTitle: e.target.value })} placeholder="SEO title (optional)" className="mt-1" /></div>
                    <div><Label>Meta Description</Label><Textarea value={articleForm.metaDescription} onChange={(e) => setArticleForm({ ...articleForm, metaDescription: e.target.value })} placeholder="SEO description (optional)" rows={2} className="mt-1" /></div>
                    <div><Label>Content</Label><Textarea value={articleForm.content} onChange={(e) => setArticleForm({ ...articleForm, content: e.target.value })} placeholder="Article content (Markdown supported)..." rows={6} className="mt-1" /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><Label>Status</Label>
                        <Select value={articleForm.status} onValueChange={(v) => setArticleForm({ ...articleForm, status: v })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="DRAFT">Draft</SelectItem><SelectItem value="PUBLISHED">Published</SelectItem><SelectItem value="ARCHIVED">Archived</SelectItem></SelectContent>
                        </Select>
                      </div>
                      {/* Tag Autocomplete */}
                      <div ref={tagInputRef} className="relative">
                        <Label>Tags</Label>
                        <div className="flex flex-wrap gap-1 mt-1 mb-1">
                          {currentTags.map((t) => (
                            <Badge key={t} variant="secondary" className="text-xs gap-1 cursor-pointer hover:bg-red-100" onClick={() => removeTag(t)}>{t}<X className="h-2.5 w-2.5" /></Badge>
                          ))}
                        </div>
                        <Input value={tagInput} onChange={(e) => { setTagInput(e.target.value); setTagSuggestionsOpen(true); }} onFocus={() => setTagSuggestionsOpen(true)} placeholder="Type to search tags..." className="mt-0" />
                        {tagSuggestionsOpen && tagSuggestions.length > 0 && (
                          <div className="absolute z-10 mt-1 w-full bg-background border rounded-md shadow-lg max-h-32 overflow-y-auto">
                            {tagSuggestions.map((t) => (<div key={t} className="px-3 py-1.5 text-sm cursor-pointer hover:bg-muted" onClick={() => addTag(t)}>{t}</div>))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setArticleDialogOpen(false); setEditingItem(null); }}>Cancel</Button>
                    <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => articleMutation.mutate({
                      action: editingItem ? "update-article" : "create-article",
                      type: "article",
                      ...(editingItem ? { id: (editingItem as Article).id } : {}),
                      data: {
                        title: articleForm.title, content: articleForm.content,
                        categoryId: getCategoryByName(articleForm.category)?.id || null,
                        status: articleForm.status,
                        tags: currentTags,
                        slug: articleForm.slug, metaTitle: articleForm.metaTitle, metaDescription: articleForm.metaDescription,
                      },
                    })} disabled={!articleForm.title || !articleForm.content || articleMutation.isPending}>
                      {articleMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}{editingItem ? "Update" : "Create"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs font-medium uppercase">Title</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Category</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                    <TableHead className="text-xs font-medium uppercase text-right">Views</TableHead>
                    <TableHead className="text-xs font-medium uppercase text-right">Helpful</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Last Updated</TableHead>
                    <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                  </TableRow></TableHeader><TableBody>
                    {articles.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No articles yet. Create your first article.</TableCell></TableRow>
                    ) : articles.map((article) => {
                      const tags = (() => { try { return JSON.parse(article.tags || "[]"); } catch { return []; } })();
                      return (
                        <TableRow key={article.id} className="hover:bg-muted/50 transition-colors duration-150">
                          <TableCell><div className="max-w-xs"><p className="text-sm font-medium truncate">{article.title}</p><div className="flex gap-1 mt-1">{tags.slice(0, 2).map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}{tags.length > 2 && <Badge variant="outline" className="text-[10px]">+{tags.length - 2}</Badge>}</div></div></TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{article.category?.name || "Uncategorized"}</Badge></TableCell>
                          <TableCell><Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[article.status] || ""}`}>{article.status}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{article.views}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{article.helpfulVotes || 0}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(article.updatedAt).toLocaleDateString("en-IN")}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Preview" onClick={() => { incrementViewsMutation.mutate(article.id); incrementArticleView(article.title); setPreviewArticle(article); }}><Eye className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="History" onClick={() => setVersionHistoryArticle(article)}><History className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openArticleDialog(article)}><Edit2 className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteArticleTarget(article)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Categories Tab (with hierarchy) ── */}
        <TabsContent value="categories" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{categories.length} categor(ies)</p>
            <Dialog open={categoryDialogOpen} onOpenChange={(open) => { setCategoryDialogOpen(open); if (!open) setEditingCategory(null); }}>
              <DialogTrigger asChild>
                <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => openCategoryDialog()}><Plus className="h-4 w-4 mr-2" />Add Category</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingCategory ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                  <div><Label>Name</Label><Input value={editingCategory ? editCategoryForm.name : categoryForm.name} onChange={(e) => editingCategory ? setEditCategoryForm({ ...editCategoryForm, name: e.target.value }) : setCategoryForm({ ...categoryForm, name: e.target.value })} placeholder="Category name" className="mt-1" /></div>
                  <div><Label>Icon</Label>
                    <Select value={editingCategory ? editCategoryForm.icon : categoryForm.icon} onValueChange={(v) => editingCategory ? setEditCategoryForm({ ...editCategoryForm, icon: v }) : setCategoryForm({ ...categoryForm, icon: v })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="Info">Info</SelectItem><SelectItem value="CreditCard">CreditCard</SelectItem><SelectItem value="Wrench">Wrench</SelectItem><SelectItem value="Package">Package</SelectItem><SelectItem value="User">User</SelectItem></SelectContent>
                    </Select>
                  </div>
                  {/* Parent Category */}
                  <div><Label>Parent Category</Label>
                    <Select value={editingCategory ? editCategoryForm.parentCategory : categoryForm.parentCategory} onValueChange={(v) => editingCategory ? setEditCategoryForm({ ...editCategoryForm, parentCategory: v }) : setCategoryForm({ ...categoryForm, parentCategory: v })}><SelectTrigger className="mt-1"><SelectValue placeholder="None (top-level)" /></SelectTrigger>
                      <SelectContent><SelectItem value="__none__">None (top-level)</SelectItem>{rootCategories.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Description</Label><Textarea value={editingCategory ? editCategoryForm.description : categoryForm.description} onChange={(e) => editingCategory ? setEditCategoryForm({ ...editCategoryForm, description: e.target.value }) : setCategoryForm({ ...categoryForm, description: e.target.value })} placeholder="Brief description" className="mt-1" /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setCategoryDialogOpen(false); setEditingCategory(null); }}>Cancel</Button>
                  <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => {
                    const form = editingCategory ? editCategoryForm : categoryForm;
                    const parentCat = categories.find((c) => c.id === form.parentCategory);
                    categoryMutation.mutate({
                      action: editingCategory ? "update-category" : "create-category",
                      type: "category",
                      ...(editingCategory ? { id: editingCategory.id } : {}),
                      data: { name: form.name, icon: form.icon, description: form.description, parentId: parentCat?.id || null },
                    });
                  }} disabled={!(editingCategory ? editCategoryForm.name : categoryForm.name) || categoryMutation.isPending}>
                    {categoryMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}{editingCategory ? "Update" : "Create"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {/* Hierarchical category tree */}
          <div className="border rounded-lg p-2 space-y-1">
            {renderCategoryTree(rootCategories)}
          </div>
        </TabsContent>

        {/* ── FAQs Tab ── */}
        <TabsContent value="faqs" className="mt-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search FAQs..." value={searchFaq} onChange={(e) => setSearchFaq(e.target.value)} className="pl-8" />
            </div>
            <Dialog open={faqDialogOpen} onOpenChange={(open) => { setFaqDialogOpen(open); if (!open) setEditingItem(null); }}>
              <DialogTrigger asChild>
                <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => openFaqDialog()}><Plus className="h-4 w-4 mr-2" />Add FAQ</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{editingItem ? "Edit FAQ" : "Add FAQ"}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                  <div><Label>Question</Label><Input value={faqForm.question} onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })} placeholder="Frequently asked question" className="mt-1" /></div>
                  <div><Label>Answer</Label><Textarea value={faqForm.answer} onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })} placeholder="Detailed answer" rows={4} className="mt-1" /></div>
                  <div className="grid grid-cols-3 gap-4">
                    <div><Label>Category</Label>
                      <Select value={faqForm.category} onValueChange={(v) => setFaqForm({ ...faqForm, category: v })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Order</Label><Input type="number" value={faqForm.order} onChange={(e) => setFaqForm({ ...faqForm, order: e.target.value })} className="mt-1" /></div>
                    <div><Label>Status</Label>
                      <Select value={faqForm.status} onValueChange={(v) => setFaqForm({ ...faqForm, status: v })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="active">Published</SelectItem><SelectItem value="draft">Draft</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setFaqDialogOpen(false); setEditingItem(null); }}>Cancel</Button>
                  <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => faqMutation.mutate({
                    action: editingItem ? "update-faq" : "create-faq", type: "faq",
                    ...(editingItem ? { id: (editingItem as Faq).id } : {}),
                    data: { question: faqForm.question, answer: faqForm.answer, category: faqForm.category, sortOrder: parseInt(faqForm.order) || 0, status: faqForm.status },
                  })} disabled={!faqForm.question || !faqForm.answer || faqMutation.isPending}>
                    {faqMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}{editingItem ? "Update" : "Create"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <Card className="border shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base font-semibold flex items-center gap-2"><HelpCircle className="h-4 w-4" />FAQs ({filteredFaqs.length})</CardTitle></CardHeader>
            <CardContent>
              {filteredFaqs.length === 0 ? (<p className="text-center text-muted-foreground py-8 text-sm">No FAQs found</p>) : (
                <Accordion type="single" collapsible className="w-full">
                  {filteredFaqs.map((faq, index) => (
                    <div key={faq.id} className="relative">
                      {overIndex === index && dragIndex !== null && dragIndex !== index && (<div className="absolute top-0 left-0 right-0 h-0.5 bg-[#DC2626] rounded-full z-10 -translate-y-0.5" />)}
                      <AccordionItem value={faq.id} className={dragIndex === index ? "opacity-40" : ""} draggable onDragStart={(e) => handleDragStart(e, index)} onDragOver={(e) => handleDragOver(e, index)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, index)} onDragEnd={handleDragEnd}>
                        <AccordionTrigger className="text-sm hover:no-underline hover:bg-red-50/50 px-3 py-2.5 rounded-lg">
                          <div className="flex items-center gap-2 text-left flex-1 min-w-0">
                            <span className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0 touch-none" onPointerDown={(e) => e.stopPropagation()}><GripVertical className="h-4 w-4" /></span>
                            <span className="text-xs text-muted-foreground shrink-0">Q{index + 1}.</span>
                            <span className="truncate">{faq.question}</span>
                            <Badge variant="outline" className="text-[10px] ml-auto mr-2 shrink-0">{faq.category}</Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-3 pb-4">
                          <div className="pl-8 border-l-2 border-red-200 py-2"><p className="text-sm text-muted-foreground">{faq.answer}</p></div>
                          <div className="flex items-center justify-end gap-2 mt-2 pr-2">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openFaqDialog(faq)}><Edit2 className="h-3 w-3 mr-1" />Edit</Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteFaqTarget(faq)}><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </div>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Analytics Tab ── */}
        <TabsContent value="analytics" className="mt-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border shadow-sm"><CardContent className="p-4 text-center"><Eye className="h-5 w-5 text-purple-600 mx-auto mb-1" /><p className="text-2xl font-bold">{kbAnalytics.totalViews.toLocaleString()}</p><p className="text-xs text-muted-foreground">Total Views</p></CardContent></Card>
            <Card className="border shadow-sm"><CardContent className="p-4 text-center"><Search className="h-5 w-5 text-teal-600 mx-auto mb-1" /><p className="text-2xl font-bold text-teal-600">{kbAnalytics.totalSearches.toLocaleString()}</p><p className="text-xs text-muted-foreground">Total Searches</p></CardContent></Card>
            <Card className="border shadow-sm"><CardContent className="p-4 text-center"><ThumbsUp className="h-5 w-5 text-green-600 mx-auto mb-1" /><p className="text-2xl font-bold text-green-600">{stats.totalViews > 0 ? (stats.totalHelpful / Math.max(1, stats.totalArticles)).toFixed(1) : "0"}</p><p className="text-xs text-muted-foreground">Avg Helpful Rating</p></CardContent></Card>
            <Card className="border shadow-sm"><CardContent className="p-4 text-center"><TrendingUp className="h-5 w-5 text-amber-600 mx-auto mb-1" /><p className="text-sm font-bold text-amber-600 truncate">{kbAnalytics.articleViews.length > 0 ? kbAnalytics.articleViews[0].title : "N/A"}</p><p className="text-xs text-muted-foreground">Most Viewed Article</p></CardContent></Card>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4" />Top 10 Most Viewed Articles</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={kbAnalytics.articleViews.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis dataKey="title" type="category" width={120} tick={{ fontSize: 9 }} />
                      <RTooltip />
                      <Bar dataKey="views" fill="#8B5CF6" name="Views" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Search className="h-4 w-4" />Top 10 Searches</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={kbAnalytics.topSearches.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis dataKey="term" type="category" width={110} tick={{ fontSize: 9 }} />
                      <RTooltip />
                      <Bar dataKey="count" fill="#F59E0B" name="Searches" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Preview Dialog ── */}
      <Dialog open={!!previewArticle} onOpenChange={(open) => { if (!open) setPreviewArticle(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{previewArticle?.title}</DialogTitle></DialogHeader>
          {previewArticle && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs">{previewArticle.category?.name || "Uncategorized"}</Badge>
                <Badge variant="outline" className={`text-xs ${STATUS_STYLES[previewArticle.status] || ""}`}>{previewArticle.status}</Badge>
                <Badge variant="outline" className="text-xs"><Eye className="h-3 w-3 mr-1" />{previewArticle.views}</Badge>
                <Badge variant="outline" className="text-xs"><ThumbsUp className="h-3 w-3 mr-1" />{previewArticle.helpfulVotes || 0}</Badge>
              </div>
              {(() => { try { return JSON.parse(previewArticle.tags || "[]"); } catch { return []; } })().length > 0 && (
                <div className="flex flex-wrap gap-1">{(() => { try { return JSON.parse(previewArticle.tags || "[]"); } catch { return []; } })().map((t: string) => (<Badge key={t} variant="secondary" className="text-xs">{t}</Badge>))}</div>
              )}
              <div className="prose prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{previewArticle.content}</div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" className="text-xs" onClick={() => voteMutation.mutate({ action: "vote-article", id: previewArticle.id, voteType: "up" })}><ThumbsUp className="h-3.5 w-3.5 mr-1" />Helpful ({previewArticle.helpfulVotes || 0})</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Version History Dialog ── */}
      <Dialog open={!!versionHistoryArticle} onOpenChange={(open) => { if (!open) setVersionHistoryArticle(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Version History — {versionHistoryArticle?.title}</DialogTitle></DialogHeader>
          {versionsLoading ? (<div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>) : (
            <div className="space-y-4">
              {(!versionData?.versions || versionData.versions.length === 0) ? (<p className="text-center text-muted-foreground py-8 text-sm">No version history available.</p>) :
                versionData.versions.map((v) => (
                  <Card key={v.id} className="border shadow-sm">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">Version {v.version}</CardTitle>
                        <Badge variant="outline" className="text-[10px]">{new Date(v.createdAt).toLocaleString("en-IN")}</Badge>
                      </div>
                      <CardDescription className="text-xs">{v.changeNote || "No change note"}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div><span className="text-xs font-medium text-muted-foreground">Title: </span><span className="text-sm">{v.title}</span></div>
                        <div className="max-h-32 overflow-y-auto rounded border p-2 bg-muted/30"><pre className="text-xs whitespace-pre-wrap">{v.content.substring(0, 500)}{v.content.length > 500 ? "\n..." : ""}</pre></div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              }
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Import Dialog ── */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Import Article</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div><Label>Title *</Label><Input value={importTitle} onChange={(e) => setImportTitle(e.target.value)} placeholder="Article title" className="mt-1" /></div>
            <div><Label>Category</Label>
              <Select value={importCategory} onValueChange={setImportCategory}><SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Format</Label>
              <Select value={importFormat} onValueChange={setImportFormat}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="markdown">Markdown</SelectItem><SelectItem value="text">Plain Text</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Content *</Label><Textarea value={importContent} onChange={(e) => setImportContent(e.target.value)} placeholder="Paste your article content here..." rows={10} className="mt-1 font-mono text-sm" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => importMutation.mutate({ action: "import", format: importFormat, title: importTitle, content: importContent, categoryId: importCategory || null })} disabled={!importTitle || !importContent || importMutation.isPending}>
              {importMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Import as Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete AlertDialogs */}
      <AlertDialog open={!!deleteArticleTarget} onOpenChange={(open) => { if (!open) setDeleteArticleTarget(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Article</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete &quot;{deleteArticleTarget?.title}&quot;?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => { if (!deleteArticleTarget) return; deleteMutation.mutate({ action: "delete", type: "article", id: deleteArticleTarget.id }); setDeleteArticleTarget(null); }}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!deleteFaqTarget} onOpenChange={(open) => { if (!open) setDeleteFaqTarget(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete FAQ</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete this FAQ?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => { if (!deleteFaqTarget) return; deleteMutation.mutate({ action: "delete", type: "faq", id: deleteFaqTarget.id }); setDeleteFaqTarget(null); }}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!deleteCategoryTarget} onOpenChange={(open) => { if (!open) setDeleteCategoryTarget(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Category</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete category &quot;{deleteCategoryTarget?.name}&quot;?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => { if (!deleteCategoryTarget) return; deleteMutation.mutate({ action: "delete", type: "category", id: deleteCategoryTarget.id }); setDeleteCategoryTarget(null); }}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
export default KnowledgeBasePage;
