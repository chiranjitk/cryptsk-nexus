# CRYPTSKINTELLIGENT ISP Platform — Final Feature Sheet (v7.0)

> **Purpose:** This is the complete, preserved feature inventory of the running CRYPTSKINTELLIGENT ("Cryptsk") ISP platform. Use this document when rebuilding the new product so **no feature is lost**.
>
> **Generated from:** Live source-code analysis of `/home/z/my-project` (Next.js 16 + PostgreSQL 18 + FreeRADIUS 3.2.7 + 12 Bun mini-services).
> **Last running version:** v7.0 · Dashboard verified HTTP 200 · 15 seed subscribers · Admin login `admin@cryptsk.com / Admin@2026`.
> **The user's favorite parts (preserve at all costs):** the **Dashboard look & feel** (§3) and the **full product color combination** (§2 — Red `#DC2626` primary on Dark Navy `#0F172A` sidebar).

---

## Table of Contents

1. [Executive Summary & Scale](#1-executive-summary--scale)
2. [Design System & Color Combination ★ (user favorite)](#2-design-system--color-combination--user-favorite)
3. [Dashboard Look & Feel ★ (user favorite)](#3-dashboard-look--feel--user-favorite)
4. [Complete Menu / Page Feature List (113 pages)](#4-complete-menu--page-feature-list-113-pages)
5. [Backend Feature List (APIs + Mini-Services)](#5-backend-feature-list-apis--mini-services)
6. [Data Model (204 Prisma models + 90 enums)](#6-data-model-204-prisma-models--90-enums)
7. [Architecture & Integrations](#7-architecture--integrations)
8. [Rebuild Cheat-Sheet](#8-rebuild-cheat-sheet)

---

## 1. Executive Summary & Scale

**CRYPTSKINTELLIGENT (branded "Cryptsk")** is a comprehensive, end-to-end ISP (Internet Service Provider) management platform designed for Indian ISPs. It covers the complete lifecycle: subscriber acquisition → billing → network management → field operations → AI-powered intelligence.

### 1.1 Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Framework | Next.js (App Router) | 16.2.6 |
| UI Library | React | 19.2.6 |
| Styling | Tailwind CSS | 4.x |
| Component Library | shadcn/ui (New York style, neutral base) + Radix UI | latest |
| Icons | lucide-react | 0.525.0 |
| State (client) | Zustand | 5.0.13 |
| State (server) | TanStack Query | 5.x |
| Forms | React Hook Form + Zod | 7.x / 4.x |
| Backend | Next.js API Routes | 16.2.6 |
| ORM | Prisma | 6.19.3 |
| Database | PostgreSQL | 18.4 (bundled, compiled from source) |
| AAA | FreeRADIUS | 3.2.7 (compiled from source) |
| Process Manager | PM2 | latest |
| Auth | Custom HMAC-SHA256 session tokens (cookie `cryptsk_session` + Bearer fallback) | — |
| Password Hashing | bcryptjs | 3.0.3 |
| Charts | Recharts | 2.15.4 |
| Maps | Leaflet / React-Leaflet | 1.9.4 / 5.0.0 |
| Dark Mode | next-themes | 0.4.6 |
| Runtime | Bun / Node.js | — |
| SMS | MSG91 / Twilio / WhatsApp Cloud | — |
| Email | Nodemailer (SMTP) | 8.0.7 |
| Payment | Razorpay + Stripe + PayU | — |
| Network libs | SNMP (net-snmp), SSH2, ros-client (MikroTik API) | — |
| Voice | Web Speech API + LLM | — |
| AI | z-ai-web-dev-sdk (LLM/VLM) | 0.0.17 |

### 1.2 Scale Metrics (current running product)

| Metric | Count |
|--------|-------|
| API route files (`route.ts`) | **501** |
| API endpoint groups | **134** |
| Prisma models | **204** |
| Enumerations | **90** |
| Sidebar nav items | **~100** across 11 sections |
| Page components | **113** (96 root + 7 sub-tabs + 10 selfcare) |
| Dashboard widgets | **40** (+ fixed status bar) |
| Mini-services (Bun) | **12** |
| UI components (shadcn/ui) | **50+** |
| Platform modules | **17** |
| Seed data | 1 admin · 6 areas · 8 plans · 15 subscribers · 12 RADIUS users · 1 NAS · 5 invoices |

### 1.3 Port Mapping

| Port | Service |
|------|---------|
| 3000 | Next.js app (PM2: `cryptsk-isp`) |
| 3001 | radius-service |
| 3002 | network-monitor (WebSocket) |
| 3003 | whatsapp-bot |
| 3004 | billing-cron |
| 3005 | gateway-service (the big control plane) |
| 3006 | multiwan-monitor |
| 3010 | session-engine (WebSocket) |
| 3020 | snmp-service |
| 3030 | ips-daemon (WebSocket `/ws`) |
| 3031 | ndpi-service |
| 3870 | diameter-service |
| 1514/UDP | syslog-service |
| 1812/1813/3799 | FreeRADIUS auth/acct/CoA |
| 5432 | PostgreSQL |

### 1.4 Key Credentials

| Service | Username | Password |
|---------|----------|----------|
| Admin Login | admin@cryptsk.com | Admin@2026 |
| PostgreSQL (app) | z (also `cryptsk`) | Cryptsk2026 |
| PostgreSQL (superuser) | postgres | postgres |

---

## 2. Design System & Color Combination ★ (user favorite)

> **The signature identity: CRYPTSK RED (`#DC2626`) primary on a DARK NAVY (`#0F172A`) sidebar.** Red is the *only* accent color — used for buttons, focus rings, active states, hovers, chart primary, badges, the NProgress bar, and selection. The dark-navy sidebar stays dark in **both** light and dark modes (it's a permanent dark anchor).

### 2.1 Light Theme (`:root`)

| Token | Hex | Usage |
|-------|-----|-------|
| `--background` | `#FFFFFF` | App background |
| `--foreground` | `#1E293B` | Body text (slate-800) |
| `--card` | `#FFFFFF` | Card background |
| `--card-foreground` | `#1E293B` | Card text |
| `--popover` / `--popover-foreground` | `#FFFFFF` / `#1E293B` | Popover/dropdown |
| **`--primary`** | **`#DC2626`** | **CRYPTSK RED (red-600)** — buttons, active, focus |
| `--primary-foreground` | `#FFFFFF` | Text on primary |
| `--secondary` / `--secondary-foreground` | `#F1F5F9` / `#1E293B` | Secondary surface |
| `--muted` / `--muted-foreground` | `#F1F5F9` / `#64748B` | Muted surface / caption text |
| `--accent` / `--accent-foreground` | `#FEE2E2` / `#991B1B` | Active-item tint (red-100 / red-800) |
| `--destructive` | `#DC2626` | Same as primary |
| `--border` / `--input` | `#E2E8F0` | Slate-200 borders |
| `--ring` | `#DC2626` | Focus ring |
| **`--sidebar`** | **`#0F172A`** | **DARK NAVY sidebar (slate-900) — fixed in both themes** |
| `--sidebar-foreground` | `#94A3B8` | Sidebar body text (slate-400) |
| `--sidebar-primary` | `#DC2626` | Sidebar active accent |
| `--sidebar-primary-foreground` | `#FFFFFF` | Text on sidebar primary |
| `--sidebar-accent` / `-foreground` | `#1E293B` / `#E2E8F0` | Sidebar hover surface |
| `--sidebar-border` | `#1E293B` | Sidebar dividers |
| `--sidebar-ring` | `#DC2626` | Sidebar focus ring |
| `--radius` | `0.625rem` | Base radius (10px) |

### 2.2 Dark Theme (`.dark`)

| Token | Hex | Change vs light |
|-------|-----|-----------------|
| `--background` | `#0F172A` | Navy (was white) |
| `--foreground` | `#F1F5F9` | Slate-100 |
| `--card` / `--card-foreground` | `#1E293B` / `#F1F5F9` | Slate-800 cards |
| `--popover` / `--popover-foreground` | `#1E293B` / `#F1F5F9` | |
| **`--primary`** | **`#EF4444`** | Brighter red-400 (better contrast on dark) |
| `--secondary` / `-foreground` | `#1E293B` / `#F1F5F9` | |
| `--muted` / `--muted-foreground` | `#1E293B` / `#94A3B8` | |
| `--accent` / `-foreground` | `#450A0A` / `#FCA5A5` | Deep red-950 surface |
| `--destructive` | `#EF4444` | |
| `--border` / `--input` | `#334155` | Slate-700 |
| `--ring` | `#EF4444` | |
| **`--sidebar`** | **`#020617`** | Deepest navy (slate-950) |
| `--sidebar-primary` | `#EF4444` | |

### 2.3 Chart Palette (recharts)

| Token | Light | Dark | Semantic role |
|-------|-------|------|---------------|
| `--chart-1` | `#DC2626` | `#EF4444` | **Primary / Revenue / Subscribers (RED)** |
| `--chart-2` | `#16A34A` | `#22C55E` | Success / Active / Online (GREEN) |
| `--chart-3` | `#2563EB` | `#3B82F6` | Info / Secondary metric (BLUE) |
| `--chart-4` | `#D97706` | `#F59E0B` | Warning / Pending (AMBER) |
| `--chart-5` | `#7C3AED` | `#8B5CF6` | Special / AI / Plans (VIOLET) |

### 2.4 Custom Cryptsk Semantic Tokens

```
--color-cryptsk-red:        #DC2626
--color-cryptsk-red-dark:   #B91C1C   /* gradient end-stop */
--color-cryptsk-red-light:  #FEE2E2
--color-cryptsk-navy:       #0F172A
--color-cryptsk-success:    #16A34A
--color-cryptsk-warning:    #D97706
--color-cryptsk-blue:       #2563EB
--color-cryptsk-purple:     #7C3AED
```

### 2.5 Stat Card Gradients (135° diagonal)

| Class | Gradient |
|-------|----------|
| `.stat-gradient-red` | `#DC2626 → #991B1B` |
| `.stat-gradient-teal` | `#0D9488 → #0F766E` |
| `.stat-gradient-blue` | `#2563EB → #1D4ED8` |
| `.stat-gradient-green` | `#16A34A → #15803D` |
| `.stat-gradient-amber` | `#D97706 → #B45309` |
| `.stat-gradient-emerald` | `#059669 → #047857` |
| `.stat-gradient-navy` | `#0F172A → #1E293B` |
| `.stat-gradient-purple` | `#7C3AED → #6D28D9` |
| `.stat-gradient-cyan` | `#0891B2 → #0E7490` |
| `.aging-gradient-amber/orange/red/critical` | `#D97706→#B45309` / `#EA580C→#C2410C` / `#DC2626→#991B1B` / `#991B1B→#7F1D1D` |

### 2.6 Status Badge Colors

| State | Light (bg/text/border) | Dark |
|-------|------------------------|------|
| active / success | `#DCFCE7 / #15803D / #BBF7D0` | `#052E16 / #4ADE80 / #14532D` |
| suspended / warning | `#FEF3C7 / #B45309 / #FDE68A` | `#451A03 / #FCD34D / #78350F` |
| disconnected / error | `#FEE2E2 / #B91C1C / #FECACA` | `#450A0A / #FCA5A5 / #7F1D1D` |
| pending | `#DBEAFE / #1D4ED8 / #BFDBFE` | `#172554 / #93C5FD / #1E3A5F` |
| info | `#E0F2FE / #0369A1 / #BAE6FD` | `#0C4A6E / #7DD3FC / #164E63` |
| inactive | `#F1F5F9 / #64748B / #E2E8F0` | `#1E293B / #94A3B8 / #334155` |

### 2.7 Role Badge Colors

| Role | Color |
|------|-------|
| SUPER_ADMIN | red |
| ADMIN | amber |
| OPERATOR | teal |
| AGENT | emerald |
| TECHNICIAN | violet |
| default | slate |

### 2.8 Typography

- **Fonts:** `Geist` (sans) + `Geist_Mono` (mono), loaded via `next/font/google`, applied on `<body>` with `antialiased`.
- **CSS vars:** `--font-sans: var(--font-geist-sans)`, `--font-mono: var(--font-geist-mono)`.
- **Type scale:** `text-[10px]` micro-labels · `text-[11px]` sidebar stats · `text-xs` captions · `text-sm` body/nav/cells · `text-base` default · `text-lg/xl/2xl` page headers · `text-3xl/4xl/5xl` dashboard KPIs.
- **Weights:** `font-medium` (nav) · `font-semibold` (card titles, badges) · `font-bold` (group labels, buttons) · `font-black` ("CRYPTSK" wordmark).
- **Letter-spacing:** `tracking-[0.15em]` brand wordmark · `tracking-[0.2em]` "AAA Platform" tagline · `tracking-[0.08em]` sidebar group labels (uppercase).
- **Special classes:** `.text-gradient-red` (`linear-gradient(135deg, #DC2626, #EF4444)` clipped to text) · `.text-gradient-teal` · `.text-gradient-navy` · `.tabular-nums` on all stat numbers.

### 2.9 Layout Shell (`src/components/layout/app-shell.tsx`)

```
<Providers>                       ← QueryClientProvider + ThemeProvider
  <SidebarProvider>               ← --sidebar-width=16rem, --sidebar-width-icon=3rem
    <NProgressLoader />           ← red 3px bar on top
    <ModuleStoreSync />
    <div className="hidden lg:block"><AppSidebar /></div>   ← desktop sidebar (lg+)
    <SidebarInset>                ← main column flex-col
      <AppHeader />               ← sticky top h-14
      <main className="flex-1 content-area">{children}</main>
      <AppFooter />               ← mt-auto shrink-0
    </SidebarInset>
    <QuickActionsWidget />        ← floating
    <QuickNotesWidget />          ← floating
    <CommandPalette />            ← ⌘K overlay
    <KeyboardShortcutsDialog />
    <VoiceAssistantButton />      ← floating
  </SidebarProvider>
</Providers>
```

**Constants:**
- Sidebar: `16rem` expanded (256px) · `3rem` collapsed icon-rail (48px) · `18rem` mobile sheet (288px). `collapsible="icon"`, `⌘B` toggles.
- Header: `h-14` (56px), sticky `top-0`, `z-30`, `bg-background/80 backdrop-blur-md`, `border-b border-border/50`.
- Footer: `~h-10` (40px), `mt-auto shrink-0`, `border-t border-border/50`, `bg-background/60 backdrop-blur-sm`.
- Content area: `.content-area` enforces `min-height: calc(100vh - 3.5rem - 2.5rem)` so footer always sits at bottom.
- Content padding: `1rem 1.5rem` mobile → `1.5rem 2rem` lg → `1.5rem 2.5rem` 2xl.

### 2.10 Sidebar Design (the dark-navy anchor)

- **Background:** `bg-sidebar` → `#0F172A` (light) / `#020617` (dark) — **always dark navy**, regardless of theme.
- No right border (`border-none`), soft right shadow `shadow-[2px_0_12px_-4px_rgba(0,0,0,0.08)]`.
- **Brand header (32px tile):** red gradient `linear-gradient(135deg, #DC2626, #B91C1C)` with white `CircleDot` icon + `.login-logo-glow` (pulsing red box-shadow `0 0 20px → 0 0 35px rgba(220,38,38,0.5)` over 3s). Wordmark "CRYPTSK" in `text-gradient-red font-black tracking-[0.15em]` + "AAA Platform" tagline `text-[9px] tracking-[0.2em]`.
- **Section headers:** 11px, bold, uppercase, `tracking-[0.08em]`. Active-group label turns `text-primary` (red). `ChevronDown` rotates -90° when collapsed.
- **Nav item active state (SIGNATURE):** **3px red left border** (`border-l-[3px] border-l-primary`) + red-tinted bg (`bg-accent` = `#FEE2E2` light / `#450A0A` dark) + red icon + `font-semibold`. Inactive items have `border-l-[3px] border-l-transparent` (keeps layout stable) and a hover sweep highlight via `::before` (gradient `rgba(220,38,38,0.08) → transparent`).
- **CSS override (globals-extended.css):**
  ```css
  [data-sidebar="menu-button"][data-active="true"] {
    background-color: rgba(220, 38, 38, 0.12) !important;
    color: #FFFFFF !important;
    border-left: 3px solid #DC2626;
    font-weight: 600;
  }
  [data-sidebar="menu-button"]:hover:not([data-active="true"]) {
    background-color: #1E293B;
    color: #E2E8F0;
  }
  ```
- **Badges:** destructive badges use `bg-primary text-primary-foreground shadow-[0_0_8px_rgba(220,38,38,0.4)] animate-badge-pulse` (pulsing scale 1→1.08). Non-destructive: `bg-red-500/15 text-red-400 ring-1 ring-red-500/25`. Counts > 99 show "99+".
- **Sidebar sparkline:** 40px recharts `AreaChart` of 7-day signups — stroke `#DC2626`, gradient fill `0.3 → 0.02 opacity`, active dot `r=3 fill=#DC2626 stroke=#0F172A`.
- **Sidebar stats bar:** compact expandable panel (active subs/MRR/complaints/online) with 3.5×3.5 Lucide icons in `text-emerald-400` / `text-red-400` / `text-amber-400`.
- **Footer:** gradient divider `from-transparent via-sidebar-border to-transparent` · pulsing emerald "Online" dot · user avatar with red gradient fallback · "Powered by **Cryptsk** v7.0".
- **Scrollbar (sidebar-specific):** 4px wide, slate-400 thumb, **teal on hover**.

### 2.11 Header Design (`src/components/layout/header.tsx`)

Sticky `h-14` bar, two halves:

**Left:** Mobile hamburger (`lg:hidden`) · Desktop SidebarTrigger (`hover:text-primary`) · vertical separator · Breadcrumb (`hidden sm:flex`: muted section → foreground page) · mobile page title (`sm:hidden`).

**Right (left-to-right):**
1. Real-time clock (`hidden lg:flex`) — `Clock` icon + `text-xs font-medium tabular-nums` (en-IN, updates 60s)
2. System Health dropdown (`Server` icon) — color-coded dot (green/amber/red, `animate-ping` on critical) → 288px popover with uptime, memory bar, DB status, version
3. Online subscribers pill (`hidden md:flex`) — `Wifi` icon + emerald number
4. RADIUS sync status dot (`hidden sm:flex`, 2×2 round) — emerald/amber/red
5. Search input (`hidden md:block md:w-64`) — `Search` icon + read-only input triggering ⌘K, with `<kbd>⌘K</kbd>` hint
6. Mobile search toggle (`md:hidden`)
7. ExportManager (icon button)
8. Notification sound toggle (`Volume2`/`VolumeX`)
9. NotificationPanel (popover with unread count badge)
10. DarkModeToggle (Sun/Moon cross-fade rotate+scale)
11. User Avatar dropdown (`avatar-ring`, 8×8) — name, email, role badge, "View Profile", "Settings", "Toggle Theme ⌘⇧D", "Log out" (red text)

**Sound:** On new notification (unread count increases), `AudioContext` beeps 800Hz for 0.3s with exponential gain decay. Persisted in `localStorage["cryptsk-notification-sound"]`.

**Keyboard shortcuts:** `⌘K` command palette · `⌘B` toggle sidebar · `⌘⇧D` toggle dark mode.

### 2.12 Card Styling

```tsx
<div className="bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm" />
```
- `rounded-xl` (14px) · 1px `var(--border)` · `shadow-sm` · `py-6 px-6` (24px) · `flex flex-col gap-6`.
- **Hover variants:** `.card-hover-lift` (-2px translate + soft shadow) · `.card-hover-pollish` (-1px + red-tinted shadow `rgba(220,38,38,0.08)` + red border tint) · `.card-glow` (pulsing red outer glow) · `.card-spotlight` (radial gradient follows cursor via `--mouse-x`/`--mouse-y`) · `.stat-card-interactive` (-3px + scale 1.01).
- **Chart card (`.chart-card`):** has a `::before` top accent `linear-gradient(90deg, #DC2626, #0D9488, #D97706)` that fades in on hover.

### 2.13 Animations & Micro-interactions (CSS-only, no framer-motion)

**NProgress loader:** 3px red top bar (`#DC2626` light / `#EF4444` dark) with glow `box-shadow 0 0 8px rgba(220,38,38,0.4)`. Triggers on route change + React Query `isFetching > 0`. No spinner. `trickleSpeed:200, minimum:0.08, speed:400`.

**Scroll progress bar:** Fixed 2px top bar, `linear-gradient(90deg, #DC2626, #EF4444, #F97316)` (light) / `(#EF4444, #F87171, #FB923C)` (dark). JS sets `--scroll-progress` width.

**Keyframe catalogue (all in `globals-extended.css`):**

| Keyframe | Effect |
|----------|--------|
| `cryptsk-card-load` / `animate-card-enter` | opacity 0→1, translateY 8px→0, scale 0.98→1 |
| `cryptsk-page-enter` | translateY 8px→0 |
| `cryptsk-slide-in-left` | sidebar items translateX -12px→0 |
| `cryptsk-pulse-dot` / `.live-dot` | box-shadow 0 0 0 0→8px rgba(220,38,38,0.6)→0 |
| `badge-pulse` | scale 1→1.08, red box-shadow pulse |
| `badge-pulse-teal` | same in teal |
| `shimmer` / `skeleton-wave` | bg-position -200%→200% over gradient |
| `page-transition` | translateY + blur(4px)→0 + backdrop-blur(6px)→0 |
| `count-up` | translateY 8px→0 + opacity 0→1 (number entrances) |
| `bounce-in` | scale 0.3→1.05→0.9→1 (notification toasts) |
| `dialog-enter` | scale 0.95 + translateY 8px → 1.0 |
| `status-ring` | box-shadow 0→6px rgba(22,163,74,0.4)→0 (green pulse) |
| `login-logo-glow` | red box-shadow 0 0 20px→0 0 35px |
| `pulse-glow` / `pulse-glow-dark` | floating help button — box-shadow 0→10px + scale 1→1.05 |
| `confetti-fall` | translateY 0→80px + rotate 0→720deg |
| `login-gradient-spin` | conic gradient border 0→360deg (6s) |
| `login-float-up` | particles translateY 0→-105vh + translateX 25px (12s) |
| `btn-shine-sweep` | white gradient sweeps -100%→200% on hover (0.6s) |

**Global transition:** `* { transition: background-color 0.2s, border-color 0.2s, color 0.15s; }` — makes every color change (including dark-mode toggle) feel smooth without framer-motion. `@media (prefers-reduced-motion: reduce)` disables all.

**Button micro-interactions:** `.btn-press` (:active scale 0.97) · `.btn-shine` (::before sweeps 60%-width white gradient) · `.btn-ripple` (mobile hamburger).

### 2.14 Custom CSS Utilities

- **Scrollbars:** Global 6px, slate-300 thumb → **red on hover**. Sidebar 4px → **teal on hover**. Dark: `rgba(100,116,139,0.4)` → `rgba(239,68,68,0.6)`.
- **Selection:** `rgba(220,38,38,0.2)` light / `rgba(239,68,68,0.3)` dark.
- **Glass-morphism:** `.glass` (blur 12px, `rgba(255,255,255,0.7)`) · `.glass-dark` (`rgba(15,23,42,0.75)`) · `.glass-teal` · `.glass-red` · `.glass-card` (blur 16px).
- **Gradient borders:** `.gradient-border-teal` (`#0D9488, #14B8A6, #DC2626`) · `.gradient-border-red` (`#DC2626, #EF4444, #F97316`) · `.gradient-border-emerald`.
- **Notification type borders (3px left):** bill `#F59E0B` · payment `#16A34A` · usage `#0D9488` · outage `#DC2626` · plan `#7C3AED` · welcome `#2563EB`.
- **SLA dots:** met `#16A34A` · at-risk `#D97706` · breached `#DC2626` · escalated `#EA580C`.
- **Live dots:** `.live-dot` (green, `cryptsk-pulse-dot`) · `.live-dot-red` · `.status-dot-online/warning` (with `status-ring` animation).
- **Login page (signature SaaS look):** `.login-glass-card` (blur 32px saturate 1.6, multi-layer red-tinted shadows, lifts -3px on hover) · `.login-animated-border` (rotating conic gradient, 6s) · `.login-scanlines` (CRT effect via repeating 2px gradient + `mix-blend-mode: overlay`) · `.login-input-enhanced:focus` (multi-layer red box-shadow) · `.login-float-up` particles.

### 2.15 Dark Mode

- **Library:** `next-themes ^0.4.6`, class-based (`attribute="class"`), `defaultTheme="light"`, `enableSystem`, `disableTransitionOnChange`.
- **FOUC prevention:** `html:not(.dark):not(.light) body { visibility: hidden; }` — hides body until next-themes resolves.
- **Toggle:** Header button (Sun↔Moon cross-fade) · User menu item · `⌘⇧D` shortcut.
- **What changes:** background white→navy · cards white→slate-800 · primary `#DC2626`→`#EF4444` · text slate-800→slate-100 · borders slate-200→slate-700 · sidebar `#0F172A`→`#020617` · scrollbar thumb slate→red · selection red-tinted · NProgress red→bright-red · chart palette 600-shade→400-500-shade. **Sidebar stays dark in both.**

### 2.16 Designer Replication Checklist

1. Load `Geist` + `Geist_Mono` via next/font/google; apply on `<body>` with `antialiased`.
2. Tailwind v4 + shadcn/ui (new-york, neutral base, cssVariables, lucide).
3. Paste the 26 CSS variable theme tokens (`:root` + `.dark`) from §2.1/§2.2.
4. Set `--radius: 0.625rem` + radius scale (sm=-4px, md=-2px, lg=0.625rem, xl=+4px).
5. Configure next-themes (`attribute="class"`, `defaultTheme="light"`, `enableSystem`, `disableTransitionOnChange`).
6. Add FOUC guard.
7. Sidebar: dark-navy `bg-sidebar` always, 16rem/3rem/18rem widths, active = 3px red left border + `bg-accent` tint + red icon + `font-semibold`.
8. Header: sticky `h-14`, `bg-background/80 backdrop-blur-md`, `border-b border-border/50`.
9. Footer: `h-10`, `bg-background/60 backdrop-blur-sm`, `mt-auto`.
10. Cards: `rounded-xl` (14px), `border`, `shadow-sm`, `py-6 px-6`, `flex flex-col gap-6`. Apply `.card-hover-pollish`.
11. Scrollbars: 6px global / 4px sidebar, slate thumb → red on hover.
12. Selection + focus rings: red-tinted.
13. NProgress: 3px red top bar with glow, no spinner.
14. Charts: use `--chart-1`..`--chart-5`, primary stroke `#DC2626` light / `#EF4444` dark.
15. Icons: lucide-react. `CircleDot` for brand.
16. Login: dark navy bg, `.login-glass-card`, `.login-animated-border`, `.login-logo-glow`, `.login-float-up` particles, `.login-scanlines`.

---

## 3. Dashboard Look & Feel ★ (user favorite)

> **Source:** `src/components/pages/dashboard-page.tsx` (~2,894 lines) + `src/components/dashboard/dashboard-status-bar.tsx`. **40 widgets** + a fixed bottom status bar. The user explicitly loves this — preserve every detail.

### 3.1 Dashboard Overall Layout

**Top-level container:** `<div className="space-y-6 page-enter">` — vertical stack, 1.5rem gap, entrance fade.

**Header row:**
- **Left:** `text-2xl font-bold text-gradient-red` greeting ("Good morning/afternoon/evening") + subtitle "Here's your ISP operations overview." + small `CalendarClock` line with weekday/date/time.
- **Right (button group, wraps):**
  1. `Select` Date range dropdown (150px) — **7d / 30d / 90d / this_month / last_month** (drives `/api/dashboard?range=`)
  2. `Download Report` button (CSV export of all KPIs, complaints, payments, overdue invoices, top customers, renewals)
  3. Outline icon button with `RefreshCw` (spin while `isRefetching`) — `queryClient.invalidateQueries`
  4. `Bell` popover with red badge showing `urgentItems.total` — lists critical complaints (red), overdue invoices (amber), device warnings (orange), SLA breaches (red)
  5. `<span className="live-dot" />` + green "Live" pill

**Quick action strip (below header):** Four outline buttons:
- `Generate Invoices` — red border/text
- `Add Subscriber` — green border/text
- `Raise Complaint` — amber border/text
- `Collect Payment` — purple border/text

All use `btn-press btn-shine` utility classes.

**Welcome Banner (dismissible, per-day localStorage `dashboard-welcome-dismissed`):**
- `gradient-border-red rounded-xl` outer, white Card inside with two soft decorative radial gradients (red top-right, teal bottom-left)
- Left: vertical red gradient bar + greeting ("Good Morning, {userName}!") + rotating "tip of the day" (7 tips cycled by weekday)
- Right: date + 3 icon-only quick-actions (UserPlus/Wallet/AlertTriangle) with tooltips + dismiss `X`

**Quick Stats Banner (4-up grid):** `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3` — 4 cards with `linear-gradient(135deg, rgba(16,185,129,0.08)…)` bg and emerald icon tiles: Total Subscribers · Active Connections · Monthly Revenue (MRR) · Collection Today % (color: emerald ≥80% / amber ≥50% / red).

**Stats Summary Bar (5-up grid):** `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3` — 5 compact cards with gradient icon tiles (`from-red-400 to-red-500`, `from-emerald-400 to-green-500`, `from-amber-400 to-yellow-500`, `from-orange-400 to-red-500`, `from-teal-400 to-emerald-500`): Subscribers · Active · Revenue · Complaints · Uptime.

**Then the vertical widget stack (in order):**
1. `<SystemAlertBanner />` (global banner)
2. `<GettingStartedPanel />` (onboarding)
3. `<DashboardQuickActionsWidget />` (6 shortcuts)
4. `<NotificationSummaryWidget />`
5. `<LiveActivityFeedWidget />`
6. `<PerformanceMetricsWidget />`
7. `<QuickActionsWidget />`
8. **Primary StatCard row** — `grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4` — 6 gradient StatCards: Total Subscribers (red) · Revenue This Month (blue) · Active Connections (purple) · Open Complaints (amber) · Collection Today (teal) · Network Uptime (emerald). Each: `border-0 shadow-lg hover:shadow-2xl hover:scale-[1.03] hover:-translate-y-1 card-glow stat-card-lift animate-card-enter`.
9. **Secondary 4-up row** — `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4` — ARPU · Churn Rate · CAC · MRR Growth with `border-l-4` colored left border (red/teal/green/amber) + `card-hover-lift animate-slide-up`.
10. **AI Insight card** (full width) — `border-2 border-red-500/20` with Bot icon, displays `data.aiInsight`.
11. **Charts row 1** — `grid grid-cols-1 lg:grid-cols-2 gap-6` — AreaChart (Monthly Revenue) + BarChart (Plan Distribution). PIE_COLORS palette: `#DC2626, #16A34A, #D97706, #7C3AED, #EC4899, #14B8A6, #2563EB, #F43F5E, #84CC16, #06B6D4…`
12. **Charts row 2** — Bandwidth Usage AreaChart + Complaints Trend LineChart.
13. **Composed SLA/ticket widget** — full-width card with 4 priority mini-cards.
14. **Widget grid A** — `grid grid-cols-1 lg:grid-cols-4 gap-6` — IspHealthScore · NetworkHealthEnhanced · BandwidthTrends · TopAreas.
15. **Widget grid B** — `lg:grid-cols-2` — AreaDistribution · ConnectionType.
16. **Widget grid C** — `lg:grid-cols-2` — RevenuePaymentMode · RevenueBreakdown.
17. **Widget grid D** — `lg:grid-cols-2` — TopSubscribers · PlanComparison.
18. `<CollectionPerformanceWidget />` (full-width composed chart).
19. **Widget grid E** — ComplaintsAnalytics · PlanPerformance.
20. `<RecentPaymentsTimelineWidget />` (full-width timeline).
21. **Widget grid F** — ExpiringSubscriptions · OverduePayments.
22. **Widget grid G** — RetentionChurn · InvoiceAging.
23. **Widget grid H** — ChurnRisk · ChurnPrediction.
24. **Widget grid I** — PaymentAnalytics · SubscriberLifecycle.
25. `<TechnicianPerformanceWidget />` + `<SubscriberAnalyticsWidget />` (full width).
26. **Widget grid J** — SystemOverview · SystemPerformance.
27. `<PlanRecommendationWidget />` (full-width).
28. **Widget grid K** — `grid-cols-2 md:grid-cols-4` — ResponseTime · CollectionTarget · RadiusSyncStatus · RecentSignups.
29. **Widget grid L** — RevenueForecast + forecast card.
30. **Recent Complaints / Overdue Invoices / Upcoming Renewals / Top Customers / SLA Breaches / Device Health** — full-width stat cards + data tables (inline in dashboard-page.tsx).
31. **System Alerts strip** — `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` — 3 alert cards (Warning amber, Critical red with pulsing dot, Info sky) with `border-l-4`.
32. **Footer timestamp** — centered "Data updated {time} · Range: {rangeLabel}" with live-dot.
33. **`<DashboardStatusBar />`** — fixed bottom strip.

### 3.2 Dashboard Status Bar (fixed bottom)

`fixed bottom-0 left-0 right-0 z-50 h-10`, dark backdrop `rgba(15,23,42,0.95)` + `backdrop-blur(12px)`, 1px gradient top-border `linear-gradient(90deg, transparent, #DC2626 30%, #DC2626 70%, transparent)`.

Three regions (text 12px, slate-400 default):
- **Left** — 3 indicator dots with icons: Database (green/amber/red), API latency in ms (animated dots), Network Uptime % (color by threshold).
- **Center** — compact quick stats: `Total Devices · Online · Complaints · Overdue · MRR ₹X` (each value colored teal/emerald/amber/red, separated by `·`).
- **Right** — keyboard shortcut hints (`⌘K Search · ⌘1 Dashboard · ⌘2 Subscribers` on lg+) + `Clock` + "Updated HH:MM".

**APIs:** `/api/system/health` + `/api/dashboard/stats`, polled every 60s.

### 3.3 Widget Catalog (40 widgets)

> **Universal widget pattern:** `<Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md transition-all duration-200">` with header pattern:
> ```
> <CardHeader className="pb-3">
>   <div className="flex items-center justify-between">
>     <CardTitle className="text-base font-semibold flex items-center gap-2">
>       <div className="p-1.5 rounded-lg bg-gradient-to-br from-{color}-400 to-{color}-500 text-white shadow-sm">
>         <Icon className="h-3.5 w-3.5" />
>       </div>
>       {Title}
>       {optional <Badge> with count}
>     </CardTitle>
>     <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
>       <RefreshCw className={cn("h-3.5 w-3.5", isRefetching && "animate-spin")} />
>     </Button>
>   </div>
> </CardHeader>
> ```
> The icon tile is **always** a 2-stop gradient `from-{color}-400 to-{color}-500/600` with `text-white`. Hover border-color shifts to match accent. Critical-state widgets get `ring-2 ring-red-500/30`.

#### Revenue / Finance Widgets

| # | Widget | Metrics | Viz | Colors | API | Refresh |
|---|--------|---------|-----|--------|-----|---------|
| 1 | **Revenue Overview** | MRR, revenue this month, ARPU, revenue by connection type (FTTH/Cable/Wireless/Leased) | KPI hero + 4 horizontal progress bars | Red `#DC2626`, emerald trend; hero `bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20` | `/api/dashboard/stats` + `/api/dashboard?range=30d` | 60s |
| 2 | **Revenue Forecast** | Current MRR, projected 90d MRR, ARR, growth rate, outstanding receivables, historical MRR | KPI hero + 3 stat tiles + Recharts AreaChart (mini 120px) | `THEME_RED=#DC2626`, `THEME_GREEN=#16A34A`; area fill `mrrMiniGrad` red 25%→2% | `/api/revenue/forecast` | 120s |
| 3 | **Revenue by Payment Mode** | Total revenue/payments, breakdown by Cash/UPI/Online/Bank Transfer/Cheque/Wallet | Donut (Recharts PieChart innerRadius 55% outerRadius 85%) + legend | CASH=#DC2626, UPI=#0D9488, ONLINE=#D97706, BANK_TRANSFER=#059669, CHEQUE=#F43F5E, WALLET=#EA580C | `/api/payments/revenue-by-mode` | 120s |
| 4 | **Collection Performance** | Daily collected vs target (30d), total collected, avg daily, best day, achievement %, days met target | Recharts ComposedChart (Bars + Line): green bars when met target, red when below + dashed amber target Line | Bar gradients `collectionGreenGrad` (emerald) / `collectionRedGrad` (red), target line `#D97706` | `/api/dashboard/collection-performance` | 120s |
| 5 | **Monthly Collection Target** | Month collected vs target, % complete, days remaining, daily avg needed, today's collection, status | Hero KPI + horizontal progress bar + 4 stat tiles | Status-driven: emerald (on_track), amber (behind), red (critically_behind); icon `from-rose-400 to-red-500` | `/api/dashboard/collection-target` | 120s |
| 6 | **Invoice Aging** | Total outstanding, DSO, collection efficiency, aging buckets (0-30/31-60/61-90/90+), top overdue | 3-up KPI + horizontal stacked bar + Recharts vertical BarChart + top-overdue list | Current=#14B8A6, 31-60=#D97706, 61-90=#DC2626, 90+=#991B1B; icon `from-red-400 to-rose-500` | `/api/dashboard/invoice-aging` | 120s |
| 7 | **Payment Analytics** | Today/month collection progress, mode breakdown, overdue, avg payment, this week, collection rate, top collectors | 2 CollectionBars + horizontal stacked mode bar + 2×2 stat tiles + top collectors | MODE_COLORS: UPI=#0D9488, CASH=#10B981, ONLINE=#F59E0B, BANK_TRANSFER=#DC2626, CHEQUE=#78716C, WALLET=#D97706 | `/api/dashboard/payment-analytics` | 120s |
| 8 | **Overdue Payments** | Total overdue, list with days-overdue, balance, plan, due date | Summary bar + cards with `border-l-[3px]` color-coded by age | >30d red, ≥15d amber, <15d yellow; icon red | `/api/invoices?status=OVERDUE&limit=10` | 120s |
| 9 | **Top Revenue Subscribers** | Top 5 by total paid, rank, plan, payment count, last payment | Ranked list with medal-style top-3 | 1st gold #F59E0B, 2nd silver #94A3B8, 3rd bronze #B45309; icon rose | `/api/dashboard/top-subscribers` | 120s |
| 10 | **Recent Payments** | Recent payments with subscriber, amount, mode, status, timestamp; today/month/avg | Vertical timeline list + 3-up summary | Per-mode colors; status dots; icon `from-red-500 to-rose-600` | `/api/payments/recent` | **30s** |
| 11 | **Plan Comparison** | Per-plan subscriber count, total revenue, avg revenue/sub, % of total | Horizontal bar list (8 colors) + totals | BAR_COLORS: red, teal, amber, emerald, rose, emerald-dark, orange, pink; icon emerald | `/api/dashboard/plan-comparison` | 120s |
| 12 | **Plan Performance** | Most popular plan, top revenue plan, avg plan price, top 8 plans by subscribers, category breakdown | 3-up highlight cards + horizontal bars + category grid | BAR_COLORS (8); category styles: FTTH emerald, WIRELESS amber, CABLE teal, LEASED_LINE red, HOTSPOT orange, COMBO rose | `/api/plans/performance` | 120s |
| 13 | **Smart Plan Recommendations** | Total opportunities, savings count, upgrade count, monthly savings potential, top 5 opportunities | 3-up summary tiles + opportunities list with type badges | Save=emerald, Upgrade=amber, Better Value=teal, Better Fit=rose; icon `from-amber-400 to-amber-500` | `/api/plans/recommend` | 120s |

#### Subscribers / Churn Widgets

| # | Widget | Metrics | Viz | Colors | API | Refresh |
|---|--------|---------|-----|--------|-----|---------|
| 14 | **Subscriber Growth** | New subscribers, avg daily, growth trend %, churn indicator, monthly additions | **Hand-rolled inline SVG AreaChart** (500×200) with glow filter, hover crosshair, data-point circles, SVG tooltip | `#DC2626` line/area (gradient `growthGradient` red 35%→8%→0); range buttons `bg-red-600` active | `/api/dashboard?range={7d\|30d\|90d}` | on range change |
| 15 | **Subscriber Analytics** | Funnel (active/trial/suspended/disconnected/pending), connection type breakdown, ARPU, MRR, growth rate, plan distribution | Funnel bars + 2-up stat tiles + Recharts donut PieChart (120×120) center label | FUNNEL_COLORS: trial amber, active green, suspended red, disconnected gray, pending teal; CONNECTION_COLORS: FTTH emerald, WIRELESS amber, CABLE red, LEASED_LINE teal, ETHERNET orange | `/api/dashboard/subscriber-analytics` | 120s |
| 16 | **Subscriber Lifecycle** | Lifecycle stages funnel, connection type breakdown, top plans, recently churned, avg lifetime days | Vertical funnel rows + 4-up connection cards + top plans list + churned cards | CONN_TYPE_CONFIG: FTTH #10B981, CABLE #F59E0B, WIRELESS #0D9488, LEASED_LINE #DC2626, ETHERNET #78716C; icon amber | `/api/dashboard/subscriber-lifecycle` | 120s |
| 17 | **Subscriber Retention** | Retention rate (circular gauge), churn rate, revenue at risk, subscriber flow (New/Active/At Risk/Churned), at-risk table, churn by connection type | **Inline SVG circular RetentionRing** (64×64) + FlowSegments + mini-bars + at-risk table | Retention: ≥95 #10B981, ≥85 #F59E0B, else #DC2626; flow: New emerald, Active teal, At Risk amber, Churned red | `/api/dashboard/retention` | 120s |
| 18 | **Churn Risk Alerts** | Total at-risk by level (HIGH/MEDIUM/LOW), per-subscriber risk reasons | Summary bar with 3 colored dots + risk cards `border-l-[3px]` | HIGH=red, MEDIUM=amber, LOW=teal; pulsing red dot when high>0 | `/api/dashboard/churn-risk` | 120s |
| 19 | **Churn Prediction** | High-risk count, revenue at risk, risk distribution (Critical/High/Medium/Low) | 2-up summary + horizontal risk-distribution bars | Critical red-600, High red-400, Medium amber-500, Low teal-500; pulsing dot when totalAtRisk>0 | `/api/churn/analytics` | 120s |
| 20 | **Expiring Subscriptions** | Subscribers with expiring plans (next 7d), days-left, plan, area, price | Summary bar + cards `border-l-[3px]` color by urgency | ≤2d red, ≤5d amber, else emerald; icon amber | `/api/subscribers/expiring` | 120s |
| 21 | **Recent Sign-ups** | Last 5 new subscribers with avatar, plan, area, created date, status | Vertical list with colored initial-avatars + status badges | Status: ACTIVE emerald, TRIAL amber, PENDING teal, SUSPENDED red, DISCONNECTED gray; avatar colors hashed from name (6-color palette) | `/api/subscribers?page=1&limit=5&sortBy=createdAt&sortOrder=desc` | 60s |
| 22 | **Top Revenue Areas** | Top 5 areas by revenue, % of total, total bar | Horizontal bars with color-coded gradients | BAR_COLORS: red, teal, amber, emerald, rose (each `from-X-500 to-X-600`) | (prop-driven from parent) | n/a |
| 23 | **Area Distribution** | Per-area: total/active subscribers, revenue, complaints; summary totals | 3-up summary + scrollable area rows with `bg-gradient-to-r` bars | 8-color palette (red/teal/amber/emerald/rose/purple/orange/cyan); "Top Area" badge red | `/api/dashboard/area-distribution` | 120s |
| 24 | **Connection Types** | Subscriber distribution by FTTH/Wireless/Cable/Leased Line/Ethernet | Recharts donut PieChart (max 200×200) with center "Total subscribers" label + legend | TYPE_COLORS: FTTH #0D9488, WIRELESS #D97706, CABLE #DC2626, LEASED_LINE #059669, ETHERNET #F43F5E | `/api/dashboard/connection-types` | 60s |
| 25 | **SLA Compliance** | Overall compliance %, avg resolution time, breach count, per-priority compliance (P1–P4) | **Inline SVG circular ComplianceRing** (140×140) + priority rows with mini-bars | Compliance: ≥95 #16A34A, ≥80 #D97706, else #DC2626; priority: P1 #DC2626, P2 #EA580C, P3 #D97706, P4 #16A34A | `/api/sla/monitor` | 60s |

#### Network / Operations Widgets

| # | Widget | Metrics | Viz | Colors | API | Refresh |
|---|--------|---------|-----|--------|-----|---------|
| 26 | **Network Status** | Network segment status (Core/Distribution/Last Mile) with traffic-light dots, uptime %, active subscribers, online devices, open complaints by priority | 3-up segment cards with StatusDots + **inline SVG CircularProgress** (72×72) + device indicators + priority badges | Status: green/yellow/red; uptime emerald≥99.5% / amber≥99% / red; P1 red, P2 orange, P3 yellow, P4 green | `/api/network/status` | **30s** |
| 27 | **AI Network Health** | Overall score 0–100, letter grade A–F, 5 factor bars (Devices/Subscribers/Complaints/Resolution/Alerts), AI predictions, recommendations | **Inline SVG HealthGauge** (120×120) showing score+grade + 5 FactorBars + critical warning panel + "View Full Analysis" link | Grade: A #16A34A, B #0D9488, C #D97706, D #EA580C, F #DC2626; critical factors pulse red; `ring-2 ring-red-500/30` when critical | `/api/network/health-enhanced` | 60s |
| 28 | **Bandwidth Trends** | Peak/Current/Average bandwidth (Mbps) over 24h, download vs upload | 3-up KPI tiles + Recharts AreaChart with two Areas | Download `#0D9488` (teal) gradient 30%→0, Upload `#DC2626` (red) gradient 20%→0; peak red, current teal, average amber | (prop-driven from parent) | n/a |
| 29 | **ISP Health Score** | Overall score 0–100, label (Excellent/Good/Fair/Poor/Critical), 3 component bars (Uptime/Active Ratio/Complaint Score) | **Inline SVG HealthGauge** (130×130, strokeWidth 12) + 3 MetricRows | scoreColor: ≥80 #16A34A, ≥60 #D97706, else #DC2626 | `/api/dashboard/health-score` | 60s |
| 30 | **Complaints Analytics** | Total/open/avg resolution time, complaint-type distribution (10 types), priority breakdown (P1–P4), status overview | 3-up KPI + Recharts donut PieChart (180×180) + priority rows with mini-bars + 2×2 status pills | TYPE_COLORS (10 colors); PRIORITY_INFO: P1 #DC2626, P2 #EA580C, P3 #D97706, P4 #16A34A | `/api/complaints/analytics` | 60s |
| 31 | **Technician Performance** | Available/total technicians, avg rating, open tickets, per-tech rating/resolved/open/resolution-rate/avg-time, workload distribution | 3-up KPI + technician leaderboard cards with avatars + Recharts vertical BarChart (workload by tech initials) | Avatar palette (10 colors hashed); bar colors by load: <3 green, 3-5 amber, >5 red; icon `from-teal-500 to-emerald-600` | `/api/dashboard/technician-stats` | 120s |
| 32 | **Ticket Response Time** | Avg first response, SLA breach rate, per-priority avg response vs SLA target (with target marker line) | Summary tile + per-priority rows with horizontal bars and SLA target markers | barColor: ≤0.5 green, ≤0.8 teal, ≤1.0 amber, >1.0 red; priority dots P1/P2/P3/P4 red/orange/amber/green | `/api/dashboard/response-time` | 120s |
| 33 | **Live Activity Feed** | Real-time events (subscriber_created, payment_collected, complaint_raised/resolved, invoice_generated, installation, device_alert, plan_changed, user_login) | Vertical scrollable timeline list with colored category icons + dots | Per-category: subscriber=emerald, payment=green, complaint=red, resolved=teal, invoice=amber, installation=orange, device_alert=rose, plan_changed=yellow, user_login=slate; **green pulsing "LIVE" dot** | `/api/activity-feed?maxItems=20` | **15s** |
| 34 | **System Alerts** | Critical/High/Warning/Info alert counts, network device status (online/offline/warning/maintenance), alert timeline, quick actions | 4 AlertPills with pulsing dots + device status panel with MiniProgressBar + alert timeline + 3 quick-action buttons | SEVERITY: CRITICAL red, HIGH orange, WARNING amber, INFO teal; device dots: online emerald, offline red, warning amber, maintenance gray | `/api/system/alerts-summary` | **45s** |
| 35 | **Quick Actions** | 6 shortcut tiles: Add Subscriber, Create Invoice, Log Complaint, View Devices, Run Speed Test, Generate Report | 6-up grid of action tiles with hover gradient overlay + bottom accent bar | Per-action gradient: rose/red, red, orange/red, amber/orange, red/rose, rose/red; icon `from-rose-500 to-red-600` with `Zap` | (none — pure navigation) | n/a |

#### System / Infrastructure Widgets

| # | Widget | Metrics | Viz | Colors | API | Refresh |
|---|--------|---------|-----|--------|-----|---------|
| 36 | **System Overview** | Server status, DB size+connections, active PPPoE sessions, server uptime, memory used/total, Node.js version, platform version | 5 InfoRow tiles with icons + StatusBadge | Status badge: healthy=emerald, degraded=amber, critical=red | `/api/system/health` + `/api/system-monitor` | 30s / 15s |
| 37 | **System Health** | API latency, DB status, memory usage %, uptime + status badge + version | 2×2 grid of metric cards with status dots | statusDot: green/yellow/red with `animate-pulse` when green | `/api/system/health` | 30s |
| 38 | **System Performance** | Server uptime, memory %, CPU avg with sparkline, disk %, API latency, active connections, DB health, cache hit rate | Uptime badge + 3 MetricBars (memory/CPU/disk) + **inline SVG MiniSparkline** for CPU + 2×2 stat grid | Threshold: <70% green, <85% amber, else red | `/api/dashboard/stats` | **30s** |
| 39 | **RADIUS Sync** | Sync status (synced/minor_drift/drifted/error), app RADIUS subs, RADIUS users, user groups, group replies/checks, drift details | Compact card with MetricRows + drift warnings | statusConfig: synced=emerald, minor_drift=amber, drifted=red, error=red | `/api/freeradius/sync-status` | 120s |
| 40 | **Dashboard Status Bar** | DB status, API latency (ms), network uptime %, total/online devices, open complaints, overdue invoices, MRR; keyboard shortcuts; last updated | Fixed bottom bar with 3 regions | Background `rgba(15,23,42,0.95)` + blur; 1px red gradient top-border; dots emerald/amber/red; center stats colored | `/api/system/health` + `/api/dashboard/stats` | 60s |

### 3.4 Dashboard Color & Style DNA

- **Primary brand accent: `#DC2626`** — page title gradient, status bar top-border, dominant chart line/area, header icon tiles, "View All" buttons, live-dot. **No blue/indigo used as primary anywhere.**
- **Secondary palette (semantic):** Teal `#0D9488` (network/bandwidth/SLA-good) · Amber `#D97706` (warnings, approaching threshold, medium priority) · Emerald `#16A34A`/`#059669` (success, on track, active, met target) · Orange `#EA580C` (high priority P2, device warnings) · Rose `#F43F5E`/`#E11D48` (overdue critical, top-revenue, churn) · Purple `#9333EA` (sparingly, only in 8-color bar palettes) · Stone/Gray (disconnected, unknown, low priority).
- **Chart palette constants:** `PIE_COLORS` (20-color, starts `#DC2626, #16A34A, #D97706, #7C3AED, #EC4899, #14B8A6, #2563EB, #F43F5E, #84CC16, #06B6D4…`), `BAR_COLORS` (8-color cycle: red/teal/amber/emerald/rose/purple/orange/cyan each `from-X-500 to-X-600`), `MODE_COLORS`/`TYPE_COLORS` (semantic per category).
- **SVG gradients:** `growthGradient` (red 35%→8%→0), `mrrMiniGrad` (red 25%→2%), `downloadGradient` (teal 30%→0), `uploadGradient` (red 20%→0), `collectionGreenGrad`/`collectionRedGrad` (emerald/red 80%/70%→50%/40%). All use SVG `<filter id="glow">` with `feGaussianBlur` for line glow.
- **Typography & numbers:** All KPI numbers use `tabular-nums` + `font-bold`/`font-semibold`. Indian number formatting via `Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" })` (₹, no decimals) and `formatCompactINR` (₹K/₹L/₹Cr). Tiny uppercase labels `text-[10px] font-medium text-muted-foreground uppercase tracking-wider`. Footer caption `text-[10px] text-muted-foreground/60 text-right` "Auto-refreshes every Xs".
- **Animations:** `animate-card-enter` (staggered entrance fade-up via `animationDelay` 50ms–1300ms) · `animate-slide-up` · `animate-pulse` (green status dots, LIVE indicator) · `animate-ping` (red alert dots) · `animate-badge-pulse` (pulsing prediction count) · `animate-spin` (RefreshCw during refetch) · `animate-count-up` (KPI numbers). All progress bars `transition-all duration-700 ease-out`. All SVG circular gauges `transition-all duration-1000 ease-out` on `stroke-dashoffset`. Hover: `hover:scale-[1.03] hover:-translate-y-1` on stat cards.
- **Light/Dark behavior:** Every colored bg has paired `dark:` variant (`bg-red-50 dark:bg-red-950/40`). The 950-shade `bg-{color}-950/40` (40% opacity) is the universal dark-mode tinted bg for badges/pills. Borders `border-{color}-200` light / `dark:border-{color}-800/50` dark. Icon tiles retain `text-white` in both. Status bar permanently dark.
- **Skeletons:** Every widget has a dedicated `LoadingSkeleton` using `<Skeleton className="skeleton-wave h-X w-Y rounded-lg" />` matching the final layout shape (donut skeleton = circular, bar skeleton = horizontal pill).
- **Auto-refresh cadences:** **15s** Live Activity Feed · **30s** Network Status, Recent Payments, System Performance, System Overview, System Health · **45s** System Alerts · **60s** SLA Monitor, ISP Health Score, Network Health Enhanced, Connection Types, Recent Signups, Dashboard Status Bar, main `/api/dashboard` · **120s** all revenue/churn/retention/invoice/payment/lifecycle/technician/plan/area widgets. **Manual refresh** button on every widget.
- **Reusable sub-patterns:** `CircularProgress`/`HealthGauge`/`ComplianceRing`/`RetentionRing` (all hand-rolled SVG, `-rotate-90` + `strokeDasharray` + `strokeDashoffset`, `transition-all duration-1000 ease-out`) · `MiniBar`/`MiniProgressBar`/`MetricBar`/`CollectionBar` (`h-1.5/h-2/h-2.5 w-full rounded-full bg-muted overflow-hidden` with colored fill) · `HorizontalBar` (label+value above, `h-2.5` track, colored fill) · `StatusDot`/`PulsingDot` (`h-2 w-2 rounded-full` with `animate-pulse`/`animate-ping` ring) · `CustomTooltip` (Recharts) `bg-card/90 border border-border/80 rounded-xl shadow-2xl px-4 py-3 text-xs backdrop-blur-md` glass-card style.

### 3.5 Quick Recreation Recipe (for the new product)

1. Set up Tailwind with the same color tokens (red-600 primary, teal-600/amber-600/emerald-600/rose-500/orange-600 secondary).
2. Build a `<WidgetCard title icon gradient refreshHandler>` primitive wrapping `Card + CardHeader (icon tile + title + badge + refresh) + CardContent`.
3. Build SVG primitives: `CircularGauge`, `Sparkline`, `HorizontalBar`, `StackedBar`, `DonutChart` (or use Recharts).
4. Standardize `formatINR` + `formatCompactINR` + `formatRelativeTime` helpers.
5. Auto-refresh via `setInterval` in `useEffect` with `isRefetching` state for spin icon.
6. Every widget ~150–500 lines, self-contained, fetches its own endpoint, handles loading/error/empty with skeleton + retry.
7. Page layout: vertical stack `space-y-6`, then responsive `grid grid-cols-1 lg:grid-cols-2 gap-6` for widget pairs, `grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4` for top stat cards.
8. Add the fixed `DashboardStatusBar` at bottom (z-50, blur backdrop, red gradient top-border).

---

## 4. Complete Menu / Page Feature List (113 pages)

> **Source:** `src/lib/nav-config.ts` (11 sections, ~100 items) + `src/components/pages/` (96 root + 7 sub-tabs + 10 selfcare). Architecture: **Pure OSS/BSS + Internet Gateway** (like 24online / High8). FreeRADIUS is backend AAA — NOT exposed in GUI. Subscriber profile = RADIUS user. Plan = RADIUS group. All provisioning happens through Subscriber/Plan management.

### 4.1 DASHBOARD

#### Dashboard (`/`) — `dashboard-page.tsx`
Master operations dashboard. Personalized greeting, AI Insights panel, SLA Warnings panel, wide grid of widget cards (see §3). Also exposes GettingStartedPanel, NotificationSummaryWidget, DashboardStatusBar.
- **Components:** Stat KPI cards, area/bar/line charts (Recharts), activity feed list, quick-action tiles, system alert banner, skeleton loaders, refresh, Getting-Started wizard, status bar.
- **APIs:** `/api/dashboard`, `/api/dashboard/subscriber-growth`, `/api/system-monitor` (+ per-widget endpoints).

#### Dashboard Widgets (`/dashboard-widgets`) — `dashboard-widgets-page.tsx`
Widget catalog & layout manager — 16 widget types across categories NETWORK/BILLING/SUBSCRIBERS/SECURITY/SYSTEM/TRAFFIC. Toggle visibility, reorder, set size (SMALL/MEDIUM/LARGE), preview. Multi-user config (Admin, NOC Operator, Billing Manager, Support Lead).
- **APIs:** `/api/dashboard-widgets`.

#### Login (`/login`) — `login-page.tsx`
Animated admin login — email/password, show-password toggle, "remember me", client-side validation, loading state, reduced-motion support, gradient background with hex-grid SVG. Uses `.login-glass-card`, `.login-animated-border`, `.login-logo-glow`, `.login-float-up` particles, `.login-scanlines`.
- **APIs:** `/api/auth/login` (via `useAuthStore`).

### 4.2 SUBSCRIBERS (core user management — creates RADIUS entries behind the scenes)

#### Subscribers (`/subscribers`) — `subscribers-page.tsx`
Full subscriber CRM. Paginated/searchable/sortable table with status dots, connection-type icons, plan/area filters. Stat cards (Active, New this month, Suspended, Trial, Online). Add/Edit dialogs (photo upload, KYC, GST/PAN, router rental, IPv4/IPv6 dual-stack, RADIUS enable, subnet/IP picker, device assignment, session/idle timeouts, login restriction). Bulk change-status, CSV/JSON import & export. Per-row actions (view, edit, delete, suspend/activate, disconnect session, view credentials). Detail dialog with 5 tabs (Overview, Billing, Payments, Support, Activity).
- **APIs:** `/api/subscribers` (GET/POST/PUT/DELETE), `/api/subscribers/stats`, `/api/subscribers/online-count`, `/api/subscribers/bulk`, `/api/subscribers/export`, `/api/subscribers/{id}`, `/api/areas`, `/api/plans`, `/api/subnets`, `/api/devices`, `/api/sessions/disconnect`, `/api/upload`, `/api/files`.

#### Plans (`/plans`) — `plans-page.tsx`
Plan (RADIUS group) catalog. Two tabs: Plans (CRUD with pricing tiers monthly/quarterly/half-yearly/yearly, FUP limits, IPv6 mode, speed up/down, active subscriber count) and Analytics (subscriber distribution by plan, revenue contribution, top plans). Plan comparison dialog, migrate-subscribers-between-plans dialog.
- **APIs:** `/api/plans` (CRUD), `/api/plans/analytics`, `/api/plans/migrate`, `/api/plans/reorder`, `/api/subscribers`, `/api/dhcpv6/subnets`.

#### 360° Customer View (`/subscriber-360`) — `subscriber-360-page.tsx`
Unified subscriber profile — search/select subscriber, load 360° data (subscriber info, plan, sessions, invoices, payments, complaints, RADIUS attributes, IP info). Profile photo loading.
- **APIs:** `/api/subscribers`, `/api/subscribers/{id}/360`, `/api/files`.

#### Batch Provisioning (`/batch-provisioning`) — `batch-provisioning-page.tsx`
Bulk subscriber provisioning — reusable templates, batch jobs (CSV upload or generated subscribers), monitor progress, job details dialog.
- **APIs:** `/api/batch-provisioning/templates` (CRUD), `/api/batch-provisioning/jobs`, `/api/plans`.

#### Plan Recommendation (`/plan-recommendation`) — `plan-recommendation-page.tsx` *(orphan)*
AI-driven plan recommendation & optimization — analyzes subscriber usage vs plan tier, recommends optimal plan, optimization suggestions.
- **APIs:** `/api/plans/recommend`, `/api/plans/optimization`.

### 4.3 NETWORK (infrastructure — NAS, IPAM, DHCP, DNS, routing)

#### NAS Clients (`/nas-clients`) — `nas-clients-page.tsx`
RADIUS NAS client management — list with type (Cisco/MikroTik/Other), shared secret, ports, test-connection button, vendor dropdown.
- **APIs:** `/api/nas-clients`, `/api/nas-clients/test-connection`, `/api/nas-clients/vendors`.

#### NAS Devices (`/nas-devices`) — `devices-page.tsx`
Network device inventory — CRUD for routers/switches/OLTs, bulk import/export, test-connection, schedule-maintenance, device detail dialog, multi-select delete.
- **APIs:** `/api/devices` (CRUD), `/api/devices/bulk`, `/api/devices/export`, `/api/devices/import`, `/api/devices/test-connection`, `/api/areas`.

#### Subnets / IPAM (`/ipam`) — `ipam-page.tsx`
Comprehensive IP Address Management — subnets CRUD, IP assignment, VLANs, FreeRADIUS pool population, conflict-check, DHCP sync, snapshots, assignment history, import/export, trends, gateway config. Includes CGNAT sub-tab.
- **APIs:** `/api/ipam`, `/api/ipam/assign-subscriber`, `/api/ipam/assignment-history`, `/api/ipam/conflict-check`, `/api/ipam/dhcp-sync`, `/api/ipam/export`, `/api/ipam/import`, `/api/ipam/radius-pools`, `/api/ipam/snapshots`, `/api/ipam/trends`, `/api/areas`, `/api/gateway/config`.

#### System Interfaces (`/system-interfaces`) — `interfaces-page.tsx`
Linux interface config — list interfaces (physical/vlan/bridge/bond), configure IP, create VLAN/Bridge/Bond, add static routes, add/remove alias IPs.
- **APIs:** `/api/interfaces`, `/api/routes`.

#### DHCP Server (`/dhcp`) — `dhcp-page.tsx`
KEA DHCP server management — subnets, reservations, hotspot integration.
- **APIs:** `/api/dhcp`, `/api/hotspot`, `/api/interfaces`.

#### DNS Server (`/dns`) — `dns-page.tsx`
dnsmasq DNS management — A/CNAME/MX/TXT records, captive-portal detection records, generated config preview, reload action.
- **APIs:** `/api/dns`.

#### PPPoE Server (`/pppoe-server`) — `pppoe-server-page.tsx`
PPPoE server config — profiles (rate limits, IP pools, DNS), active sessions list with disconnect/bulk-disconnect.
- **APIs:** `/api/pppoe`, `/api/pppoe/profiles/{id}`, `/api/pppoe/sessions/{id}`.

#### Captive Portal (`/captive-portal`) — `captive-portal-page.tsx`
Multi-portal captive portal system — create/edit portals by venue type, rules, MAC whitelist, schedules, voucher pools, ad zones, subnet mapping, analytics, live sessions (with disconnect-all), quick-access by venue type.
- **APIs:** `/api/captive-portal` (+ all sub-resources: `/ads`, `/analytics`, `/events`, `/mac-whitelist`, `/rules`, `/schedules`, `/sessions`, `/sessions/disconnect-all`, `/subnet-mapping`, `/voucher-pools`), `/api/agents`, `/api/areas`.

#### MultiWAN (`/multiwan`) — `multiwan-page.tsx`
WAN link management & failover — WAN links CRUD, failover rules, budget/alert config, bandwidth shaping, failback config, ping-test, IP configuration, manual failover, link health dashboard.
- **APIs:** `/api/multiwan`, `/api/interfaces`.

#### Dynamic Routing (`/dynamic-routing`) — `dynamic-routing-page.tsx`
BGP/OSPF/RIP/BFD dynamic routing config — BGP neighbors, OSPFv2/v3 areas, RIP/RIPng networks, BFD peers, config editors.
- **APIs:** `/api/dynamic-routing`.

#### FTTH/GPON (`/ftth-gpon`) — `ftth-gpon-page.tsx`
FTTH OLT management — 4 tabs (OLTs, Splitters, Templates, Capacity). Add/edit OLT devices with PON ports, port status history, splitters, OLT templates, capacity planning. Reboot OLT, export.
- **APIs:** `/api/ftth/olts` (CRUD), `/api/ftth/olts/{id}/reboot`, `/api/ftth/olts/export`, `/api/ftth/ports`, `/api/ftth/ports/status-history`, `/api/ftth/splitters`, `/api/ftth/templates`, `/api/areas`, `/api/subscribers`.

#### Network Health (`/network-health`) — `network-health-enhanced-page.tsx`
Enhanced network health dashboard with predictive analytics — device health scores, history trends, predictive failure warnings.
- **APIs:** `/api/network/health-enhanced`, `/api/network/health-history`, `/api/network/predictive`.

#### DHCPv6 Server (`/dhcpv6`) — `dhcpv6-page.tsx`
KEA DHCPv6 server — IPv6 subnets, prefix-delegation pools, reservations, stats, generated kea-dhcp6.conf preview.
- **APIs:** `/api/dhcpv6/pools`, `/api/dhcpv6/prefix-delegation`, `/api/dhcpv6/reservations`, `/api/dhcpv6/stats`, `/api/dhcpv6/subnets`.

### 4.4 POLICY (bandwidth, firewall, security controls)

#### Bandwidth Mgmt (`/bandwidth-mgmt`) — `bandwidth-mgmt-page.tsx`
Linux TC (Traffic Control) QoS manager — initialize/teardown TC, batch-restore from DB, subnet QoS pools (add/edit/remove), per-subscriber TC classes (rate change, remove). Status dashboard.
- **APIs:** `/api/qos`, `/api/qos/config`, `/api/qos/init`, `/api/qos/restore`, `/api/qos/status`, `/api/qos/subnet/add|del|rate`, `/api/qos/subnets`, `/api/qos/subscriber/add|del|rate`, `/api/qos/subscribers`, `/api/qos/teardown`.

#### Time Access (`/time-access`) — `time-access-page.tsx`
Time-based access policies — 2 tabs: Policies (CRUD time-window rules) and Assignments (assign policies to subscribers). Allowed/denied time slots.
- **APIs:** `/api/time-access-policies`.

#### QoS Monitor (`/qos-monitor`) — `qos-monitor-page.tsx`
Live QoS class monitoring — real-time per-class throughput, queue stats, drop counters, latency.
- **APIs:** `/api/qos-monitor`.

#### Firewall Rules (`/firewall`) — `firewall-page.tsx`
nftables firewall rule management — CRUD rules (chain, protocol, src/dst, action), apply rules to gateway, quick-rule templates.
- **APIs:** `/api/firewall`.

#### IPS / Anomaly Detection (`/ips`) — `ips-page.tsx`
Intrusion Prevention System — detection rules, block rules (with unblock), live alerts, threat scores, stats dashboard, nftables IPS table initialization.
- **APIs:** `/api/ips`, `/api/ips/alerts`, `/api/ips/block-rules` (CRUD, unblock), `/api/ips/nftables/init`, `/api/ips/rules` (CRUD), `/api/ips/stats`, `/api/ips/threat-scores`.

#### DDoS Protection (`/ddos-protection`) — `ddos-protection-page.tsx`
DDoS mitigation — policies with thresholds, live attack counters, reset counters.
- **APIs:** `/api/ddos`, `/api/ddos/counters`.

#### VPN Server (`/vpn-server`) — `vpn-server-page.tsx`
VPN server with 4 tabs: Overview, WireGuard (peers CRUD), IPsec/strongSwan (connections CRUD), VPN Logs. Service status dashboard.
- **APIs:** `/api/vpn-server`.

#### Security Profiles (`/security`) — `security-page.tsx`
Security profile templates — CRUD profiles (content filtering, DNS filtering, port blocking, rate limits), apply to multiple subscribers.
- **APIs:** `/api/security`.

### 4.5 MONITORING (live sessions, bandwidth, traffic, alerts)

#### Active Sessions (`/sessions`) — `sessions-page.tsx`
Live RADIUS sessions & security center — 3 tabs: Sessions (active list, terminate, disconnect RADIUS), Password (reset/lock user), Security (terminate suspicious sessions, lock accounts). Session details dialog.
- **APIs:** `/api/sessions`, `/api/sessions/export`, `/api/radius/sessions`, `/api/audit-log/entity/{type}`, `/api/settings/isp-profile`.

#### Session History (`/session-history`) — `session-history-page.tsx`
Historical RADIUS session records — searchable list of past sessions with duration, bytes, termination cause.
- **APIs:** `/api/aaa/session-history`.

#### Authentication Log (`/auth-log`) — `auth-log-page.tsx`
RADIUS authentication log — accept/reject events with subscriber, NAS, error reason, export.
- **APIs:** `/api/aaa/auth-log`, `/api/aaa/auth-log/export`.

#### Bandwidth (`/bandwidth`) — `bandwidth-page.tsx`
Real-time bandwidth monitor — interface-level RX/TX, plan comparison, devices list, settings, multi-period charts, export.
- **APIs:** `/api/bandwidth`, `/api/bandwidth/compare`, `/api/bandwidth/export`, `/api/bandwidth/interfaces`, `/api/devices`, `/api/plans`, `/api/settings`.

#### Traffic Analytics (`/traffic-analytics`) — `traffic-analytics-page.tsx`
Deep traffic analytics — protocols breakdown, location-wise sessions/traffic/avg-speed, interface status with peak in/out/utilization/trend.
- **APIs:** `/api/traffic-analytics`.

#### BW Reports (`/bw-reports`) — `bw-reports-page.tsx`
Bandwidth reports — per-pool/per-subnet utilization, avg download/upload, total data, per-session start/duration/download/upload/status, top-N users ranked.
- **APIs:** `/api/bw-reports`.

#### App Awareness (`/app-awareness`) — `app-awareness-page.tsx`
nDPI deep-packet-inspection app awareness — app catalog, categories, custom rules (CRUD), per-subscriber app usage, QoS rule integration, stats.
- **APIs:** `/api/ndpi`, `/api/ndpi/apps`, `/api/ndpi/catalog`, `/api/ndpi/categories`, `/api/ndpi/rules` (CRUD), `/api/ndpi/stats`, `/api/ndpi/subscribers`.

#### Uptime Monitor (`/uptime-monitor`) — `uptime-monitor-page.tsx`
HTTP/TCP uptime monitor — targets with status/latency/HTTP-code/message history, outage records with start/end/duration/checks, quick-add ISP services template.
- **APIs:** `/api/uptime-monitor`.

#### Latency Monitor (`/latency-monitor`) — `latency-monitor-page.tsx`
Latency monitoring across targets — live ping latency, history charts.
- **APIs:** `/api/latency-monitor`.

#### Speed Test (`/speed-test`) — `speed-test-page.tsx`
Built-in speed-test (download/upload/ping/latency) against gateway service.
- **APIs:** `/api/speed-test`.

#### Syslog Server (`/syslog-server`) — `syslog-server-page.tsx`
Syslog receiver — live log stream table (timestamp/facility/severity/hostname/app/source/message).
- **APIs:** `/api/syslog-server`.

#### Diagnostic Tools (`/diagnostic-tools`) — `diagnostic-tools-page.tsx`
Network diagnostics — ping/traceroute/tcpdump capture (list/download/delete), interface picker.
- **APIs:** `/api/diag`, `/api/diag/tcpdump/captures/{id}`, `/api/diag/tcpdump/download/{id}`, `/api/interfaces`.

#### IP-MAC History (`/ip-mac-history`) — `ip-mac-history-page.tsx`
IP↔MAC binding history — track IP/MAC pair changes over time for security & troubleshooting.
- **APIs:** `/api/ip-mac-history`.

#### Zone Budgets (`/zone-budgets`) — `zone-budgets-page.tsx`
Area/zone bandwidth budget management — define area data budgets per cycle, record usage, per-area budget vs actual.
- **APIs:** `/api/area-budgets` (GET/POST/PATCH).

#### NAT Logs (`/nat-logs`) — `nat-logs-page.tsx`
NAT logging & syslog config — view NAT translation logs, configure syslog server targets, test syslog.
- **APIs:** `/api/nat-logs`, `/api/syslog/configs` (CRUD), `/api/syslog/test/{id}`.

#### Network Alerts (`/network-alerts`) — `network-alerts-page.tsx`
Alert management — alerts list, analytics, auto-escalation, history, maintenance windows, alert-rule CRUD, assignment, suppression, export.
- **APIs:** `/api/alerts`, `/api/alerts/analytics`, `/api/alerts/auto-escalate`, `/api/alerts/export`, `/api/alerts/history`.

#### Grafana Dashboards (`/grafana-dashboards`) — `grafana-dashboards-page.tsx`
Embed/link Grafana dashboards inside the platform, configure Grafana URL/API key.
- **APIs:** `/api/grafana-dashboards`.

### 4.6 SERVICES (device management, TR-069, SNMP, enterprise)

#### TR-069 ACS (`/tr069-acs`) — `tr069-acs-page.tsx`
GenieACS TR-069 CPE management — device list (serial, manufacturer, model, software, last inform), tasks (per-device), preset scripts (with script preview), service status banner when GenieACS not running.
- **APIs:** `/api/tr069-acs`, `/api/tr069-acs/service`.

#### MikroTik Manager (`/mikrotik-manager`) — `mikrotik-manager-page.tsx`
MikroTik API integration — connect to MT devices, manage interfaces (enable/disable toggle), IP addresses (add/remove), static routes (add/remove), view connections/interfaces/IPs/routes tables.
- **APIs:** `/api/mikrotik-manager`.

#### SSH Device Manager (`/ssh-device-manager`) — `ssh-device-manager-page.tsx`
SSH terminal manager — 4 tabs: Devices (add SSH device), Terminal (live SSH session), Quick Commands (predefined command library), Batch Execute (run command across multiple devices).
- **APIs:** `/api/ssh-device-manager`.

#### SNMP Manager (`/snmp-manager`) — `snmp-manager-page.tsx`
SNMP manager — device list with interface table (description/type/speed/MAC/admin/oper/in/out counters), custom OID table, custom SNMP values.
- **APIs:** `/api/snmp-manager`.

#### RADIUS Proxy (`/radius-proxy`) — `radius-proxy-page.tsx`
RADIUS proxy configuration — 2 tabs: Realms (CRUD proxy realms, strip-realm, server list, status) and Servers (CRUD proxy servers with host/auth-port/acct-port/type/priority, test-connection).
- **APIs:** `/api/radius-proxy/realms` (CRUD), `/api/radius-proxy/servers` (CRUD), `/api/radius-proxy/servers/{id}/test`.

#### RADIUS Attributes (`/radius-attributes`) — `radius-attributes-page.tsx`
RADIUS dictionary & per-user attribute editor — 2 tabs: Attribute Definitions (CRUD dictionary attrs with type/op) and User Attributes (assign/bulk-assign custom attrs to subscribers).
- **APIs:** `/api/radius-attributes/definitions` (CRUD), `/api/radius-attributes/user-attributes` (CRUD/bulk), `/api/subscribers`.

#### Enterprise Auth (`/enterprise-auth`) — `enterprise-auth-page.tsx`
Enterprise subscriber directory — CRUD enterprise auth accounts (corporate customers with custom auth), delete.
- **APIs:** `/api/enterprise-auth` (CRUD).

#### WiFi Offload (`/wifi-offload`) — `wifi-offload-page.tsx`
WiFi offload & Diameter peer management — sessions list (disconnect), Diameter peers (CRUD), policies, events log (clear-all).
- **APIs:** `/api/wifi-offload` (CRUD), `/api/wifi-offload/proxy`.

#### Hotspot (`/hotspot`) — `hotspot-page.tsx`
Hotspot management with dashboard tab — locations CRUD, hotspot plans CRUD (bulk create), live users (disconnect), data history per user, revenue reports, analytics, export.
- **APIs:** `/api/hotspot`, `/api/hotspot/analytics`, `/api/hotspot/dashboard`, `/api/hotspot/data-history`, `/api/hotspot/export`, `/api/hotspot/revenue`, `/api/hotspot/users/{id}`, `/api/vouchers`.

#### Tech Performance (`/technician-performance`) — `technician-performance-page.tsx`
Technician performance dashboard — leaderboard, performance metrics, dispatch actions per technician.
- **APIs:** `/api/technicians/leaderboard`, `/api/technicians/performance`, `/api/technicians/dispatch`, `/api/complaints/{id}`.

#### CoA Tracking (`/coa-tracking`) — `coa-events-page.tsx`
RADIUS Change-of-Authorization event log — per-event subscriber, type, status, plan-change, BW %, triggered-by, error.
- **APIs:** `/api/coa-events`.

### 4.7 OPERATIONS (billing, complaints, field work, CRM)

#### Billing (`/billing`) — `billing-page.tsx`
Billing/invoice workflow — invoice table (invoice #, subscriber, period, amount, balance, status, due date), line items, payment history per invoice.
- **APIs:** `/api/billing`, `/api/billing/{id}`, `/api/billing/export`, `/api/invoices`, `/api/subscribers`.

#### Invoices (`/invoices`) — `invoices-page.tsx`
Invoice management — bulk-generate, recurring templates, credit notes, cancel, delete, export-all, tax settings, invoice format settings, printable invoice view (Subscriber info, Plan details, Billing period, Line items, Amount breakdown, Payment history).
- **APIs:** `/api/invoices` (CRUD), `/api/invoices/{id}/credit-note`, `/api/invoices/bulk-generate`, `/api/invoices/export-all`, `/api/invoices/recurring-templates`, `/api/settings/invoice-format`, `/api/settings/tax`, `/api/areas`, `/api/plans`, `/api/subscribers`.

#### Payments (`/payments`) — `payments-page.tsx`
Payment recording — table with verify, refund, delete, export, per-payment detail dialog (subscriber, plan, ISP info). Adjusts subscriber balance.
- **APIs:** `/api/payments` (CRUD), `/api/payments/{id}`, `/api/payments/{id}/refund`, `/api/payments/export`, `/api/subscribers`, `/api/subscribers/{id}/balance`.

#### Vouchers (`/vouchers`) — `vouchers-page.tsx`
Voucher management — generate batches from templates, voucher cards (printable), templates CRUD, usage history, stats, import. Plan & subscriber link.
- **APIs:** `/api/vouchers` (CRUD), `/api/vouchers/{id}`, `/api/vouchers/generate`, `/api/vouchers/import`, `/api/vouchers/stats`, `/api/vouchers/templates` (CRUD), `/api/vouchers/usage-history`, `/api/plans`, `/api/subscribers`.

#### Complaints (`/complaints`) — `complaints-page.tsx`
Complaint/ticket system — complaint analytics, complaint table with priority/status, new complaint dialog, complaint detail (description, resolution notes, comments, auto-assign), bulk-close, export. Subscriber/area/technician link.
- **APIs:** `/api/complaints` (CRUD), `/api/complaints/{id}/auto-assign`, `/api/complaints/{id}/comments`, `/api/complaints/analytics`, `/api/complaints/bulk-close`, `/api/complaints/export`, `/api/audit-log/entity/Complaint`, `/api/areas`, `/api/subscribers`, `/api/technicians`, `/api/settings/isp-profile`.

#### Technicians (`/technicians`) — `technicians-page.tsx`
Technician CRM — list with skills/managed-areas, weekly schedule & calendar (with day-detail showing complaints/installations), attendance/leave, SLA tracking, dispatch (complaint or installation), compensation & bank-details editors, status changes, bulk actions, export, analytics.
- **APIs:** `/api/technicians` (CRUD), `/api/technicians/{id}/analytics`, `/api/technicians/attendance`, `/api/technicians/bulk`, `/api/technicians/calendar`, `/api/technicians/export`, `/api/technicians/leave`, `/api/technicians/sla`, `/api/areas`, `/api/complaints`, `/api/installations`, `/api/subscribers`.

#### Agents (`/agents`) — `agents-page.tsx`
Sales agent / collection agent CRM — CRUD agents, analytics, follow-ups, commission payouts, reconciliation, create-login (agent portal), import/export.
- **APIs:** `/api/agents` (CRUD), `/api/agents/analytics`, `/api/agents/create-login`, `/api/agents/export`, `/api/agents/followups`, `/api/agents/import`, `/api/agents/payouts`, `/api/agents/reconciliation`, `/api/areas`, `/api/subscribers`.

#### Installations (`/installations`) — `installations-page.tsx`
Installation job management — list of installation jobs, auto-assign technician, daily report, customer feedback, timeline view. Links equipment, areas, subscribers, technicians.
- **APIs:** `/api/installations` (CRUD), `/api/installations/auto-assign`, `/api/installations/daily-report`, `/api/installations/feedback`, `/api/installations/timeline`, `/api/areas`, `/api/equipment`, `/api/subscribers`, `/api/technicians`.

#### Inventory (`/inventory`) — `inventory-page.tsx`
Equipment/inventory module — stock items CRUD, bulk, stock transfers, vendors CRUD, analytics.
- **APIs:** `/api/inventory` (CRUD/bulk), `/api/stock-transfers`, `/api/vendors` (CRUD), `/api/equipment/analytics`, `/api/audit-log/entity/Equipment`.

#### Equipment (`/equipment`) — `equipment-page.tsx`
Equipment & inventory master with 11 tabs: Equipment, Purchase Orders, Vendors, Warehouses, Returns, Repairs, Stock, plus analytics tabs Category/Condition/Monthly/Location.
- **Sub-tabs (`src/components/pages/tabs/`):**
  - **warehouses-tab.tsx** — Warehouse CRUD → `/api/warehouses`
  - **returns-tab.tsx** — Returns table → `/api/equipment/returns`
  - **repairs-tab.tsx** — Repairs table → `/api/equipment/repairs`
  - **stock-tab.tsx** — Stock adjustments + history → `/api/equipment/adjustments`, `/api/equipment/adjustments/history`
  - **qos-tab.tsx** — QoS rule CRUD → `/api/bandwidth/qos`
  - **throttling-tab.tsx** — Throttle rule CRUD → `/api/bandwidth/throttle`
  - **thresholds-tab.tsx** — Bandwidth alert rule CRUD → `/api/bandwidth/thresholds`

#### Incidents (`/incidents`) — `incidents-page.tsx`
Incident management — list with filters/assignment, create incident, auto-detect from alerts, merge duplicates, schedule maintenance, add updates, resolve, root-cause-analysis, escalate, assign, view affected subscribers, export.
- **APIs:** `/api/incidents`, `/api/incidents/export`.

#### Leads (`/leads`) — `leads-page.tsx`
Lead/prospect CRM — list with status pipeline, Add/Edit/Delete lead, lead detail view, upcoming follow-ups card, lost-reason breakdown card.
- **APIs:** `/api/leads`.

#### Reseller (`/reseller`) — `reseller-page.tsx`
Reseller & franchise management — reseller table (Reseller/Area/Status/Credit/Commission), commission ledger (Reseller/Month/Subscribers/Revenue/Rate/Commission/Status), plan-pricing table (Plan/Base Price/Reseller Price/Margin). Mark-commission-paid, bulk-assign plans, Add/Edit/Delete reseller.
- **APIs:** `/api/reseller`.

#### Action History (`/action-history`) — `action-history-page.tsx`
Audit-able action history — table (Timestamp/Subscriber/Action/Entity/Performed By/Reversible/Actions) with reverse-action buttons.
- **APIs:** `/api/action-history`.

#### Announcements (`/announcements`) — `announcements-page.tsx`
Platform announcements — CRUD announcement cards with title/body, dismiss tracking.
- **APIs:** `/api/announcements` (CRUD), `/api/announcements/dismiss`.

### 4.8 FINANCE

#### Reports (`/reports`) — `reports-page.tsx`
Custom report builder — predefined report templates (subscriber usage, monthly revenue, device inventory) + custom report runner. Results table (Subscriber/Plan/Area/Connection/Download GB/Upload GB/Total GB/Avg Session, Monthly Revenue/Collected/Invoices/Collection %, Device/Type).
- **APIs:** `/api/reports`, `/api/reports/custom`.

#### Revenue Reports (`/revenue-reports`) — `revenue-reports-page.tsx`
Comprehensive revenue reporting — daily revenue table, agent-wise revenue chart, agent breakdown table, invoice aging chart, growth summary table, churn revenue impact trend, forecast summary, expense records, monthly TDS trend, KPI targets, TDS-TCS report.
- **APIs:** `/api/reports/revenue`, `/api/reports/kpi-targets`, `/api/reports/tds-tcs`, `/api/expenses`.

#### Revenue Forecast (`/revenue-forecast`) — `revenue-forecast-page.tsx`
AI revenue forecast & cashflow — category breakdown table (Category/Subscribers/MRR/% Share), forecast chart, cashflow projection.
- **APIs:** `/api/revenue/forecast`, `/api/revenue/cashflow`.

#### Collection (`/collection`) — `collection-page.tsx`
Collection management — collection summary, targets, receipt generation, reconcile, disputes, refunds. Links invoices, payments, subscribers.
- **APIs:** `/api/collection`, `/api/collection/receipt`, `/api/collection/reconcile`, `/api/collection/summary`, `/api/collection/targets`, `/api/disputes`, `/api/invoices`, `/api/payments`, `/api/payments/{id}/refund`, `/api/subscribers`.

#### Due Recovery (`/due-recovery`) — `due-recovery-page.tsx`
Overdue invoice recovery — overdue invoices table, payment plans, installment schedules, dispute history, SLA dashboard, export. Actions: payment promise, assign recovery agent, write-off, reactivate subscriber, schedule reminder, bulk reminder, record payment, suspend subscriber.
- **APIs:** `/api/due-recovery`, `/api/due-recovery/sla-dashboard`, `/api/due-recovery/sla-export`, `/api/agents`, `/api/areas`, `/api/invoices`, `/api/subscribers`.

#### GST/Tax (`/gst-tax`) — `gst-tax-page.tsx`
Indian GST/Tax management — monthly tax collection, breakdown, tax payable, quarterly breakdown, FY GSTR-9 summary, TDS section summary, TDS/TCS entries, invoice-level GST audit, reverse-charge invoices, composite scheme, HSN/SAC codes. TDS/TCS entry CRUD, HSN CRUD.
- **APIs:** `/api/gst`, `/api/gst/audit`, `/api/gst/composite`, `/api/gst/gstr9`, `/api/gst/reverse-charge`, `/api/gst/tds-tcs`, `/api/settings/isp-profile`.

#### Referral (`/referral`) — `referral-page.tsx`
Referral + loyalty hub with 5 tabs: Referral Program, Loyalty Points, Campaigns, Rewards, Analytics. Configure tier thresholds, create/edit/delete rewards, manual points adjustment, enroll subscribers.
- **APIs:** `/api/referral`.

#### Loyalty Gamification (`/loyalty-gamification`) — `loyalty-gamification-page.tsx`
Loyalty gamification — badges, enhanced loyalty engine, tier management.
- **APIs:** `/api/loyalty/badges`, `/api/loyalty/enhanced`, `/api/loyalty/tiers`.

#### Charge Override (`/charge-override`) — `charge-overrides-page.tsx`
Per-subscriber custom charge overrides — create/edit/cancel overrides on top of plan pricing.
- **APIs:** `/api/charge-overrides` (CRUD), `/api/subscribers`.

#### Cyclic Billing (`/cyclic-billing`) — `cyclic-billing-page.tsx`
Cyclic billing cycles & milestones — define cycles (Threshold/Speed Down/Speed Up/Priority/Description), milestones, plan link.
- **APIs:** `/api/cyclic-billing/cycles`, `/api/cyclic-billing/milestones`, `/api/plans`.

#### Grace Periods (`/grace-periods`) — `grace-periods-page.tsx`
Subscriber grace-period management — table (Subscriber/Grace Days/Type/Suspension Date/Expiry/Reason/Status) with cancel action.
- **APIs:** `/api/grace-periods`.

#### Add-on Services (`/add-on-services`) — `add-on-services-page.tsx`
Add-on service catalog & subscriptions — CRUD add-on services, subscribe/unsubscribe subscribers, view active subscriptions.
- **APIs:** `/api/add-on-services` (CRUD), `/api/add-on-services/subscribe`, `/api/add-on-services/subscriptions` (CRUD), `/api/subscribers`.

#### Top-Ups (`/top-ups`) — `top-ups-page.tsx`
Top-up product management with 2 tabs: Products (CRUD data top-up products) and Purchase History.
- **APIs:** `/api/top-ups`.

#### Smart Collections (`/smart-collections`) — `smart-collections-page.tsx`
AI-driven smart collections — analytics, schedule, smart collection queue (Subscriber/Channel/Best Time), area-wise recovery stats (Outstanding/Recovered/Recovery Rate/Avg Days/Subscribers), top overdue subscribers with phone/plan/area/days-overdue/invoices.
- **APIs:** `/api/collections/analytics`, `/api/collections/schedule`, `/api/collections/smart`.

#### Revenue Leakage (`/revenue-leakage`) — `revenue-leakage-page.tsx`
Revenue leakage detection — leakage categories, invoice aging buckets, monthly aging trend, area-wise aging, anomaly flags, monthly adjustment trend, top-10 largest adjustments, financial adjustments table.
- **APIs:** `/api/revenue/leakage`, `/api/revenue/aging-enhanced`, `/api/revenue/audit`.

#### Compliance & SLA (`/compliance-sla`) — `compliance-sla-page.tsx`
SLA & compliance dashboard — priority-wise compliance, monthly compliance trend, resolution time by priority, P95 resolution time, escalation tracking, compliance checklist, tax compliance summary, KYC verification status, data retention & audit coverage.
- **APIs:** `/api/compliance/sla`, `/api/compliance/regulatory`, `/api/compliance/audit-report`.

#### Reseller Intelligence (`/reseller-intelligence`) — `reseller-analytics-page.tsx`
Reseller analytics hub — performance dashboard, commission comparison (simple vs tiered), payout history, risk assessment, credit-limit adjustment.
- **APIs:** `/api/resellers/analytics`, `/api/resellers/commission-engine`, `/api/resellers/credit`.

#### Data Export (`/data-export`) — `data-export-page.tsx`
Data export module — export subscribers, invoices, payments, complaints in CSV/Excel.
- **APIs:** `/api/export/subscribers`, `/api/export/invoices`, `/api/export/payments`, `/api/export/complaints`.

### 4.9 AI INTELLIGENCE

#### AI Advisor (`/ai-advisor`) — `ai-advisor-page.tsx`
AI advisory chat — ask business questions, get markdown-rendered recommendations (supports h1/h2/h3 headings).
- **APIs:** `/api/ai/advisor`.

#### AI Diagnosis (`/ai-diagnosis`) — `ai-diagnosis-page.tsx`
AI-powered network/subscriber diagnosis — diagnose issues, baselines, link to subscribers & complaints.
- **APIs:** `/api/ai/diagnose`, `/api/ai/diagnosis/baselines`, `/api/complaints`, `/api/subscribers`.

#### Churn Alerts (`/churn-alerts`) — `churn-alerts-page.tsx`
Churn alert center — alerts list, communications log, tracking, workflows. Subscriber detail & action dialog (with capitalized action name).
- **APIs:** `/api/churn-alerts`, `/api/churn-alerts/communications`, `/api/churn-alerts/tracking`, `/api/churn-alerts/workflows`.

#### Churn Prediction (`/churn-prediction`) — `churn-prediction-page.tsx`
ML churn prediction — analytics, predict endpoint, retention recommendations.
- **APIs:** `/api/churn/analytics`, `/api/churn/predict`, `/api/churn/retention`.

#### Competitor Intel (`/competitor-intel`) — `competitor-intel-page.tsx`
Competitor intelligence — CRUD competitor plans, win/loss reports, AI-driven insights.
- **APIs:** `/api/competitors` (CRUD), `/api/competitors/win-loss`, `/api/ai`.

#### Competitor Analysis (`/competitor-analysis`) — `competitor-analysis-page.tsx`
Competitor analytics — market share, pricing intelligence, comparison, win/loss analysis.
- **APIs:** `/api/competitors/comparison`, `/api/competitors/market-share`, `/api/competitors/pricing-intelligence`, `/api/competitors/win-loss`.

#### WhatsApp Bot (`/whatsapp-bot`) — `whatsapp-bot-page.tsx`
WhatsApp business bot — 10 tabs: Config, Templates, Commands, Quick Replies, Conversations, Schedule, Analytics, Business, Webhooks, Logs. CRUD templates/commands/quick-replies, broadcast, schedule, view conversations, webhook config, log viewer.
- **APIs:** `/api/whatsapp/analytics`, `/api/whatsapp/broadcast`, `/api/whatsapp/commands` (CRUD), `/api/whatsapp/config`, `/api/whatsapp/conversations`, `/api/whatsapp/logs`, `/api/whatsapp/quick-replies` (CRUD), `/api/whatsapp/schedule`, `/api/whatsapp/templates` (CRUD), `/api/whatsapp/webhook`, `/api/whatsapp/webhooks`, `/api/subscribers`.

### 4.10 SETTINGS

#### ISP Profile (`/isp-profile`) — `isp-profile-page.tsx`
ISP company profile editor — company name, contact, GST, logo, bank details, invoice format defaults.
- **APIs:** `/api/settings/isp-profile`.

#### Admin Users (`/admin-users`) — `users-page.tsx`
Admin user management — CRUD users, bulk import/bulk action, change password, reset user password, view sessions & activity, impersonate, terminate sessions, permissions matrix, export.
- **APIs:** `/api/users` (CRUD), `/api/users/{id}/activity`, `/api/users/{id}/impersonate`, `/api/users/{id}/sessions`, `/api/users/bulk`, `/api/users/bulk-import`, `/api/users/change-password`, `/api/users/export`, `/api/users/permissions`, `/api/areas`, `/api/auth/logout`.

#### Areas (`/areas`) — `areas-page.tsx`
Area/zone management — CRUD areas, reorder, bulk-import CSV, area details dialog. Links agents & technicians.
- **APIs:** `/api/areas` (CRUD), `/api/areas/bulk-import`, `/api/areas/reorder`, `/api/agents`, `/api/technicians`.

#### Equipment (`/equipment`) — `equipment-page.tsx`
*(same file as Inventory under OPERATIONS — 11 tabs covering equipment, POs, vendors, warehouses, returns, repairs, stock, plus 4 analytics tabs).*

#### Promotions (`/promotions`) — `promotions-page.tsx`
Promotional campaign management — CRUD promotions, toggle status, promotion details dialog.
- **APIs:** `/api/promotions` (CRUD), `/api/promotions/{id}/toggle-status`.

#### Notifications (`/notifications`) — `notifications-page.tsx`
Notification center — 3 tabs: History (sent notifications), Rules (CRUD notification rules), Analytics. Retry-failed, send, delete.
- **APIs:** `/api/notifications` (CRUD), `/api/notifications/{id}/retry`, `/api/notifications/analytics`, `/api/notifications/retry-failed`, `/api/notifications/send`, `/api/notification-rules` (CRUD), `/api/subscribers`.

#### API Keys (`/api-keys`) — `api-keys-page.tsx`
API key management — list/create/revoke keys, scopes, regenerate, extend expiry, webhook test.
- **APIs:** `/api/api-keys` (CRUD + PUT), `/api/api-keys/{id}` (DELETE/PUT), `/api/api-keys/webhook/test`.

#### Audit Log (`/audit-log`) — `audit-log-page.tsx`
Audit log with 3 tabs: Activity Log, Anomalies, Compliance — multi-select delete.
- **APIs:** `/api/audit-log`, `/api/settings`.

#### Backup (`/backup`) — `backup-page.tsx`
Backup & restore — create backup, restore, export data, delete backup (local + cloud), full-DB restore danger zone, environment settings.
- **APIs:** `/api/backup`, `/api/backup/{id}/download`, `/api/backup/{id}/verify`, `/api/settings/environment`.

#### Integrations (`/integrations`) — `integrations-page.tsx`
Third-party integrations with 4 tabs: Payment Gateways, Communication, Webhooks, Transactions — add/configure gateways/channels, webhook endpoints, test integration, view API call logs & transactions.
- **APIs:** `/api/integrations`, `/api/integrations/logs`, `/api/integrations/test`, `/api/integrations/transactions`, `/api/webhooks`.

#### Knowledge Base (`/knowledge-base`) — `knowledge-base-page.tsx`
KB / FAQ manager — categories, articles, FAQs, version history, preview, import article.
- **APIs:** `/api/knowledge-base`.

#### Module Manager (`/module-manager`) — `module-manager-page.tsx`
Feature-flag / module toggle manager — enable/disable platform modules.
- **APIs:** `/api/modules`.

### 4.11 SELFCARE PORTAL (`/selfcare/*` — `src/components/pages/selfcare/`)

Standalone subscriber portal shell (no AppShell sidebar) — subscriber login form (service username + password), top status bar, mobile menu, 9-item left nav.

#### Selfcare Layout (`selfcare-layout.tsx`)
9-item left nav: Dashboard, My Usage, Billing, Support, My Profile, Service Status, Payments, Speed History, Plan Comparison. Lazy-loads sub-pages.
- **APIs:** `/api/subscriber-auth/login` (via `useSubscriberAuthStore`).

#### Selfcare Dashboard (`selfcare-dashboard.tsx`)
Subscriber dashboard — service health, usage meter, speed history chart, service status, recent invoices, recent payments, recent complaints, password-change widget.
- **APIs:** `/api/selfcare/service-health`, `/api/selfcare/speed-history`, `/api/selfcare/usage-meter`, `/api/subscriber-auth/complaints`, `/api/subscriber-auth/invoices`, `/api/subscriber-auth/password`, `/api/subscriber-auth/payments`, `/api/subscriber-auth/service-status`, `/api/subscriber-auth/usage`.

#### Selfcare Usage (`selfcare-usage.tsx`)
Subscriber data-usage view — current cycle usage vs quota, plan info, complaints quick-link.
- **APIs:** `/api/subscriber-auth/usage`, `/api/subscriber-auth/plans`, `/api/subscriber-auth/complaints`.

#### Selfcare Billing (`selfcare-billing.tsx`)
Subscriber billing — invoice list & payment history.
- **APIs:** `/api/subscriber-auth/invoices`, `/api/subscriber-auth/payments`.

#### Selfcare Support (`selfcare-support.tsx`)
Subscriber support — file/view complaints.
- **APIs:** `/api/subscriber-auth/complaints`.

#### Selfcare Profile (`selfcare-profile.tsx`)
Subscriber profile editor — update contact info, change password.
- **APIs:** `/api/subscriber-auth/me`, `/api/subscriber-auth/password`, `/api/subscriber-auth/profile`.

#### Selfcare Services (`selfcare-services.tsx`)
Service-status page — check current RADIUS/service status, run a speed test, file a complaint.
- **APIs:** `/api/subscriber-auth/service-status`, `/api/subscriber-auth/speed-test`, `/api/subscriber-auth/complaints`.

#### Selfcare Payments (`selfcare-payments.tsx`)
Make a payment — list outstanding invoices, create payment order via gateway integration, view past payments.
- **APIs:** `/api/payments/create-order`, `/api/subscriber-auth/invoices`, `/api/subscriber-auth/payments`, `/api/integrations`.

#### Selfcare Speed History (`selfcare-speed-history.tsx`)
Subscriber speed-test history — daily speed trend chart.
- **APIs:** `/api/selfcare/speed-history`.

#### Selfcare Plan Compare (`selfcare-plan-compare.tsx`)
Plan comparison — compare subscriber's current plan with alternatives side-by-side.
- **APIs:** `/api/selfcare/plan-compare`.

### 4.12 ORPHAN / HIDDEN AAA PAGES (exist in `page-loaders.ts` but NOT in nav-config)

#### Aaa Users (`aaa-users-page.tsx`)
RADIUS user table — Username/Subscriber/Group/Status/Type/Plan-Speed/RADIUS-enabled toggle/actions; per-user attribute table (Attribute/Op/Value ×4).
- **APIs:** `/api/aaa/users` (GET/POST/PUT/DELETE), `/api/radius-groups`, `/api/subscribers`.

#### Aaa Sessions (`aaa-sessions-page.tsx`)
Active RADIUS session table — Username/Framed IP/MAC/NAS/Group/Duration (sortable)/Status.
- **APIs:** `/api/aaa/active-sessions`.

#### Aaa Groups (`aaa-groups-page.tsx`)
RADIUS group manager — Group Name/Description/Users count/Check Attrs/Reply Attrs/Speed/Priority/actions; attribute editor tables; user list per group.
- **APIs:** `/api/aaa/groups` (CRUD), `/api/aaa/groups/{id}`.

#### Aaa Radius (`aaa-radius-page.tsx`)
Combined RADIUS admin — RADIUS users (provision/edit/import/export/toggle-enabled), RADIUS groups (add/edit/delete), RADIUS sessions, RADIUS accounting, RADIUS settings; subscriber search for radiusEnabled=false.
- **APIs:** `/api/radius-users` (CRUD + export/import/toggle-enabled), `/api/radius-groups` (CRUD), `/api/radius-sessions`, `/api/radius-accounting`, `/api/radius-settings`, `/api/settings/isp-profile`, `/api/subscribers`.

#### Session Engine (`session-engine-page.tsx`)
Internal session engine admin — sessions list, NAS config, per-session policy enforcement.
- **APIs:** `/api/session-engine`, `/api/session-engine/nas-config`, `/api/session-engine/policy/{id}`, `/api/session-engine/sessions` (CRUD), `/api/plans`.

---

## 5. Backend Feature List (APIs + Mini-Services)

### 5.1 API Route Catalog (134 groups · 501 route.ts files · ~88% require auth)

**Auth model:** `requireAuth(req)` from `src/lib/api-auth.ts` — cookie `cryptsk_session` (HMAC-SHA256) + Bearer-token fallback, active-account check. Public routes: login/logout, `/api/auth/me`, subscriber self-care login, `test-toast`, `files`, `reports`, some polling endpoints.

#### A. Subscribers & CRM
| Group | Methods (root) | Sub-routes |
|-------|----------------|------------|
| `/subscribers` | GET, POST | `[id]`, `[id]/360`, `[id]/balance`, `bulk`, `expiring`, `export`, `online-count`, `stats` |
| `/subscriber-auth` | (dir) | `login`, `logout`, `me`, `profile`, `password`, `plans`, `invoices`, `payments`, `complaints`, `usage`, `speed-test`, `service-status` |
| `/areas` | GET, POST, PUT | `[id]`, `bulk-import`, `reorder` |
| `/area-budgets` | GET, POST | — |
| `/subnets` | GET | — |
| `/leads` | GET, POST | `[id]` |
| `/referral` | GET, POST | — |
| `/selfcare` | (dir) | `plan-compare`, `service-health`, `speed-history`, `usage-meter` |
| `/churn` | (dir) | `analytics`, `predict`, `retention` |
| `/churn-alerts` | GET, POST | `communications`, `tracking`, `workflows` |

#### B. Billing & Finance
| Group | Methods (root) | Sub-routes |
|-------|----------------|------------|
| `/billing` | GET, POST | `[id]`, `export` |
| `/invoices` | GET, POST | `[id]`, `[id]/credit-note`, `[id]/credit-notes`, `bulk-generate`, `export`, `export-all`, `recurring-templates` |
| `/payments` | GET, POST | `[id]`, `[id]/refund`, `create-order`, `export`, `recent`, `revenue-by-mode` |
| `/top-ups` | GET, POST | — |
| `/promotions` | GET, POST | `[id]`, `[id]/toggle-status` |
| `/charge-overrides` | GET, POST | `[id]` |
| `/collection` | GET, POST | `disputes`, `receipt`, `reconcile`, `refund`, `summary`, `targets` |
| `/collections` | (dir) | `analytics`, `schedule`, `smart` |
| `/due-recovery` | GET, POST | `legal-notice`, `payment-plan`, `sla-dashboard`, `sla-export` |
| `/grace-periods` | GET, POST | — |
| `/cyclic-billing` | GET, POST | — |
| `/revenue` | (dir) | `aging-enhanced`, `audit`, `cashflow`, `forecast`, `leakage` |
| `/gst` | GET, POST | `audit`, `composite`, `gstr9`, `reverse-charge`, `tds-tcs` |
| `/expenses` | GET, POST | — |
| `/reports` | (none) | `custom`, `expenses`, `kpi-targets`, `revenue`, `tds-tcs` |
| `/agents` | GET, POST | `[id]`, `analytics`, `create-login`, `export`, `followups`, `import`, `payouts`, `reconciliation` |
| `/resellers` | (dir) | `analytics`, `commission-engine`, `credit` |
| `/reseller` | GET, POST | — |
| `/loyalty` | (dir) | `badges`, `enhanced`, `tiers` |

#### C. Plans, Vouchers, Provisioning
| Group | Methods (root) | Sub-routes |
|-------|----------------|------------|
| `/plans` | GET, POST | `[id]`, `analytics`, `migrate`, `optimization`, `performance`, `recommend`, `reorder` |
| `/vouchers` | GET, POST | `[id]`, `bulk`, `generate`, `import`, `stats`, `templates`, `templates/[id]`, `usage-history` |
| `/add-on-services` | GET, POST | `subscribe`, `subscriptions`, `subscriptions/[id]` |
| `/provisioning` | GET, POST | — |
| `/batch-provisioning` | (dir) | `jobs`, `templates`, `templates/[id]` |

#### D. Support, Complaints, Notifications
| Group | Methods (root) | Sub-routes |
|-------|----------------|------------|
| `/complaints` | GET, POST | `[id]`, `[id]/auto-assign`, `[id]/comments`, `analytics`, `bulk-close`, `export`, `open-count` |
| `/technicians` | GET, POST | `[id]`, `[id]/analytics`, `attendance`, `bulk`, `calendar`, `dispatch`, `export`, `leaderboard`, `leave`, `performance`, `sla` |
| `/installations` | GET, POST | `[id]`, `auto-assign`, `daily-report`, `feedback`, `timeline` |
| `/sla` | (dir) | `monitor` |
| `/knowledge-base` | GET, POST | — |
| `/announcements` | GET, POST | `[id]`, `dismiss` |
| `/incidents` | GET, POST | `export` |
| `/notifications` | GET, POST | `[id]`, `[id]/retry`, `analytics`, `mark-all-read`, `retry-failed`, `send`, `unread-count` |
| `/notification-rules` | GET, POST, PUT, DELETE | `[id]` |
| `/activity-feed` | GET | — |
| `/action-history` | GET, POST | — |
| `/audit-log` | GET, POST, DELETE | `entity`, `entity/[entityType]`, `stats` |

#### E. RADIUS / AAA
| Group | Methods (root) | Sub-routes |
|-------|----------------|------------|
| `/aaa` | (dir) | `active-sessions`, `auth-log`, `groups`, `groups/[groupname]`, `session-history`, `users`, `users/[username]` |
| `/radius` | (dir) | `sessions`, `users`, `users/[id]` |
| `/radius-attributes` | GET, POST | `definitions`, `definitions/[id]`, `user-attributes`, `user-attributes/[id]`, `user-attributes/bulk` |
| `/radius-groups` | GET, POST, PUT, DELETE | — |
| `/radius-proxy` | GET, POST | `realms`, `realms/[id]`, `servers`, `servers/[id]` |
| `/radius-sessions` | GET, POST | — |
| `/radius-settings` | GET, PUT | — |
| `/radius-users` | GET, POST | `[id]`, `export`, `import`, `toggle-enabled` |
| `/radius-accounting` | GET | — |
| `/nas-clients` | GET, POST, PUT, DELETE | `[id]`, `test-connection`, `vendors` |
| `/nas-client-config` | GET, POST | — |
| `/freeradius` | GET | `sync-status` |
| `/coa-events` | GET, POST | — |
| `/sessions` | GET, POST | `disconnect`, `export` |
| `/session-engine` | GET, POST | `nas-config`, `policy`, `policy/[subscriberId]`, `sessions`, `sessions/[id]` |
| `/enterprise-auth` | GET, POST | `[id]`, `[id]/sessions`, `[id]/test-ldap`, `[id]/users` |
| `/pppoe` | GET, POST, PUT, DELETE | — |
| `/hotspot` | GET, POST | `analytics`, `dashboard`, `data-history`, `export`, `revenue`, `users`, `users/[id]`, `users/[id]/history` |
| `/captive-portal` | GET, POST | `[id]`, `ads`, `ads/[id]`, `analytics`, `events`, `mac-whitelist`, `rules`, `rules/[id]`, `schedules`, `schedules/[id]`, `sessions`, `sessions/[id]`, `sessions/disconnect-all`, `subnet-mapping`, `voucher-pools`, `voucher-pools/[id]` |

#### F. Network / Gateway
| Group | Methods (root) | Sub-routes |
|-------|----------------|------------|
| `/devices` | GET, POST | `[id]`, `bulk`, `config-history`, `export`, `import`, `test-connection`, `tree` |
| `/network` | (dir) | `devices`, `health-enhanced`, `health-history`, `predictive`, `status`, `usage-summary` |
| `/system-health` | GET | — |
| `/system-monitor` | GET | — |
| `/system` | (dir) | `alerts-summary`, `health` |
| `/bandwidth` | GET | `compare`, `consumers`, `export`, `interfaces`, `qos`, `thresholds`, `throttle` |
| `/bandwidth-mgmt` | GET, POST, PUT, DELETE | — |
| `/bw-reports` | GET, POST, DELETE | — |
| `/qos-monitor` | GET | — |
| `/qos` | (catch-all `[...slug]`) | — |
| `/multiwan` | GET, POST | `export` |
| `/uptime-monitor` | GET, POST | — |
| `/latency-monitor` | GET | — |
| `/traffic-analytics` | GET | — |
| `/speed-test` | GET, POST | — |
| `/ddos` | GET, POST, PUT, DELETE | — |
| `/firewall` | GET, POST, PUT, DELETE | — |
| `/ips` | GET | `alerts`, `block-rules`, `block-rules/[id]`, `block-rules/unblock`, `nftables`, `nftables/init`, `rules`, `rules/[id]`, `stats`, `threat-scores` |
| `/ndpi` | GET | `apps`, `catalog`, `categories`, `rules`, `rules/[id]`, `stats`, `subscribers` |
| `/dhcp` | GET, POST, PUT, DELETE | — |
| `/dhcpv6` | (dir) | `pools`, `prefix-delegation`, `reservations`, `stats`, `subnets` |
| `/dns` | GET, POST, PUT, DELETE | — |
| `/ipam` | GET, POST | `assign-subscriber`, `assignment-history`, `auto-fill`, `cgnat`, `conflict-check`, `dhcp-sync`, `export`, `import`, `radius-pools`, `snapshots`, `trends` |
| `/ip-mac-history` | GET, POST | — |
| `/interfaces` | GET, POST, PUT, DELETE | — |
| `/routes` | GET, POST, DELETE | — |
| `/dynamic-routing` | GET, POST, DELETE | — |
| `/nat-logs` | GET, DELETE | — |
| `/ftth` | (dir) | `olts`, `olts/[id]`, `olts/[id]/reboot`, `olts/export`, `ports`, `ports/[id]`, `ports/status-history`, `splitters`, `templates` |
| `/mikrotik-manager` | POST | — |
| `/ssh-device-manager` | POST | — |
| `/snmp-manager` | POST | — |
| `/tr069-acs` | GET, POST, DELETE | `service` |
| `/syslog-server` | GET, POST | — |
| `/wifi-offload` | GET, POST | `[id]`, `dashboard`, `events`, `events/stats`, `peers`, `peers/[id]`, `peers/[id]/actions`, `peers/[id]/actions/[action]`, `policies`, `policies/[id]`, `proxy`, `sessions`, `sessions/[id]` |
| `/vpn-server` | GET, POST | — |
| `/diag` | GET, POST, DELETE | `tcpdump`, `tcpdump/captures`, `tcpdump/captures/[id]`, `tcpdump/download/[id]` |

#### G. Inventory & Equipment
| Group | Methods (root) | Sub-routes |
|-------|----------------|------------|
| `/inventory` | GET, POST | `[id]`, `bulk` |
| `/equipment` | GET, POST | `[id]`, `adjust`, `adjustments`, `adjustments/history`, `analytics`, `inspect`, `purchase-orders`, `purchase-orders/[id]`, `purchase-orders/export`, `repair`, `repairs`, `repairs/[id]`, `returns`, `returns/[id]`, `stock-count` |
| `/purchase-orders` | GET, POST | `[id]` |
| `/vendors` | GET, POST | `[id]` |
| `/warehouses` | GET, POST | `[id]`, `summary` |
| `/stock-transfers` | GET, POST | — |

#### H. AI, Voice, WhatsApp
| Group | Methods (root) | Sub-routes |
|-------|----------------|------------|
| `/ai` | (dir) | `advisor`, `churn`, `diagnose`, `diagnosis`, `diagnosis/baselines`, `whatsapp-bot` |
| `/voice` | (dir) | `command`, `speak`, `transcribe` |
| `/whatsapp` | (dir) | `analytics`, `broadcast`, `commands`, `commands/[id]`, `config`, `conversations`, `logs`, `quick-replies`, `quick-replies/[id]`, `schedule`, `templates`, `templates/[id]`, `webhooks` |

#### I. Admin / System / Security
| Group | Methods (root) | Sub-routes |
|-------|----------------|------------|
| `/auth` | (dir) | `login`, `logout`, `me` |
| `/users` | GET, POST | `[id]`, `[id]/activity`, `[id]/impersonate`, `[id]/sessions`, `bulk`, `bulk-import`, `change-password`, `export`, `permissions` |
| `/api-keys` | GET, POST | `[id]` |
| `/backup` | GET, POST | `[id]/download`, `[id]/verify` |
| `/settings` | GET, PUT | `invoice-format`, `isp-profile`, `isp-profile/test-smtp`, `tax` |
| `/smtp-profiles` | GET, POST, PUT, DELETE | — |
| `/modules` | GET, PUT | — |
| `/dashboard` | GET | 17 sub-analytics (area-distribution, churn-risk, collection-performance, collection-target, connection-types, health-score, invoice-aging, payment-analytics, plan-comparison, response-time, retention, stats, subscriber-analytics, subscriber-growth, subscriber-lifecycle, technician-stats, top-subscribers) |
| `/dashboard-widgets` | GET, POST | — |
| `/export` | (dir) | `complaints`, `invoices`, `payments`, `subscribers` |
| `/files` | GET | — |
| `/integrations` | GET, POST | `logs`, `transactions` |
| `/services` | (dir) | `status` |
| `/security` | GET, POST, PUT, DELETE | — |
| `/compliance` | (dir) | `audit-report`, `regulatory`, `sla` |
| `/alerts` | GET, POST | `analytics`, `auto-escalate`, `export`, `history` |
| `/competitors` | GET, POST | `[id]`, `comparison`, `market-share`, `price-history`, `pricing-intelligence`, `win-loss` |
| `/time-access-policies` | GET, POST | — |
| `/grafana-dashboards` | GET, POST | — |
| `/test-toast` | POST | — |

### 5.2 Mini-Services (12 Bun services)

| Service | Port | Runtime | Responsibility & Key endpoints |
|---------|------|---------|--------------------------------|
| **radius-service** | 3001 | Bun + Prisma | RADIUS user/group/session management; config file generation (users-file, clients.conf, sql-counter); accounting import; `/api/users`, `/api/sessions`, `/api/groups`, `/api/accounting`, `/api/import`, `/api/config/*`, `/api/status`, `/api/health` |
| **ips-daemon** | 3030 | Bun + Prisma | Intrusion detection daemon; 5-sec `setInterval` detection cycle for port-scans, malware C2; threat-scoring; auto-block via nftables; `/alerts`, `/alerts/stats`, `/rules`, `/block-rules`, `/threat-scores`, `/top-offenders`, `/nftables/init`, `/ws` |
| **ndpi-service** | 3031 | Bun | nDPI application-awareness; protocol catalog with per-subscriber app usage; `/health`, `/api/apps`, `/api/catalog`, `/api/categories`, `/api/stats`, `/api/subscribers`, `/api/rules` (GET/POST), `/api/seed` |
| **gateway-service** | 3005 | Bun + Prisma | The big one (~5000 LOC): gateway/network control plane — interfaces (vlan/bond/bridge), DHCP subnets/reservations/leases + Kea reload, DNS records/reload/test, gateway init/config, services status, firewall rules/apply/nftables, QoS init/teardown/restore/subnet shaping, RADIUS status; failover/CoA |
| **multiwan-monitor** | 3006 | Bun | Multi-WAN health monitor; pings each WAN link, failover/failback with thresholds, auto-rewrite default gateway; `/health`, `/api/status`, `/api/config`, `/api/control` |
| **syslog-service** | 1514/UDP | Bun | Syslog collector (RFC 3164/5424 UDP listener) — ingests device logs into `SyslogMessage` table |
| **diameter-service** | 3870 | Bun + Express | 3GPP Diameter simulator; Gy (initialize/update/terminate), Gx (push-policy), SWa (authenticate/verify); peer management; session simulation; `/dashboard`, `/policies`, `/sessions`, `/peers`, `/events/stats` |
| **snmp-service** | 3020 | Bun + net-snmp | SNMP v1/v2c/v3 proxy; POST-only RPC API: action=get/getNext/getBulk/walk/getSystemInfo/getInterfaces/getRouteTable/etc. against any host+community/credentials |
| **network-monitor** | 3002 | Bun + Prisma + WebSocket | SNMP-driven polling of network devices, ping/traceroute/DNS/HTTP-check, alerts, predictive analytics; `/ws` live WebSocket; `/api/devices`, `/api/poll`, `/api/snmpget`, `/api/dns-lookup`, `/api/http-check`, `/api/bandwidth`, `/api/alerts` |
| **billing-cron** | 3004 | Bun + Prisma | Scheduled billing automation; cron registry with handlers for invoice generation, overdue check, payment reminders, auto-suspend, monthly usage reset; `/api/jobs`, `/api/generate-invoices`, `/api/check-overdue`, `/api/send-reminders`, `/api/suspend-overdue`, `/api/usage-reset`, `/api/next-run` |
| **whatsapp-bot** | 3003 | Bun + Prisma | WhatsApp Business API integration; inbound webhook + outbound send/broadcast; auto-reply rules engine; message queue + retry; template management; `/webhook` (GET verify + POST), `/api/send`, `/api/broadcast`, `/api/conversations`, `/api/templates`, `/api/queue`, `/api/process-queue`, `/api/auto-reply-rules`, `/api/stats` |
| **session-engine** | 3010 | Bun + WebSocket | Per-subscriber session policy enforcement engine; maintains live WebSocket control channel; CoA/policy push; `/api/auth` (subscriber NAS-style), `/api/logout`, `/api/sessions`, `/api/sessions/bulk-disconnect`, `/api/policy/enforce`, `/api/stats/overview`, `/api/stats/bandwidth`, `/api/events`, `/api/nas/config` (GET/PUT) |

**Shared utilities in `/mini-services/shared/`:** `auth.ts` (requireAuth + CORS headers used by all services), `logger.ts` (structured logger factory).

### 5.3 Backend Services & Libs

#### `src/lib/services/`
| File | Capability |
|------|------------|
| `audit-service.ts` | Centralized audit-log writer (`auditCreate`, `auditBulk`, `auditLogin`, `auditUpdate`); auto-captures userId, IP, UA, endpoint, method, before/after diffs. Used by ~all mutating routes. |
| `email-service.ts` | Nodemailer-based transactional email; pulls SMTP config from DB; sends invoices, payment receipts, dunning, announcements. |
| `sms-service.ts` | Multi-provider SMS (generic API, Twilio, WhatsApp Cloud); DB-driven config; subscriber/technician notifications. |
| `payment-service.ts` | Payment-gateway abstraction (Razorpay/Stripe/PayU-style); HMAC signature verification, order creation, webhook verification, payout reconciliation. |
| `webhook-service.ts` | Outbound webhook dispatcher with HMAC signing, retry/backoff, delivery log; `fireEventAsync(event, payload)` used by subscribers/plans/invoices routes. |
| `backup-crypto.ts` | AES-256-GCM backup encryption with machine-bound key (magic header `CRPTSK01` + 12-byte IV); encrypt/decrypt streams for DB backup files. |

#### `src/lib/`
| File | Capability |
|------|------------|
| `db.ts` | PrismaClient singleton (hot-reload safe). |
| `auth.ts` | `login(email, password)` using bcryptjs; `getUser`, role → permission mapping (`hasPermission`). |
| `session.ts` | HMAC-SHA256 session token create/verify; Edge-runtime compatible; cookie `cryptsk_session`; configurable max-age. |
| `api-auth.ts` | `requireAuth(req)` — cookie + Bearer fallback, active-account check; throws `AuthError` with 401/403. Used by ~88% of routes. |
| `rate-limit.ts` | In-memory sliding-window limiter `rateLimit(key, {maxRequests, windowMs})` → returns success + retry-after; used on login etc. |
| `gateway-proxy.ts` | Resilient fetch wrapper to gateway-service (port 3005); handles ECONNREFUSED, 404, 401, 5xx, timeouts. |
| `radius-sync.ts` | FreeRADIUS table sync — writes Subscriber/Plan data into `radcheck`, `radreply`, `radusergroup`, `radgroupcheck`, `radgroupreply`. |
| `ndpi-proxy.ts` | Resilient proxy to nDPI daemon (port 3031). |
| `ips-proxy.ts` | Resilient proxy to IPS daemon (port 3030). |
| `subscriber-session.ts` | Self-care session wrapper (separate cookie so admin + subscriber sessions don't collide). |
| `voice-commands.ts` | Voice-command registry — maps page routes + keywords for LLM-based voice navigation. |
| `export-utils.ts` | CSV/Excel export helpers — value escaping, response headers, streaming. |
| `nav-config.ts` | Single source of truth for sidebar navigation (desktop + mobile import same array). |
| `page-loaders.ts` | Maps module-registry page labels → lazy `import()` for code-splitting (Turbopack-safe). |
| `modules/registry.ts` | Module/page registry — defines all OSS/BSS + Internet-Gateway modules, categories (core/network/gateway/operations/finance/ai/communication/addon), required vs optional. |
| `api.ts` | Re-exports `apiFetch` from utils (central client-side fetch wrapper). |
| `format-utils.ts` | Shared formatting (bytes → human-readable, currency, dates, etc.). |
| `utils/html-escape.ts` | HTML-escape helpers for safe string interpolation. |
| `os/network-utils.ts` | OS-level network helpers (interface listing, routing table, ARP). |
| `validators/ipv6.ts` | IPv6 address/prefix validation utilities. |

---

## 6. Data Model (204 Prisma models + 90 enums)

**Source:** `/prisma/schema.prisma` (PostgreSQL provider). **204 models + 90 enums.**

### 6.1 Models grouped by domain

**Subscribers & CRM (15):** Subscriber, Area, AreaBudgetLimit, Subnet, Lead, LeadCommunication, ReferralCampaign, ReferralCode, ReferralEnrollment, ReferralSetting, ReferralTracking, LoyaltyMember, LoyaltySetting, PointsHistory, Reward, RewardRedemption

**Billing & Finance (24):** Invoice, InvoiceLineItem, CreditNote, RecurringInvoiceTemplate, Payment, Refund, PaymentPlan, PaymentPlanInstallment, BillingMilestone, UserBillingCycle, SubscriberTopUp, TopUpProduct, SubscriberChargeOverride, Promotion, PromotionPlan, SubscriberAddOn, AddOnService, SubscriberGracePeriod, Expense, TdsEntry, CommissionPayout, AgentReconciliation, AgentFollowUp, CollectionAgent

**Resellers & Agents (4):** Reseller, ResellerCommissionPayout, WinLossAnalysis, Competitor, CompetitorPriceHistory

**Complaints / Support / Field Ops (12):** Complaint, ComplaintComment, CustomerFeedback, Installation, Technician, AttendanceRecord, LeaveRecord, Incident, IncidentUpdate, MaintenanceWindow, KbArticle, KbArticleVersion, KbCategory, Faq

**Plans & Vouchers (4):** Plan, Voucher, VoucherTemplate, ProvisioningTemplate

**RADIUS / AAA (FreeRADIUS-native + app models) (22):** RadiusUser, RadiusGroup, RadiusAttributeDef, UserRadiusAttribute, RadiusSession, RadiusAccountingLog, RadiusPacketMapping, RadiusPacketRule, RadiusProxyRealm, RadiusProxyServer, NasClientConfig, NasConfig, NasSession, CoaEvent, radcheck, radreply, radgroupcheck, radgroupreply, radusergroup, radacct, radpostauth, nas, nasreload, radius_provisioning_log, radius_daily_stats

**Enterprise / SSO (3):** EnterpriseUser, EnterpriseSubscriber, EnterpriseSession, LdapConfig

**Network / Gateway (32):** NetworkDevice, DeviceInterface, DeviceConfigHistory, SystemInterface, Vlan, Subnet, IpAddress, IpAssignmentHistory, IpamSnapshot, CgnatPool, CgnatMapping, IpMacHistory, FirewallRule, DnsRecord, DhcpSubnet, DhcpReservation, DhcpV6Subnet, DhcpV6Pool, DhcpV6PrefixDelegation, DhcpV6Reservation, PppoeProfile, PppoeSession, QosConfig, TcClassMapping, BandwidthPolicy, BandwidthThrottleConfig, BandwidthLog, BwSample, WanLink, WanEvent, FailoverRule, NatLog, UptimeCheck, UptimeTarget, SecurityProfile

**Captive Portal / Hotspot (9):** CaptivePortal, PortalAccessRule, PortalAdZone, PortalEventLog, PortalMacWhitelist, PortalSchedule, PortalSession, PortalVoucherPool, PortalTemplate

**FTTH (3):** OltPort, OltTemplate, Splitter

**WiFi Offload (4):** wifi_offload_peers, wifi_offload_sessions, wifi_offload_policies, wifi_offload_events

**Security / IPS / nDPI (6):** IpsAlert, IpsBlockRule, IpsDetectionRule, NdpiApp, NdpiAppRule, NdpiAppUsage, DdosProtection

**Equipment / Inventory (13):** Equipment, EquipmentInspection, EquipmentRepair, EquipmentReturn, RepairRecord, StockAdjustment, StockTransfer, Warehouse, Vendor, PurchaseOrder, PurchaseOrderItem, IntegrationConfig, IntegrationLog, IntegrationTransaction

**AI / Diagnostics (5):** DiagnosisBaseline, DiagnosticCapture, ChurnTracking, ChurnCommunication, RecoveryEscalation, RecoverySla

**Due Recovery (2):** GeneratedLegalNotice, Dispute

**Admin / Users (10):** User, UserSession, UserActionHistory, UserWidgetConfig, ApiKey, AuditLog, BackupRecord, IspSettings, SmtpProfile, Webhook, WebhookDelivery

**Notifications (3):** Notification, NotificationRule, Announcement, AnnouncementDismissal

**Alerts / Monitoring (5):** AlertRule, AlertComment, AlertSuppression, NetworkAlert, DashboardWidget

**WhatsApp (3):** WhatsAppTemplate, BotCommand, QuickReply, ScheduledMessage

**Syslog (2):** SyslogConfig, SyslogMessage

**Sessions / Usage (5):** SessionEvent, DataUsage, UsageLog, SubscriberTimeAccess, TimeAccessPolicy

**Misc (1):** GatewayConfig

### 6.2 PostgreSQL Production Schema (SOURCE OF TRUTH)

`/pgsql-production/complete-database.sql` defines (idempotent — `CREATE TABLE IF NOT EXISTS` / `CREATE OR REPLACE`):
- **FreeRADIUS standard tables:** radcheck, radreply, radgroupcheck, radgroupreply, radusergroup, radpostauth, radacct, nas
- **Cryptsk extended RADIUS columns:** subscriber_id, plan_id, area_id on radacct
- **Helper tables:** radius_provisioning_log, radius_daily_stats
- **5 Reporting views:**
  - `v_active_sessions` — live RADIUS sessions joined to Subscriber/Plan/Area/NAS
  - `v_radius_user_status` — per-user provisioning status (has_password, has_group, etc.)
  - `v_auth_summary_daily` — daily auth success/failure aggregates
  - `v_subscriber_data_usage` — per-subscriber total/monthly usage in GB
  - `v_nas_status` — per-NAS online sessions / total users
- **8 Database functions:**
  - `fn_subscriber_total_usage_gb(p_subscriber_id text)`
  - `fn_subscriber_active_sessions(p_subscriber_id text)`
  - `fn_subscriber_monthly_usage_gb(p_subscriber_id text)`
  - `fn_total_active_sessions()`
  - `fn_auth_success_rate(p_hours integer DEFAULT 24)`
  - `fn_radius_group_member_count(p_group_name text)`
  - `fn_disconnect_subscriber(p_username text)`
  - `fn_refresh_daily_stats()`
  - `fn_seed_group_reply(...)` — seeds RADIUS group reply attributes for the 8 default plans

### 6.3 Enums (90)

`AddOnChargeType, AdjustmentReason, AllocationStrategy, AppRuleAction, AppRuleScope, AreaStatus, AuthMethod, BatchJobStatus, BillingCycleType, BwSampleSource, CaptureStatus, ChargeOverrideStatus, CoaStatus, CoaType, CommissionMethod, ComplaintPriority, ComplaintStatus, ComplaintType, ConnectionType, DdosAction, DdosProtectionType, DeviceStatus, DeviceType, DeviceVendor, DhcpLeaseState, DiagnosticTool, DiscountType, DnsRecordType, EqRepairStatus, EqRepairType, EquipmentCategory, EquipmentCondition, EquipmentStatus, FirewallAction, FirewallRuleStatus, GracePeriodStatus, GracePeriodType, IfaceRole, IfaceType, InstallationStatus, InterfaceStatus, InterfaceType, InvoiceStatus, IpStackType, IpType, IpsAlertStatus, IpsBlockAction, IpsBlockDuration, IpsEventType, IpsSeverity, LateFeeType, LeadSource, LeadStatus, MonitorProtocol, NasType, NatMode, NotificationCategory, NotificationStatus, NotificationType, PacketAction, PacketType, PaymentMode, PaymentStatus, PlanCategory, PlanStatus, PortalLoginMethod, PortalSessionStatus, PortalTemplate, PppoeAuthType, PppoeSessionStatus, PromoStatus, PromoType, ProxyServerType, PurchaseOrderStatus, RadiusAttrDataType, RadiusAttrType, RecurringSchedule, RepairStatus, ResellerStatus, ReturnCondition, ReturnStatus, SecurityFeature, SessionEventType, SessionStatus, SpeedUnit, SubscriberAddOnStatus, SubscriberStatus, SyslogProtocol, TdsEntryStatus, TdsEntryType, TimeAccessAction, TopUpStatus, TopUpType, UserActionType, UserRole, UserStatus, VoucherStatus, WarehouseStatus, WidgetCategory`

---

## 7. Architecture & Integrations

### 7.1 Architecture Pattern

- **Frontend:** Next.js 16 App Router, single-page app with client-side SPA routing (`src/app/page.tsx` lazy-loads page components via `src/lib/page-loaders.ts` based on the active route from `useAppStore`).
- **Backend:** Next.js API Routes (`/api/*`) — 501 route handlers across 134 groups. ~88% use `requireAuth(req)`.
- **Database:** PostgreSQL 18.4 (bundled, compiled from source at `runtime-applications/pgsql/`). Prisma 6.19 ORM. NOT SQLite.
- **AAA:** FreeRADIUS 3.2.7 (compiled from source at `runtime-applications/freeradius/`) — backend only, not exposed in GUI. Subscriber = RADIUS user. Plan = RADIUS group.
- **Mini-services:** 12 Bun services (each own port + own PrismaClient against same DB). Started via PM2 (`ecosystem.config.cjs`).
- **Real-time:** WebSocket endpoints on session-engine (3010), network-monitor (3002), ips-daemon (`/ws`).
- **Cron:** billing-cron (3004) — invoice generation, overdue check, reminders, auto-suspend, monthly usage reset (driven by `setInterval` + cron registry).

### 7.2 Auth Flow

1. Login → `POST /api/auth/login` with email+password → `auth.ts` verifies bcrypt → `session.ts` creates HMAC-SHA256 token → sets `cryptsk_session` cookie.
2. Every protected route calls `requireAuth(req)` from `api-auth.ts` → verifies cookie (or Bearer token) + checks account active → returns user or throws 401/403.
3. Roles: SUPER_ADMIN · ADMIN · OPERATOR · AGENT · TECHNICIAN → `hasPermission(role, action)` mapping.
4. **Subscriber self-care** uses a SEPARATE cookie via `subscriber-session.ts` so admin + subscriber sessions don't collide.
5. Rate limiting on login via `rate-limit.ts` (in-memory sliding window).

### 7.3 RADIUS Sync Flow

`radius-sync.ts` writes Subscriber/Plan data into native FreeRADIUS tables (`radcheck`, `radreply`, `radusergroup`, `radgroupcheck`, `radgroupreply`). `/api/freeradius/sync-status` reports drift between app DB and RADIUS tables (synced / minor_drift / drifted / error).

### 7.4 Audit & Webhooks

- **Audit:** Every mutating route calls `auditCreate`/`auditUpdate`/`auditBulk` from `audit-service.ts` — captures userId, IP, UA, endpoint, method, before/after diffs.
- **Webhooks:** `fireEventAsync(event, payload)` from `webhook-service.ts` — outbound webhook dispatcher with HMAC signing, retry/backoff, delivery log. Used in subscribers/plans/invoices/payments routes.

### 7.5 External Integrations

- **Payment gateways:** Razorpay, Stripe, PayU (`payment-service.ts` — HMAC signature verification, order creation, webhook verification, payout reconciliation).
- **SMS:** MSG91, Twilio, WhatsApp Cloud (`sms-service.ts`).
- **Email:** Nodemailer SMTP (`email-service.ts`, `smtp-profiles`).
- **WhatsApp Business API:** `whatsapp-bot` mini-service (templates, commands, quick-replies, broadcasts, auto-reply rules, message queue + retry).
- **Network device vendors:** MikroTik (`ros-client`), SSH2 (any device), SNMP v1/v2c/v3 (`net-snmp`), TR-069/GenieACS.
- **Grafana:** embed/link external Grafana dashboards.
- **AI:** z-ai-web-dev-sdk (LLM for advisor/diagnosis/churn, VLM for image understanding).
- **Maps:** Leaflet/React-Leaflet (areas, coverage).
- **Backup:** AES-256-GCM encrypted backups (`backup-crypto.ts`, machine-bound key).

### 7.6 PM2 Process Management

`ecosystem.config.cjs` defines 13 apps:
1. `cryptsk-isp` — Next.js (port 3000)
2. `cryptsk-radius-service` (3001)
3. `cryptsk-ips-daemon` (3030)
4. `cryptsk-ndpi-service` (3031)
5. `cryptsk-gateway-service` (3005)
6. `cryptsk-multiwan-monitor` (3006)
7. `cryptsk-syslog-service` (1514/UDP)
8. `cryptsk-diameter-service` (3870)
9. `cryptsk-snmp-service` (3020)
10. `cryptsk-network-monitor` (3002)
11. `cryptsk-billing-cron` (3004)
12. `cryptsk-whatsapp-bot` (3003)
13. `cryptsk-session-engine` (3010)

PostgreSQL starts manually via `pg_ctl` (NOT PM2). Commands: `npx pm2 start ecosystem.config.cjs --only <name>` · `npx pm2 list` · `npx pm2 logs <name>` · `npx pm2 restart <name>` · `npx pm2 save`.

### 7.7 Gateway (Caddy)

Only ONE port exposed externally. For API requests to different ports, use `XTransformPort` query param:
- API: `fetch('/api/subscribers')` — goes to port 3000 (Next.js)
- NEVER write absolute URLs like `http://localhost:PORT`
- WebSocket: `io('/?XTransformPort=3003')`

---

## 8. Rebuild Cheat-Sheet

### 8.1 To recreate the EXACT look & feel

1. **Stack:** Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui (new-york, neutral base, cssVariables, lucide).
2. **Fonts:** Geist + Geist_Mono via next/font/google.
3. **Theme tokens:** Paste the 26 CSS variables from §2.1 (light `:root`) + §2.2 (dark `.dark`). Set `--radius: 0.625rem`.
4. **Signature:** Red `#DC2626` primary + Dark Navy `#0F172A` sidebar (sidebar stays dark in both themes).
5. **Sidebar:** 16rem expanded / 3rem icon-rail / 18rem mobile sheet. Active = 3px red left border + `bg-accent` tint + red icon + `font-semibold`.
6. **Header:** sticky `h-14`, `bg-background/80 backdrop-blur-md`, `border-b border-border/50`.
7. **Footer:** `h-10`, `mt-auto`, `bg-background/60 backdrop-blur-sm`.
8. **Cards:** `rounded-xl` (14px), `border`, `shadow-sm`, `py-6 px-6`, `flex flex-col gap-6`. Apply `.card-hover-pollish`.
9. **Dark mode:** next-themes (`attribute="class"`, `defaultTheme="light"`, `enableSystem`, `disableTransitionOnChange`). Add FOUC guard.
10. **NProgress:** 3px red top bar with glow, no spinner, triggers on route change + query fetch.
11. **Charts:** recharts, use `--chart-1`..`--chart-5`, primary stroke `#DC2626` light / `#EF4444` dark.
12. **Animations:** CSS-only keyframes from §2.13 (card-enter, pulse-dot, badge-pulse, shimmer, count-up, etc.). Global `* { transition: background-color 0.2s, border-color 0.2s, color 0.15s; }`.
13. **Login:** dark navy bg, `.login-glass-card`, `.login-animated-border`, `.login-logo-glow`, `.login-float-up` particles, `.login-scanlines`.

### 8.2 To recreate the DASHBOARD (user's favorite)

1. Build `<WidgetCard title icon gradient refreshHandler>` primitive (§3.3 universal pattern).
2. Build SVG primitives: `CircularGauge`, `HealthGauge`, `ComplianceRing`, `RetentionRing`, `Sparkline`, `HorizontalBar`, `StackedBar`, `DonutChart`.
3. Standardize `formatINR` + `formatCompactINR` (₹K/₹L/₹Cr) + `formatRelativeTime`.
4. Auto-refresh via `setInterval` in `useEffect` with `isRefetching` state for spin icon. Cadences: 15s/30s/45s/60s/120s (see §3.4).
5. Every widget ~150–500 lines, self-contained, fetches its own endpoint, handles loading/error/empty with skeleton + retry.
6. Page layout: vertical stack `space-y-6`, then responsive `grid grid-cols-1 lg:grid-cols-2 gap-6` for widget pairs, `grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4` for top stat cards.
7. Add the fixed `DashboardStatusBar` at bottom (z-50, `rgba(15,23,42,0.95)` + blur, 1px red gradient top-border).
8. Rebuild all 40 widgets per §3.3 catalog — each with its exact metrics, viz type, colors, API.

### 8.3 To recreate the BACKEND

1. **DB:** PostgreSQL + Prisma. Recreate 204 models + 90 enums (§6).
2. **Auth:** HMAC-SHA256 session tokens, bcryptjs password hashing, cookie `cryptsk_session` + Bearer fallback, separate subscriber self-care cookie.
3. **API:** 134 endpoint groups (§5.1). ~88% require auth. Every mutating route writes audit log.
4. **Mini-services:** 12 Bun services (§5.2). gateway-service is the big control plane (~5000 LOC).
5. **RADIUS:** FreeRADIUS 3.2.7 backend. `radius-sync.ts` syncs Subscriber/Plan → radcheck/radreply/radusergroup/radgroupcheck/radgroupreply.
6. **Real-time:** WebSocket on session-engine (3010), network-monitor (3002), ips-daemon (`/ws`).
7. **Cron:** billing-cron (3004) — invoice generation, overdue check, reminders, auto-suspend, monthly usage reset.
8. **External:** Razorpay/Stripe/PayU payments, MSG91/Twilio SMS, Nodemailer email, WhatsApp Business, MikroTik/SSH/SNMP device mgmt, TR-069 GenieACS, Grafana embed, z-ai-web-dev-sdk AI.

### 8.4 Seed Data (to verify the rebuild)

Run `DATABASE_URL="postgresql://z:Cryptsk2026@127.0.0.1:5432/ispplatform" npx tsx prisma/seed.ts`:
- 1 admin (admin@cryptsk.com / Admin@2026)
- 1 ISP settings (Cryptsk Networks Pvt Ltd)
- 6 areas (Salt Lake, New Town, Lake Town, Dum Dum, Barasat, Howrah)
- 8 plans (5 FTTH, 2 Wireless, 1 Cable) with RADIUS groups
- 15 demo subscribers with RADIUS provisioning (11 active, 1 suspended, 1 trial)
- 12 RADIUS check entries + 12 user-group mappings
- 1 sample NAS device (MikroTik-CORE 192.168.1.1)
- 5 sample invoices

---

## Appendix: File Locations (for reference during rebuild)

```
my-project/
├── src/
│   ├── app/
│   │   ├── api/                    # 501 route.ts across 134 groups
│   │   ├── page.tsx                # SPA entry (lazy-loads pages)
│   │   ├── layout.tsx              # Root layout (Geist fonts, ThemeProvider)
│   │   ├── globals.css             # 14K lines — theme tokens + custom utilities
│   │   └── error.tsx
│   ├── components/
│   │   ├── layout/                 # app-shell, sidebar, header, footer, mobile-sidebar
│   │   ├── pages/                  # 96 page components (+ tabs/ + selfcare/)
│   │   ├── dashboard/              # 40 widget components + dashboard-status-bar
│   │   ├── ui/                     # 50+ shadcn/ui components
│   │   ├── providers.tsx           # QueryClient + ThemeProvider
│   │   ├── client-app.tsx          # Auth gate
│   │   ├── client-layout.tsx       # Authenticated layout
│   │   ├── command-palette.tsx     # ⌘K
│   │   ├── nprogress-loader.tsx    # red 3px top bar
│   │   ├── dark-mode-toggle.tsx
│   │   ├── voice-assistant/        # floating voice button
│   │   └── ... (notification-panel, global-search, etc.)
│   ├── lib/
│   │   ├── db.ts                   # PrismaClient singleton
│   │   ├── auth.ts                 # login + hasPermission
│   │   ├── session.ts             # HMAC-SHA256 tokens
│   │   ├── api-auth.ts            # requireAuth
│   │   ├── rate-limit.ts
│   │   ├── radius-sync.ts         # FreeRADIUS table sync
│   │   ├── gateway-proxy.ts       # port 3005 proxy
│   │   ├── ndpi-proxy.ts          # port 3031 proxy
│   │   ├── ips-proxy.ts           # port 3030 proxy
│   │   ├── nav-config.ts          # ★ single source of truth for nav (11 sections)
│   │   ├── page-loaders.ts        # lazy import() per route
│   │   ├── modules/registry.ts    # module feature flags
│   │   ├── services/              # audit, email, sms, payment, webhook, backup-crypto
│   │   └── ...
│   ├── store/                      # Zustand: auth-store, app-store, module-store, subscriber-auth-store
│   ├── hooks/                      # use-toast, use-mobile, use-badge-counts
│   └── types/index.ts
├── prisma/
│   ├── schema.prisma              # 204 models + 90 enums (PostgreSQL)
│   └── seed.ts                    # demo data
├── pgsql-production/
│   └── complete-database.sql      # RADIUS tables + 5 views + 8 functions (SOURCE OF TRUTH)
├── runtime-applications/
│   ├── pgsql/                     # PostgreSQL 18.4 binaries + data
│   └── freeradius/                # FreeRADIUS 3.2.7 binaries + config
├── mini-services/                 # 12 Bun services (radius, ips, ndpi, gateway, etc.)
├── configs/templates/             # FreeRADIUS, accel-ppp, dnsmasq, kea config templates
├── scripts/                       # TC shaping, network ops, deploy
├── docs/                          # architecture docs
├── ecosystem.config.cjs           # PM2 config (13 apps)
├── Caddyfile                      # gateway (:81 with XTransformPort)
└── .env                           # DATABASE_URL=postgresql://z:Cryptsk2026@localhost:5432/ispplatform
```

---

**End of Final Feature Sheet v7.0.** This document preserves every feature of the running CRYPTSKINTELLIGENT ISP platform. Use it as the single source of truth when rebuilding the new product — especially §2 (color combination) and §3 (dashboard look & feel), which the user explicitly loves.
