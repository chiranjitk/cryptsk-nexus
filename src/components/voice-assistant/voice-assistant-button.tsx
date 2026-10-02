"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  Mic, MicOff, X, Send, Trash2, MessageCircle,
  Volume2, Loader2, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceAssistant, ChatMessage } from "./use-voice-assistant";
import { useModuleStore } from "@/store/module-store";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";

export default function VoiceAssistantButton() {
  const {
    messages,
    isRecording,
    isProcessing,
    isSpeaking,
    panelOpen,
    togglePanel,
    closePanel,
    toggleRecording,
    sendTextMessage,
    clearMessages,
    micStatus,
    setPendingWelcome,
  } = useVoiceAssistant();

  const enabledModules = useModuleStore((s) => s.enabledModules);
  const isModuleEnabled = enabledModules.includes("voice-assistant");

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userName = useAuthStore((s) => s.user?.name);

  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const apiSupported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia ||
    !!(typeof window !== "undefined" &&
      ((window as unknown as Record<string, unknown>).SpeechRecognition ||
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isAuthenticated && userName) {
      setPendingWelcome(userName);
    }
  }, [isAuthenticated, userName, setPendingWelcome]);

  // Close panel on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && panelOpen) {
        togglePanel();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [panelOpen, togglePanel]);

  if (!isModuleEnabled) return null;

  const micFailed = micStatus === "unavailable" || micStatus === "denied" || micStatus === "error";

  const handleSend = () => {
    if (inputText.trim()) {
      sendTextMessage(inputText);
      setInputText("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickActions = [
    "Dashboard",
    "Subscribers",
    "Billing",
    "Sessions",
    "Alerts",
  ];

  return (
    <>
      {/* ── Floating Button (unified FAB stack — bottom slot) ──── */}
      <button
        onClick={togglePanel}
        title={panelOpen ? "Close voice assistant" : "Voice assistant"}
        className={cn(
          // Stack-consistent: 44px mobile / 48px desktop, anchored right-5,
          // z-40 shared with Quick Notes + Quick Actions in the same column.
          "fixed z-40 h-11 w-11 sm:h-12 sm:w-12 rounded-full shadow-lg",
          "flex items-center justify-center transition-all duration-300",
          // Bottom slot of the unified stack (mic at the bottom).
          "bottom-5 right-5",
          panelOpen
            ? "bg-red-500 hover:bg-red-600"
            : "bg-primary hover:bg-primary/90",
          isRecording && "animate-pulse ring-4 ring-red-500/30",
        )}
        aria-label={panelOpen ? "Close voice assistant" : "Open voice assistant"}
      >
        {panelOpen ? (
          <X className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
        ) : isRecording ? (
          <MicOff className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
        ) : (
          <Mic className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
        )}
      </button>

      {/* ── Backdrop (mobile: full screen overlay, desktop: none) ── */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 sm:bg-transparent sm:pointer-events-none"
          onClick={closePanel}
          aria-hidden="true"
        />
      )}

      {/* ── Panel ────────────────────────────────────────────── */}
      {panelOpen && (
        <div
          className={cn(
            "fixed z-50 bg-background border border-border shadow-2xl flex flex-col overflow-hidden",
            // Opens to the LEFT of the FAB stack (bottom-aligned with the
            // column) so it never covers the Quick Notes / Quick Actions
            // buttons. right offset = right-5 + 48px button + 12px gap.
            "bottom-5 left-4 right-[4.75rem] sm:left-auto sm:right-20 sm:w-[380px]",
            "rounded-2xl",
            "max-h-[calc(100vh-2.5rem)] sm:max-h-[min(520px,calc(100vh-2.5rem))]",
            // Animation
            "animate-in slide-in-from-bottom-4 fade-in duration-200",
          )}
          // Stop click propagation so backdrop doesn't close panel when clicking inside
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Mobile drag handle ── */}
          <div className="flex justify-center pt-2 pb-0 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* ── Header ── */}
          <div className="flex items-center justify-between px-4 py-2.5 sm:py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2 min-w-0">
              <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
              <span className="font-semibold text-sm truncate">Voice Assistant</span>
              {isSpeaking && (
                <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary animate-pulse shrink-0" />
              )}
              {micFailed && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium shrink-0">
                  Text Only
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={clearMessages}
                aria-label="Clear chat"
              >
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </Button>
              {/* Explicit close button — large tap target */}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-red-500 active:text-red-600"
                onClick={closePanel}
                aria-label="Close voice assistant"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* ── Messages ── */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[80px] sm:min-h-[120px] max-h-[35vh] sm:max-h-[280px]" style={{ WebkitOverflowScrolling: "touch" }}>
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground text-xs py-4 sm:py-6">
                <Mic className="w-7 h-7 sm:w-8 sm:h-8 mx-auto mb-2 opacity-50" />
                <p className="font-medium mb-1">How can I help you?</p>
                <p className="opacity-70">
                  Type or speak a command to navigate
                </p>
              </div>
            )}

            {messages.map((msg: ChatMessage) => (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-3 py-2 text-xs",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : msg.isError
                        ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
                        : "bg-muted text-foreground"
                  )}
                >
                  <p className="flex items-start gap-1.5">
                    {msg.isError && (
                      <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                    )}
                    <span>{msg.content}</span>
                  </p>
                  {msg.action === "navigate" && (
                    <p className="opacity-70 mt-1 text-[10px]">
                      → Navigating to {msg.label || msg.route}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-xl px-3 py-2 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {isRecording ? "Listening..." : "Processing..."}
                  </span>
                </div>
              </div>
            )}

            {isRecording && !isProcessing && (
              <div className="flex justify-start">
                <div className="bg-primary/10 rounded-xl px-3 py-2 flex items-center gap-1.5">
                  <Mic className="w-3 h-3 text-primary animate-pulse" />
                  <span className="text-xs text-primary font-medium">
                    Listening... speak now
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Quick Actions ── */}
          {messages.length === 0 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {quickActions.map((action) => (
                <button
                  key={action}
                  onClick={() => sendTextMessage(action)}
                  className="text-[10px] sm:text-[11px] px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors active:bg-primary/30"
                >
                  {action}
                </button>
              ))}
            </div>
          )}

          {/* ── Input Bar ── */}
          <div className="border-t border-border px-2 py-2.5 flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-10 w-10 shrink-0 rounded-full",
                isRecording
                  ? "bg-red-100 dark:bg-red-900/30 text-red-600 hover:bg-red-200"
                  : micFailed
                    ? "text-amber-500 hover:text-amber-600"
                    : "text-muted-foreground hover:text-foreground"
              )}
              onClick={toggleRecording}
              disabled={isProcessing}
              aria-label={isRecording ? "Stop recording" : "Start voice recording"}
            >
              {isRecording ? (
                <MicOff className="w-4 h-4" />
              ) : micFailed ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </Button>

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type or speak a command..."
              className="flex-1 text-sm bg-muted rounded-lg px-3 py-2.5 outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50"
              disabled={isProcessing}
            />

            <Button
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full bg-primary hover:bg-primary/90"
              onClick={handleSend}
              disabled={!inputText.trim() || isProcessing}
              aria-label="Send message"
            >
              <Send className="w-4 h-4 text-primary-foreground" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
