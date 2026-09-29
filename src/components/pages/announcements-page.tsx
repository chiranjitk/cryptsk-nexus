"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Megaphone,
  Plus,
  RefreshCw,
  AlertTriangle,
  Clock,
  Send,
  Bell,
  Eye,
  EyeOff,
  Info,
  Wrench,
  Zap,
  CalendarClock,
  Search,
  X,
  CheckCircle2,
  Mail,
  MessageCircle,
  Smartphone,
  Globe,
  Filter,
  Loader2,
  Trash2,
  ToggleLeft,
  History,
  ChevronDown,
} from "lucide-react";
import { apiFetch } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: string;
  priority: number;
  target: string;
  channels: string;
  expiresAt: string | null;
  isActive: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Constants ────────────────────────────────────────────────────

const ANNOUNCEMENT_TYPES = ["ALL", "INFO", "WARNING", "UPGRADE", "MAINTENANCE", "PROMO"] as const;
const TARGET_OPTIONS = [
  { value: "ALL", label: "All Subscribers" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "TRIAL", label: "Trial" },
  { value: "PAID", label: "Paid" },
  { value: "OVERDUE", label: "Overdue" },
] as const;
const CHANNEL_OPTIONS = [
  { value: "IN_APP", label: "In-App", icon: Bell },
  { value: "EMAIL", label: "Email", icon: Mail },
  { value: "SMS", label: "SMS", icon: Smartphone },
  { value: "WHATSAPP", label: "WhatsApp", icon: MessageCircle },
  { value: "PUSH", label: "Push", icon: Globe },
] as const;
const PRIORITY_OPTIONS = [
  { value: 0, label: "Normal", color: "bg-gray-500" },
  { value: 1, label: "High", color: "bg-amber-500" },
  { value: 2, label: "Critical", color: "bg-red-500" },
] as const;

// ── Helpers ──────────────────────────────────────────────────────

function getTypeConfig(type: string) {
  switch (type) {
    case "INFO":
      return { color: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30", icon: Info, label: "Info" };
    case "WARNING":
      return { color: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30", icon: AlertTriangle, label: "Warning" };
    case "UPGRADE":
      return { color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30", icon: Zap, label: "Upgrade" };
    case "MAINTENANCE":
      return { color: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30", icon: Wrench, label: "Maintenance" };
    case "PROMO":
      return { color: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30", icon: Megaphone, label: "Promo" };
    default:
      return { color: "bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-500/30", icon: Info, label: type };
  }
}

function getPriorityConfig(priority: number) {
  if (priority === 2) return { label: "Critical", color: "bg-red-500", textColor: "text-red-600 dark:text-red-400", pulse: true };
  if (priority === 1) return { label: "High", color: "bg-amber-500", textColor: "text-amber-600 dark:text-amber-400", pulse: false };
  return { label: "Normal", color: "bg-gray-400", textColor: "text-muted-foreground", pulse: false };
}

function getTargetLabel(target: string) {
  return TARGET_OPTIONS.find((t) => t.value === target)?.label || target;
}

function formatCountdown(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h left`;
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Announcement Card ────────────────────────────────────────────

function AnnouncementCard({
  announcement,
  onDismiss,
}: {
  announcement: Announcement;
  onDismiss?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const typeConfig = getTypeConfig(announcement.type);
  const priorityConfig = getPriorityConfig(announcement.priority);
  const TypeIcon = typeConfig.icon;
  const channels = announcement.channels.split(",").filter(Boolean);

  return (
    <Card className="card-hover-pollish relative overflow-hidden">
      {/* Priority bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${priorityConfig.color}`} />

      <CardContent className="p-4 pl-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={`p-2 rounded-lg mt-0.5 ${typeConfig.color.split(" ").slice(0, 1).join(" ")}`}>
              <TypeIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="font-semibold text-foreground text-sm">{announcement.title}</h3>
                {priorityConfig.pulse && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                )}
              </div>

              <p
                className={`text-sm text-muted-foreground leading-relaxed ${!expanded ? "line-clamp-2" : ""}`}
              >
                {announcement.message}
              </p>

              {announcement.message.length > 150 && (
                <button
                  className="text-xs text-primary hover:underline mt-1"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? "Show less" : "Read more"}
                </button>
              )}

              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <Badge variant="outline" className={`text-xs ${typeConfig.color}`}>
                  {typeConfig.label}
                </Badge>
                <Badge variant="outline" className={`text-xs ${priorityConfig.textColor} border-current/20`}>
                  {priorityConfig.label}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {getTargetLabel(announcement.target)}
                </Badge>

                <div className="flex items-center gap-1 ml-auto">
                  {channels.map((ch) => {
                    const opt = CHANNEL_OPTIONS.find((c) => c.value === ch.trim());
                    if (!opt) return null;
                    const ChIcon = opt.icon;
                    return (
                      <div key={ch} className="flex items-center gap-0.5 text-muted-foreground" title={opt.label}>
                        <ChIcon className="w-3 h-3" />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CalendarClock className="w-3 h-3" />
                  {formatDate(announcement.createdAt)}
                </span>
                {announcement.expiresAt && (
                  <span
                    className={`flex items-center gap-1 ${
                      new Date(announcement.expiresAt) < new Date() ? "text-red-500" : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    {formatCountdown(announcement.expiresAt)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {onDismiss && announcement.isActive && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => onDismiss(announcement.id)}
              title="Dismiss"
            >
              <EyeOff className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Compose Form ──────────────────────────────────────────────────

function ComposeTab({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("INFO");
  const [priority, setPriority] = useState("0");
  const [target, setTarget] = useState("ALL");
  const [channels, setChannels] = useState<string[]>(["IN_APP"]);
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const toggleChannel = (ch: string) => {
    setChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
  };

  const handleSubmit = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Title and message are required");
      return;
    }
    if (channels.length === 0) {
      toast.error("Select at least one channel");
      return;
    }

    try {
      setSubmitting(true);
      await apiFetch("/api/announcements", {
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          type,
          priority: parseInt(priority, 10),
          target,
          channels: channels.join(","),
          expiresAt: expiresAt || null,
        }),
      });
      toast.success("Announcement created successfully");
      // Reset form
      setTitle("");
      setMessage("");
      setType("INFO");
      setPriority("0");
      setTarget("ALL");
      setChannels(["IN_APP"]);
      setExpiresAt("");
      setShowPreview(false);
      onCreated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create announcement";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const previewAnnouncement: Announcement = {
    id: "preview",
    title: title || "Untitled Announcement",
    message: message || "No message content",
    type,
    priority: parseInt(priority, 10),
    target,
    channels: channels.join(","),
    expiresAt: expiresAt || null,
    isActive: true,
    createdById: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Form */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="w-4 h-4 text-red-500" />
            Compose Announcement
          </CardTitle>
          <CardDescription>Create a new broadcast for your subscribers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ann-title">Title *</Label>
            <Input
              id="ann-title"
              placeholder="Enter announcement title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ann-message">Message *</Label>
            <Textarea
              id="ann-message"
              placeholder="Write your announcement message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">{message.length} characters</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INFO">ℹ️ Info</SelectItem>
                  <SelectItem value="WARNING">⚠️ Warning</SelectItem>
                  <SelectItem value="UPGRADE">⬆️ Upgrade</SelectItem>
                  <SelectItem value="MAINTENANCE">🔧 Maintenance</SelectItem>
                  <SelectItem value="PROMO">📣 Promo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">⚪ Normal</SelectItem>
                  <SelectItem value="1">🟡 High</SelectItem>
                  <SelectItem value="2">🔴 Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Target Audience</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGET_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Channels</Label>
            <div className="flex flex-wrap gap-3">
              {CHANNEL_OPTIONS.map((ch) => {
                const ChIcon = ch.icon;
                const checked = channels.includes(ch.value);
                return (
                  <label
                    key={ch.value}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                      checked
                        ? "border-primary/50 bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggleChannel(ch.value)} />
                    <ChIcon className="w-4 h-4" />
                    <span className="text-sm">{ch.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ann-expires">Expires At (optional)</Label>
            <Input
              id="ann-expires"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Leave empty for no expiry</p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleSubmit}
              disabled={submitting || !title.trim() || !message.trim()}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              {submitting ? "Creating..." : "Create Announcement"}
            </Button>
            <Button variant="outline" onClick={() => setShowPreview(!showPreview)}>
              <Eye className="w-4 h-4 mr-2" />
              {showPreview ? "Hide Preview" : "Preview"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {showPreview && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Live Preview
          </h3>
          <AnnouncementCard announcement={previewAnnouncement} />
        </div>
      )}
    </div>
  );
}

// ── History Tab ──────────────────────────────────────────────────

function HistoryTab() {
  const [allAnnouncements, setAllAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch<{ announcements: Announcement[] }>("/api/announcements?all=true&limit=100", {
        credentials: "include",
      });
      setAllAnnouncements(data.announcements);
    } catch (err) {
      console.error("Failed to fetch history:", err);
      toast.error("Failed to load history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = allAnnouncements.filter((a) => {
    if (filterType !== "ALL" && a.type !== filterType) return false;
    if (filterStatus === "active" && !a.isActive) return false;
    if (filterStatus === "inactive" && a.isActive) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!a.title.toLowerCase().includes(q) && !a.message.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const handleToggleActive = async (a: Announcement) => {
    try {
      await apiFetch(`/api/announcements/${a.id}`, {
        method: "PUT",
        credentials: "include",
        body: JSON.stringify({ isActive: !a.isActive }),
      });
      toast.success(a.isActive ? "Announcement deactivated" : "Announcement activated");
      fetchAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update";
      toast.error(msg);
    }
  };

  const handleDelete = async (a: Announcement) => {
    try {
      await apiFetch(`/api/announcements/${a.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      toast.success("Announcement archived");
      fetchAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete";
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search announcements..."
                  className="pl-9 w-56 h-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  <SelectItem value="INFO">Info</SelectItem>
                  <SelectItem value="WARNING">Warning</SelectItem>
                  <SelectItem value="UPGRADE">Upgrade</SelectItem>
                  <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                  <SelectItem value="PROMO">Promo</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="secondary" className="h-9 px-3">
                {filtered.length} result{filtered.length !== 1 ? "s" : ""}
              </Badge>
            </div>
            <Button variant="outline" size="sm" onClick={fetchAll}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <History className="w-12 h-12 text-muted-foreground/30" />
          <p className="text-muted-foreground">No announcements found</p>
          {search || filterType !== "ALL" || filterStatus !== "ALL" ? (
            <p className="text-xs text-muted-foreground">Try adjusting your filters</p>
          ) : null}
        </div>
      ) : (
        <ScrollArea className="max-h-[600px]">
          <div className="space-y-3">
            {filtered.map((a) => (
              <Card key={a.id} className={`card-hover-pollish relative overflow-hidden ${!a.isActive ? "opacity-60" : ""}`}>
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${getPriorityConfig(a.priority).color}`} />
                <CardContent className="p-4 pl-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={`p-2 rounded-lg ${getTypeConfig(a.type).color.split(" ").slice(0, 1).join(" ")}`}>
                        {(() => {
                          const Icon = getTypeConfig(a.type).icon;
                          return <Icon className="w-4 h-4" />;
                        })()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold text-sm text-foreground">{a.title}</h3>
                          <Badge variant="outline" className={`text-xs ${getTypeConfig(a.type).color}`}>
                            {getTypeConfig(a.type).label}
                          </Badge>
                          <Badge variant="outline" className={`text-xs ${getPriorityConfig(a.priority).textColor} border-current/20`}>
                            {getPriorityConfig(a.priority).label}
                          </Badge>
                          {!a.isActive && (
                            <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{a.message}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>{getTargetLabel(a.target)}</span>
                          <span>•</span>
                          <span>{formatDate(a.createdAt)}</span>
                          {a.expiresAt && (
                            <>
                              <span>•</span>
                              <span className={new Date(a.expiresAt) < new Date() ? "text-red-500" : ""}>
                                Exp: {new Date(a.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggleActive(a)} title={a.isActive ? "Deactivate" : "Activate"}>
                        <ToggleLeft className={`w-4 h-4 ${a.isActive ? "text-emerald-500" : ""}`} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => handleDelete(a)} title="Archive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [targetFilter, setTargetFilter] = useState("ALL");
  const [dismissing, setDismissing] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const fetchAnnouncements = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (typeFilter !== "ALL") params.set("type", typeFilter);
      if (targetFilter !== "ALL") params.set("target", targetFilter);
      const data = await apiFetch<{ announcements: Announcement[] }>(
        `/api/announcements?${params.toString()}`,
        { credentials: "include" }
      );
      setAnnouncements(data.announcements);
    } catch (err) {
      console.error("Failed to fetch announcements:", err);
      toast.error("Failed to load announcements");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, targetFilter]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const handleDismiss = async (id: string) => {
    try {
      setDismissing((prev) => new Set(prev).add(id));
      await apiFetch("/api/announcements/dismiss", {
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ announcementId: id }),
      });
      setDismissedIds((prev) => new Set(prev).add(id));
      toast.success("Announcement dismissed");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to dismiss";
      toast.error(msg);
    } finally {
      setDismissing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const visibleAnnouncements = announcements.filter((a) => !dismissedIds.has(a.id));
  const activeCount = announcements.filter((a) => a.isActive).length;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-lg bg-red-500/10">
              <Megaphone className="w-5 h-5 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Announcements</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Broadcast messages, maintenance notices, and promotions to your subscribers
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <Badge variant="secondary" className="bg-red-500/10 text-red-600 border-red-500/20">
              {activeCount} active
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={fetchAnnouncements}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="broadcasts" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
          <TabsTrigger value="broadcasts" className="gap-2">
            <Bell className="w-4 h-4" /> Broadcasts
          </TabsTrigger>
          <TabsTrigger value="compose" className="gap-2">
            <Plus className="w-4 h-4" /> Compose
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="w-4 h-4" /> History
          </TabsTrigger>
        </TabsList>

        {/* ─── Broadcasts Tab ─── */}
        <TabsContent value="broadcasts" className="space-y-4">
          {/* Filter bar */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Filter:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ANNOUNCEMENT_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        typeFilter === t
                          ? "bg-red-500 text-white shadow-sm"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <Separator orientation="vertical" className="hidden sm:block h-6" />
                <Select value={targetFilter} onValueChange={setTargetFilter}>
                  <SelectTrigger className="w-40 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Audiences</SelectItem>
                    {TARGET_OPTIONS.filter((t) => t.value !== "ALL").map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Announcement cards */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : visibleAnnouncements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="rounded-2xl bg-muted/50 p-5">
                <Megaphone className="w-12 h-12 text-muted-foreground/30" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-foreground font-medium">No active announcements</p>
                <p className="text-sm text-muted-foreground">
                  {typeFilter !== "ALL" || targetFilter !== "ALL"
                    ? "No announcements match your current filters"
                    : "Create your first announcement using the Compose tab"}
                </p>
              </div>
              {(typeFilter !== "ALL" || targetFilter !== "ALL") && (
                <Button variant="outline" size="sm" onClick={() => { setTypeFilter("ALL"); setTargetFilter("ALL"); }}>
                  <X className="w-4 h-4 mr-1" /> Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <ScrollArea className="max-h-[calc(100vh-380px)]">
              <div className="space-y-3">
                {visibleAnnouncements.map((a) => (
                  <AnnouncementCard
                    key={a.id}
                    announcement={a}
                    onDismiss={handleDismiss}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        {/* ─── Compose Tab ─── */}
        <TabsContent value="compose">
          <ComposeTab onCreated={fetchAnnouncements} />
        </TabsContent>

        {/* ─── History Tab ─── */}
        <TabsContent value="history">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
