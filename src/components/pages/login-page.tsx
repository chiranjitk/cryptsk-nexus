"use client";

import React, { useState, useEffect, useCallback, useRef, useSyncExternalStore, type FormEvent } from "react";
import { useAuthStore } from "@/store/auth-store";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  CircleDot,
  Loader2,
  Shield,
  Zap,
  Globe,
  Server,
  BarChart3,
  Users,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { escapeHtml } from "@/lib/utils/html-escape";

// ─── Validation Helpers ───────────────────────────────────────

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── Keyframes (injected once) ─────────────────────────────────

function LoginAnimations() {
  return (
    <style>{`
      /* ═══ Reduced Motion Override ═══ */
      @media (prefers-reduced-motion: reduce) {
        .login-shake,
        .login-fade-in,
        .login-fade-in-scale,
        .login-glow-line,
        .login-grid-scan,
        .login-btn-loading,
        .login-typing-cursor,
        .login-status-blink,
        .login-metric-count,
        .login-orbit-ring,
        .login-float-up,
        .login-shimmer-sweep,
        .login-bg-shift,
        .login-pulse-ring {
          animation: none !important;
        }
        .login-glass-card:hover {
          transform: none !important;
        }
      }

      /* ═══ Core Animations ═══ */
      @keyframes login-shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
        20%, 40%, 60%, 80% { transform: translateX(4px); }
      }

      @keyframes login-fade-in {
        0% { opacity: 0; transform: translateY(24px) scale(0.96); filter: blur(4px); }
        100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
      }

      @keyframes login-fade-in-scale {
        0% { opacity: 0; transform: scale(0.85); filter: blur(6px); }
        100% { opacity: 1; transform: scale(1); filter: blur(0); }
      }

      @keyframes login-fade-in-left {
        0% { opacity: 0; transform: translateX(-16px); }
        100% { opacity: 1; transform: translateX(0); }
      }

      @keyframes login-logo-entrance {
        0% { opacity: 0; transform: scale(0.5) rotate(-10deg); }
        60% { transform: scale(1.08) rotate(2deg); }
        80% { transform: scale(0.96) rotate(-1deg); }
        100% { opacity: 1; transform: scale(1) rotate(0deg); }
      }

      @keyframes login-glow-line {
        0%, 100% { opacity: 0.25; }
        50% { opacity: 0.8; }
      }

      @keyframes login-grid-scan {
        0% { transform: translateY(-100%); }
        100% { transform: translateY(100vh); }
      }

      @keyframes login-input-focus {
        0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4); }
        100% { box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.15), 0 0 24px rgba(220, 38, 38, 0.06); }
      }

      @keyframes login-btn-pulse {
        0%, 100% { box-shadow: 0 4px 15px rgba(220, 38, 38, 0.3); }
        50% { box-shadow: 0 4px 28px rgba(220, 38, 38, 0.5); }
      }

      @keyframes login-typing-cursor {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }

      @keyframes login-status-blink {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 1; }
      }

      @keyframes login-metric-count {
        0% { opacity: 0; transform: translateY(8px); }
        100% { opacity: 1; transform: translateY(0); }
      }

      /* ═══ Background Gradient Shift (Navy → Red) ═══ */
      @keyframes login-bg-shift {
        0% { background-position: 0% 0%; }
        25% { background-position: 100% 0%; }
        50% { background-position: 100% 100%; }
        75% { background-position: 0% 100%; }
        100% { background-position: 0% 0%; }
      }

      /* ═══ Static Dot Particles (CSS-only, no JS) ═══ */
      @keyframes login-particle-drift {
        0% { transform: translateY(0) translateX(0); opacity: 0; }
        15% { opacity: 0.6; }
        85% { opacity: 0.2; }
        100% { transform: translateY(-60vh) translateX(20px); opacity: 0; }
      }
      @keyframes login-particle-drift-reverse {
        0% { transform: translateY(0) translateX(0); opacity: 0; }
        15% { opacity: 0.4; }
        85% { opacity: 0.15; }
        100% { transform: translateY(-80vh) translateX(-15px); opacity: 0; }
      }
      @keyframes login-particle-pulse {
        0%, 100% { opacity: 0.15; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(1.3); }
      }
      .login-static-dot {
        position: absolute;
        border-radius: 50%;
        background: #DC2626;
        pointer-events: none;
      }

      /* ═══ Orbit Ring around Logo ═══ */
      @keyframes login-orbit-ring {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      /* ═══ Pulse Ring on Logo ═══ */
      @keyframes login-pulse-ring {
        0% { transform: scale(1); opacity: 0.5; }
        100% { transform: scale(1.8); opacity: 0; }
      }

      /* ═══ Shimmer Sweep on Button ═══ */
      @keyframes login-shimmer-sweep {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }

      /* ═══ Data Flow Lines ═══ */
      @keyframes login-data-flow {
        0% { stroke-dashoffset: 24; opacity: 0; }
        20% { opacity: 0.6; }
        80% { opacity: 0.6; }
        100% { stroke-dashoffset: 0; opacity: 0; }
      }

      /* ═══ Card Glow Pulse ═══ */
      @keyframes login-card-glow {
        0%, 100% { opacity: 0.03; }
        50% { opacity: 0.08; }
      }

      /* ═══ Progress Bar Fill ═══ */
      @keyframes login-progress-indeterminate {
        0% { transform: translateX(-100%); }
        50% { transform: translateX(0%); }
        100% { transform: translateX(200%); }
      }

      /* ═══ Floating Particles (CSS-only) ═══ */
      @keyframes login-float-up {
        0% {
          transform: translateY(0) scale(1);
          opacity: 0;
        }
        10% {
          opacity: 0.8;
        }
        90% {
          opacity: 0.3;
        }
        100% {
          transform: translateY(-100vh) scale(0.4);
          opacity: 0;
        }
      }

      /* ═══ Glassmorphism Card ═══ */
      .login-glass-card {
        backdrop-filter: blur(24px) saturate(1.4);
        -webkit-backdrop-filter: blur(24px) saturate(1.4);
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease;
      }
      .login-glass-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 40px rgba(220, 38, 38, 0.12), 0 2px 12px rgba(0, 0, 0, 0.3);
      }

      /* ═══ Animated Border ═══ */
      .login-animated-border {
        position: relative;
        padding: 1px;
        border-radius: 1rem;
        background: linear-gradient(135deg, rgba(220, 38, 38, 0.2) 0%, rgba(220, 38, 38, 0.05) 40%, rgba(15, 23, 42, 0.1) 60%, rgba(220, 38, 38, 0.15) 100%);
        background-size: 300% 300%;
        animation: login-border-shift 8s ease infinite;
      }
      @keyframes login-border-shift {
        0%, 100% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
      }

      /* ═══ Red Glow on Submit Button ═══ */
      .login-submit-btn:not(:disabled):hover {
        box-shadow: 0 6px 30px rgba(220, 38, 38, 0.45), 0 2px 8px rgba(220, 38, 38, 0.3) !important;
        transform: translateY(-1px);
        transition: box-shadow 0.25s ease, transform 0.25s ease;
      }
      .login-submit-btn:not(:disabled):active {
        transform: translateY(0);
        box-shadow: 0 2px 10px rgba(220, 38, 38, 0.4) !important;
      }

      /* ═══ Utility Classes ═══ */
      .login-shake { animation: login-shake 0.5s ease-in-out; }
      .login-fade-in { animation: login-fade-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; }
      .login-fade-in-scale { animation: login-fade-in-scale 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
      .login-glow-line { animation: login-glow-line 3s ease-in-out infinite; }
      .login-grid-scan { animation: login-grid-scan 4s linear infinite; }
      .login-input-group:focus-within {
        animation: login-input-focus 0.2s ease-out forwards;
      }
      .login-input-group-error:focus-within {
        animation: login-input-focus 0.2s ease-out forwards;
      }
      .login-btn-loading { animation: login-btn-pulse 1.5s ease-in-out infinite; }
      .login-typing-cursor { animation: login-typing-cursor 1s step-end infinite; }
      .login-status-blink { animation: login-status-blink 2s ease-in-out infinite; }
      .login-metric-count { animation: login-metric-count 0.8s cubic-bezier(0.16, 1, 0.3, 1) both; }
      .login-orbit-ring { animation: login-orbit-ring 20s linear infinite; }
      .login-pulse-ring { animation: login-pulse-ring 2.5s ease-out infinite; }
      .login-shimmer-sweep { animation: login-shimmer-sweep 2.5s ease-in-out infinite; }
      .login-bg-shift {
        animation: login-bg-shift 20s ease infinite;
        background-size: 400% 400%;
      }
      .login-progress-bar {
        animation: login-progress-indeterminate 1.8s ease-in-out infinite;
      }
    `}</style>
  );
}

// ─── Animated Gradient Background ─────────────────────────────

function AnimatedBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Layer 1: Deep base color */}
      <div className="absolute inset-0" style={{ background: "#060612" }} />

      {/* Layer 2: Animated navy-to-red gradient shift */}
      <div
        className="absolute inset-0 login-bg-shift"
        style={{
          background: `
            linear-gradient(135deg,
              rgba(15, 23, 42, 1) 0%,
              rgba(127, 29, 29, 0.6) 25%,
              rgba(6, 6, 18, 0.9) 50%,
              rgba(220, 38, 38, 0.3) 75%,
              rgba(15, 23, 42, 1) 100%
            )
          `,
          backgroundSize: "400% 400%",
        }}
      />

      {/* Layer 3: Radial glows */}
      <div
        className="absolute inset-0 login-bg-shift"
        style={{
          background: `
            radial-gradient(ellipse at 20% 50%, rgba(220, 38, 38, 0.15) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 20%, rgba(127, 29, 29, 0.12) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 80%, rgba(15, 23, 42, 0.8) 0%, transparent 50%)
          `,
          animationDuration: "25s",
        }}
      />

      {/* Layer 4: Hex grid pattern */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="login-hex-grid" width="60" height="52" patternUnits="userSpaceOnUse" patternTransform="rotate(15)">
            <path d="M30 0L60 15V37L30 52L0 37V15Z" fill="none" stroke="#DC2626" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#login-hex-grid)" />
      </svg>

      {/* Layer 5: Network topology SVG with animated data flow */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="login-network-dots" width="120" height="120" patternUnits="userSpaceOnUse">
            {/* Node dots */}
            <circle cx="60" cy="60" r="1.5" fill="#DC2626" />
            <circle cx="0" cy="0" r="1" fill="#DC2626" />
            <circle cx="120" cy="0" r="1" fill="#DC2626" />
            <circle cx="0" cy="120" r="1" fill="#DC2626" />
            <circle cx="120" cy="120" r="1" fill="#DC2626" />
            {/* Connection lines */}
            <line x1="60" y1="60" x2="0" y2="0" stroke="#DC2626" strokeWidth="0.3" />
            <line x1="60" y1="60" x2="120" y2="0" stroke="#DC2626" strokeWidth="0.3" />
            <line x1="60" y1="60" x2="0" y2="120" stroke="#DC2626" strokeWidth="0.3" />
            <line x1="60" y1="60" x2="120" y2="120" stroke="#DC2626" strokeWidth="0.3" />
            <line x1="0" y1="0" x2="120" y2="0" stroke="#DC2626" strokeWidth="0.2" />
            <line x1="120" y1="0" x2="120" y2="120" stroke="#DC2626" strokeWidth="0.2" />
            <line x1="120" y1="120" x2="0" y2="120" stroke="#DC2626" strokeWidth="0.2" />
            <line x1="0" y1="120" x2="0" y2="0" stroke="#DC2626" strokeWidth="0.2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#login-network-dots)" />
      </svg>

      {/* Layer 6: Scanning line */}
      <div
        className="absolute left-0 right-0 h-px login-grid-scan"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(220, 38, 38, 0.3) 20%, rgba(220, 38, 38, 0.6) 50%, rgba(220, 38, 38, 0.3) 80%, transparent 100%)",
        }}
      />

      {/* Layer 7: Floating particles (CSS-driven) */}
      <FloatingParticles />

      {/* Layer 8: CSS-only static dot particles scattered across background */}
      <div className="absolute inset-0" aria-hidden="true">
        {[
          { top: "8%", left: "12%", size: 3, dur: "12s", delay: "0s", anim: "login-particle-drift" },
          { top: "15%", left: "85%", size: 2, dur: "15s", delay: "2s", anim: "login-particle-drift-reverse" },
          { top: "25%", left: "45%", size: 2.5, dur: "10s", delay: "4s", anim: "login-particle-drift" },
          { top: "35%", left: "70%", size: 2, dur: "14s", delay: "1s", anim: "login-particle-drift-reverse" },
          { top: "50%", left: "20%", size: 3, dur: "11s", delay: "3s", anim: "login-particle-drift" },
          { top: "60%", left: "90%", size: 2, dur: "16s", delay: "5s", anim: "login-particle-drift-reverse" },
          { top: "70%", left: "35%", size: 2.5, dur: "13s", delay: "2.5s", anim: "login-particle-drift" },
          { top: "80%", left: "60%", size: 2, dur: "9s", delay: "6s", anim: "login-particle-drift-reverse" },
          { top: "90%", left: "15%", size: 3, dur: "17s", delay: "1.5s", anim: "login-particle-drift" },
          { top: "45%", left: "55%", size: 2, dur: "12s", delay: "7s", anim: "login-particle-drift-reverse" },
        ].map((p, i) => (
          <div
            key={`dot-${i}`}
            className="login-static-dot"
            style={{
              top: p.top,
              left: p.left,
              width: p.size,
              height: p.size,
              animation: `${p.anim} ${p.dur} ease-in-out ${p.delay} infinite`,
              boxShadow: `0 0 ${p.size * 4}px ${p.size}px rgba(220, 38, 38, 0.3)`,
            }}
          />
        ))}
        {/* Pulsing static dots */}
        {[
          { top: "18%", left: "30%", size: 2, delay: "0s" },
          { top: "42%", left: "78%", size: 3, delay: "1.5s" },
          { top: "65%", left: "8%", size: 2, delay: "3s" },
          { top: "28%", left: "92%", size: 2.5, delay: "4.5s" },
          { top: "75%", left: "50%", size: 2, delay: "2s" },
          { top: "55%", left: "42%", size: 3, delay: "0.8s" },
        ].map((p, i) => (
          <div
            key={`pulse-${i}`}
            className="login-static-dot"
            style={{
              top: p.top,
              left: p.left,
              width: p.size,
              height: p.size,
              animation: `login-particle-pulse 3s ease-in-out ${p.delay} infinite`,
              boxShadow: `0 0 ${p.size * 3}px ${p.size}px rgba(220, 38, 38, 0.25)`,
            }}
          />
        ))}
      </div>

      {/* Layer 9: Central radial glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(220, 38, 38, 0.08) 0%, transparent 60%)",
        }}
      />

      {/* Layer 10: Vignette overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(6, 6, 18, 0.7) 100%)",
        }}
      />
    </div>
  );
}

// ─── Floating Particles ───────────────────────────────────────

function FloatingParticles() {
  const particles = [
    { top: "100%", left: "5%", size: 2, delay: 0, duration: 14, color: "#DC2626" },
    { top: "95%", left: "15%", size: 3, delay: 2, duration: 11, color: "#EF4444" },
    { top: "100%", left: "28%", size: 2, delay: 4, duration: 16, color: "#F87171" },
    { top: "90%", left: "42%", size: 2.5, delay: 1, duration: 13, color: "#DC2626" },
    { top: "100%", left: "55%", size: 2, delay: 6, duration: 15, color: "#EF4444" },
    { top: "85%", left: "68%", size: 3, delay: 3, duration: 12, color: "#F87171" },
    { top: "100%", left: "78%", size: 2, delay: 7, duration: 17, color: "#DC2626" },
    { top: "95%", left: "90%", size: 2.5, delay: 5, duration: 10, color: "#EF4444" },
    { top: "100%", left: "10%", size: 2, delay: 8, duration: 18, color: "#F87171" },
    { top: "90%", left: "35%", size: 3, delay: 0.5, duration: 14, color: "#DC2626" },
    { top: "100%", left: "60%", size: 2, delay: 9, duration: 11, color: "#EF4444" },
    { top: "85%", left: "82%", size: 2.5, delay: 4.5, duration: 16, color: "#F87171" },
    { top: "100%", left: "22%", size: 2, delay: 10, duration: 13, color: "#DC2626" },
    { top: "95%", left: "48%", size: 3, delay: 1.5, duration: 15, color: "#EF4444" },
    { top: "100%", left: "72%", size: 2, delay: 6.5, duration: 12, color: "#F87171" },
    { top: "90%", left: "95%", size: 2.5, delay: 3.5, duration: 17, color: "#DC2626" },
  ];

  return (
    <>
      {particles.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full login-float-up"
          style={{
            top: p.top,
            left: p.left,
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 ${p.size * 3}px ${p.size}px ${p.color}40`,
            "--float-delay": `${p.delay}s`,
            "--float-duration": `${p.duration}s`,
          } as React.CSSProperties}
        />
      ))}
    </>
  );
}

// ─── Enhanced Logo with Orbital Rings ─────────────────────────

function LoginLogo() {
  return (
    <div className="flex flex-col items-center mb-8 login-fade-in" style={{ animationDelay: "0.05s" }}>
      <div className="relative mb-5">
        {/* Outer pulse ring */}
        <div className="absolute -inset-6 rounded-full border border-red-500/10 login-pulse-ring" />

        {/* Orbiting ring with dot */}
        <div className="absolute -inset-8 login-orbit-ring">
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
            style={{
              background: "#DC2626",
              boxShadow: "0 0 8px rgba(220, 38, 38, 0.6)",
            }}
          />
        </div>

        {/* Second orbiting ring (counter-rotation via CSS) */}
        <div
          className="absolute -inset-12 rounded-full border border-red-500/[0.06]"
          style={{ animation: "login-orbit-ring 30s linear infinite reverse" }}
        >
          <div
            className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-red-400/50"
            style={{ boxShadow: "0 0 6px rgba(220, 38, 38, 0.4)" }}
          />
        </div>

        {/* Main logo */}
        <div
          className="relative w-20 h-20 rounded-2xl flex items-center justify-center login-logo-glow z-10"
          style={{
            background: "linear-gradient(135deg, #DC2626 0%, #991B1B 100%)",
            boxShadow: "0 0 20px rgba(220, 38, 38, 0.3), 0 0 60px rgba(220, 38, 38, 0.1)",
          }}
        >
          <CircleDot className="w-10 h-10 text-white" strokeWidth={2} />
          {/* Inner shine */}
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%)",
            }}
          />
        </div>

        {/* Decorative rings */}
        <div className="absolute -inset-3 rounded-3xl border border-red-500/10" />
        <div className="absolute -inset-6 rounded-[2rem] border border-red-500/[0.05]" />
      </div>

      {/* Brand name */}
      <h1 className="text-3xl font-black tracking-[0.15em] text-white uppercase login-fade-in" style={{ animationDelay: "0.2s" }}>
        CRYPTSK
      </h1>
      <div className="flex items-center gap-2 mt-1.5 login-fade-in" style={{ animationDelay: "0.3s" }}>
        <div className="w-6 h-px bg-red-500/50 login-glow-line" />
        <p className="text-[10px] font-semibold tracking-[0.35em] text-red-400/80 uppercase">
          Intelligent ISP Platform
        </p>
        <div className="w-6 h-px bg-red-500/50 login-glow-line" />
      </div>
    </div>
  );
}

// ─── Status Indicator (top bar) ───────────────────────────────

function StatusIndicator() {
  return (
    <div
      className="absolute top-0 left-0 right-0 z-20 flex items-center justify-center gap-4 sm:gap-6 py-3 px-4 text-[10px] font-medium tracking-wider uppercase"
      style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 100%)" }}
    >
      <div className="flex items-center gap-1.5 text-green-400/70">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 login-status-blink" />
        <span className="hidden xs:inline">All Systems Operational</span>
        <span className="inline xs:hidden">Operational</span>
      </div>
      <span className="text-white/20">|</span>
      <div className="hidden sm:flex items-center gap-1.5 text-white/40">
        <Shield className="w-3 h-3" />
        TLS 1.3 Encrypted
      </div>
      <span className="text-white/20 hidden sm:inline">|</span>
      <div className="flex items-center gap-1.5 text-white/40">
        <Globe className="w-3 h-3" />
        v6.4
      </div>
    </div>
  );
}

// ─── Bottom Metrics Bar ───────────────────────────────────────

function MetricsBar() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const metrics = [
    { icon: Server, label: "Active Nodes", value: mounted ? "\u2014" : "..." },
    { icon: Wifi, label: "Avg Latency", value: mounted ? "\u2014" : "..." },
    { icon: BarChart3, label: "Bandwidth", value: mounted ? "\u2014" : "..." },
  ];

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20"
      style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.6) 0%, transparent 100%)" }}
    >
      <div className="flex items-center justify-center gap-5 sm:gap-8 md:gap-12 py-5">
        {metrics.map((m, i) => (
          <div
            key={m.label}
            className="flex items-center gap-2 login-metric-count"
            style={{ animationDelay: `${1.5 + i * 0.15}s` }}
          >
            <m.icon className="w-3.5 h-3.5 text-red-500/60" />
            <span className="text-[11px] font-medium text-white/35 uppercase tracking-wider hidden sm:inline">
              {m.label}
            </span>
            <span className="text-xs font-bold text-white/70 tabular-nums">
              {m.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Progress Bar (shown during login) ────────────────────────

function LoginProgressBar({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden rounded-t-2xl z-10">
      <div
        className="login-progress-bar h-full w-1/2"
        style={{
          background: "linear-gradient(90deg, transparent, #DC2626, #EF4444, transparent)",
        }}
      />
    </div>
  );
}

// ─── Main Login Page ──────────────────────────────────────────

export default function LoginPage() {
  const { login, isLoggingIn, error, clearError, checkAuth, isAuthenticated } =
    useAuthStore();
  const { setUser } = useAppStore();
  const abortControllerRef = useRef<AbortController | null>(null);

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [shakeKey, setShakeKey] = useState(0);
  const [networkRetry, setNetworkRetry] = useState(0);
  const year = new Date().getFullYear().toString();

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // If already authenticated, skip showing login (parent handles redirect)
  useEffect(() => {
    if (isAuthenticated) {
      const user = useAuthStore.getState().user;
      if (user) {
        setUser(user);
      }
    }
  }, [isAuthenticated, setUser]);

  // Clear global error when user types
  const handleEmailChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEmail(e.target.value);
      if (error) clearError();
      if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
      if (networkRetry > 0) setNetworkRetry(0);
    },
    [error, clearError, fieldErrors.email, networkRetry]
  );

  const handlePasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPassword(e.target.value);
      if (error) clearError();
      if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
      if (networkRetry > 0) setNetworkRetry(0);
    },
    [error, clearError, fieldErrors.password, networkRetry]
  );

  // ── Welcome TTS after login ──────────────────────────────────────
  const playWelcomeTTS = useCallback((userName?: string) => {
    try {
      const name = userName || "there";
      const text = `Welcome back, ${name}. How can I help you today?`;
      fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("TTS failed");
          return res.blob();
        })
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.play().catch(() => {});
          audio.onended = () => URL.revokeObjectURL(url);
          audio.onerror = () => URL.revokeObjectURL(url);
        })
        .catch(() => {
          // TTS failure is non-critical — silent fallback
        });
    } catch {
      // Ignore TTS errors during login
    }
  }, []);

  // Form submission with timeout & retry
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Abort any previous in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Client-side validation
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      errors.email = "Email is required";
    } else if (!isValidEmail(email.trim())) {
      errors.email = "Please enter a valid email address";
    }
    if (!password.trim()) {
      errors.password = "Password is required";
    } else if (password.length < 6) {
      errors.password = "Password must be at least 6 characters";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setShakeKey((prev) => prev + 1);
      return;
    }

    setFieldErrors({});

    // Attempt login with built-in timeout (15s) and auto-retry
    const maxRetries = 1;
    let attempt = 0;
    let success = false;

    while (attempt <= maxRetries && !success) {
      attempt++;

      if (attempt > 1) {
        setNetworkRetry(attempt - 1);
      }

      try {
        success = await login(email.trim(), password, { signal: controller.signal, timeout: 15000 });
      } catch {
        break;
      }

      if (!success) {
        const storeError = useAuthStore.getState().error;
        const isNetworkError =
          storeError?.includes("network") ||
          storeError?.includes("fetch") ||
          storeError?.includes("timeout") ||
          storeError?.includes("Failed to fetch");

        if (!isNetworkError || attempt > maxRetries || controller.signal.aborted) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    setNetworkRetry(0);

    if (success) {
      const user = useAuthStore.getState().user;
      if (user) {
        setUser(user);
      }
      // Show welcome notification using a custom element instead of sonner
      // to guarantee readable text color in both light and dark modes
      const welcomeEl = document.createElement("div");
      welcomeEl.setAttribute("role", "status");
      welcomeEl.setAttribute("aria-live", "polite");
      welcomeEl.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:999999999;padding:14px 18px;background:#FFFFFF;color:#111827;border:1px solid #E5E7EB;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.12),0 1px 4px rgba(0,0,0,0.06);font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:14px;max-width:380px;animation:toastSlideIn 0.35s ease forwards;cursor:pointer;";
      welcomeEl.innerHTML = `<div style="display:flex;align-items:center;gap:8px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><div><div style="font-weight:600;font-size:14px;color:#111827;">Welcome back!</div><div style="font-size:13px;color:#4B5563;margin-top:2px;">Signed in as ${escapeHtml(user?.name || email)}</div></div></div>`;
      welcomeEl.onclick = () => { welcomeEl.style.animation = "toastSlideOut 0.3s ease forwards"; setTimeout(() => welcomeEl.remove(), 300); };
      document.body.appendChild(welcomeEl);
      setTimeout(() => { if (welcomeEl.parentNode) { welcomeEl.style.animation = "toastSlideOut 0.3s ease forwards"; setTimeout(() => welcomeEl.remove(), 300); } }, 4000);

      // Speak welcome message via TTS
      playWelcomeTTS(user?.name);
    } else {
      setShakeKey((prev) => prev + 1);
      const storeError = useAuthStore.getState().error;
      toast.error("Login failed", {
        description: storeError || "Invalid credentials",
        style: {
          background: "#FFFFFF",
          color: "#111827",
          border: "1px solid #FCA5A5",
        },
        descriptionClassName: "!text-gray-600",
      });
    }
  };

  // If already authenticated, render nothing (parent will show dashboard)
  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-center items-center login-scanlines overflow-hidden">
      {/* Background layers */}
      <AnimatedBackground />
      <LoginAnimations />
      <StatusIndicator />

      {/* Main login card container */}
      <div className="relative z-10 w-full max-w-[440px] mx-3 sm:mx-4">
        {/* Logo + Brand */}
        <LoginLogo />

        {/* Login Card */}
        <div
          key={shakeKey}
          className={`${shakeKey > 0 ? "login-shake" : ""} login-fade-in`}
          style={{ animationDelay: "0.2s" }}
        >
          <div className="login-animated-border rounded-2xl">
            <div
              className="rounded-2xl p-6 sm:p-8 border relative overflow-hidden login-glass-card"
              style={{
                background:
                  "linear-gradient(180deg, rgba(15, 23, 42, 0.88) 0%, rgba(8, 12, 24, 0.94) 100%)",
                borderColor: "rgba(220, 38, 38, 0.08)",
              }}
            >
              {/* Loading progress bar */}
              <LoginProgressBar visible={isLoggingIn} />

              {/* Subtle card glow */}
              <div
                className="absolute inset-0 pointer-events-none rounded-2xl"
                style={{
                  boxShadow: "inset 0 0 80px rgba(220, 38, 38, 0.03)",
                }}
              />

              {/* Top accent line */}
              <div
                className="absolute top-0 left-8 right-8 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(220, 38, 38, 0.4) 50%, transparent 100%)",
                }}
              />

              {/* Noise texture overlay for frosted glass */}
              <div
                className="absolute inset-0 pointer-events-none rounded-2xl opacity-[0.015]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "repeat",
                  backgroundSize: "128px 128px",
                }}
              />

              {/* Card header */}
              <div className="text-center mb-7 relative z-[1] float-subtle">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Access Your Control Panel
                </h2>
                <p className="mt-1.5 text-sm text-slate-400">
                  Authenticate to manage your ISP network
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5 relative z-[1]" noValidate>
                {/* Global error */}
                {(error || networkRetry > 0) && (
                  <div
                    className="flex items-start gap-2.5 rounded-xl border p-3.5 text-sm login-fade-in"
                    style={{
                      background: "rgba(220, 38, 38, 0.08)",
                      borderColor: "rgba(220, 38, 38, 0.25)",
                    }}
                  >
                    <div
                      className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(220, 38, 38, 0.2)" }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    </div>
                    <div className="flex-1">
                      <span className="font-medium text-red-300">
                        {networkRetry > 0 ? "Connection issue" : "Authentication failed"}
                      </span>
                      <p className="text-xs mt-0.5 text-red-400/70">
                        {networkRetry > 0
                          ? `Retrying connection\u2026 (attempt ${networkRetry}/1)`
                          : error || "Invalid credentials. Please try again."}
                      </p>
                    </div>
                    {networkRetry > 0 && (
                      <Loader2 className="w-4 h-4 text-red-400 animate-spin flex-shrink-0 mt-0.5" />
                    )}
                  </div>
                )}

                {/* Email field */}
                <div className="space-y-2">
                  <Label
                    htmlFor="email"
                    className="text-xs font-semibold text-slate-400 uppercase tracking-wider"
                  >
                    Email Address
                  </Label>
                  <div
                    className={`${
                      fieldErrors.email ? "login-input-group-error" : "login-input-group"
                    } relative rounded-xl transition-all duration-200`}
                  >
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                      <Mail className="h-4 w-4 text-slate-500" />
                    </div>
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@cryptsk.com"
                      autoComplete="email"
                      value={email}
                      onChange={handleEmailChange}
                      className="pl-10 h-12 rounded-xl text-white placeholder:text-slate-600 border-slate-700/50 focus:border-red-500/50 login-input-enhanced"
                      style={{ background: "rgba(15, 23, 42, 0.6)" }}
                      disabled={isLoggingIn}
                    />
                    {fieldErrors.email && (
                      <div className="absolute right-3 inset-y-0 flex items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      </div>
                    )}
                  </div>
                  {fieldErrors.email && (
                    <p className="text-xs text-red-400 mt-1 pl-1 flex items-center gap-1.5">
                      <span className="inline-block w-1 h-1 rounded-full bg-red-500 flex-shrink-0" />
                      {fieldErrors.email}
                    </p>
                  )}
                </div>

                {/* Password field */}
                <div className="space-y-2">
                  <Label
                    htmlFor="password"
                    className="text-xs font-semibold text-slate-400 uppercase tracking-wider"
                  >
                    Password
                  </Label>
                  <div
                    className={`${
                      fieldErrors.password ? "login-input-group-error" : "login-input-group"
                    } relative rounded-xl transition-all duration-200`}
                  >
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                      <Lock className="h-4 w-4 text-slate-500" />
                    </div>
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      value={password}
                      onChange={handlePasswordChange}
                      className="pl-10 pr-11 h-12 rounded-xl text-white placeholder:text-slate-600 border-slate-700/50 focus:border-red-500/50 login-input-enhanced"
                      style={{ background: "rgba(15, 23, 42, 0.6)" }}
                      disabled={isLoggingIn}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-500 hover:text-slate-300 transition-colors rounded-lg"
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p className="text-xs text-red-400 mt-1 pl-1 flex items-center gap-1.5">
                      <span className="inline-block w-1 h-1 rounded-full bg-red-500 flex-shrink-0" />
                      {fieldErrors.password}
                    </p>
                  )}
                </div>

                {/* Remember me + Forgot password */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="remember"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked === true)}
                      className="login-checkbox"
                    />
                    <Label
                      htmlFor="remember"
                      className="text-xs text-slate-400 cursor-pointer select-none"
                    >
                      Remember this device
                    </Label>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      toast.info("Password reset", {
                        description:
                          "Please contact your administrator to reset your password.",
                      });
                    }}
                    className="text-xs font-medium text-red-400/80 hover:text-red-300 transition-colors duration-200"
                  >
                    Forgot password?
                  </button>
                </div>

                {/* Submit button with shimmer effect */}
                <div className="relative">
                  <Button
                    type="submit"
                    disabled={isLoggingIn}
                    className={`w-full h-12 font-semibold text-sm tracking-wide rounded-xl text-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed border-0 login-submit-btn btn-ripple relative overflow-hidden ${
                      isLoggingIn ? "login-btn-loading" : ""
                    }`}
                    style={{
                      background: "linear-gradient(135deg, #DC2626 0%, #991B1B 100%)",
                      boxShadow: "0 4px 15px rgba(220, 38, 38, 0.3)",
                    }}
                  >
                    {/* Shimmer overlay */}
                    <div
                      className="absolute inset-0 login-shimmer-sweep pointer-events-none"
                      style={{
                        background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)",
                      }}
                    />
                    <span className="relative z-[1]">
                      {isLoggingIn ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                          Authenticating<span className="login-typing-cursor">&hellip;</span>
                        </>
                      ) : (
                        "Sign In to Control Panel"
                      )}
                    </span>
                  </Button>
                </div>
              </form>

              {/* Bottom accent line */}
              <div
                className="absolute bottom-0 left-8 right-8 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(220, 38, 38, 0.12) 50%, transparent 100%)",
                }}
              />
            </div>
          </div>
        </div>

        {/* Subscriber Portal CTA */}
        <div className="mt-5 login-fade-in" style={{ animationDelay: "0.4s" }}>
          <button
            type="button"
            onClick={() => {
              window.open("/?portal=selfcare", "_blank");
            }}
            className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border border-white/[0.06] text-sm font-medium text-slate-400 hover:text-emerald-400 hover:border-emerald-500/20 hover:bg-emerald-500/[0.04] transition-all duration-200 group"
          >
            <Users className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
            <span>Subscriber Self-Care Portal</span>
            <svg className="w-3.5 h-3.5 text-slate-600 group-hover:text-emerald-400/60 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>

        {/* Security footer */}
        <div className="mt-4 text-center login-fade-in" style={{ animationDelay: "0.5s" }}>
          <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
            <Shield className="w-3 h-3 text-red-500/40" />
            <span className="hidden sm:inline">Secured with 256-bit TLS encryption</span>
            <span className="inline sm:hidden">256-bit TLS</span>
            <span className="text-slate-700">&middot;</span>
            <span>&copy; {year || "----"} Cryptsk Pvt Ltd</span>
          </div>
          {/* Credential hint — shown in development/demo environments */}
          <div className="mt-2 px-3 py-1.5 rounded-lg text-[10px] text-slate-500 inline-block" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="text-slate-400 font-medium">Demo:</span>{" "}
            <span className="text-slate-500">admin@cryptsk.com</span>
            <span className="text-slate-600 mx-1">/</span>
            <span className="text-slate-500">Admin@123</span>
          </div>
        </div>
      </div>

      <MetricsBar />
    </div>
  );
}
