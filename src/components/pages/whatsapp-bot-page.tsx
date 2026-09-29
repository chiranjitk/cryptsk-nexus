"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare, Settings, FileText, Send, Loader2, RefreshCw, Eye, EyeOff,
  Plus, Pencil, Trash2, Megaphone, Bot, Zap, Search, Users, X,
  ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Clock,
  BarChart3, Webhook, Building2, Shield, Calendar, ImageIcon, FileUp,
  ThumbsUp, ThumbsDown, Check, Timer, TrendingUp, CheckCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────
interface WhatsAppConfig {
  apiToken: string;
  phoneNumberId: string;
  enabled: boolean;
  autoReplyEnabled: boolean;
  greetingMessage: string;
  awayMessage: string;
}

interface WhatsAppLog {
  id: string;
  from: string;
  to: string;
  subscriberName: string | null;
  message: string;
  direction: "INBOUND" | "OUTBOUND";
  status: string;
  contentType: string;
  imageUrl: string | null;
  timestamp: string;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

interface WhatsAppTemplate {
  id: string;
  name: string;
  category: string;
  content: string;
  variables: string;
  status: string;
  approvalStatus: string;
  mediaType: string;
  mediaUrl: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string;
  createdAt: string;
}

interface BotCommand {
  id: string;
  trigger: string;
  response: string;
  description: string;
  enabled: boolean;
  createdAt: string;
}

interface QuickReply {
  id: string;
  shortcut: string;
  message: string;
  category: string;
  createdAt: string;
}

interface SubscriberOption {
  id: string;
  name: string;
  phone: string;
}

interface ScheduledMessage {
  id: string;
  templateId: string | null;
  recipientId: string;
  recipientName: string;
  recipientPhone: string;
  message: string;
  mediaType: string;
  mediaUrl: string;
  scheduledAt: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
}

interface AnalyticsData {
  stats: {
    totalMessages: number;
    deliveredRate: number;
    readRate: number;
    replyRate: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  };
  volumeData: { date: string; count: number }[];
  statusDistribution: { name: string; value: number; color: string }[];
  rateLimits: {
    dailyLimit: number;
    monthlyLimit: number;
    todayUsed: number;
    monthUsed: number;
  };
}

interface WebhookConfig {
  webhookUrl: string;
  verifyToken: string;
  subscribeMessages: boolean;
  subscribeDelivery: boolean;
  subscribeAccount: boolean;
}

interface BusinessProfile {
  whatsappBusinessName: string;
  whatsappBusinessCategory: string;
  whatsappBusinessAddress: string;
  whatsappBusinessEmail: string;
  whatsappBusinessPhone: string;
  whatsappBusinessWebsite: string;
  whatsappBusinessAbout: string;
}

const TEMPLATE_CATEGORIES = ["General", "Billing", "Alert", "Marketing", "Onboarding", "Support"];
const QUICK_REPLY_CATEGORIES = ["General", "Billing", "Support", "Plans", "Outage", "Sales"];
const BUSINESS_CATEGORIES = [
  "Internet Service Provider", "Telecommunications", "Technology", "Network Services",
  "Broadband", "Fiber Optics", "Wireless Internet", "Other",
];

const KNOWN_VARIABLES = [
  { key: "{{subscriber_name}}", label: "Subscriber Name" },
  { key: "{{plan}}", label: "Plan Name" },
  { key: "{{balance}}", label: "Account Balance" },
  { key: "{{due_date}}", label: "Due Date" },
];

const STATUS_BADGE: Record<string, string> = {
  DELIVERED: "bg-green-100 text-green-700 border-green-200",
  SENT: "bg-teal-100 text-teal-700 border-teal-200",
  READ: "bg-purple-100 text-purple-700 border-purple-200",
  FAILED: "bg-red-100 text-red-700 border-red-200",
  PENDING: "bg-yellow-100 text-yellow-700 border-yellow-200",
};

const APPROVAL_BADGE: Record<string, { cls: string; label: string }> = {
  DRAFT: { cls: "bg-gray-100 text-gray-700 border-gray-200", label: "Draft" },
  PENDING: { cls: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "Pending" },
  APPROVED: { cls: "bg-green-100 text-green-700 border-green-200", label: "Approved" },
  REJECTED: { cls: "bg-red-100 text-red-700 border-red-200", label: "Rejected" },
};

function formatCountdown(dateStr: string): string {
  const now = new Date().getTime();
  const target = new Date(dateStr).getTime();
  const diff = target - now;
  if (diff <= 0) return "Overdue";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatMessageTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit",
  });
}

function formatMessageDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Message status read receipt component
function MessageStatus({ status }: { status: string }) {
  switch (status) {
    case "PENDING":
      return <span title="Pending"><Clock className="h-3 w-3 text-yellow-500" /></span>;
    case "SENT":
      return <span title="Sent"><Check className="h-3 w-3 text-gray-400" /></span>;
    case "DELIVERED":
      return <span title="Delivered"><CheckCheck className="h-3 w-3 text-gray-400" /></span>;
    case "READ":
      return <span title="Read"><CheckCheck className="h-3 w-3 text-teal-500" /></span>;
    case "FAILED":
      return <span title="Failed"><AlertTriangle className="h-3 w-3 text-red-500" /></span>;
    default:
      return null;
  }
}

// Content type badge component
function ContentTypeBadge({ contentType, imageUrl }: { contentType: string; imageUrl: string | null }) {
  if (contentType === "with_image" || imageUrl) {
    return (
      <Badge variant="outline" className="text-[9px] px-1 py-0 bg-purple-50 text-purple-600 border-purple-200 shrink-0">
        <ImageIcon className="h-2.5 w-2.5 mr-0.5" />Image
      </Badge>
    );
  }
  if (contentType === "with_button") {
    return (
      <Badge variant="outline" className="text-[9px] px-1 py-0 bg-orange-50 text-orange-600 border-orange-200 shrink-0">
        <FileUp className="h-2.5 w-2.5 mr-0.5" />Button
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[9px] px-1 py-0 bg-gray-50 text-gray-500 border-gray-200 shrink-0">
      Text
    </Badge>
  );
}

export default function WhatsAppBotPage() {
  const queryClient = useQueryClient();
  const [showToken, setShowToken] = useState(false);

  // ─── Config Tab State ─────────────────────────────────────────────
  const { data: config, isLoading: configLoading } = useQuery<WhatsAppConfig>({
    queryKey: ["whatsapp-config"],
    queryFn: () => apiFetch("/api/whatsapp/config"),
  });

  const { data: logs, isLoading: logsLoading } = useQuery<WhatsAppLog[]>({
    queryKey: ["whatsapp-logs"],
    queryFn: () => apiFetch("/api/whatsapp/logs"),
  });

  const [form, setForm] = useState<WhatsAppConfig>({
    apiToken: "", phoneNumberId: "", enabled: false, autoReplyEnabled: false, greetingMessage: "", awayMessage: "",
  });
  const [prevConfig, setPrevConfig] = useState<WhatsAppConfig | undefined>(undefined);
  if (config && config !== prevConfig) { setPrevConfig(config); setForm(config); }

  const saveMutation = useMutation({
    mutationFn: async (data: WhatsAppConfig) => apiFetch("/api/whatsapp/config", { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { toast.success("WhatsApp configuration saved!"); queryClient.invalidateQueries({ queryKey: ["whatsapp-config"] }); },
    onError: () => toast.error("Failed to save configuration"),
  });

  const handleSave = () => {
    if (form.enabled && !form.apiToken.trim()) { toast.error("API Token is required when WhatsApp Bot is enabled."); return; }
    if (form.autoReplyEnabled && !form.greetingMessage.trim()) { toast.error("Greeting Message is required when Auto-Reply is enabled."); return; }
    saveMutation.mutate(form);
  };

  // ─── Templates Tab State ─────────────────────────────────────────
  const [templateDialog, setTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null);
  const [deleteTemplate, setDeleteTemplate] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: "", name: "" });
  const [tmplForm, setTmplForm] = useState({ name: "", category: "General", content: "", status: "ACTIVE", mediaType: "TEXT", mediaUrl: "" });
  const [tmplSearch, setTmplSearch] = useState("");
  const [tmplCategoryFilter, setTmplCategoryFilter] = useState("ALL");
  const [tmplApprovalFilter, setTmplApprovalFilter] = useState("ALL");

  const { data: templates, isLoading: templatesLoading } = useQuery<WhatsAppTemplate[]>({
    queryKey: ["whatsapp-templates", tmplCategoryFilter],
    queryFn: () => apiFetch(`/api/whatsapp/templates?category=${tmplCategoryFilter}`),
  });

  const createTemplateMutation = useMutation({
    mutationFn: (body: typeof tmplForm) => apiFetch("/api/whatsapp/templates", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Template created!"); closeTemplateDialog(); queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] }); },
    onError: () => toast.error("Failed to create template"),
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, ...body }: typeof tmplForm & { id: string } | { id: string; action: string; reason?: string }) =>
      apiFetch(`/api/whatsapp/templates/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Template updated!"); closeTemplateDialog(); queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] }); },
    onError: () => toast.error("Failed to update template"),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/whatsapp/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Template deleted!"); setDeleteTemplate({ open: false, id: "", name: "" }); queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] }); },
    onError: () => toast.error("Failed to delete template"),
  });

  const openTemplateCreate = () => { setTmplForm({ name: "", category: "General", content: "", status: "ACTIVE", mediaType: "TEXT", mediaUrl: "" }); setEditingTemplate(null); setTemplateDialog(true); };
  const openTemplateEdit = (t: WhatsAppTemplate) => { setTmplForm({ name: t.name, category: t.category, content: t.content, status: t.status, mediaType: t.mediaType || "TEXT", mediaUrl: t.mediaUrl || "" }); setEditingTemplate(t); setTemplateDialog(true); };
  const closeTemplateDialog = () => { setTemplateDialog(false); setEditingTemplate(null); };

  const handleTemplateSubmit = () => {
    if (!tmplForm.name.trim() || !tmplForm.content.trim()) { toast.error("Name and content are required"); return; }
    if (editingTemplate) updateTemplateMutation.mutate({ id: editingTemplate.id, ...tmplForm });
    else createTemplateMutation.mutate(tmplForm);
  };

  const handleSubmitForApproval = (t: WhatsAppTemplate) => {
    updateTemplateMutation.mutate({ id: t.id, action: "submit_for_approval" } as any, {
      onSuccess: () => toast.success("Template submitted for approval!"),
    });
  };

  const handleApproveTemplate = (t: WhatsAppTemplate) => {
    updateTemplateMutation.mutate({ id: t.id, action: "approve" } as any, {
      onSuccess: () => toast.success("Template approved!"),
    });
  };

  const handleRejectTemplate = (t: WhatsAppTemplate) => {
    updateTemplateMutation.mutate({ id: t.id, action: "reject", reason: "Rejected by admin" } as any, {
      onSuccess: () => toast.success("Template rejected"),
    });
  };

  const insertVariable = (variable: string) => {
    setTmplForm(prev => ({ ...prev, content: prev.content + variable }));
  };

  const getFilteredTemplates = () => {
    if (!templates) return [];
    let result = templates;
    if (tmplSearch) {
      const s = tmplSearch.toLowerCase();
      result = result.filter(t => t.name.toLowerCase().includes(s) || t.content.toLowerCase().includes(s));
    }
    if (tmplApprovalFilter !== "ALL") {
      result = result.filter(t => t.approvalStatus === tmplApprovalFilter);
    }
    return result;
  };

  const renderTemplateVariables = (content: string) => {
    const parts = content.split(/(\{\{\w+\}\})/g);
    return parts.map((part, i) => {
      if (/^\{\{\w+\}\}$/.test(part)) {
        return <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 text-xs font-mono mx-0.5">{part}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  // ─── Broadcast Tab State ─────────────────────────────────────────
  const [broadcastDialog, setBroadcastDialog] = useState(false);
  const [broadcastSearch, setBroadcastSearch] = useState("");
  const [broadcastSelected, setBroadcastSelected] = useState<Set<string>>(new Set());
  const [broadcastTemplateId, setBroadcastTemplateId] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastSearchRef, setBroadcastSearchRef] = useState<HTMLDivElement | null>(null);
  const [broadcastMediaType, setBroadcastMediaType] = useState("TEXT");
  const [broadcastMediaUrl, setBroadcastMediaUrl] = useState("");

  const { data: broadcastSubscribers } = useQuery<SubscriberOption[]>({
    queryKey: ["broadcast-subscribers", broadcastSearch],
    queryFn: async () => {
      if (!broadcastSearch || broadcastSearch.length < 2) return [];
      const data = await apiFetch<{ subscribers?: SubscriberOption[]; items?: SubscriberOption[] }>(`/api/subscribers?search=${encodeURIComponent(broadcastSearch)}&limit=20`);
      return data.subscribers || data.items || [];
    },
    enabled: broadcastDialog && broadcastSearch.length >= 2,
  });

  const broadcastMutation = useMutation({
    mutationFn: (body: { templateId: string; recipientIds: string[]; message: string }) => apiFetch("/api/whatsapp/broadcast", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => { toast.success(data.message || "Broadcast queued!"); setBroadcastDialog(false); resetBroadcast(); },
    onError: () => toast.error("Failed to queue broadcast"),
  });

  const resetBroadcast = () => {
    setBroadcastSelected(new Set()); setBroadcastTemplateId(""); setBroadcastMessage(""); setBroadcastSearch(""); setBroadcastMediaType("TEXT"); setBroadcastMediaUrl("");
  };

  const handleBroadcast = () => {
    if (broadcastSelected.size === 0) { toast.error("Select at least one recipient"); return; }
    if (!broadcastTemplateId && !broadcastMessage.trim()) { toast.error("Select a template or write a message"); return; }
    broadcastMutation.mutate({
      templateId: broadcastTemplateId,
      recipientIds: Array.from(broadcastSelected),
      message: broadcastMessage,
    });
  };

  // ─── Bot Commands Tab State ──────────────────────────────────────
  const [cmdDialog, setCmdDialog] = useState(false);
  const [editingCmd, setEditingCmd] = useState<BotCommand | null>(null);
  const [cmdForm, setCmdForm] = useState({ trigger: "", response: "", description: "", enabled: true });

  const { data: botCommands, isLoading: cmdsLoading } = useQuery<BotCommand[]>({
    queryKey: ["whatsapp-commands"],
    queryFn: () => apiFetch("/api/whatsapp/commands"),
  });

  const createCmdMutation = useMutation({
    mutationFn: (body: typeof cmdForm) => apiFetch("/api/whatsapp/commands", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Command created!"); closeCmdDialog(); queryClient.invalidateQueries({ queryKey: ["whatsapp-commands"] }); },
    onError: (err) => toast.error(err.message || "Failed to create command"),
  });

  const updateCmdMutation = useMutation({
    mutationFn: ({ id, ...body }: typeof cmdForm & { id: string }) => apiFetch(`/api/whatsapp/commands/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Command updated!"); closeCmdDialog(); queryClient.invalidateQueries({ queryKey: ["whatsapp-commands"] }); },
    onError: () => toast.error("Failed to update command"),
  });

  const deleteCmdMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/whatsapp/commands/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Command deleted!"); queryClient.invalidateQueries({ queryKey: ["whatsapp-commands"] }); },
    onError: () => toast.error("Failed to delete command"),
  });

  const openCmdCreate = () => { setCmdForm({ trigger: "", response: "", description: "", enabled: true }); setEditingCmd(null); setCmdDialog(true); };
  const openCmdEdit = (c: BotCommand) => { setCmdForm({ trigger: c.trigger, response: c.response, description: c.description, enabled: c.enabled }); setEditingCmd(c); setCmdDialog(true); };
  const closeCmdDialog = () => { setCmdDialog(false); setEditingCmd(null); };

  const handleCmdSubmit = () => {
    if (!cmdForm.trigger.trim() || !cmdForm.response.trim()) { toast.error("Trigger and response are required"); return; }
    if (editingCmd) updateCmdMutation.mutate({ id: editingCmd.id, ...cmdForm });
    else createCmdMutation.mutate(cmdForm);
  };

  const toggleCmdEnabled = (cmd: BotCommand) => {
    updateCmdMutation.mutate({ ...cmd, enabled: !cmd.enabled });
  };

  // ─── Quick Replies Tab State ─────────────────────────────────────
  const [qrDialog, setQrDialog] = useState(false);
  const [editingQr, setEditingQr] = useState<QuickReply | null>(null);
  const [qrForm, setQrForm] = useState({ shortcut: "", message: "", category: "General" });
  const [qrSearch, setQrSearch] = useState("");
  const [qrCategoryFilter, setQrCategoryFilter] = useState("ALL");

  const { data: quickReplies, isLoading: qrLoading } = useQuery<QuickReply[]>({
    queryKey: ["whatsapp-quick-replies", qrCategoryFilter],
    queryFn: () => apiFetch(`/api/whatsapp/quick-replies?category=${qrCategoryFilter}`),
  });

  const createQrMutation = useMutation({
    mutationFn: (body: typeof qrForm) => apiFetch("/api/whatsapp/quick-replies", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Quick reply created!"); closeQrDialog(); queryClient.invalidateQueries({ queryKey: ["whatsapp-quick-replies"] }); },
    onError: (err) => toast.error(err.message || "Failed to create quick reply"),
  });

  const updateQrMutation = useMutation({
    mutationFn: ({ id, ...body }: typeof qrForm & { id: string }) => apiFetch(`/api/whatsapp/quick-replies/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Quick reply updated!"); closeQrDialog(); queryClient.invalidateQueries({ queryKey: ["whatsapp-quick-replies"] }); },
    onError: () => toast.error("Failed to update quick reply"),
  });

  const deleteQrMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/whatsapp/quick-replies/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Quick reply deleted!"); queryClient.invalidateQueries({ queryKey: ["whatsapp-quick-replies"] }); },
    onError: () => toast.error("Failed to delete quick reply"),
  });

  const openQrCreate = () => { setQrForm({ shortcut: "", message: "", category: "General" }); setEditingQr(null); setQrDialog(true); };
  const openQrEdit = (q: QuickReply) => { setQrForm({ shortcut: q.shortcut, message: q.message, category: q.category }); setEditingQr(q); setQrDialog(true); };
  const closeQrDialog = () => { setQrDialog(false); setEditingQr(null); };

  const handleQrSubmit = () => {
    if (!qrForm.shortcut.trim() || !qrForm.message.trim()) { toast.error("Shortcut and message are required"); return; }
    if (editingQr) updateQrMutation.mutate({ id: editingQr.id, ...qrForm });
    else createQrMutation.mutate(qrForm);
  };

  const getFilteredQuickReplies = () => {
    if (!quickReplies) return [];
    if (!qrSearch) return quickReplies;
    const s = qrSearch.toLowerCase();
    return quickReplies.filter(q => q.shortcut.toLowerCase().includes(s) || q.message.toLowerCase().includes(s));
  };

  // ─── Schedule Tab State ──────────────────────────────────────────
  const [scheduleDialog, setScheduleDialog] = useState(false);
  const [schedSearch, setSchedSearch] = useState("");
  const [schedSelected, setSchedSelected] = useState<SubscriberOption | null>(null);
  const [schedForm, setSchedForm] = useState({ message: "", templateId: "", mediaType: "TEXT", mediaUrl: "", scheduledAt: "" });

  const { data: scheduledMessages } = useQuery<ScheduledMessage[]>({
    queryKey: ["whatsapp-scheduled"],
    queryFn: () => apiFetch("/api/whatsapp/schedule"),
    refetchInterval: 60000,
  });

  const { data: schedSubscribers } = useQuery<SubscriberOption[]>({
    queryKey: ["sched-subscribers", schedSearch],
    queryFn: async () => {
      if (!schedSearch || schedSearch.length < 2) return [];
      const data = await apiFetch<{ subscribers?: SubscriberOption[]; items?: SubscriberOption[] }>(`/api/subscribers?search=${encodeURIComponent(schedSearch)}&limit=10`);
      return data.subscribers || data.items || [];
    },
    enabled: scheduleDialog && schedSearch.length >= 2,
  });

  const scheduleMutation = useMutation({
    mutationFn: (body: typeof schedForm & { recipientId: string; recipientName: string; recipientPhone: string }) =>
      apiFetch("/api/whatsapp/schedule", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Message scheduled!"); setScheduleDialog(false); resetSchedule(); queryClient.invalidateQueries({ queryKey: ["whatsapp-scheduled"] }); },
    onError: () => toast.error("Failed to schedule message"),
  });

  const cancelScheduleMutation = useMutation({
    mutationFn: (id: string) => apiFetch("/api/whatsapp/schedule", { method: "PUT", body: JSON.stringify({ id, action: "cancel" }) }),
    onSuccess: () => { toast.success("Scheduled message cancelled"); queryClient.invalidateQueries({ queryKey: ["whatsapp-scheduled"] }); },
    onError: () => toast.error("Failed to cancel"),
  });

  const sendNowMutation = useMutation({
    mutationFn: (id: string) => apiFetch("/api/whatsapp/schedule", { method: "PUT", body: JSON.stringify({ id, action: "send_now" }) }),
    onSuccess: () => { toast.success("Message sent!"); queryClient.invalidateQueries({ queryKey: ["whatsapp-scheduled"] }); },
    onError: () => toast.error("Failed to send"),
  });

  const resetSchedule = () => {
    setSchedSelected(null); setSchedSearch(""); setSchedForm({ message: "", templateId: "", mediaType: "TEXT", mediaUrl: "", scheduledAt: "" });
  };

  const handleSchedule = () => {
    if (!schedSelected || !schedForm.message.trim() || !schedForm.scheduledAt) {
      toast.error("Recipient, message, and schedule time are required");
      return;
    }
    scheduleMutation.mutate({
      ...schedForm,
      recipientId: schedSelected.id,
      recipientName: schedSelected.name,
      recipientPhone: schedSelected.phone,
    });
  };

  // ─── Conversations Tab State ─────────────────────────────────────
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [convoMessage, setConvoMessage] = useState("");
  const [convoSearch, setConvoSearch] = useState("");
  const [showQuickReplyPicker, setShowQuickReplyPicker] = useState(false);

  // Fetch thread messages for selected conversation from the dedicated API
  const { data: convoMessages, isLoading: convoLoading } = useQuery<WhatsAppLog[]>({
    queryKey: ["whatsapp-convo-messages", selectedConversation],
    queryFn: () => apiFetch(`/api/whatsapp/conversations?contact=${encodeURIComponent(selectedConversation!)}`),
    enabled: !!selectedConversation,
    refetchInterval: 15000,
  });

  const sendConvoMutation = useMutation({
    mutationFn: (body: { to: string; message: string }) => apiFetch("/api/whatsapp/conversations", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setConvoMessage("");
      toast.success("Message sent!");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-logs"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-convo-messages", selectedConversation] });
    },
    onError: () => toast.error("Failed to send message"),
  });

  const handleConvoSend = () => {
    if (!convoMessage.trim() || !selectedConversation) return;
    sendConvoMutation.mutate({ to: selectedConversation, message: convoMessage });
  };

  const handleQuickReplyInsert = (message: string) => {
    setConvoMessage(message);
    setShowQuickReplyPicker(false);
  };

  // ─── Analytics Tab State ─────────────────────────────────────────
  const { data: analytics } = useQuery<AnalyticsData>({
    queryKey: ["whatsapp-analytics"],
    queryFn: () => apiFetch("/api/whatsapp/analytics"),
    staleTime: 30000,
  });

  // ─── Business Profile Tab State ──────────────────────────────────
  const [bizForm, setBizForm] = useState<BusinessProfile>({
    whatsappBusinessName: "", whatsappBusinessCategory: "", whatsappBusinessAddress: "",
    whatsappBusinessEmail: "", whatsappBusinessPhone: "", whatsappBusinessWebsite: "", whatsappBusinessAbout: "",
  });
  const [prevBiz, setPrevBiz] = useState<BusinessProfile | undefined>(undefined);

  useQuery<BusinessProfile>({
    queryKey: ["whatsapp-business-profile"],
    queryFn: async () => {
      const settings = await apiFetch<any>("/api/whatsapp/config");
      const profile: BusinessProfile = {
        whatsappBusinessName: settings.businessName || "",
        whatsappBusinessCategory: settings.businessCategory || "",
        whatsappBusinessAddress: settings.businessAddress || "",
        whatsappBusinessEmail: settings.businessEmail || "",
        whatsappBusinessPhone: settings.businessPhone || "",
        whatsappBusinessWebsite: settings.businessWebsite || "",
        whatsappBusinessAbout: settings.businessAbout || "",
      };
      if (JSON.stringify(profile) !== JSON.stringify(prevBiz)) {
        setPrevBiz(profile);
        setBizForm(profile);
      }
      return profile;
    },
  });

  const saveBizMutation = useMutation({
    mutationFn: (data: BusinessProfile) => apiFetch("/api/whatsapp/config", { method: "PUT", body: JSON.stringify({ ...data }) }),
    onSuccess: () => { toast.success("Business profile saved!"); queryClient.invalidateQueries({ queryKey: ["whatsapp-business-profile"] }); },
    onError: () => toast.error("Failed to save business profile"),
  });

  // ─── Webhooks Tab State ──────────────────────────────────────────
  const { data: webhookConfig, isLoading: webhookLoading } = useQuery<WebhookConfig>({
    queryKey: ["whatsapp-webhooks"],
    queryFn: () => apiFetch("/api/whatsapp/webhooks"),
  });

  const [webhookForm, setWebhookForm] = useState<WebhookConfig>({
    webhookUrl: "", verifyToken: "", subscribeMessages: true, subscribeDelivery: true, subscribeAccount: false,
  });
  const [prevWebhook, setPrevWebhook] = useState<WebhookConfig | undefined>(undefined);
  if (webhookConfig && webhookConfig !== prevWebhook) { setPrevWebhook(webhookConfig); setWebhookForm(webhookConfig); }

  const saveWebhookMutation = useMutation({
    mutationFn: (data: WebhookConfig) => apiFetch("/api/whatsapp/webhooks", { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { toast.success("Webhook configuration saved!"); queryClient.invalidateQueries({ queryKey: ["whatsapp-webhooks"] }); },
    onError: () => toast.error("Failed to save webhook config"),
  });

  const testWebhookMutation = useMutation({
    mutationFn: (data: WebhookConfig) => apiFetch("/api/whatsapp/webhooks", { method: "PUT", body: JSON.stringify({ ...data, action: "test" }) }),
    onSuccess: (data: any) => { toast.success(data.message || "Test webhook sent!"); },
    onError: (err) => toast.error(err.message || "Test failed"),
  });

  // ══════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">WhatsApp Bot</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configure WhatsApp Business API, templates, and auto-reply rules.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setScheduleDialog(true)}>
            <Calendar className="h-3.5 w-3.5" /> Schedule
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setBroadcastDialog(true)}>
            <Megaphone className="h-3.5 w-3.5" /> Broadcast
          </Button>
        </div>
      </div>

      <Tabs defaultValue="config" className="space-y-4">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="config"><Settings className="h-3.5 w-3.5 mr-1" />Config</TabsTrigger>
          <TabsTrigger value="templates"><FileText className="h-3.5 w-3.5 mr-1" />Templates</TabsTrigger>
          <TabsTrigger value="commands"><Bot className="h-3.5 w-3.5 mr-1" />Commands</TabsTrigger>
          <TabsTrigger value="quick-replies"><Zap className="h-3.5 w-3.5 mr-1" />Quick Replies</TabsTrigger>
          <TabsTrigger value="conversations"><MessageSquare className="h-3.5 w-3.5 mr-1" />Conversations</TabsTrigger>
          <TabsTrigger value="schedule"><Calendar className="h-3.5 w-3.5 mr-1" />Schedule</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="h-3.5 w-3.5 mr-1" />Analytics</TabsTrigger>
          <TabsTrigger value="business"><Building2 className="h-3.5 w-3.5 mr-1" />Business</TabsTrigger>
          <TabsTrigger value="webhooks"><Webhook className="h-3.5 w-3.5 mr-1" />Webhooks</TabsTrigger>
          <TabsTrigger value="logs"><MessageSquare className="h-3.5 w-3.5 mr-1" />Logs</TabsTrigger>
        </TabsList>

        {/* ═══ Config Tab ═══ */}
        <TabsContent value="config">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Settings className="h-4 w-4 text-green-600" />WhatsApp Business Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {configLoading ? (
                <div className="space-y-4"><Skeleton className="skeleton-wave h-10" /><Skeleton className="skeleton-wave h-10" /><Skeleton className="skeleton-wave h-20" /></div>
              ) : (
                <>
                  {/* ─── Rate Limits Display ─── */}
                  {analytics && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-lg border space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium"><Shield className="h-4 w-4 text-orange-600" />Daily Rate Limit</div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{analytics.rateLimits.todayUsed.toLocaleString()} / {analytics.rateLimits.dailyLimit.toLocaleString()}</span>
                            <span>{Math.round((analytics.rateLimits.todayUsed / analytics.rateLimits.dailyLimit) * 100)}%</span>
                          </div>
                          <Progress value={(analytics.rateLimits.todayUsed / analytics.rateLimits.dailyLimit) * 100} className="h-2" />
                        </div>
                      </div>
                      <div className="p-4 rounded-lg border space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium"><Shield className="h-4 w-4 text-orange-600" />Monthly Rate Limit</div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{analytics.rateLimits.monthUsed.toLocaleString()} / {analytics.rateLimits.monthlyLimit.toLocaleString()}</span>
                            <span>{Math.round((analytics.rateLimits.monthUsed / analytics.rateLimits.monthlyLimit) * 100)}%</span>
                          </div>
                          <Progress value={(analytics.rateLimits.monthUsed / analytics.rateLimits.monthlyLimit) * 100} className="h-2" />
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">API Token</Label>
                      <div className="relative">
                        <Input type={showToken ? "text" : "password"} value={form.apiToken} onChange={(e) => setForm({ ...form, apiToken: e.target.value })} placeholder="EAAGm0PX4ZCps..." className="pr-10" />
                        <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowToken(!showToken)}>
                          {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Phone Number ID</Label>
                      <Input value={form.phoneNumberId} onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })} placeholder="100234567890" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div><p className="text-sm font-medium">Enable WhatsApp Bot</p><p className="text-xs text-muted-foreground">Allow the bot to send and receive messages</p></div>
                    <Switch checked={form.enabled} onCheckedChange={(checked) => setForm({ ...form, enabled: checked })} />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div><p className="text-sm font-medium">Auto-Reply</p><p className="text-xs text-muted-foreground">Automatically reply to common queries</p></div>
                    <Switch checked={form.autoReplyEnabled} onCheckedChange={(checked) => setForm({ ...form, autoReplyEnabled: checked })} />
                  </div>
                  {form.autoReplyEnabled && (
                    <>
                      <div className="space-y-1.5"><Label className="text-xs">Greeting Message</Label><Textarea value={form.greetingMessage} onChange={(e) => setForm({ ...form, greetingMessage: e.target.value })} placeholder="Hello! Welcome to Cryptsk ISP." rows={3} /></div>
                      <div className="space-y-1.5"><Label className="text-xs">Away Message</Label><Textarea value={form.awayMessage} onChange={(e) => setForm({ ...form, awayMessage: e.target.value })} placeholder="We are currently unavailable." rows={3} /></div>
                    </>
                  )}
                  <div className="flex justify-end">
                    <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={saveMutation.isPending} onClick={handleSave}>
                      {saveMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving...</> : "Save Configuration"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Templates Tab ═══ */}
        <TabsContent value="templates">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-teal-600" />Message Templates <Badge variant="outline" className="text-xs">{getFilteredTemplates().length}</Badge>
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Search..." value={tmplSearch} onChange={(e) => setTmplSearch(e.target.value)} className="pl-8 h-8 text-xs w-[140px]" /></div>
                  <Select value={tmplCategoryFilter} onValueChange={setTmplCategoryFilter}>
                    <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent><SelectItem value="ALL">All</SelectItem>{TEMPLATE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={tmplApprovalFilter} onValueChange={setTmplApprovalFilter}>
                    <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Status</SelectItem>
                      <SelectItem value="DRAFT">Draft</SelectItem>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="APPROVED">Approved</SelectItem>
                      <SelectItem value="REJECTED">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button className="bg-red-600 hover:bg-red-700 text-white gap-1.5" size="sm" onClick={openTemplateCreate}><Plus className="h-3.5 w-3.5" /> New</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {templatesLoading ? (
                <div className="space-y-3"><Skeleton className="skeleton-wave h-16" /><Skeleton className="skeleton-wave h-16" /><Skeleton className="skeleton-wave h-16" /></div>
              ) : getFilteredTemplates().length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No templates found. Create one to get started.</p>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {getFilteredTemplates().map((t) => {
                    const approval = APPROVAL_BADGE[t.approvalStatus] || APPROVAL_BADGE.DRAFT;
                    return (
                      <div key={t.id} className="p-4 rounded-lg border hover:bg-muted/30 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold">{t.name}</p>
                            <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
                            <Badge variant="outline" className={`text-[10px] ${approval.cls}`}>{approval.label}</Badge>
                            {t.mediaType === "IMAGE" && <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-600 border-purple-200"><ImageIcon className="h-2.5 w-2.5 mr-0.5" />Image</Badge>}
                            {t.mediaType === "DOCUMENT" && <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-600 border-orange-200"><FileUp className="h-2.5 w-2.5 mr-0.5" />Doc</Badge>}
                          </div>
                          <div className="flex gap-1">
                            {t.approvalStatus === "DRAFT" && (
                              <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1 text-yellow-600" onClick={() => handleSubmitForApproval(t)}><CheckCircle2 className="h-3 w-3" />Submit</Button>
                            )}
                            {t.approvalStatus === "PENDING" && (
                              <>
                                <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1 text-green-600" onClick={() => handleApproveTemplate(t)}><ThumbsUp className="h-3 w-3" />Approve</Button>
                                <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1 text-red-600" onClick={() => handleRejectTemplate(t)}><ThumbsDown className="h-3 w-3" />Reject</Button>
                              </>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openTemplateEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => setDeleteTemplate({ open: true, id: t.id, name: t.name })}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">{renderTemplateVariables(t.content)}</p>
                        {t.approvalStatus === "REJECTED" && t.rejectionReason && (
                          <p className="text-xs text-red-600 mt-1"><AlertTriangle className="h-3 w-3 inline mr-1" />Rejection: {t.rejectionReason}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Bot Commands Tab ═══ */}
        <TabsContent value="commands">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2"><Bot className="h-4 w-4 text-purple-600" />Bot Commands <Badge variant="outline" className="text-xs">{botCommands?.length || 0}</Badge></CardTitle>
                <Button className="bg-red-600 hover:bg-red-700 text-white gap-1.5" size="sm" onClick={openCmdCreate}><Plus className="h-3.5 w-3.5" /> New Command</Button>
              </div>
            </CardHeader>
            <CardContent>
              {cmdsLoading ? (<div className="space-y-3"><Skeleton className="skeleton-wave h-14" /><Skeleton className="skeleton-wave h-14" /></div>) :
              !botCommands || botCommands.length === 0 ? (<p className="text-sm text-muted-foreground text-center py-8">No bot commands configured.</p>) : (
                <Table><TableHeader><TableRow>
                  <TableHead className="text-xs">Trigger</TableHead><TableHead className="text-xs">Response</TableHead><TableHead className="text-xs">Description</TableHead><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow></TableHeader><TableBody>
                  {botCommands.map((cmd) => (
                    <TableRow key={cmd.id}>
                      <TableCell><Badge variant="outline" className="text-xs font-mono">{cmd.trigger}</Badge></TableCell>
                      <TableCell className="text-sm max-w-[250px] truncate">{cmd.response}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{cmd.description || "—"}</TableCell>
                      <TableCell><Switch checked={cmd.enabled} onCheckedChange={() => toggleCmdEnabled(cmd)} className="scale-75" /></TableCell>
                      <TableCell><div className="flex gap-1 justify-end"><Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openCmdEdit(cmd)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => deleteCmdMutation.mutate(cmd.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div></TableCell>
                    </TableRow>
                  ))}
                </TableBody></Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Quick Replies Tab ═══ */}
        <TabsContent value="quick-replies">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2"><Zap className="h-4 w-4 text-yellow-600" />Quick Replies <Badge variant="outline" className="text-xs">{getFilteredQuickReplies().length}</Badge></CardTitle>
                <div className="flex gap-2">
                  <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Search..." value={qrSearch} onChange={(e) => setQrSearch(e.target.value)} className="pl-8 h-8 text-xs w-[140px]" /></div>
                  <Select value={qrCategoryFilter} onValueChange={setQrCategoryFilter}>
                    <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent><SelectItem value="ALL">All</SelectItem>{QUICK_REPLY_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button className="bg-red-600 hover:bg-red-700 text-white gap-1.5" size="sm" onClick={openQrCreate}><Plus className="h-3.5 w-3.5" /> New</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {qrLoading ? (<div className="space-y-3"><Skeleton className="skeleton-wave h-12" /><Skeleton className="skeleton-wave h-12" /></div>) :
              getFilteredQuickReplies().length === 0 ? (<p className="text-sm text-muted-foreground text-center py-8">No quick replies found.</p>) : (
                <Table><TableHeader><TableRow>
                  <TableHead className="text-xs">Shortcut</TableHead><TableHead className="text-xs">Message</TableHead><TableHead className="text-xs">Category</TableHead><TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow></TableHeader><TableBody>
                  {getFilteredQuickReplies().map((qr) => (
                    <TableRow key={qr.id}>
                      <TableCell><Badge variant="outline" className="text-xs font-mono">{qr.shortcut}</Badge></TableCell>
                      <TableCell className="text-sm max-w-[300px] truncate">{qr.message}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{qr.category}</Badge></TableCell>
                      <TableCell><div className="flex gap-1 justify-end"><Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openQrEdit(qr)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => deleteQrMutation.mutate(qr.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div></TableCell>
                    </TableRow>
                  ))}
                </TableBody></Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Conversations Tab ═══ */}
        <TabsContent value="conversations">
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="flex h-[560px]">
                {/* Contact list */}
                <div className="w-72 border-r flex flex-col shrink-0">
                  <div className="p-3 border-b">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search contacts or messages..."
                        value={convoSearch}
                        onChange={(e) => setConvoSearch(e.target.value)}
                        className="h-8 text-xs pl-8 pr-8"
                      />
                      {convoSearch && (
                        <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setConvoSearch("")}>
                          <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {logsLoading ? (
                      <div className="space-y-3 p-3">
                        <Skeleton className="skeleton-wave h-14 w-full" />
                        <Skeleton className="skeleton-wave h-14 w-full" />
                        <Skeleton className="skeleton-wave h-14 w-full" />
                      </div>
                    ) : (!logs || logs.length === 0) ? (
                      <div className="flex flex-col items-center justify-center py-12 px-4">
                        <MessageSquare className="h-8 w-8 text-muted-foreground/40 mb-2" />
                        <p className="text-xs text-muted-foreground text-center">No conversations yet.</p>
                        <p className="text-[10px] text-muted-foreground text-center mt-1">Messages will appear here once you start chatting.</p>
                      </div>
                    ) : (() => {
                      const contacts = new Map<string, { phone: string; name: string | null; lastMsg: string; time: string; direction: string; status: string }>();
                      for (const log of logs) {
                        const phone = log.direction === "INBOUND" ? log.from : log.to;
                        if (!contacts.has(phone) || new Date(log.timestamp) > new Date(contacts.get(phone)!.time)) {
                          contacts.set(phone, { phone, name: log.subscriberName, lastMsg: log.message, time: log.timestamp, direction: log.direction, status: log.status });
                        }
                      }
                      let contactList = Array.from(contacts.values()).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
                      if (convoSearch) {
                        const s = convoSearch.toLowerCase();
                        contactList = contactList.filter(c =>
                          c.phone.toLowerCase().includes(s) ||
                          (c.name && c.name.toLowerCase().includes(s)) ||
                          c.lastMsg.toLowerCase().includes(s)
                        );
                      }
                      if (contactList.length === 0) {
                        return (
                          <div className="flex flex-col items-center justify-center py-12 px-4">
                            <Search className="h-6 w-6 text-muted-foreground/40 mb-2" />
                            <p className="text-xs text-muted-foreground text-center">No contacts match your search.</p>
                          </div>
                        );
                      }
                      return contactList.map((c) => (
                        <button
                          key={c.phone}
                          className={`w-full text-left px-3 py-3 border-b hover:bg-muted/50 transition-colors ${selectedConversation === c.phone ? "bg-red-50 border-l-2 border-l-red-600" : ""}`}
                          onClick={() => setSelectedConversation(c.phone)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                                <Users className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{c.name || c.phone}</p>
                                <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                                  {c.lastMsg.length > 35 ? c.lastMsg.slice(0, 35) + "…" : c.lastMsg}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                              <span className="text-[10px] text-muted-foreground">{formatMessageTime(c.time)}</span>
                              {c.direction === "OUTBOUND" && <MessageStatus status={c.status} />}
                            </div>
                          </div>
                        </button>
                      ));
                    })()}
                  </div>
                </div>
                {/* Message thread */}
                <div className="flex-1 flex flex-col min-w-0">
                  {selectedConversation ? (
                    <>
                      <div className="p-3 border-b flex items-center gap-2 bg-muted/20">
                        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs shrink-0">
                          <Users className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{selectedConversation}</p>
                          <p className="text-[10px] text-muted-foreground">WhatsApp Contact</p>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-gradient-to-b from-muted/30 to-background">
                        {convoLoading ? (
                          <div className="space-y-3">
                            <Skeleton className="skeleton-wave h-12 w-[60%] ml-auto" />
                            <Skeleton className="skeleton-wave h-14 w-[65%]" />
                            <Skeleton className="skeleton-wave h-10 w-[50%] ml-auto" />
                          </div>
                        ) : convoMessages && convoMessages.length === 0 ? (
                          <div className="flex items-center justify-center h-full">
                            <p className="text-xs text-muted-foreground">No messages with this contact yet.</p>
                          </div>
                        ) : (
                          convoMessages?.map((l, idx, arr) => {
                            // Show date separator when date changes
                            const showDate = idx === 0 || formatMessageDate(l.timestamp) !== formatMessageDate(arr[idx - 1].timestamp);
                            return (
                              <React.Fragment key={l.id}>
                                {showDate && (
                                  <div className="flex items-center justify-center py-2">
                                    <span className="text-[10px] text-muted-foreground bg-muted/80 px-3 py-1 rounded-full">
                                      {formatMessageDate(l.timestamp)}
                                    </span>
                                  </div>
                                )}
                                <div className={`flex ${l.direction === "OUTBOUND" ? "justify-end" : "justify-start"} group`}>
                                  <div className={`max-w-[75%] rounded-xl px-3.5 py-2 text-sm shadow-sm ${l.direction === "OUTBOUND" ? "bg-red-600 text-white rounded-br-sm" : "bg-white border rounded-bl-sm"}`}>
                                    <div className="flex items-start gap-2">
                                      {l.direction === "OUTBOUND" && (
                                        <ContentTypeBadge contentType={l.contentType} imageUrl={l.imageUrl} />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <p className="break-words whitespace-pre-wrap">{l.message}</p>
                                        {(l.imageUrl) && (
                                          <div className="mt-1.5 rounded overflow-hidden border border-white/20">
                                            <img src={l.imageUrl} alt="Shared media" className="max-w-full max-h-40 object-cover" />
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className={`flex items-center justify-end gap-1.5 mt-1.5 ${l.direction === "OUTBOUND" ? "text-red-200" : "text-muted-foreground"}`}>
                                      <span className="text-[10px]">
                                        {formatMessageTime(l.timestamp)}
                                      </span>
                                      {l.direction === "OUTBOUND" && <MessageStatus status={l.status} />}
                                      {l.status === "FAILED" && (
                                        <span className="text-[9px] text-red-300 italic">failed</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </React.Fragment>
                            );
                          })
                        )}
                      </div>
                      {/* Quick reply picker */}
                      {showQuickReplyPicker && quickReplies && quickReplies.length > 0 && (
                        <div className="border-t p-2 bg-muted/30 max-h-36 overflow-y-auto">
                          <div className="flex items-center gap-1.5 mb-1.5 px-1">
                            <Zap className="h-3 w-3 text-orange-500" />
                            <span className="text-[10px] font-medium text-muted-foreground">Quick Replies</span>
                            <button className="ml-auto" onClick={() => setShowQuickReplyPicker(false)}>
                              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {quickReplies.slice(0, 12).map((q) => (
                              <button
                                key={q.id}
                                className="text-[10px] px-2 py-1 rounded-full border bg-background hover:bg-muted transition-colors truncate max-w-[180px]"
                                title={`${q.shortcut}: ${q.message}`}
                                onClick={() => handleQuickReplyInsert(q.message)}
                              >
                                <span className="font-medium text-orange-600">{q.shortcut}</span>
                                <span className="text-muted-foreground ml-1 truncate">{q.message.slice(0, 30)}{q.message.length > 30 ? "…" : ""}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="p-3 border-t flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 h-9 w-9 p-0 text-muted-foreground hover:text-orange-600"
                          onClick={() => setShowQuickReplyPicker(!showQuickReplyPicker)}
                          title="Quick Replies"
                        >
                          <Zap className="h-4 w-4" />
                        </Button>
                        <Input
                          value={convoMessage}
                          onChange={(e) => setConvoMessage(e.target.value)}
                          placeholder="Type a message..."
                          className="text-sm flex-1"
                          disabled={sendConvoMutation.isPending}
                          onKeyDown={(e) => { if (e.key === "Enter" && convoMessage.trim()) handleConvoSend(); }}
                        />
                        <Button
                          className="bg-red-600 hover:bg-red-700 text-white shrink-0"
                          size="sm"
                          disabled={sendConvoMutation.isPending || !convoMessage.trim()}
                          onClick={handleConvoSend}
                        >
                          {sendConvoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                      <MessageSquare className="h-12 w-12 mb-3 text-muted-foreground/30" />
                      <p className="text-sm font-medium">Select a conversation</p>
                      <p className="text-xs mt-1">Choose a contact from the list to view messages</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Schedule Tab ═══ */}
        <TabsContent value="schedule">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2"><Calendar className="h-4 w-4 text-orange-600" />Scheduled Messages <Badge variant="outline" className="text-xs">{scheduledMessages?.filter(m => m.status === "PENDING").length || 0} pending</Badge></CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => queryClient.invalidateQueries({ queryKey: ["whatsapp-scheduled"] })}><RefreshCw className="h-3 w-3" />Refresh</Button>
                  <Button className="bg-red-600 hover:bg-red-700 text-white gap-1.5" size="sm" onClick={() => setScheduleDialog(true)}><Plus className="h-3.5 w-3.5" />Schedule New</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!scheduledMessages || scheduledMessages.length === 0 ? (
                <div className="text-center py-10">
                  <Calendar className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No scheduled messages yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">Click "Schedule New" to create one.</p>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto space-y-2">
                  {scheduledMessages.map((m) => (
                    <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium truncate">{m.recipientName || m.recipientPhone}</p>
                          <Badge variant="outline" className={`text-[10px] ${m.status === "PENDING" ? "bg-yellow-50 text-yellow-700 border-yellow-200" : m.status === "SENT" ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-600 border-gray-200"}`}>{m.status}</Badge>
                          {m.mediaType !== "TEXT" && <Badge variant="outline" className="text-[10px]">{m.mediaType}</Badge>}
                          {m.templateId && <Badge variant="outline" className="text-[10px] bg-teal-50 text-teal-600 border-teal-200">Template</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{m.message}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Timer className="h-2.5 w-2.5" />
                          {m.status === "PENDING" ? `Sends in ${formatCountdown(m.scheduledAt)} — ${formatDate(m.scheduledAt)}` : `Sent ${m.sentAt ? formatDate(m.sentAt) : ""}`}
                        </p>
                      </div>
                      <div className="flex gap-1 ml-2">
                        {m.status === "PENDING" && (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1 text-teal-600" onClick={() => sendNowMutation.mutate(m.id)}><Send className="h-3 w-3" />Now</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1 text-red-600" onClick={() => cancelScheduleMutation.mutate(m.id)}><X className="h-3 w-3" />Cancel</Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Analytics Tab ═══ */}
        <TabsContent value="analytics">
          <div className="space-y-4">
            {/* Stat Cards */}
            {analytics && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Send className="h-4 w-4" />Total Messages</div><p className="text-2xl font-bold">{analytics.stats.totalMessages.toLocaleString()}</p></CardContent></Card>
                  <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><CheckCircle2 className="h-4 w-4" />Delivered Rate</div><p className="text-2xl font-bold">{analytics.stats.deliveredRate}%</p></CardContent></Card>
                  <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Eye className="h-4 w-4" />Read Rate</div><p className="text-2xl font-bold">{analytics.stats.readRate}%</p></CardContent></Card>
                  <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><TrendingUp className="h-4 w-4" />Reply Rate</div><p className="text-2xl font-bold">{analytics.stats.replyRate}%</p></CardContent></Card>
                </div>
                {/* Volume over time chart (simplified bar chart) */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Message Volume (Last 30 Days)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex items-end gap-0.5 h-32">
                      {analytics.volumeData.map((d, i) => {
                        const maxCount = Math.max(...analytics.volumeData.map(v => v.count), 1);
                        const height = Math.max((d.count / maxCount) * 100, d.count > 0 ? 4 : 2);
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${d.count} messages`}>
                            <div className="w-full bg-red-600 rounded-t" style={{ height: `${height}%`, minHeight: 2 }} />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>{analytics.volumeData[0]?.date.slice(5)}</span>
                      <span>{analytics.volumeData[Math.floor(analytics.volumeData.length / 2)]?.date.slice(5)}</span>
                      <span>{analytics.volumeData[analytics.volumeData.length - 1]?.date.slice(5)}</span>
                    </div>
                  </CardContent>
                </Card>
                {/* Status Distribution */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Delivery Status Distribution</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {analytics.statusDistribution.filter(s => s.value > 0).map((s) => (
                        <div key={s.name} className="text-center">
                          <div className="h-16 w-16 mx-auto rounded-full flex items-center justify-center text-sm font-bold" style={{ backgroundColor: s.color + "20", color: s.color }}>
                            {s.value}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{s.name}</p>
                        </div>
                      ))}
                    </div>
                    {analytics.statusDistribution.every(s => s.value === 0) && (
                      <p className="text-sm text-muted-foreground text-center py-4">No data available yet.</p>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </TabsContent>

        {/* ═══ Business Profile Tab ═══ */}
        <TabsContent value="business">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2"><Building2 className="h-4 w-4 text-green-600" />Business Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">Business Name</Label><Input value={bizForm.whatsappBusinessName} onChange={(e) => setBizForm({ ...bizForm, whatsappBusinessName: e.target.value })} placeholder="My ISP" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Business Category</Label>
                  <Select value={bizForm.whatsappBusinessCategory} onValueChange={(v) => setBizForm({ ...bizForm, whatsappBusinessCategory: v })}>
                    <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                    <SelectContent>{BUSINESS_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">About / Description</Label><Textarea value={bizForm.whatsappBusinessAbout} onChange={(e) => setBizForm({ ...bizForm, whatsappBusinessAbout: e.target.value })} placeholder="Describe your business..." rows={3} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Address</Label><Input value={bizForm.whatsappBusinessAddress} onChange={(e) => setBizForm({ ...bizForm, whatsappBusinessAddress: e.target.value })} placeholder="123 Main Street, City" /></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">Email</Label><Input type="email" value={bizForm.whatsappBusinessEmail} onChange={(e) => setBizForm({ ...bizForm, whatsappBusinessEmail: e.target.value })} placeholder="support@myisp.com" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Phone</Label><Input value={bizForm.whatsappBusinessPhone} onChange={(e) => setBizForm({ ...bizForm, whatsappBusinessPhone: e.target.value })} placeholder="+91 98765 43210" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Website URL</Label><Input value={bizForm.whatsappBusinessWebsite} onChange={(e) => setBizForm({ ...bizForm, whatsappBusinessWebsite: e.target.value })} placeholder="https://myisp.com" /></div>
              </div>
              <div className="flex justify-end">
                <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={saveBizMutation.isPending} onClick={() => saveBizMutation.mutate(bizForm)}>
                  {saveBizMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving...</> : "Save Business Profile"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Webhooks Tab ═══ */}
        <TabsContent value="webhooks">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2"><Webhook className="h-4 w-4 text-purple-600" />Webhook Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {webhookLoading ? (<div className="space-y-4"><Skeleton className="skeleton-wave h-10" /><Skeleton className="skeleton-wave h-10" /></div>) : (
                <>
                  <div className="space-y-1.5"><Label className="text-xs">Webhook URL</Label><Input value={webhookForm.webhookUrl} onChange={(e) => setWebhookForm({ ...webhookForm, webhookUrl: e.target.value })} placeholder="https://your-server.com/api/whatsapp/webhook" /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Verify Token</Label><Input type="password" value={webhookForm.verifyToken} onChange={(e) => setWebhookForm({ ...webhookForm, verifyToken: e.target.value })} placeholder="my_secret_verify_token" /></div>
                  <div className="space-y-2">
                    <Label className="text-xs">Subscribe to Events</Label>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2"><Checkbox checked={webhookForm.subscribeMessages} onCheckedChange={(c) => setWebhookForm({ ...webhookForm, subscribeMessages: !!c })} /><span className="text-sm">Messages</span></div>
                      <div className="flex items-center gap-2"><Checkbox checked={webhookForm.subscribeDelivery} onCheckedChange={(c) => setWebhookForm({ ...webhookForm, subscribeDelivery: !!c })} /><span className="text-sm">Delivery Updates</span></div>
                      <div className="flex items-center gap-2"><Checkbox checked={webhookForm.subscribeAccount} onCheckedChange={(c) => setWebhookForm({ ...webhookForm, subscribeAccount: !!c })} /><span className="text-sm">Account Updates</span></div>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <Button variant="outline" disabled={testWebhookMutation.isPending || !webhookForm.webhookUrl} onClick={() => testWebhookMutation.mutate(webhookForm)}>
                      {testWebhookMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Testing...</> : <><Webhook className="h-3.5 w-3.5 mr-1.5" />Test Webhook</>}
                    </Button>
                    <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={saveWebhookMutation.isPending} onClick={() => saveWebhookMutation.mutate(webhookForm)}>
                      {saveWebhookMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving...</> : "Save Configuration"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Logs Tab ═══ */}
        <TabsContent value="logs">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4 text-purple-600" />Message Logs</CardTitle>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => queryClient.invalidateQueries({ queryKey: ["whatsapp-logs"] })}><RefreshCw className="h-3 w-3" /> Refresh</Button>
              </div>
            </CardHeader>
            <CardContent>
              {logsLoading ? (<div className="space-y-2"><Skeleton className="skeleton-wave h-10" /><Skeleton className="skeleton-wave h-10" /><Skeleton className="skeleton-wave h-10" /></div>) : (
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <Table><TableHeader><TableRow>
                    <TableHead className="text-xs">Direction</TableHead><TableHead className="text-xs">Phone</TableHead><TableHead className="text-xs">Message</TableHead><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs">Time</TableHead>
                  </TableRow></TableHeader><TableBody>
                    {(!logs || logs.length === 0) ? (<TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">No message logs yet.</TableCell></TableRow>) :
                      logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell><Badge variant="outline" className={`text-[10px] ${log.direction === "INBOUND" ? "bg-teal-50 text-teal-700 border-teal-200" : "bg-green-50 text-green-700 border-green-200"}`}>{log.direction}</Badge></TableCell>
                          <TableCell className="text-sm font-mono text-xs">{log.direction === "INBOUND" ? log.from : log.to}</TableCell>
                          <TableCell className="text-sm max-w-[250px] truncate">{log.message}</TableCell>
                          <TableCell><Badge variant="outline" className={`text-[10px] ${STATUS_BADGE[log.status] || ""}`}>{log.status}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(log.timestamp).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody></Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══ Broadcast Dialog ═══ */}
      <Dialog open={broadcastDialog} onOpenChange={(open) => { if (!open) { setBroadcastDialog(false); resetBroadcast(); } }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><Megaphone className="h-4 w-4 text-red-600" />Broadcast Message</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Media Type Selection */}
            <div className="space-y-1.5">
              <Label className="text-xs">Media Type</Label>
              <Select value={broadcastMediaType} onValueChange={setBroadcastMediaType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="TEXT">Text Only</SelectItem><SelectItem value="IMAGE">Image</SelectItem><SelectItem value="DOCUMENT">Document</SelectItem></SelectContent>
              </Select>
            </div>
            {broadcastMediaType !== "TEXT" && (
              <div className="space-y-1.5">
                <Label className="text-xs">{broadcastMediaType === "IMAGE" ? "Image URL" : "Document URL"}</Label>
                <Input value={broadcastMediaUrl} onChange={(e) => setBroadcastMediaUrl(e.target.value)} placeholder={broadcastMediaType === "IMAGE" ? "https://example.com/image.jpg" : "https://example.com/document.pdf"} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Select Template (optional)</Label>
              <Select value={broadcastTemplateId} onValueChange={(v) => { setBroadcastTemplateId(v); const t = templates?.find(tpl => tpl.id === v); if (t) setBroadcastMessage(t.content); }}>
                <SelectTrigger><SelectValue placeholder="Choose a template..." /></SelectTrigger>
                <SelectContent>{templates?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Message</Label>
              <Textarea value={broadcastMessage} onChange={(e) => setBroadcastMessage(e.target.value)} placeholder="Type your message or select a template..." rows={4} />
              <div className="flex flex-wrap gap-1">{KNOWN_VARIABLES.map(v => (<Button key={v.key} variant="outline" size="sm" className="text-[10px] h-6 px-2 gap-1" onClick={() => setBroadcastMessage(prev => prev + " " + v.key)}><Plus className="h-2.5 w-2.5" />{v.label}</Button>))}</div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Recipients ({broadcastSelected.size} selected)</Label>
              <div className="relative" ref={setBroadcastSearchRef}>
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search subscribers..." value={broadcastSearch} onChange={(e) => setBroadcastSearch(e.target.value)} className="pl-8 h-8 text-xs" />
                {broadcastSearch.length >= 2 && (broadcastSubscribers?.length ?? 0) > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-40 overflow-y-auto">
                    {broadcastSubscribers!.filter(s => !broadcastSelected.has(s.id)).slice(0, 10).map((s) => (
                      <button key={s.id} type="button" className="w-full text-left px-3 py-2 hover:bg-accent text-sm" onClick={() => { setBroadcastSelected(prev => new Set(prev).add(s.id)); setBroadcastSearch(""); }}>{s.name} ({s.phone})</button>
                    ))}
                  </div>
                )}
              </div>
              {broadcastSelected.size > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-1 mt-2">
                  {Array.from(broadcastSelected).map(id => (<div key={id} className="flex items-center justify-between p-2 rounded border text-sm"><span className="text-xs">{id.slice(0, 8)}...</span><Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setBroadcastSelected(prev => { const n = new Set(prev); n.delete(id); return n; })}><X className="h-3 w-3" /></Button></div>))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setBroadcastDialog(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={broadcastMutation.isPending || broadcastSelected.size === 0 || !broadcastMessage.trim()} onClick={handleBroadcast}>
                {broadcastMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Queuing...</> : <><Send className="h-3.5 w-3.5 mr-1.5" />Send to {broadcastSelected.size}</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Schedule Dialog ═══ */}
      <Dialog open={scheduleDialog} onOpenChange={(open) => { if (!open) { setScheduleDialog(false); resetSchedule(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4 text-orange-600" />Schedule Message</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Select Subscriber</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search by name or phone..." value={schedSearch} onChange={(e) => setSchedSearch(e.target.value)} className="pl-8 h-8 text-xs" />
                {schedSearch.length >= 2 && (schedSubscribers?.length ?? 0) > 0 && !schedSelected && (
                  <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-40 overflow-y-auto">
                    {schedSubscribers!.slice(0, 10).map((s) => (
                      <button key={s.id} type="button" className="w-full text-left px-3 py-2 hover:bg-accent text-sm" onClick={() => { setSchedSelected(s); setSchedSearch(""); }}>{s.name} ({s.phone})</button>
                    ))}
                  </div>
                )}
              </div>
              {schedSelected && (
                <div className="flex items-center justify-between p-2 rounded border text-sm">
                  <span className="text-xs font-medium">{schedSelected.name} ({schedSelected.phone})</span>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setSchedSelected(null)}><X className="h-3 w-3" /></Button>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Template (optional)</Label>
              <Select value={schedForm.templateId} onValueChange={(v) => { setSchedForm({ ...schedForm, templateId: v }); const t = templates?.find(tpl => tpl.id === v); if (t) setSchedForm(prev => ({ ...prev, message: t.content })); }}>
                <SelectTrigger><SelectValue placeholder="Choose a template..." /></SelectTrigger>
                <SelectContent>{templates?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Media Type</Label>
              <Select value={schedForm.mediaType} onValueChange={(v) => setSchedForm({ ...schedForm, mediaType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="TEXT">Text</SelectItem><SelectItem value="IMAGE">Image</SelectItem><SelectItem value="DOCUMENT">Document</SelectItem></SelectContent>
              </Select>
            </div>
            {schedForm.mediaType !== "TEXT" && (
              <div className="space-y-1.5">
                <Label className="text-xs">{schedForm.mediaType === "IMAGE" ? "Image URL" : "Document URL"}</Label>
                <Input value={schedForm.mediaUrl} onChange={(e) => setSchedForm({ ...schedForm, mediaUrl: e.target.value })} placeholder="https://..." />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Message</Label>
              <Textarea value={schedForm.message} onChange={(e) => setSchedForm({ ...schedForm, message: e.target.value })} placeholder="Your message..." rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Schedule Date & Time</Label>
              <Input type="datetime-local" value={schedForm.scheduledAt} onChange={(e) => setSchedForm({ ...schedForm, scheduledAt: e.target.value })} min={new Date().toISOString().slice(0, 16)} />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setScheduleDialog(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={scheduleMutation.isPending} onClick={handleSchedule}>
                {scheduleMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Scheduling...</> : <><Clock className="h-3.5 w-3.5 mr-1.5" />Schedule</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Template Create/Edit Dialog ═══ */}
      <Dialog open={templateDialog} onOpenChange={closeTemplateDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base">{editingTemplate ? "Edit" : "Create"} Template</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs">Template Name</Label><Input value={tmplForm.name} onChange={(e) => setTmplForm({ ...tmplForm, name: e.target.value })} placeholder="e.g. Bill Reminder" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Category</Label>
                <Select value={tmplForm.category} onValueChange={(v) => setTmplForm({ ...tmplForm, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TEMPLATE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Media Type</Label>
              <Select value={tmplForm.mediaType} onValueChange={(v) => setTmplForm({ ...tmplForm, mediaType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="TEXT">Text Only</SelectItem><SelectItem value="IMAGE">Image</SelectItem><SelectItem value="DOCUMENT">Document</SelectItem></SelectContent>
              </Select>
            </div>
            {tmplForm.mediaType !== "TEXT" && (
              <div className="space-y-1.5">
                <Label className="text-xs">{tmplForm.mediaType === "IMAGE" ? "Image URL" : "Document URL"}</Label>
                <Input value={tmplForm.mediaUrl} onChange={(e) => setTmplForm({ ...tmplForm, mediaUrl: e.target.value })} placeholder="https://..." />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Content</Label>
              <Textarea value={tmplForm.content} onChange={(e) => setTmplForm({ ...tmplForm, content: e.target.value })} placeholder="Hello {{subscriber_name}}..." rows={5} />
              <div className="flex flex-wrap gap-1">{KNOWN_VARIABLES.map(v => (<Button key={v.key} variant="outline" size="sm" className="text-[10px] h-6 px-2 gap-1" onClick={() => insertVariable(v.key)}><Plus className="h-2.5 w-2.5" />{v.label}</Button>))}</div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={closeTemplateDialog}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleTemplateSubmit}>{editingTemplate ? "Update" : "Create"} Template</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Command Create/Edit Dialog ═══ */}
      <Dialog open={cmdDialog} onOpenChange={closeCmdDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base">{editingCmd ? "Edit" : "Create"} Command</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label className="text-xs">Trigger</Label><Input value={cmdForm.trigger} onChange={(e) => setCmdForm({ ...cmdForm, trigger: e.target.value })} placeholder="e.g. /balance" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Response</Label><Textarea value={cmdForm.response} onChange={(e) => setCmdForm({ ...cmdForm, response: e.target.value })} rows={3} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Description</Label><Input value={cmdForm.description} onChange={(e) => setCmdForm({ ...cmdForm, description: e.target.value })} /></div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={closeCmdDialog}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleCmdSubmit}>{editingCmd ? "Update" : "Create"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Quick Reply Create/Edit Dialog ═══ */}
      <Dialog open={qrDialog} onOpenChange={closeQrDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base">{editingQr ? "Edit" : "Create"} Quick Reply</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label className="text-xs">Shortcut</Label><Input value={qrForm.shortcut} onChange={(e) => setQrForm({ ...qrForm, shortcut: e.target.value })} placeholder="e.g. /plan" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Message</Label><Textarea value={qrForm.message} onChange={(e) => setQrForm({ ...qrForm, message: e.target.value })} rows={3} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Category</Label>
              <Select value={qrForm.category} onValueChange={(v) => setQrForm({ ...qrForm, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{QUICK_REPLY_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={closeQrDialog}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleQrSubmit}>{editingQr ? "Update" : "Create"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Delete Template Dialog ═══ */}
      <AlertDialog open={deleteTemplate.open} onOpenChange={(open) => setDeleteTemplate({ ...deleteTemplate, open })}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Template</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete &quot;{deleteTemplate.name}&quot;? This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteTemplateMutation.mutate(deleteTemplate.id)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
