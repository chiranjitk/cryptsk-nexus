"use client";

import React, { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Bot, Search, AlertTriangle, CheckCircle2, Loader2, Wifi, Activity, Zap, Clock,
  History, Trash2, PlusCircle, X, Users, Save, ArrowDownUp, FileDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import { escapeHtml } from "@/lib/utils/html-escape";

interface DiagnosisResult {
  subscriberId: string;
  subscriberName: string;
  status: string;
  plan: string;
  networkPath: { hop: number; device: string; ip: string; latency: string; status: string }[];
  speedTest: { download: string; upload: string; ping: string; jitter: string };
  issues: { severity: string; title: string; description: string }[];
  resolutionSteps: string[];
  summary: string;
}

interface SubscriberOption {
  id: string;
  name: string;
  code: string;
  phone: string;
}

interface DiagnosisHistoryItem {
  id: string;
  subscriberId: string;
  subscriberName: string;
  timestamp: string;
  summary: string;
  issuesCount: number;
  result: DiagnosisResult;
}

interface BaselineData {
  id: string;
  subscriberId: string;
  riskScore: number;
  issuesCount: number;
  speedDown: string;
  speedUp: string;
  ping: string;
  summary: string;
  createdAt: string;
}

interface BulkResult {
  subscriberId: string;
  subscriberName: string;
  result: DiagnosisResult | null;
  error?: string;
}

const DIAGNOSIS_HISTORY_KEY = "ai-diagnosis-history";

function loadDiagnosisHistory(): DiagnosisHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(DIAGNOSIS_HISTORY_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function saveDiagnosisHistory(history: DiagnosisHistoryItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DIAGNOSIS_HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
  } catch { /* ignore */ }
}

// Generate a printable HTML report for a diagnosis result
function generateDiagnosisReportHtml(result: DiagnosisResult, baseline?: BaselineData | null): string {
  const severityColors: Record<string, string> = {
    critical: "#dc2626",
    warning: "#d97706",
    info: "#2563eb",
  };

  const hopStatusColor = (status: string) => (status === "OK" ? "#16a34a" : "#dc2626");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Diagnosis Report - ${escapeHtml(result.subscriberName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #1f2937;
      line-height: 1.6;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    @media print {
      body { padding: 20px; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid #dc2626;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .header h1 { font-size: 24px; color: #dc2626; }
    .header .company { font-size: 14px; color: #6b7280; }
    .header .date { font-size: 12px; color: #9ca3af; text-align: right; }
    .section {
      margin-bottom: 24px;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 16px;
      font-weight: 700;
      color: #374151;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .info-item label {
      font-size: 11px;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      display: block;
    }
    .info-item span {
      font-size: 14px;
      font-weight: 600;
    }
    .summary-box {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .summary-box p { font-size: 14px; color: #991b1b; }
    .speed-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }
    .speed-card {
      text-align: center;
      padding: 16px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
    }
    .speed-card .value { font-size: 20px; font-weight: 700; }
    .speed-card .label { font-size: 11px; color: #6b7280; margin-top: 4px; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      margin-bottom: 16px;
    }
    th {
      background: #f9fafb;
      padding: 8px 12px;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #e5e7eb;
    }
    td {
      padding: 8px 12px;
      border-bottom: 1px solid #f3f4f6;
    }
    tr:hover { background: #f9fafb; }
    .issue-row { display: flex; gap: 12px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; page-break-inside: avoid; }
    .issue-severity {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 2px 8px;
      border-radius: 4px;
      color: white;
      white-space: nowrap;
      height: fit-content;
    }
    .issue-content h4 { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
    .issue-content p { font-size: 12px; color: #6b7280; }
    .step { display: flex; gap: 12px; margin-bottom: 8px; page-break-inside: avoid; }
    .step-num {
      width: 24px; height: 24px; border-radius: 50%;
      background: #fef2f2; color: #dc2626;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; flex-shrink: 0;
    }
    .step-text { font-size: 13px; padding-top: 2px; }
    .comparison-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }
    .comparison-card {
      padding: 12px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
    }
    .comparison-card .label { font-size: 10px; color: #9ca3af; text-transform: uppercase; }
    .comparison-card .values { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
    .comparison-card .before { text-decoration: line-through; color: #9ca3af; font-size: 13px; }
    .comparison-card .after { font-weight: 700; font-size: 13px; }
    .footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      font-size: 11px;
      color: #9ca3af;
      text-align: center;
    }
    .print-btn {
      display: inline-block;
      padding: 10px 24px;
      background: #dc2626;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      margin-bottom: 20px;
    }
    .print-btn:hover { background: #b91c1c; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save as PDF</button>

  <div class="header">
    <div>
      <h1>AI Network Diagnosis Report</h1>
      <div class="company">Cryptsk ISP Management Platform</div>
    </div>
    <div class="date">
      <div><strong>${escapeHtml(result.subscriberName)}</strong></div>
      <div>${new Date().toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" })}</div>
    </div>
  </div>

  <!-- Subscriber Info -->
  <div class="section">
    <div class="section-title">Subscriber Information</div>
    <div class="info-grid">
      <div class="info-item"><label>Subscriber</label><span>${escapeHtml(result.subscriberName)}</span></div>
      <div class="info-item"><label>Status</label><span>${escapeHtml(result.status)}</span></div>
      <div class="info-item"><label>Plan</label><span>${escapeHtml(result.plan)}</span></div>
      <div class="info-item"><label>Diagnosis Time</label><span>${new Date().toLocaleTimeString("en-IN")}</span></div>
    </div>
  </div>

  <!-- AI Summary -->
  <div class="section">
    <div class="section-title">AI Analysis Summary</div>
    <div class="summary-box">
      <p>${escapeHtml(result.summary)}</p>
    </div>
  </div>

  <!-- Baseline Comparison -->
  ${baseline ? `
  <div class="section">
    <div class="section-title">Before / After Comparison</div>
    <div class="comparison-grid">
      <div class="comparison-card">
        <div class="label">Issues</div>
        <div class="values">
          <span class="before">${baseline.issuesCount}</span>
          <span>→</span>
          <span class="after">${result.issues.length}</span>
        </div>
      </div>
      <div class="comparison-card">
        <div class="label">Download</div>
        <div class="values">
          <span class="before">${baseline.speedDown}</span>
          <span>→</span>
          <span class="after">${result.speedTest.download}</span>
        </div>
      </div>
      <div class="comparison-card">
        <div class="label">Upload</div>
        <div class="values">
          <span class="before">${baseline.speedUp}</span>
          <span>→</span>
          <span class="after">${result.speedTest.upload}</span>
        </div>
      </div>
      <div class="comparison-card">
        <div class="label">Ping</div>
        <div class="values">
          <span class="before">${baseline.ping}</span>
          <span>→</span>
          <span class="after">${result.speedTest.ping || "N/A"}</span>
        </div>
      </div>
    </div>
    <div style="font-size: 11px; color: #9ca3af;">Baseline saved on ${new Date(baseline.createdAt).toLocaleString("en-IN")}</div>
  </div>
  ` : ""}

  <!-- Speed Test -->
  <div class="section">
    <div class="section-title">Speed Test Results</div>
    <div class="speed-grid">
      <div class="speed-card"><div class="value" style="color: #16a34a;">${escapeHtml(result.speedTest.download)}</div><div class="label">Download</div></div>
      <div class="speed-card"><div class="value" style="color: #2563eb;">${escapeHtml(result.speedTest.upload)}</div><div class="label">Upload</div></div>
      <div class="speed-card"><div class="value" style="color: #d97706;">${escapeHtml(result.speedTest.ping)}</div><div class="label">Ping</div></div>
      <div class="speed-card"><div class="value" style="color: #7c3aed;">${escapeHtml(result.speedTest.jitter)}</div><div class="label">Jitter</div></div>
    </div>
  </div>

  <!-- Network Path -->
  ${result.networkPath.length > 0 ? `
  <div class="section">
    <div class="section-title">Network Path Analysis</div>
    <table>
      <thead>
        <tr><th>Hop</th><th>Device</th><th>IP Address</th><th>Latency</th><th>Status</th></tr>
      </thead>
      <tbody>
        ${result.networkPath.map(hop => `
          <tr>
            <td>${hop.hop}</td>
            <td><strong>${escapeHtml(hop.device)}</strong></td>
            <td style="font-family: monospace;">${escapeHtml(hop.ip)}</td>
            <td>${escapeHtml(hop.latency)}</td>
            <td style="color: ${hopStatusColor(hop.status)}; font-weight: 600;">${escapeHtml(hop.status)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </div>
  ` : ""}

  <!-- Issues -->
  ${result.issues.length > 0 ? `
  <div class="section">
    <div class="section-title">Issues Detected (${result.issues.length})</div>
    ${result.issues.map(issue => `
      <div class="issue-row">
        <span class="issue-severity" style="background: ${severityColors[issue.severity] || severityColors.info};">${issue.severity}</span>
        <div class="issue-content">
          <h4>${escapeHtml(issue.title)}</h4>
          <p>${escapeHtml(issue.description)}</p>
        </div>
      </div>
    `).join("")}
  </div>
  ` : ""}

  <!-- Resolution Steps -->
  <div class="section">
    <div class="section-title">Resolution Steps</div>
    ${result.resolutionSteps.map((step, idx) => `
      <div class="step">
        <div class="step-num">${idx + 1}</div>
        <div class="step-text">${escapeHtml(step)}</div>
      </div>
    `).join("")}
  </div>

  <div class="footer">
    <p>This report was generated by the AI Diagnosis System of Cryptsk ISP Management Platform.</p>
    <p>Report Date: ${new Date().toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" })}</p>
  </div>
</body>
</html>`;
}

export default function AiDiagnosisPage() {
  const [subscriberId, setSubscriberId] = useState("");
  const [subscriberSearch, setSubscriberSearch] = useState("");
  const [selectedSubscriber, setSelectedSubscriber] = useState<SubscriberOption | null>(null);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [history, setHistory] = useState<DiagnosisHistoryItem[]>(() => loadDiagnosisHistory());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [complaintDialog, setComplaintDialog] = useState(false);
  const [complaintNote, setComplaintNote] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);
  // Bulk diagnosis state
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSubscriberSearch, setBulkSubscriberSearch] = useState("");
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkDone, setBulkDone] = useState(false);
  // Baseline state
  const [baseline, setBaseline] = useState<BaselineData | null>(null);
  const [baselineDialog, setBaselineDialog] = useState(false);
  const bulkSearchRef = useRef<HTMLDivElement>(null);

  // Subscriber autocomplete for single diagnosis
  const { data: subscriberResults } = useQuery<SubscriberOption[]>({
    queryKey: ["subscriber-search-diagnosis", subscriberSearch],
    queryFn: async () => {
      if (!subscriberSearch || subscriberSearch.length < 2) return [];
      const data = await apiFetch<{ subscribers?: SubscriberOption[]; items?: SubscriberOption[] }>(`/api/subscribers?search=${encodeURIComponent(subscriberSearch)}&limit=8`);
      return data.subscribers || data.items || [];
    },
    enabled: subscriberSearch.length >= 2,
  });

  // Subscriber autocomplete for bulk diagnosis
  const { data: bulkSubscribers } = useQuery<SubscriberOption[]>({
    queryKey: ["subscriber-search-bulk", bulkSubscriberSearch],
    queryFn: async () => {
      if (!bulkSubscriberSearch || bulkSubscriberSearch.length < 2) return [];
      const data = await apiFetch<{ subscribers?: SubscriberOption[]; items?: SubscriberOption[] }>(`/api/subscribers?search=${encodeURIComponent(bulkSubscriberSearch)}&limit=20`);
      return data.subscribers || data.items || [];
    },
    enabled: bulkOpen && bulkSubscriberSearch.length >= 2,
  });

  // Fetch existing baselines
  const { data: baselines } = useQuery<BaselineData[]>({
    queryKey: ["diagnosis-baselines"],
    queryFn: () => apiFetch<BaselineData[]>("/api/ai/diagnosis/baselines"),
  });

  const mutation = useMutation({
    mutationFn: async (id: string) => {
      return apiFetch("/api/ai/diagnose", {
        method: "POST",
        body: JSON.stringify({ subscriberId: id }),
      });
    },
    onSuccess: (data) => {
      setDiagnosis(data);
      toast.success("Diagnosis complete!");
      const newHistoryItem: DiagnosisHistoryItem = {
        id: `diag_${Date.now()}`,
        subscriberId: data.subscriberId,
        subscriberName: data.subscriberName,
        timestamp: new Date().toISOString(),
        summary: data.summary,
        issuesCount: data.issues.length,
        result: data,
      };
      const updatedHistory = [newHistoryItem, ...history].slice(0, 30);
      setHistory(updatedHistory);
      saveDiagnosisHistory(updatedHistory);
      // Check for existing baseline
      const existingBaseline = baselines?.find(b => b.subscriberId === data.subscriberId);
      if (existingBaseline) setBaseline(existingBaseline);
      else setBaseline(null);
    },
    onError: () => {
      toast.error("Failed to run diagnosis.");
    },
  });

  const handleDiagnose = (id?: string) => {
    const subId = id || subscriberId.trim();
    if (!subId) return;
    setDiagnosis(null);
    mutation.mutate(subId);
  };

  const handleSelectSubscriber = (sub: SubscriberOption) => {
    setSubscriberId(sub.id);
    setSelectedSubscriber(sub);
    setSubscriberSearch("");
  };

  const clearSubscriber = () => {
    setSubscriberId("");
    setSelectedSubscriber(null);
    setSubscriberSearch("");
    setDiagnosis(null);
  };

  const openFromHistory = (item: DiagnosisHistoryItem) => {
    setSubscriberId(item.subscriberId);
    setDiagnosis(item.result);
    const existingBaseline = baselines?.find(b => b.subscriberId === item.subscriberId);
    if (existingBaseline) setBaseline(existingBaseline);
    else setBaseline(null);
    setHistoryOpen(false);
  };

  // Download PDF report by opening a new window with printable HTML
  const handleDownloadPdf = (result?: DiagnosisResult, baselineData?: BaselineData | null) => {
    const diagResult = result || diagnosis;
    if (!diagResult) return;
    const html = generateDiagnosisReportHtml(diagResult, baselineData ?? baseline);
    const newWindow = window.open("", "_blank");
    if (newWindow) {
      newWindow.document.write(html);
      newWindow.document.close();
    } else {
      toast.error("Pop-up blocked. Please allow pop-ups for this site.");
    }
  };

  // Create complaint from diagnosis
  const complaintMutation = useMutation({
    mutationFn: async (body: { subscriberId: string; type: string; description: string; priority: string }) => {
      return apiFetch("/api/complaints", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast.success("Complaint created successfully!");
      setComplaintDialog(false);
      setComplaintNote("");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create complaint");
    },
  });

  const handleCreateComplaint = () => {
    if (!diagnosis) return;
    const issuesText = diagnosis.issues.map(i => i.description).join("; ");
    complaintMutation.mutate({
      subscriberId: diagnosis.subscriberId,
      type: "NETWORK",
      description: complaintNote || `Auto-generated from AI diagnosis: ${diagnosis.summary} Issues: ${issuesText}`,
      priority: diagnosis.issues.some(i => i.severity === "critical") ? "HIGH" : "MEDIUM",
    });
  };

  // Save baseline
  const saveBaselineMutation = useMutation({
    mutationFn: async (body: { subscriberId: string; riskScore: number; issuesCount: number; speedDown: string; speedUp: string; ping: string; summary: string; fullResult: string }) => {
      return apiFetch("/api/ai/diagnosis/baselines", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: (data) => {
      setBaseline(data);
      toast.success("Baseline saved!");
    },
    onError: () => toast.error("Failed to save baseline"),
  });

  const handleSaveBaseline = () => {
    if (!diagnosis) return;
    saveBaselineMutation.mutate({
      subscriberId: diagnosis.subscriberId,
      riskScore: diagnosis.issues.filter(i => i.severity === "critical").length * 40 + diagnosis.issues.filter(i => i.severity === "warning").length * 20,
      issuesCount: diagnosis.issues.length,
      speedDown: diagnosis.speedTest.download,
      speedUp: diagnosis.speedTest.upload,
      ping: diagnosis.speedTest.ping || "N/A",
      summary: diagnosis.summary,
      fullResult: JSON.stringify(diagnosis),
    });
  };

  // Bulk diagnosis
  const handleBulkDiagnose = async () => {
    if (bulkSelected.size === 0) { toast.error("Select subscribers first"); return; }
    setBulkRunning(true);
    setBulkResults([]);
    setBulkDone(false);
    const ids = Array.from(bulkSelected);
    const results: BulkResult[] = [];
    for (const id of ids) {
      try {
        const data = await apiFetch<DiagnosisResult>("/api/ai/diagnose", { method: "POST", body: JSON.stringify({ subscriberId: id }) });
        results.push({ subscriberId: id, subscriberName: data.subscriberName, result: data });
      } catch {
        const sub = bulkSubscribers?.find(s => s.id === id);
        results.push({ subscriberId: id, subscriberName: sub?.name || "Unknown", result: null, error: "Failed" });
      }
    }
    setBulkResults(results);
    setBulkRunning(false);
    setBulkDone(true);
    toast.success(`Bulk diagnosis complete: ${results.filter(r => r.result).length}/${ids.length} succeeded`);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSubscriberSearch("");
      }
      if (bulkSearchRef.current && !bulkSearchRef.current.contains(e.target as Node)) {
        setBulkSubscriberSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const SEVERITY_STYLES: Record<string, string> = {
    critical: "bg-red-100 text-red-700 border-red-200",
    warning: "bg-yellow-100 text-yellow-700 border-yellow-200",
    info: "bg-teal-100 text-teal-700 border-teal-200",
  };

  // Comparison helpers
  const parseSpeed = (s: string) => {
    const m = s.match(/([\d.]+)/);
    return m ? parseFloat(m[1]) : 0;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Diagnosis</h1>
          <p className="text-sm text-muted-foreground mt-0.5">AI-powered network troubleshooting and diagnostics.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setBulkOpen(true)}>
            <Users className="h-3.5 w-3.5" /> Bulk Diagnosis
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setHistoryOpen(true)}>
            <History className="h-3.5 w-3.5" /> History ({history.length})
          </Button>
        </div>
      </div>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5 text-red-600" />
            AI Network Diagnosis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2" ref={searchRef}>
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <div className="relative">
                <Input
                  placeholder={selectedSubscriber ? `Selected: ${selectedSubscriber.name} (${selectedSubscriber.code})` : "Search subscriber by name, code, or phone..."}
                  value={selectedSubscriber ? "" : subscriberSearch}
                  onChange={(e) => { setSubscriberSearch(e.target.value); if (selectedSubscriber) clearSubscriber(); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && subscriberId.trim()) handleDiagnose(); }}
                  disabled={mutation.isPending}
                  className="pl-9 pr-8"
                />
                {selectedSubscriber && (
                  <Button type="button" variant="ghost" size="sm" className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0" onClick={clearSubscriber}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {subscriberSearch.length >= 2 && (subscriberResults?.length ?? 0) > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {subscriberResults!.map((s) => (
                    <button key={s.id} type="button" className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-center justify-between" onClick={() => handleSelectSubscriber(s)}>
                      <span>{s.name} <span className="text-muted-foreground">({s.code})</span></span>
                      <span className="text-xs text-muted-foreground">{s.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={() => handleDiagnose()} disabled={!subscriberId.trim() || mutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              Diagnose
            </Button>
          </div>
        </CardContent>
      </Card>

      {mutation.isPending && (
        <div className="space-y-4">
          <Skeleton className="skeleton-wave h-32 w-full" />
          <Skeleton className="skeleton-wave h-48 w-full" />
          <Skeleton className="skeleton-wave h-40 w-full" />
        </div>
      )}

      {diagnosis && !mutation.isPending && (
        <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          {/* Before/After Comparison */}
          {baseline && (
            <Card className="border-2 border-teal-300 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ArrowDownUp className="h-4 w-4 text-teal-600" />
                  Before / After Comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <ComparisonField label="Issues" before={`${baseline.issuesCount}`} after={`${diagnosis.issues.length}`} better="down" />
                  <ComparisonField label="Download" before={baseline.speedDown} after={diagnosis.speedTest.download} better="up" numeric />
                  <ComparisonField label="Upload" before={baseline.speedUp} after={diagnosis.speedTest.upload} better="up" numeric />
                  <ComparisonField label="Ping" before={baseline.ping} after={diagnosis.speedTest.ping || "N/A"} better="down" numeric />
                </div>
                <p className="text-xs text-muted-foreground mt-2">Baseline saved on {new Date(baseline.createdAt).toLocaleString("en-IN")}</p>
              </CardContent>
            </Card>
          )}

          {/* Subscriber Info */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-red-600" />
                  Subscriber Information
                </CardTitle>
                <div className="flex gap-1">
                  {diagnosis.issues.length > 0 && (
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setComplaintDialog(true)}>
                      <PlusCircle className="h-3.5 w-3.5" /> Create Complaint
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleSaveBaseline} disabled={saveBaselineMutation.isPending}>
                    <Save className="h-3.5 w-3.5" /> Save Baseline
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => handleDownloadPdf()}>
                    <FileDown className="h-3.5 w-3.5" /> Download PDF
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><p className="text-xs text-muted-foreground">Subscriber</p><p className="text-sm font-semibold">{diagnosis.subscriberName}</p></div>
                <div><p className="text-xs text-muted-foreground">Status</p><Badge variant="outline" className={diagnosis.status === "ACTIVE" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}>{diagnosis.status}</Badge></div>
                <div><p className="text-xs text-muted-foreground">Plan</p><p className="text-sm font-medium">{diagnosis.plan}</p></div>
                <div><p className="text-xs text-muted-foreground">Diagnosis Time</p><p className="text-sm text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{new Date().toLocaleTimeString("en-IN")}</p></div>
              </div>
            </CardContent>
          </Card>

          {/* AI Summary */}
          <div className="rounded-xl border-2 border-red-500/30 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20 p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 p-2 rounded-lg bg-red-600 text-white"><Bot className="h-4 w-4" /></div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-red-800 dark:text-red-300 mb-1">AI Analysis Summary</h3>
                <p className="text-sm text-red-700/80 dark:text-red-300/80 leading-relaxed">{diagnosis.summary}</p>
              </div>
            </div>
          </div>

          {/* Speed Test */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-600" /> Speed Test Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 rounded-lg bg-green-50 border"><Wifi className="h-5 w-5 text-green-600 mx-auto mb-1" /><p className="text-xl font-bold text-green-700">{diagnosis.speedTest.download}</p><p className="text-xs text-muted-foreground">Download</p></div>
                <div className="text-center p-4 rounded-lg bg-teal-50 border"><Activity className="h-5 w-5 text-teal-600 mx-auto mb-1" /><p className="text-xl font-bold text-teal-700">{diagnosis.speedTest.upload}</p><p className="text-xs text-muted-foreground">Upload</p></div>
                <div className="text-center p-4 rounded-lg bg-yellow-50 border"><Clock className="h-5 w-5 text-yellow-600 mx-auto mb-1" /><p className="text-xl font-bold text-yellow-700">{diagnosis.speedTest.ping}</p><p className="text-xs text-muted-foreground">Ping</p></div>
                <div className="text-center p-4 rounded-lg bg-purple-50 border"><Zap className="h-5 w-5 text-purple-600 mx-auto mb-1" /><p className="text-xl font-bold text-purple-700">{diagnosis.speedTest.jitter}</p><p className="text-xs text-muted-foreground">Jitter</p></div>
              </div>
            </CardContent>
          </Card>

          {/* Network Path */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Wifi className="h-4 w-4 text-teal-600" /> Network Path Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {diagnosis.networkPath.map((hop, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <span className="text-xs font-mono text-muted-foreground w-8">Hop {hop.hop}</span>
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                      <span className="font-medium">{hop.device}</span>
                      <span className="text-muted-foreground font-mono text-xs">{hop.ip}</span>
                      <span className="text-muted-foreground">{hop.latency}</span>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${hop.status === "OK" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>{hop.status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Issues */}
          {diagnosis.issues.length > 0 && (
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600" /> Issues Detected ({diagnosis.issues.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {diagnosis.issues.map((issue, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg border">
                    <Badge variant="outline" className={`text-[10px] flex-shrink-0 mt-0.5 ${SEVERITY_STYLES[issue.severity] || SEVERITY_STYLES.info}`}>{issue.severity}</Badge>
                    <div>
                      <p className="text-sm font-medium">{issue.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{issue.description}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Resolution Steps */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" /> Resolution Steps
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {diagnosis.resolutionSteps.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold">{idx + 1}</div>
                    <p className="text-sm leading-relaxed pt-0.5">{step}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Diagnosis History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><History className="h-4 w-4 text-red-600" />Diagnosis History</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No diagnosis history yet</p>
            ) : (
              history.map((item) => (
                <div key={item.id} className="p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => openFromHistory(item)}>
                    <p className="text-sm font-medium">{item.subscriberName}</p>
                    <Badge variant="outline" className="text-[10px]">{item.issuesCount} issue(s)</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2" onClick={() => openFromHistory(item)}>{item.summary}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(item.timestamp).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                  <div className="flex justify-end mt-1">
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground" onClick={() => handleDownloadPdf(item.result)}>
                      <FileDown className="h-3 w-3" /> PDF
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          {history.length > 0 && (
            <div className="flex justify-end pt-2 border-t">
              <Button variant="outline" size="sm" className="gap-1.5 text-red-600 hover:text-red-700" onClick={() => { setHistory([]); saveDiagnosisHistory([]); toast.success("History cleared"); }}>
                <Trash2 className="h-3.5 w-3.5" /> Clear History
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Complaint Dialog */}
      <Dialog open={complaintDialog} onOpenChange={setComplaintDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><PlusCircle className="h-4 w-4 text-red-600" />Create Complaint from Diagnosis</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><p className="text-xs text-muted-foreground">Subscriber</p><p className="text-sm font-medium">{diagnosis?.subscriberName}</p></div>
            <div><p className="text-xs text-muted-foreground">Auto-generated Description</p><p className="text-xs text-muted-foreground bg-muted p-2 rounded line-clamp-3">{diagnosis?.issues.map(i => i.description).join("; ")}</p></div>
            <div><p className="text-xs text-muted-foreground mb-1">Additional Notes (optional)</p><Textarea value={complaintNote} onChange={(e) => setComplaintNote(e.target.value)} placeholder="Add additional details..." rows={3} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setComplaintDialog(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={complaintMutation.isPending} onClick={handleCreateComplaint}>
                {complaintMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}Create Complaint
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Diagnosis Dialog */}
      <Dialog open={bulkOpen} onOpenChange={(open) => { if (!open) { setBulkOpen(false); setBulkDone(false); setBulkResults([]); setBulkSelected(new Set()); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-red-600" />Bulk Diagnosis</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="relative" ref={bulkSearchRef}>
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search subscribers to add..." value={bulkSubscriberSearch} onChange={(e) => setBulkSubscriberSearch(e.target.value)} className="pl-9" />
              {bulkSubscriberSearch.length >= 2 && (bulkSubscribers?.length ?? 0) > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {bulkSubscribers!.filter(s => !bulkSelected.has(s.id)).map((s) => (
                    <button key={s.id} type="button" className="w-full text-left px-3 py-2 hover:bg-accent text-sm" onClick={() => { setBulkSelected(prev => new Set(prev).add(s.id)); setBulkSubscriberSearch(""); }}>
                      {s.name} ({s.code}) - {s.phone}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {bulkSelected.size > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Selected ({bulkSelected.size})</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {Array.from(bulkSelected).map(id => {
                    const sub = bulkResults.find(r => r.subscriberId === id);
                    return (
                      <div key={id} className="flex items-center justify-between p-2 rounded border text-sm">
                        <span>{id.slice(0, 8)}...</span>
                        {sub && <Badge variant="outline" className={`text-[10px] ${sub.error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{sub.error || "Done"}</Badge>}
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setBulkSelected(prev => { const n = new Set(prev); n.delete(id); return n; })}><X className="h-3 w-3" /></Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {bulkDone && bulkResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Results</p>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">Subscriber</TableHead>
                    <TableHead className="text-xs">Issues</TableHead>
                    <TableHead className="text-xs">Speed</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Report</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {bulkResults.filter(r => r.result).map((r, i) => (
                      <TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150">
                        <TableCell className="text-sm">{r.subscriberName}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{r.result!.issues.length} issues</Badge></TableCell>
                        <TableCell className="text-sm">{r.result!.speedTest.download}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px] bg-green-50 text-green-700">OK</Badge></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => handleDownloadPdf(r.result!)}>
                            <FileDown className="h-3 w-3" /> PDF
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {bulkResults.filter(r => r.error).map((r, i) => (
                      <TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150">
                        <TableCell className="text-sm">{r.subscriberName}</TableCell>
                        <TableCell colSpan={4}><Badge variant="outline" className="text-[10px] bg-red-50 text-red-700">Failed</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setBulkOpen(false)}>Close</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={bulkRunning || bulkSelected.size === 0} onClick={handleBulkDiagnose}>
                {bulkRunning ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Diagnosing ({Math.round((bulkResults.length / bulkSelected.size) * 100)}%)...</> : "Run Bulk Diagnosis"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ComparisonField({ label, before, after, better, numeric }: { label: string; before: string; after: string; better: "up" | "down"; numeric?: boolean }) {
  let indicator = "";
  let color = "text-muted-foreground";
  if (numeric) {
    const b = parseFloat(before) || 0;
    const a = parseFloat(after) || 0;
    if (b !== 0 && a !== b) {
      if (better === "up" ? a > b : a < b) { indicator = "↑ Improved"; color = "text-green-600"; }
      else { indicator = "↓ Degraded"; color = "text-red-600"; }
    }
  } else {
    const bInt = parseInt(before) || 0;
    const aInt = parseInt(after) || 0;
    if (better === "down" ? aInt < bInt : aInt > bInt) { indicator = "↑ Improved"; color = "text-green-600"; }
    else if (aInt !== bInt) { indicator = "↓ Degraded"; color = "text-red-600"; }
  }
  return (
    <div className="p-3 rounded-lg border">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground line-through">{before}</span>
        <span className="text-sm font-semibold">{after}</span>
        {indicator && <span className={`text-[10px] font-semibold ${color}`}>{indicator}</span>}
      </div>
    </div>
  );
}
