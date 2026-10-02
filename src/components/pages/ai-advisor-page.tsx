"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bot, Send, Sparkles, Lightbulb, TrendingUp, Shield, Loader2, Plus, RotateCcw, Trash2, MessageSquare, Download, Clipboard, Coins, Clock, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ConversationMeta {
  id: string;
  title: string;
  createdAt: string;
  messageCount: number;
}

// Token estimation: 1 token per 4 characters
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Cost per 1K tokens in INR (approximate GPT-3.5 pricing)
const COST_PER_1K_INPUT = 0.45; // INR
const COST_PER_1K_OUTPUT = 1.35; // INR

interface UsageStats {
  sessionTokens: number;
  todayTokens: number;
  estimatedCost: number;
}

interface RateLimitState {
  timestamps: number[];
  minuteRemaining: number;
  hourRemaining: number;
  cooldownUntil: number | null;
}

const MINUTE_LIMIT = 20;
const HOUR_LIMIT = 100;

const QUICK_ACTIONS = [
  { label: "Analyze revenue", icon: TrendingUp, message: "Analyze my revenue trends for the last 6 months and provide growth insights." },
  { label: "Suggest plan pricing", icon: Lightbulb, message: "Suggest optimal pricing for my internet plans based on market trends and subscriber usage patterns." },
  { label: "Churn prevention tips", icon: Shield, message: "What are the top churn prevention strategies I should implement for my ISP business?" },
];

function getFollowUps(userMessage: string): string[] {
  const msg = userMessage.toLowerCase();
  if (msg.includes("revenue") || msg.includes("income") || msg.includes("growth")) {
    return ["How can I increase ARPU?", "What are my best-performing plans?", "Suggest a pricing strategy for next quarter"];
  }
  if (msg.includes("churn") || msg.includes("retention") || msg.includes("leave")) {
    return ["Which subscribers are at highest risk?", "What retention offers work best?", "How to reduce complaint-driven churn?"];
  }
  if (msg.includes("plan") || msg.includes("pricing") || msg.includes("package")) {
    return ["Compare my plans vs competitors", "Which plans need price adjustment?", "Suggest a budget-friendly plan tier"];
  }
  if (msg.includes("complaint") || msg.includes("issue") || msg.includes("support")) {
    return ["What are the most common complaint types?", "How to reduce support ticket volume?", "Which areas have most complaints?"];
  }
  return ["What should I focus on this month?", "How does my business compare to industry benchmarks?", "Suggest 3 quick wins to improve revenue"];
}

function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) return <h4 key={i} className="font-bold text-sm mt-2">{line.slice(4)}</h4>;
        if (line.startsWith("## ")) return <h3 key={i} className="font-bold text-base mt-2">{line.slice(3)}</h3>;
        if (line.startsWith("# ")) return <h2 key={i} className="font-bold text-lg mt-2">{line.slice(2)}</h2>;
        if (line.startsWith("- ") || line.startsWith("* ")) return <li key={i} className="ml-4 text-sm list-disc">{renderInline(line.slice(2))}</li>;
        if (/^\d+\.\s/.test(line)) {
          const match = line.match(/^(\d+\.)\s(.*)$/);
          return <li key={i} className="ml-4 text-sm list-decimal">{renderInline(match ? match[2] : line)}</li>;
        }
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i} className="text-sm leading-relaxed">{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.*?)\*\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);
    const candidates: Array<{ type: string; index: number; length: number; content: string }> = [];
    if (boldMatch && boldMatch.index !== undefined) {
      candidates.push({ type: "bold", index: boldMatch.index, length: boldMatch[0].length, content: boldMatch[1] });
    }
    if (codeMatch && codeMatch.index !== undefined) {
      candidates.push({ type: "code", index: codeMatch.index, length: codeMatch[0].length, content: codeMatch[1] });
    }
    candidates.sort((a, b) => a.index - b.index);
    const firstMatch = candidates[0] || null;
    if (firstMatch) {
      if (firstMatch.index > 0) parts.push(<span key={key++}>{remaining.slice(0, firstMatch.index)}</span>);
      if (firstMatch.type === "bold") parts.push(<strong key={key++} className="font-semibold">{firstMatch.content}</strong>);
      else if (firstMatch.type === "code") parts.push(<code key={key++} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{firstMatch.content}</code>);
      remaining = remaining.slice(firstMatch.index + firstMatch.length);
    } else {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }
  }
  return <>{parts}</>;
}

function TypingIndicator() {
  return (
    <div className="flex gap-1 items-center px-1">
      <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
    </div>
  );
}

const STORAGE_KEY = "ai-advisor-conversations";

function loadConversations(): { current: ConversationMeta; list: ConversationMeta[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved);
  } catch { return null; }
}

function saveConversations(current: ConversationMeta, list: ConversationMeta[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ current, list: list.slice(0, 50) }));
  } catch { /* ignore */ }
}

function loadMessages(convId: string): Message[] | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(`ai-advisor-messages-${convId}`);
    if (!saved) return null;
    return JSON.parse(saved).map((m: Message) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch { return null; }
}

function saveMessages(convId: string, messages: Message[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`ai-advisor-messages-${convId}`, JSON.stringify(messages));
  } catch { /* ignore */ }
}

const defaultWelcomeMessage: Message = {
  id: "welcome",
  role: "assistant",
  content: "Hello! I'm your AI business advisor for Cryptsk ISP. I can help you analyze revenue, optimize pricing, prevent churn, and grow your subscriber base. Ask me anything or use the quick actions below!",
  timestamp: new Date(),
};

export default function AiAdvisorPage() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const [conversations, setConversations] = useState<ConversationMeta[]>(() => {
    const saved = loadConversations();
    return saved ? saved.list : [];
  });
  const [currentConvId, setCurrentConvId] = useState<string>(() => {
    const saved = loadConversations();
    return saved?.current?.id ?? "";
  });
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = loadConversations();
    if (saved) {
      const msgs = loadMessages(saved.current.id);
      if (msgs) return msgs;
    }
    return [defaultWelcomeMessage];
  });
  const [input, setInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [initialized] = useState(true);

  // Usage tracking state
  const [usageStats, setUsageStats] = useState<UsageStats>({ sessionTokens: 0, todayTokens: 0, estimatedCost: 0 });

  // Rate limiting state
  const [rateLimit, setRateLimit] = useState<RateLimitState>({
    timestamps: [],
    minuteRemaining: MINUTE_LIMIT,
    hourRemaining: HOUR_LIMIT,
    cooldownUntil: null,
  });
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Cooldown countdown timer
  useEffect(() => {
    if (!rateLimit.cooldownUntil) {
      setCooldownSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      const remaining = Math.ceil((rateLimit.cooldownUntil! - Date.now()) / 1000);
      if (remaining <= 0) {
        setRateLimit(prev => ({ ...prev, cooldownUntil: null }));
        setCooldownSeconds(0);
        clearInterval(interval);
      } else {
        setCooldownSeconds(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [rateLimit.cooldownUntil]);

  // Tick rate limit remaining every second
  useEffect(() => {
    const interval = setInterval(() => {
      setRateLimit(prev => {
        const now = Date.now();
        const recentMinute = prev.timestamps.filter(t => now - t < 60000);
        const recentHour = prev.timestamps.filter(t => now - t < 3600000);
        return {
          ...prev,
          timestamps: recentMinute,
          minuteRemaining: Math.max(0, MINUTE_LIMIT - recentMinute.length),
          hourRemaining: Math.max(0, HOUR_LIMIT - recentHour.length),
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const isRateLimited = rateLimit.cooldownUntil !== null && Date.now() < rateLimit.cooldownUntil;

  const mutation = useMutation({
    mutationFn: async (message: string) => {
      return apiFetch("/api/ai/advisor", {
        method: "POST",
        body: JSON.stringify({ message }),
      });
    },
    onSuccess: (data) => {
      const assistantMsg: Message = { id: Date.now().toString(), role: "assistant", content: data.response, timestamp: new Date() };
      const updatedMessages = [...messages.filter(m => m.id !== "typing"), assistantMsg];
      setMessages(updatedMessages);
      saveMessages(currentConvId, updatedMessages);

      // Calculate tokens for this exchange
      const lastUserMsg = [...updatedMessages].reverse().find(m => m.role === "user");
      const inputTokens = lastUserMsg ? estimateTokens(lastUserMsg.content) : 0;
      const outputTokens = estimateTokens(data.response || "");
      const totalTokens = inputTokens + outputTokens;
      const inputCost = (inputTokens / 1000) * COST_PER_1K_INPUT;
      const outputCost = (outputTokens / 1000) * COST_PER_1K_OUTPUT;

      setUsageStats(prev => ({
        sessionTokens: prev.sessionTokens + totalTokens,
        todayTokens: prev.todayTokens + totalTokens,
        estimatedCost: prev.estimatedCost + inputCost + outputCost,
      }));

      setConversations(prev => {
        const updated = prev.map(c => {
          if (c.id === currentConvId) {
            const title = updatedMessages.find(m => m.role === "user")?.content.slice(0, 40) || "New Conversation";
            return { ...c, title: title + ((updatedMessages.find(m => m.role === "user")?.content?.length ?? 0) > 40 ? "..." : ""), messageCount: updatedMessages.length };
          }
          return c;
        });
        const current = updated.find(c => c.id === currentConvId) || updated[0];
        if (current) saveConversations(current, updated);
        return updated;
      });
    },
    onError: () => {
      setMessages(prev => prev.filter(m => m.id !== "typing"));
      toast.error("Failed to get AI response. Please try again.");
    },
  });

  const handleSend = useCallback((text?: string) => {
    const msg = text || input.trim();
    if (!msg || mutation.isPending) return;

    // Rate limit check
    const now = Date.now();
    const recentMinute = rateLimit.timestamps.filter(t => now - t < 60000);
    const recentHour = rateLimit.timestamps.filter(t => now - t < 3600000);

    if (recentMinute.length >= MINUTE_LIMIT) {
      setRateLimit(prev => ({ ...prev, cooldownUntil: now + 60000 }));
      toast.error(`Rate limit reached: max ${MINUTE_LIMIT} messages per minute. Please wait.`);
      return;
    }
    if (recentHour.length >= HOUR_LIMIT) {
      setRateLimit(prev => ({ ...prev, cooldownUntil: now + 3600000 }));
      toast.error(`Rate limit reached: max ${HOUR_LIMIT} messages per hour. Please wait.`);
      return;
    }

    // Record timestamp for rate limiting
    const newTimestamps = [...rateLimit.timestamps, now];
    setRateLimit(prev => ({
      ...prev,
      timestamps: newTimestamps,
      minuteRemaining: Math.max(0, MINUTE_LIMIT - newTimestamps.filter(t => now - t < 60000).length),
      hourRemaining: Math.max(0, HOUR_LIMIT - newTimestamps.filter(t => now - t < 3600000).length),
    }));

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: msg, timestamp: new Date() };
    const typingMsg: Message = { id: "typing", role: "assistant", content: "", timestamp: new Date() };
    const updatedMessages = [...messages.filter(m => m.id !== "welcome" || messages.length > 1), userMsg, typingMsg];
    setMessages(updatedMessages);
    setInput("");
    mutation.mutate(msg);
  }, [input, messages, mutation, rateLimit.timestamps]);

  const startNewConversation = () => {
    const newId = `conv_${Date.now()}`;
    const newConv: ConversationMeta = { id: newId, title: "New Conversation", createdAt: new Date().toISOString(), messageCount: 1 };
    const welcomeMsg = [defaultWelcomeMessage];
    const updatedList = [newConv, ...conversations];
    setConversations(updatedList);
    setCurrentConvId(newId);
    setMessages(welcomeMsg);
    saveConversations(newConv, updatedList);
    saveMessages(newId, welcomeMsg);
    setHistoryOpen(false);
  };

  const switchConversation = (convId: string) => {
    const msgs = loadMessages(convId);
    setMessages(msgs || [defaultWelcomeMessage]);
    setCurrentConvId(convId);
    const conv = conversations.find(c => c.id === convId);
    if (conv) saveConversations(conv, conversations);
    setHistoryOpen(false);
  };

  const deleteConversation = (convId: string) => {
    localStorage.removeItem(`ai-advisor-messages-${convId}`);
    const updatedList = conversations.filter(c => c.id !== convId);
    setConversations(updatedList);
    if (convId === currentConvId) {
      if (updatedList.length > 0) switchConversation(updatedList[0].id);
      else startNewConversation();
    }
    if (updatedList.length > 0) {
      const current = updatedList.find(c => c.id === currentConvId) || updatedList[0];
      saveConversations(current, updatedList);
    }
  };

  // Export conversation as .txt file
  const exportAsText = () => {
    const text = currentMessages
      .filter(m => m.id !== "welcome")
      .map(m => `[${m.role === "user" ? "You" : "AI Advisor"}] (${m.timestamp.toLocaleString("en-IN")})\n${m.content}`)
      .join("\n\n---\n\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-advisor-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Conversation exported as .txt");
  };

  // Copy all messages to clipboard
  const copyToClipboard = async () => {
    const text = currentMessages
      .filter(m => m.id !== "welcome")
      .map(m => `[${m.role === "user" ? "You" : "AI Advisor"}]: ${m.content}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Conversation copied to clipboard");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const currentMessages = messages.filter(m => m.id !== "typing");
  const lastAssistantMsg = [...currentMessages].reverse().find(m => m.role === "assistant");
  const followUps = lastAssistantMsg && lastAssistantMsg.id !== "welcome"
    ? getFollowUps(currentMessages.find(m => m.role === "user")?.content || "")
    : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Advisor</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Get AI-powered business insights and recommendations.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setHistoryOpen(true)}>
            <MessageSquare className="h-3.5 w-3.5" /> History ({conversations.length})
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5" disabled={currentMessages.length <= 1}>
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={copyToClipboard}>
                <Clipboard className="h-4 w-4 mr-2" /> Copy to Clipboard
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportAsText}>
                <Download className="h-4 w-4 mr-2" /> Download as .txt
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={startNewConversation}>
            <Plus className="h-3.5 w-3.5" /> New Chat
          </Button>
        </div>
      </div>

      {/* Usage Stats Bar */}
      <Card className="border shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-6 flex-1 flex-wrap">
              {/* Session Tokens */}
              <div className="flex items-center gap-2 min-w-0">
                <Zap className="h-4 w-4 text-amber-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Session Tokens</p>
                  <p className="text-sm font-semibold">{usageStats.sessionTokens.toLocaleString()}</p>
                </div>
              </div>

              {/* Today Tokens */}
              <div className="flex items-center gap-2 min-w-0">
                <Clock className="h-4 w-4 text-teal-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Today Tokens</p>
                  <p className="text-sm font-semibold">{usageStats.todayTokens.toLocaleString()}</p>
                </div>
              </div>

              {/* Estimated Cost */}
              <div className="flex items-center gap-2 min-w-0">
                <Coins className="h-4 w-4 text-green-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Est. Cost</p>
                  <p className="text-sm font-semibold">₹{usageStats.estimatedCost.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Rate Limit Indicators */}
            <div className="flex items-center gap-4 border-l pl-4 sm:pl-6">
              <div className="text-right min-w-[100px]">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Per Minute</p>
                <div className="flex items-center gap-2 justify-end">
                  <Progress value={(rateLimit.minuteRemaining / MINUTE_LIMIT) * 100} className="h-1.5 w-16" />
                  <span className={`text-xs font-semibold ${rateLimit.minuteRemaining <= 3 ? "text-red-600" : "text-foreground"}`}>{rateLimit.minuteRemaining}/{MINUTE_LIMIT}</span>
                </div>
              </div>
              <div className="text-right min-w-[100px]">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Per Hour</p>
                <div className="flex items-center gap-2 justify-end">
                  <Progress value={(rateLimit.hourRemaining / HOUR_LIMIT) * 100} className="h-1.5 w-16" />
                  <span className={`text-xs font-semibold ${rateLimit.hourRemaining <= 10 ? "text-red-600" : "text-foreground"}`}>{rateLimit.hourRemaining}/{HOUR_LIMIT}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Cooldown Banner */}
          {isRateLimited && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-2.5">
              <Clock className="h-4 w-4 text-red-600 flex-shrink-0 animate-pulse" />
              <p className="text-xs text-red-700 dark:text-red-400">
                Rate limit cooldown active. Please wait <span className="font-bold">{cooldownSeconds}s</span> before sending another message.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5 text-red-600" />
            AI Business Advisor
            <Badge variant="outline" className="ml-auto text-green-600 border-green-200 bg-green-50 text-xs">Online</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-col h-[520px]">
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-4 max-w-3xl mx-auto">
                {initialized && messages.map((msg) => (
                  <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-600 flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-white" />
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-red-600 text-white rounded-br-md"
                        : "bg-muted rounded-bl-md"
                    }`}>
                      {msg.id === "typing" ? (
                        <TypingIndicator />
                      ) : (
                        <SimpleMarkdown content={msg.content} />
                      )}
                      <p className={`text-[10px] mt-1 ${msg.role === "user" ? "text-red-200" : "text-muted-foreground"}`}>
                        {msg.timestamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    {msg.role === "user" && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-bold text-primary">U</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {followUps.length > 0 && !mutation.isPending && (
                <div className="max-w-3xl mx-auto mt-4">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <Lightbulb className="h-3 w-3" /> Suggested follow-ups:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {followUps.map((q, i) => (
                      <Button key={i} variant="outline" size="sm" className="text-xs hover:border-red-300 hover:bg-red-50 h-8" onClick={() => handleSend(q)}>
                        {q}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </ScrollArea>

            <div className="border-t p-4">
              {currentMessages.length <= 1 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {QUICK_ACTIONS.map((action) => (
                    <Button key={action.label} variant="outline" size="sm" className="text-xs gap-1.5 hover:border-red-300 hover:bg-red-50" onClick={() => handleSend(action.message)} disabled={mutation.isPending || isRateLimited}>
                      <action.icon className="h-3.5 w-3.5" />
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask the AI advisor anything about your ISP business..."
                  className="min-h-[44px] max-h-[120px] resize-none text-sm"
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  disabled={mutation.isPending}
                />
                <Button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || mutation.isPending || isRateLimited}
                  className="bg-red-600 hover:bg-red-700 text-white self-end"
                  size="icon"
                >
                  {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conversation History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-red-600" />
              Conversation History
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No conversations yet</p>
            ) : (
              conversations.map((conv) => (
                <div key={conv.id} className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${conv.id === currentConvId ? "border-red-300 bg-red-50" : ""}`}>
                  <div className="flex-1 min-w-0" onClick={() => switchConversation(conv.id)}>
                    <p className="text-sm font-medium truncate">{conv.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {conv.messageCount} messages · {new Date(conv.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </p>
                  </div>
                  <div className="flex gap-1 ml-2">
                    {conv.id === currentConvId && <Badge variant="outline" className="text-[10px] text-red-600">Active</Badge>}
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="flex justify-end pt-2 border-t">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { startNewConversation(); setHistoryOpen(false); }}>
              <Plus className="h-3.5 w-3.5" /> New Conversation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
