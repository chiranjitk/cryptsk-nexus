/**
 * Captive Portal Layout — Fully Isolated from Admin Theme
 *
 * CP-MED-07 Fix: This layout provides complete theme isolation:
 *
 * 1. PROVIDER ISOLATION: The root layout (layout.tsx) detects the
 *    X-Route-Context: portal header set by proxy.ts and skips ALL
 *    admin providers (FoucGuard, PerformancePatch, UIStyleProvider,
 *    AuthProvider, PermissionProvider, FeatureFlagsProvider,
 *    AdminProvidersGate, PWA, toasters, i18n). The portal renders
 *    with a bare <html><body data-portal="true"> wrapper only.
 *
 * 2. CSS ISOLATION: globals.css is still imported by the root layout
 *    (Next.js requirement), so admin theme CSS variables and component
 *    styles are technically in the cascade. This layout neutralizes
 *    them with scoped resets under [data-portal="true"].
 *
 * 3. CSP ISOLATION: proxy.ts sets frame-ancestors 'none' and
 *    X-Frame-Options: DENY for /connect routes, preventing
 *    clickjacking via iframe embedding.
 *
 * 4. FUTURE: For complete isolation, serve the portal from a
 *    separate domain/subdomain (e.g., portal.staysuite.com).
 */

import type { Metadata } from 'next';
import { PortalFontLoader } from './portal-font-loader';

export const metadata: Metadata = {
  title: 'Connect to WiFi',
  description: 'WiFi captive portal - connect to the hotel network',
};

export default function ConnectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/*
        CP-MED-07: Scoped CSS reset under [data-portal="true"].
        This selector matches the <body data-portal="true"> set
        by the root layout's portal branch. It:
        - Removes any residual dark class theme leaking
        - Overrides all admin CSS variables with neutral defaults
        - Nullifies admin theme visual effects (themes-b.css)
        - Prevents enterprise.css component overrides
        - Scopes all resets to portal only via [data-portal]
      */}
      <style>{`
        /* ===================================================
           PORTAL CSS ISOLATION LAYER
           All selectors scoped to [data-portal="true"] to
           prevent admin theme leaking into the captive portal.
           =================================================== */

        /* 1. Prevent admin dark mode from affecting portal */
        [data-portal="true"],
        [data-portal="true"] .dark {
          color-scheme: light;
        }

        /* 2. Neutralize all admin CSS theme variables */
        [data-portal="true"] {
          --background: #ffffff;
          --foreground: #111827;
          --card: #ffffff;
          --card-foreground: #111827;
          --popover: #ffffff;
          --popover-foreground: #111827;
          --primary: #0d9488;
          --primary-foreground: #ffffff;
          --secondary: #f3f4f6;
          --secondary-foreground: #1f2937;
          --muted: #f3f4f6;
          --muted-foreground: #6b7280;
          --accent: #f3f4f6;
          --accent-foreground: #1f2937;
          --destructive: #ef4444;
          --border: #e5e7eb;
          --input: #e5e7eb;
          --ring: #0d9488;
          --radius: 0.5rem;

          /* Neutralize sidebar variables */
          --sidebar: #ffffff;
          --sidebar-foreground: #111827;
          --sidebar-primary: #0d9488;
          --sidebar-primary-foreground: #ffffff;
          --sidebar-accent: #f3f4f6;
          --sidebar-accent-foreground: #111827;
          --sidebar-border: #e5e7eb;
          --sidebar-ring: #0d9488;

          /* Neutralize chart variables */
          --chart-1: #f97316;
          --chart-2: #eab308;
          --chart-3: #22c55e;
          --chart-4: #3b82f6;
          --chart-5: #a855f7;

          /* Neutralize premium/gradient variables */
          --premium: #d97706;
          --premium-foreground: #111827;
          --gradient-start: #0d9488;
          --gradient-end: #0891b2;

          /* Neutralize slider variables */
          --slider-track-bg: #e5e7eb;
          --slider-range-bg: #0d9488;
          --slider-thumb-bg: #ffffff;
          --slider-thumb-border: #0d9488;
        }

        /* 3. Nullify admin theme visual effects from themes-b.css */
        /* These !important overrides prevent any [data-theme] selectors
           from applying decorative styles to portal elements */
        [data-portal="true"] aside,
        [data-portal="true"] [data-theme] aside {
          background: none !important;
          border: none !important;
          box-shadow: none !important;
        }
        [data-portal="true"] aside::before,
        [data-portal="true"] aside::after,
        [data-portal="true"] [data-theme] aside::before,
        [data-portal="true"] [data-theme] aside::after {
          display: none !important;
        }
        [data-portal="true"] [data-slot="card"],
        [data-portal="true"] [data-theme] [data-slot="card"] {
          border: none !important;
          box-shadow: none !important;
          background: none !important;
        }
        [data-portal="true"] header,
        [data-portal="true"] [data-theme] header {
          border: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }
        [data-portal="true"] .app-background,
        [data-portal="true"] .app-background::before,
        [data-portal="true"] .app-background::after,
        [data-portal="true"] [data-theme] .app-background,
        [data-portal="true"] [data-theme] .app-background::before,
        [data-portal="true"] [data-theme] .app-background::after {
          display: none !important;
          content: none !important;
        }

        /* 4. Reset body styles for portal */
        [data-portal="true"] {
          margin: 0 !important;
          padding: 0 !important;
          min-height: 100vh;
          overflow-x: hidden;
        }

        /* 5. Prevent login-animations.css from affecting portal */
        [data-portal="true"] .login-container,
        [data-portal="true"] .login-card {
          animation: none !important;
          transform: none !important;
        }

        /* ===================================================
           PREMIUM PORTAL ANIMATIONS
           Modern, subtle, performance-optimized keyframes
           for a high-end captive portal experience.
           =================================================== */

        /* Shimmer sweep for loading skeletons */
        @keyframes portal-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        /* Premium shine sweep for primary buttons */
        @keyframes portal-shine {
          0% { background-position: 200% 0; }
          60% { background-position: -100% 0; }
          100% { background-position: -100% 0; }
        }
        [data-portal="true"] .portal-shimmer {
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%);
          background-size: 200% 100%;
          animation: portal-shimmer 2s ease-in-out infinite;
        }
        [data-portal="true"]:not(.dark) .portal-shimmer {
          background: linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.04) 50%, transparent 100%);
          background-size: 200% 100%;
          animation: portal-shimmer 2s ease-in-out infinite;
        }

        /* Ambient floating orbs — slow, organic movement */
        @keyframes portal-float-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(30px, -20px) scale(1.05); }
          50% { transform: translate(-10px, -40px) scale(0.95); }
          75% { transform: translate(-30px, -10px) scale(1.02); }
        }
        @keyframes portal-float-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(-25px, 15px) scale(0.97); }
          50% { transform: translate(15px, 35px) scale(1.04); }
          75% { transform: translate(35px, 5px) scale(0.98); }
        }
        @keyframes portal-float-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(20px, 25px) scale(1.03); }
          66% { transform: translate(-20px, -15px) scale(0.96); }
        }

        /* Expanding pulse ring for success checkmark */
        @keyframes portal-pulse-ring {
          0% { transform: scale(0.8); opacity: 0.6; }
          50% { transform: scale(1.3); opacity: 0; }
          100% { transform: scale(0.8); opacity: 0; }
        }

        /* Gradient border rotation */
        @keyframes portal-border-rotate {
          0% { --border-angle: 0deg; }
          100% { --border-angle: 360deg; }
        }

        /* Subtle breathing glow */
        @keyframes portal-glow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }

        /* Fade-in-up with subtle spring */
        @keyframes portal-fade-in-up {
          0% { opacity: 0; transform: translateY(16px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        [data-portal="true"] .portal-animate-in {
          animation: portal-fade-in-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        /* Premium input focus glow */
        [data-portal="true"] input:focus,
        [data-portal="true"] textarea:focus,
        [data-portal="true"] select:focus {
          transition: box-shadow 0.2s ease, border-color 0.2s ease;
        }

        /* Smooth scrollbar for portal */
        [data-portal="true"] ::-webkit-scrollbar {
          width: 4px;
        }
        [data-portal="true"] ::-webkit-scrollbar-track {
          background: transparent;
        }
        [data-portal="true"] ::-webkit-scrollbar-thumb {
          background: rgba(128,128,128,0.3);
          border-radius: 2px;
        }
        [data-portal="true"] ::-webkit-scrollbar-thumb:hover {
          background: rgba(128,128,128,0.5);
        }

        /* ── Custom Checkbox Toggle ── */
        [data-portal="true"] .portal-toggle {
          position: relative;
          width: 36px;
          height: 20px;
          -webkit-appearance: none;
          appearance: none;
          background: rgba(128,128,128,0.3);
          border-radius: 9999px;
          outline: none;
          cursor: pointer;
          transition: background 0.2s ease;
          flex-shrink: 0;
        }
        [data-portal="true"] .portal-toggle:checked {
          background: var(--portal-accent, #14b8a6);
        }
        [data-portal="true"] .portal-toggle::after {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          width: 16px;
          height: 16px;
          background: #ffffff;
          border-radius: 50%;
          transition: transform 0.2s ease;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        [data-portal="true"] .portal-toggle:checked::after {
          transform: translateX(16px);
        }
        [data-portal="true"] .portal-toggle:focus-visible {
          box-shadow: 0 0 0 2px var(--portal-accent, #14b8a6);
        }

        /* ── Custom Checkbox ── */
        [data-portal="true"] .portal-checkbox {
          position: relative;
          width: 18px;
          height: 18px;
          -webkit-appearance: none;
          appearance: none;
          border: 2px solid rgba(128,128,128,0.4);
          border-radius: 4px;
          outline: none;
          cursor: pointer;
          transition: all 0.15s ease;
          flex-shrink: 0;
          background: transparent;
        }
        [data-portal="true"] .portal-checkbox:checked {
          background: var(--portal-accent, #14b8a6);
          border-color: var(--portal-accent, #14b8a6);
        }
        [data-portal="true"] .portal-checkbox:checked::after {
          content: '';
          position: absolute;
          top: 1px;
          left: 5px;
          width: 5px;
          height: 9px;
          border: solid #ffffff;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }
        [data-portal="true"] .portal-checkbox:focus-visible {
          box-shadow: 0 0 0 2px var(--portal-accent, #14b8a6);
        }

        /* ── Custom Select/Dropdown ── */
        [data-portal="true"] .portal-select {
          -webkit-appearance: none;
          appearance: none;
          background: rgba(128,128,128,0.1);
          border: 1px solid rgba(128,128,128,0.25);
          border-radius: 8px;
          padding: 4px 28px 4px 10px;
          font-size: 12px;
          color: inherit;
          cursor: pointer;
          outline: none;
          transition: all 0.15s ease;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 8px center;
        }
        [data-portal="true"] .portal-select:hover {
          border-color: rgba(128,128,128,0.5);
        }
        [data-portal="true"] .portal-select:focus {
          border-color: var(--portal-accent, #14b8a6);
          box-shadow: 0 0 0 1px var(--portal-accent, #14b8a6);
        }
        [data-portal="true"] .portal-select option {
          background: #1a1a1a;
          color: #f0f0f0;
        }

        /* ── Confetti Animation ── */
        @keyframes portal-confetti-fall {
          0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes portal-confetti-sway {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(15px); }
          75% { transform: translateX(-15px); }
        }
        [data-portal="true"] .portal-confetti-piece {
          position: fixed;
          top: -10px;
          width: 8px;
          height: 8px;
          border-radius: 2px;
          animation: portal-confetti-fall linear forwards, portal-confetti-sway ease-in-out infinite;
          pointer-events: none;
          z-index: 9999;
        }

        /* ── Slide Transition for Carousel ── */
        @keyframes portal-slide-in-right {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes portal-slide-out-left {
          from { opacity: 1; transform: translateX(0); }
          to { opacity: 0; transform: translateX(-20px); }
        }
        [data-portal="true"] .portal-slide-enter {
          animation: portal-slide-in-right 0.3s ease-out forwards;
        }
        [data-portal="true"] .portal-slide-exit {
          animation: portal-slide-out-left 0.3s ease-in forwards;
        }

        /* ── Amenity Card Hover ── */
        [data-portal="true"] .portal-amenity-card {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        [data-portal="true"] .portal-amenity-card:hover {
          transform: translateY(-2px);
        }

        /* ── Premium Form Card — subtle lift on hover ── */
        [data-portal="true"] .portal-form-card {
          transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.3s ease;
        }
        [data-portal="true"] .portal-form-card:hover {
          transform: translateY(-2px);
        }

        /* ── Auth method tab focus ring (premium) ── */
        [data-portal="true"] button:focus-visible {
          outline: 2px solid var(--portal-accent, #14b8a6);
          outline-offset: 2px;
        }

        /* ═══════════════════════════════════════════════════════════════
           RTL (Right-to-Left) SUPPORT
           Scoped to [data-portal="true"][dir="rtl"] so LTR is untouched.
           ═══════════════════════════════════════════════════════════════ */

        /* 1. Global text direction and alignment */
        [data-portal="true"][dir="rtl"] {
          direction: rtl;
          text-align: right;
        }

        /* 2. Form inputs & textareas — right-aligned text + RTL padding */
        [data-portal="true"][dir="rtl"] input,
        [data-portal="true"][dir="rtl"] textarea,
        [data-portal="true"][dir="rtl"] select,
        [data-portal="true"][dir="rtl"] input::placeholder,
        [data-portal="true"][dir="rtl"] textarea::placeholder {
          text-align: right;
          direction: rtl;
        }

        /* 3. Logical property overrides for flex layouts that use explicit px */
        [data-portal="true"][dir="rtl"] .flex-row-reverse-auto {
          flex-direction: row-reverse;
        }

        /* 4. Checkbox and radio alignment — label text on the right of the control */
        [data-portal="true"][dir="rtl"] .portal-checkbox,
        [data-portal="true"][dir="rtl"] .portal-toggle {
          margin-left: 0;
          margin-right: 0;
        }

        /* 5. Select dropdown arrow — flip to left side in RTL */
        [data-portal="true"][dir="rtl"] .portal-select {
          padding: 4px 10px 4px 28px;
          background-position: left 8px center;
        }

        /* 6. Focus ring and glow — works with both directions */
        [data-portal="true"][dir="rtl"] input:focus,
        [data-portal="true"][dir="rtl"] textarea:focus,
        [data-portal="true"][dir="rtl"] select:focus {
          transition: box-shadow 0.2s ease, border-color 0.2s ease;
        }

        /* 7. Scrollbar on the left side for RTL */
        [data-portal="true"][dir="rtl"] ::-webkit-scrollbar {
          width: 4px;
        }

        /* 8. Terms link underline offset */
        [data-portal="true"][dir="rtl"] a {
          text-decoration-skip-ink: none;
        }

        /* 9. Input with icon — icon on right, text padding adjusted */
        [data-portal="true"][dir="rtl"] input[class*="pl-10"] {
          padding-left: 1rem;
          padding-right: 2.5rem;
        }
        [data-portal="true"][dir="rtl"] input[class*="pl-10"] ~ svg,
        [data-portal="true"][dir="rtl"] .input-icon-wrapper {
          right: auto;
          left: 1rem;
        }
      `}</style>
      <PortalFontLoader />
      <div data-portal-root className="min-h-screen">
        {children}
      </div>
    </>
  );
}