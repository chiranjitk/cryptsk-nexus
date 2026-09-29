"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Brain, Send, Loader2, Activity, TrendingUp, Stethoscope,
  Lightbulb, AlertCircle, Sparkles, MessageSquare,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

type Message = { role: "user" | "assistant"; content: string; timestamp: string };

export function AiPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [messages, setMessages] = React.useState<Message[]>([
    {
      role: "assistant",
      content: "Welcome to CRYPTSK Nexus AI Intelligence. I'm your AI Advisor with access to real-time platform data. Ask me anything about your subscribers, revenue, network health, or try one of the quick actions below.",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Fetch saved insights
  const { data: insightsData } = useQuery({
    queryKey: ["ai-insights"],
    queryFn: async () => {
      const res = await fetch("/api/ai/insights");
      if (!res.ok) return { insights: [] };
      return res.json();
    },
  });
  const insights: any[] = insightsData?.insights || [];

  React.useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, loading]);

  const advisorMutation = useMutation({
    mutationFn: async (question: string) => {
      const res = await fetch("/api/ai/advisor", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
      return res.json();
    },
    onMutate: (question) => {
      setMessages((prev) => [...prev, { role: "user", content: question, timestamp: new Date().toISOString() }]);
      setLoading(true);
    },
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.response, timestamp: new Date().toISOString() }]);
      qc.invalidateQueries({ queryKey: ["ai-insights"] });
    },
    onError: (err: any) => {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err.message}`, timestamp: new Date().toISOString() }]);
      toast({ title: "AI Error", description: err.message, variant: "destructive" });
    },
    onSettled: () => setLoading(false),
  });

  const quickAction = async (type: "diagnosis" | "churn" | "forecast") => {
    setLoading(true);
    const labels: Record<string, string> = {
      diagnosis: "🔍 Running network diagnosis...",
      churn: "📊 Analyzing churn risk...",
      forecast: "💰 Forecasting revenue...",
    };
    setMessages((prev) => [...prev, { role: "user", content: labels[type], timestamp: new Date().toISOString() }]);

    try {
      const res = await fetch(`/api/ai/${type}`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.response, timestamp: new Date().toISOString() }]);
      qc.invalidateQueries({ queryKey: ["ai-insights"] });
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err.message}`, timestamp: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  };

  function handleSend() {
    if (!input.trim() || loading) return;
    const question = input.trim();
    setInput("");
    advisorMutation.mutate(question);
  }

  function getInsightIcon(type: string) {
    const icons: Record<string, typeof Brain> = {
      advisor: Lightbulb, diagnosis: Stethoscope, churn: Activity,
      forecast: TrendingUp, recommendation: Sparkles, competitor: Brain,
    };
    return icons[type] || Brain;
  }

  function getInsightColor(type: string) {
    const colors: Record<string, string> = {
      advisor: "text-violet-500", diagnosis: "text-rose-500",
      churn: "text-amber-500", forecast: "text-emerald-500",
      recommendation: "text-blue-500", competitor: "text-cyan-500",
    };
    return colors[type] || "text-primary";
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 cryptsk-fade-in" style={{ minHeight: "calc(100vh - 120px)" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="size-6 text-violet-500" /> AI Intelligence
          </h1>
          <p className="text-sm text-muted-foreground">
            Advisory-only AI · z-ai-web-dev-sdk · Per ADR-030
          </p>
        </div>
        <Badge variant="outline" className="border-violet-500/30 bg-violet-500/5 text-violet-600 gap-1.5">
          <div className="size-2 rounded-full bg-violet-500 ai-glow" /> AI Active
        </Badge>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <QuickActionCard
          icon={Stethoscope}
          title="Network Diagnosis"
          description="Analyze RADIUS auth + accounting data for issues"
          color="text-rose-500"
          bg="bg-rose-500/10"
          onClick={() => quickAction("diagnosis")}
          disabled={loading}
        />
        <QuickActionCard
          icon={Activity}
          title="Churn Prediction"
          description="Identify at-risk subscribers + retention actions"
          color="text-amber-500"
          bg="bg-amber-500/10"
          onClick={() => quickAction("churn")}
          disabled={loading}
        />
        <QuickActionCard
          icon={TrendingUp}
          title="Revenue Forecast"
          description="Project revenue 30/60/90 days + collection tips"
          color="text-emerald-500"
          bg="bg-emerald-500/10"
          onClick={() => quickAction("forecast")}
          disabled={loading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 flex-1">
        {/* Chat interface (2/3) */}
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="size-4 text-violet-500" /> AI Advisor Chat
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0">
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[400px] cryptsk-scrollbar">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-lg p-3 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}>
                    {msg.role === "assistant" && msg.content === messages[0]?.content ? (
                      <div className="flex items-start gap-2">
                        <Brain className="size-4 mt-0.5 text-violet-500 shrink-0" />
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      </div>
                    ) : msg.role === "assistant" ? (
                      <div className="flex items-start gap-2">
                        <Brain className="size-4 mt-0.5 text-violet-500 shrink-0" />
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                    <Loader2 className="size-4 cryptsk-spin text-violet-500" />
                    <span className="text-sm text-muted-foreground">AI is thinking...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t p-3 flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder="Ask AI about your platform..."
                disabled={loading}
                className="flex-1"
              />
              <Button onClick={handleSend} disabled={loading || !input.trim()} className="gap-2 bg-violet-600 hover:bg-violet-700">
                <Send className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Saved Insights (1/3) */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="size-4 text-amber-500" /> Saved Insights
            </CardTitle>
            <CardDescription className="text-xs">AI-generated recommendations (advisory)</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto cryptsk-scrollbar max-h-[450px]">
            <div className="space-y-2">
              {insights.length === 0 ? (
                <div className="text-center py-8">
                  <Brain className="size-8 mx-auto text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground mt-2">No insights saved yet. Use the chat or quick actions to generate AI insights.</p>
                </div>
              ) : (
                insights.map((insight) => {
                  const Icon = getInsightIcon(insight.type);
                  const color = getInsightColor(insight.type);
                  return (
                    <div key={insight.id} className="rounded-lg border p-3 card-lift cursor-pointer hover:border-primary/30">
                      <div className="flex items-start gap-2">
                        <Icon className={`size-4 mt-0.5 ${color} shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{insight.title}</p>
                          <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
                            {insight.content.slice(0, 150)}...
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <Badge variant="outline" className="text-[8px]">{insight.type}</Badge>
                            <Badge variant="outline" className={`text-[8px] ${
                              insight.status === "accepted" ? "border-emerald-500/30 text-emerald-600" :
                              insight.status === "rejected" ? "border-rose-500/30 text-rose-600" :
                              "border-amber-500/30 text-amber-600"
                            }`}>{insight.status}</Badge>
                            <span className="text-[9px] text-muted-foreground">
                              {new Date(insight.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Advisory disclaimer */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
        <AlertCircle className="size-3" />
        AI outputs are advisory only (ADR-030). Any action requires human authorization.
      </div>
    </div>
  );
}

function QuickActionCard({
  icon: Icon, title, description, color, bg, onClick, disabled,
}: {
  icon: typeof Brain; title: string; description: string;
  color: string; bg: string; onClick: () => void; disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:border-primary/30 hover:bg-accent transition-all card-lift text-left disabled:opacity-50"
    >
      <div className={`flex size-10 items-center justify-center rounded-lg ${bg}`}>
        <Icon className={`size-5 ${color}`} />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-[10px] text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}
