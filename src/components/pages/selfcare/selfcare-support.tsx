"use client";

import React, { useEffect, useState, useCallback } from "react";
import { type ComplaintItem } from "@/store/subscriber-auth-store";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import {
  HelpCircle,
  Send,
  RefreshCw,
  AlertTriangle,
  Clock,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

// ─── Gradient Icon Circle ───────────────────────────────────

function GradientIcon({ icon: Icon, from, to }: { icon: React.ElementType; from?: string; to?: string }) {
  return (
    <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${from || "from-red-500"} ${to || "to-red-700"} flex items-center justify-center flex-shrink-0`}>
      <Icon className="w-3.5 h-3.5 text-white" />
    </div>
  );
}

// ─── Status Dot Badge ───────────────────────────────────────

function StatusDotBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Badge className={`text-[10px] inline-flex items-center gap-1 ${className || ""}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {children}
    </Badge>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function formatDateTime(dateStr: string): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function complaintStatusBadge(status: string) {
  const map: Record<string, string> = {
    OPEN: "bg-amber-100 text-amber-700 hover:bg-amber-100 border-0",
    IN_PROGRESS: "bg-sky-100 text-sky-700 hover:bg-sky-100 border-0",
    RESOLVED: "bg-red-100 text-red-700 hover:bg-red-100 border-0",
    CLOSED: "bg-slate-100 text-slate-600 hover:bg-slate-100 border-0",
  };
  return map[status] || "bg-muted text-muted-foreground border-0";
}

function priorityBadge(priority: string) {
  const map: Record<string, string> = {
    LOW: "bg-slate-100 text-slate-600 hover:bg-slate-100 border-0",
    MEDIUM: "bg-amber-100 text-amber-700 hover:bg-amber-100 border-0",
    HIGH: "bg-orange-100 text-orange-700 hover:bg-orange-100 border-0",
    CRITICAL: "bg-red-100 text-red-700 hover:bg-red-100 border-0",
  };
  return map[priority] || "bg-muted text-muted-foreground border-0";
}

// ─── FAQ Data ─────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "How to check data usage?",
    a: "Navigate to the 'My Usage' tab in the sidebar. You can see your current cycle usage, daily breakdown, and upload/download split. The progress indicator shows how much of your data limit you have used.",
  },
  {
    q: "How to pay my bill?",
    a: "Go to the 'Billing' tab to view your invoices and payment history. You can pay online via UPI, bank transfer, or visit our office. Contact support for payment assistance.",
  },
  {
    q: "How to raise a complaint?",
    a: "Use the 'Raise New Complaint' form below in the Support section. Select a category, priority, describe your issue, and submit. You can track your complaint status in 'My Complaints' list.",
  },
  {
    q: "What are the plan upgrade options?",
    a: "You can view your current plan on the Dashboard. To upgrade, please contact our support team via phone or visit our office. We will help you switch to a higher plan with better speeds and data limits.",
  },
  {
    q: "How to change my password?",
    a: "Go to 'My Profile' and scroll to the 'Security' section. Enter your current password, then your new password (minimum 8 characters), and confirm. Click 'Change Password' to save.",
  },
  {
    q: "What to do if internet is not working?",
    a: "1) Check if the router has power (lights are on). 2) Restart the router by unplugging for 30 seconds. 3) Check if the WAN cable is connected. 4) If using WiFi, try connecting via ethernet cable. If the issue persists, raise a complaint with 'Connection Issue' category.",
  },
  {
    q: "How to check my connection speed?",
    a: "You can see your current speeds on the Dashboard under 'Connection Info'. For a real-time speed test, visit speedtest.net or fast.com. If speeds are consistently lower than your plan, contact support.",
  },
];

// ─── Data Hook ────────────────────────────────────────────────

function useComplaints() {
  const [complaints, setComplaints] = useState<ComplaintItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/subscriber-auth/complaints");
      const data = await res.json();
      if (data.success) {
        setComplaints(data.data || []);
      } else {
        setError(data.error || "Failed to fetch complaints");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { complaints, loading, error, refetch: fetchData };
}

// ─── Complaint Form ───────────────────────────────────────────

function ComplaintForm({ onSuccess }: { onSuccess: () => void }) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !category || !priority || !description.trim()) {
      toast.error("Missing fields", {
        description: "Please fill in all required fields.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/subscriber-auth/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          category,
          priority,
          description: description.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Complaint submitted", {
          description: "Your complaint has been registered. We will address it soon.",
        });
        setSubject("");
        setCategory("");
        setPriority("");
        setDescription("");
        onSuccess();
      } else {
        toast.error("Failed to submit", {
          description: data.error || "Please try again.",
        });
      }
    } catch {
      toast.error("Network error", {
        description: "Could not submit complaint. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="sc-subject" className="text-xs font-medium">
            Subject <span className="text-destructive">*</span>
          </Label>
          <Input
            id="sc-subject"
            placeholder="Brief description of your issue"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-10"
            disabled={submitting}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium">
            Category <span className="text-destructive">*</span>
          </Label>
          <Select value={category} onValueChange={setCategory} disabled={submitting}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Internet Speed">Internet Speed</SelectItem>
              <SelectItem value="Connection Issue">Connection Issue</SelectItem>
              <SelectItem value="Billing">Billing</SelectItem>
              <SelectItem value="Plan Change">Plan Change</SelectItem>
              <SelectItem value="Account Issue">Account Issue</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium">
            Priority <span className="text-destructive">*</span>
          </Label>
          <Select value={priority} onValueChange={setPriority} disabled={submitting}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Select priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Low">Low</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sc-description" className="text-xs font-medium">
          Description <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="sc-description"
          placeholder="Describe your issue in detail — what happened, when, troubleshooting steps already tried..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          disabled={submitting}
        />
      </div>

      <Button
        type="submit"
        className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-sm shadow-red-500/20"
        disabled={submitting}
      >
        {submitting ? (
          <>
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            Submitting…
          </>
        ) : (
          <>
            <Send className="w-4 h-4 mr-2" />
            Submit Complaint
          </>
        )}
      </Button>
    </form>
  );
}

// ─── Complaint Card ───────────────────────────────────────────

function ComplaintCard({ complaint }: { complaint: ComplaintItem }) {
  return (
    <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground">
                {complaint.ticketNumber}
              </h3>
              <StatusDotBadge className={priorityBadge(complaint.priority)}>
                {complaint.priority.replace("P", "").replace("_", " ")}
              </StatusDotBadge>
              <StatusDotBadge className={complaintStatusBadge(complaint.status)}>
                {complaint.status.replace("_", " ")}
              </StatusDotBadge>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {complaint.description}
            </p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                {complaint.type.replace("_", " ")}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Created: {formatDate(complaint.createdAt)}
              </span>
              {complaint.updatedAt !== complaint.createdAt && (
                <span>
                  Updated: {formatDate(complaint.updatedAt)}
                </span>
              )}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground hidden sm:block flex-shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Component ────────────────────────────────────────────────

export default function SelfcareSupport() {
  const { complaints, loading, error, refetch } = useComplaints();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <GradientIcon icon={HelpCircle} from="from-red-500" to="to-red-700" />
            Support
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Get help, raise complaints, and find answers
          </p>
        </div>
      </div>

      {/* FAQ */}
      <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <GradientIcon icon={HelpCircle} from="from-red-500" to="to-red-700" />
            Frequently Asked Questions
          </CardTitle>
          <CardDescription>Find quick answers to common questions</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {FAQ_ITEMS.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Raise New Complaint */}
      <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <GradientIcon icon={Send} from="from-red-500" to="to-cyan-600" />
            Raise New Complaint
          </CardTitle>
          <CardDescription>
            Describe your issue and we&apos;ll get back to you
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ComplaintForm onSuccess={refetch} />
        </CardContent>
      </Card>

      {/* My Complaints */}
      <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <GradientIcon icon={MessageSquare} from="from-violet-500" to="to-purple-600" />
                My Complaints
              </CardTitle>
              <CardDescription>
                {complaints.length} complaint{complaints.length !== 1 ? "s" : ""} raised
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={refetch} className="gap-1.5 border-border/50 bg-background hover:bg-muted/50">
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <AlertTriangle className="w-6 h-6 text-destructive mx-auto mb-2" />
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={refetch} className="mt-3">
                Retry
              </Button>
            </div>
          ) : complaints.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {complaints.map((c) => (
                <ComplaintCard key={c.id} complaint={c} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">No complaints raised yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
