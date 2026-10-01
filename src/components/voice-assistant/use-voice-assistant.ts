"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAppStore } from "@/store/app-store";

export type MicStatus = "idle" | "available" | "unavailable" | "denied" | "error";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  action?: string;
  route?: string;
  label?: string;
  isError?: boolean;
}

interface UseVoiceAssistantReturn {
  messages: ChatMessage[];
  isRecording: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  closePanel: () => void;
  startRecording: () => void;
  stopRecording: () => void;
  toggleRecording: () => void;
  sendTextMessage: (text: string) => void;
  clearMessages: () => void;
  micStatus: MicStatus;
  micStatusReason: string;
  playWelcome: (userName?: string) => void;
  setPendingWelcome: (name?: string) => void;
}

// ── Web Speech API types (not in standard TS lib) ─────────────
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as Record<string, unknown>).SpeechRecognition as (new () => SpeechRecognitionInstance) | null ||
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition as (new () => SpeechRecognitionInstance) | null ||
    null
  );
}

export function useVoiceAssistant(): UseVoiceAssistantReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [micStatus, setMicStatus] = useState<MicStatus>("idle");
  const [micStatusReason, setMicStatusReason] = useState("");

  const speechRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  // ReturnType<typeof setTimeout> instead of NodeJS.Timeout so the ref works
  // in tsconfigs with and without node types (client-only timer).
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakAudioRef = useRef<HTMLAudioElement | null>(null);
  // React 19 types require an explicit initial value for useRef — passing
  // undefined keeps the exact same optional-ref semantics (all consumers use
  // .current assignments and optional ?.() calls).
  const processCommandRef = useRef<((text: string) => Promise<void>) | undefined>(undefined);
  const speakTextRef = useRef<((text: string) => Promise<void>) | undefined>(undefined);
  const welcomePlayedRef = useRef(false);
  const pendingWelcomeNameRef = useRef<string | undefined>(undefined);

  const togglePanel = useCallback(() => {
    setPanelOpen((prev) => !prev);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
  }, []);

  // ── Listen for device hot-plug to re-enable mic after failure ──
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    const handler = () => {
      if (micStatus !== "idle") {
        setMicStatus("idle");
        setMicStatusReason("");
      }
    };
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
  }, [micStatus]);

  const addAssistantMessage = useCallback((content: string, isError = false) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: "assistant",
        content,
        timestamp: new Date(),
        isError,
      },
    ]);
  }, []);

  const stopRecordingInternal = useCallback(() => {
    // Stop SpeechRecognition if active
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch { /* ignore */ }
      speechRecognitionRef.current = null;
    }
    // Stop MediaRecorder if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
  }, []);

  // ── Speak response via TTS ─────────────────────────────────────
  const speakText = useCallback(async (text: string) => {
    try {
      setIsSpeaking(true);
      if (speakAudioRef.current) {
        speakAudioRef.current.pause();
        speakAudioRef.current = null;
      }

      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) throw new Error("TTS failed");

      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      speakAudioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        speakAudioRef.current = null;
        setIsSpeaking(false);
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        speakAudioRef.current = null;
        setIsSpeaking(false);
      };

      audio.play().catch(() => {
        // Autoplay blocked — this is expected for welcome messages
        // where there was no prior user gesture
        URL.revokeObjectURL(audioUrl);
        speakAudioRef.current = null;
        setIsSpeaking(false);
      });
    } catch {
      speakAudioRef.current = null;
      setIsSpeaking(false);
    }
  }, []);

  speakTextRef.current = speakText;

  // ── Process text command ───────────────────────────────────────
  const processCommand = useCallback(async (text: string) => {
    try {
      const res = await fetch("/api/voice/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: text }),
      });

      if (!res.ok) throw new Error("Command processing failed");

      const data = await res.json();

      const assistantMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: data.description || data.message || "Done!",
        timestamp: new Date(),
        action: data.action,
        route: data.route,
        label: data.label,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      const speakContent = data.description || data.message || "";
      if (speakContent) {
        await speakTextRef.current?.(speakContent);
      }

      // Navigate using SPA state — NOT window.location.href
      if (data.action === "navigate" && data.label) {
        setPanelOpen(false);
        useAppStore.getState().setCurrentPage(data.label, data.section);
      }
    } catch {
      addAssistantMessage("Sorry, I couldn't process that command. Please try again.");
    }
  }, [addAssistantMessage]);

  processCommandRef.current = processCommand;

  // ── Start recording — Web Speech API first, MediaRecorder fallback ──
  const startRecording = useCallback(() => {
    setIsProcessing(true);

    // ── Attempt 1: Web Speech API (browser built-in STT) ──
    const SpeechRecognitionCtor = getSpeechRecognition();

    if (SpeechRecognitionCtor) {
      try {
        const recognition = new SpeechRecognitionCtor();
        recognition.lang = "en-US";
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          setIsRecording(true);
          setIsProcessing(false);
          setMicStatus("available");
          setMicStatusReason("");
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const text = event.results[0]?.[0]?.transcript;
          if (text && text.trim()) {
            const userMsg: ChatMessage = {
              id: Date.now().toString(),
              role: "user",
              content: text.trim(),
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, userMsg]);
            processCommandRef.current?.(text.trim());
          } else {
            addAssistantMessage("I didn't catch that. Please try again.", true);
          }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          setIsRecording(false);
          setIsProcessing(false);

          if (event.error === "not-allowed") {
            setMicStatus("denied");
            setMicStatusReason("Microphone permission denied.");
          } else if (event.error === "no-speech") {
            setMicStatus("idle");
            // No speech detected — silent, don't spam chat
          } else if (event.error === "audio-capture") {
            // No mic hardware — fall through to MediaRecorder attempt
            tryMediaRecorder();
            return;
          } else if (event.error === "network") {
            setMicStatus("error");
            setMicStatusReason("Network error during speech recognition.");
          } else {
            // Other errors — try MediaRecorder as fallback
            tryMediaRecorder();
            return;
          }
        };

        recognition.onend = () => {
          setIsRecording(false);
          setIsProcessing(false);
          speechRecognitionRef.current = null;
        };

        speechRecognitionRef.current = recognition;

        // Auto-stop after 15 seconds
        recordingTimerRef.current = setTimeout(() => {
          try { recognition.stop(); } catch { /* ignore */ }
        }, 15000);

        recognition.start();
        return; // Success — don't fall through to MediaRecorder
      } catch {
        // SpeechRecognition constructor failed — fall through
      }
    }

    // ── Attempt 2: MediaRecorder + getUserMedia + ASR API ──
    function tryMediaRecorder() {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setMicStatus("unavailable");
        setMicStatusReason("No microphone available.");
        setIsProcessing(false);
        return;
      }

      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          setMicStatus("available");
          setMicStatusReason("");
          setIsProcessing(false);

          const mediaRecorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
              ? "audio/webm;codecs=opus"
              : "audio/webm",
          });

          audioChunksRef.current = [];

          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              audioChunksRef.current.push(event.data);
            }
          };

          mediaRecorder.onstop = async () => {
            stream.getTracks().forEach((track) => track.stop());
            if (audioChunksRef.current.length === 0) return;

            const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
            setIsProcessing(true);

            try {
              const formData = new FormData();
              formData.append("audio", audioBlob, "recording.webm");

              const res = await fetch("/api/voice/transcribe", {
                method: "POST",
                body: formData,
              });

              if (!res.ok) throw new Error("Transcription failed");

              const data = await res.json();
              const text = data.text;

              if (text && text.trim()) {
                const userMsg: ChatMessage = {
                  id: Date.now().toString(),
                  role: "user",
                  content: text.trim(),
                  timestamp: new Date(),
                };
                setMessages((prev) => [...prev, userMsg]);
                await processCommandRef.current?.(text.trim());
              } else {
                addAssistantMessage("I didn't hear anything. Please try again or type your command.", true);
              }
            } catch {
              addAssistantMessage("Sorry, I couldn't understand your voice. Please type your command.", true);
            } finally {
              setIsProcessing(false);
            }
          };

          mediaRecorder.start();
          mediaRecorderRef.current = mediaRecorder;
          setIsRecording(true);

          recordingTimerRef.current = setTimeout(() => {
            stopRecordingInternal();
          }, 15000);
        })
        .catch((error: DOMException) => {
          setIsProcessing(false);
          setMicStatus("unavailable");
          setMicStatusReason("No microphone found on this device.");
          // Silent — no error message spammed in chat
        });
    }

    // No SpeechRecognition API available — go straight to MediaRecorder
    tryMediaRecorder();
  }, [stopRecordingInternal, addAssistantMessage]);

  const stopRecording = useCallback(() => {
    stopRecordingInternal();
  }, [stopRecordingInternal]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const sendTextMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;

      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      processCommand(text.trim());
    },
    [processCommand]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    if (speakAudioRef.current) {
      speakAudioRef.current.pause();
      speakAudioRef.current = null;
    }
    setIsSpeaking(false);
    setMicStatus("idle");
    setMicStatusReason("");
  }, []);

  // ── Play welcome message (text in chat + TTS if possible) ──
  const playWelcome = useCallback((userName?: string) => {
    const name = userName?.trim();
    const greeting = name
      ? `Welcome back, ${name}! I'm your ISP platform voice assistant. You can type or speak commands to navigate. How can I help you today?`
      : "Welcome! I'm your ISP platform voice assistant. You can type or speak commands to navigate. How can I help you today?";
    addAssistantMessage(greeting);
    // TTS will be attempted but may be blocked by autoplay policy.
    // It will retry when user first opens the panel (which is a user gesture).
    speakTextRef.current?.(greeting);
  }, [addAssistantMessage]);

  // ── Speak welcome when user opens panel for the first time ──
  // This ensures the TTS has a user gesture context (panel open = click)
  useEffect(() => {
    if (panelOpen && !welcomePlayedRef.current && messages.length === 0) {
      welcomePlayedRef.current = true;
      // Small delay so the panel animation completes first
      const timer = setTimeout(() => {
        const name = pendingWelcomeNameRef.current;
        const greeting = name?.trim()
          ? `Welcome back, ${name}! I'm your ISP platform voice assistant. You can type or speak commands to navigate. How can I help you today?`
          : "Welcome! I'm your ISP platform voice assistant. You can type or speak commands to navigate. How can I help you today?";
        addAssistantMessage(greeting);
        speakTextRef.current?.(greeting);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [panelOpen, messages.length, addAssistantMessage]);

  // ── Store pending welcome name for when panel opens ──
  const setPendingWelcome = useCallback((name?: string) => {
    pendingWelcomeNameRef.current = name;
  }, []);

  return {
    messages,
    isRecording,
    isProcessing,
    isSpeaking,
    panelOpen,
    setPanelOpen,
    togglePanel,
    closePanel,
    startRecording,
    stopRecording,
    toggleRecording,
    sendTextMessage,
    clearMessages,
    micStatus,
    micStatusReason,
    playWelcome,
    setPendingWelcome,
  };
}
