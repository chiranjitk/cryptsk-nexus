# CRYPTSK NEXUS — UI/UX IMPLEMENTATION SPECIFICATION
## Product visual system, information architecture, dashboard, component standards, accessibility, responsive behavior, and operational UX

**Status:** LOCKED UI/UX IMPLEMENTATION BASELINE
**Authority:** The visual identity and dashboard requirements are functionally preserved from `04_PRODUCT_FEATURE_CATALOGUE.md`.

---

# 1. PURPOSE

This document converts the preserved visual identity into a repeatable design system that can scale across 113 catalogued pages and approved modules without visual drift. Future modules may be added only through the locked-pack change-control process.

The UI is not a cosmetic layer. It is the operational control surface for a technically complex ISP/gateway product.

The design MUST optimize for:

- rapid NOC/operations scanning;
- safe network changes;
- billing accuracy;
- clear subscriber lifecycle state;
- high information density without clutter;
- consistent interaction patterns;
- responsive behavior;
- accessibility;
- dark/light theme consistency;
- traceability from a UI action to an API command and resulting state.

---

# 2. VISUAL IDENTITY — NON-NEGOTIABLE

## 2.1 Primary brand

**CRYPTSK Red:** `#DC2626`

Use for:

- primary actions;
- active navigation;
- focus states;
- important links;
- selection;
- primary chart stroke;
- progress accents;
- top loading bar;
- critical attention indicators where appropriate.

## 2.2 Sidebar

**Dark Navy:** `#0F172A` in light mode and `#020617` in dark mode.

The sidebar remains dark in both themes and acts as the permanent visual anchor.

## 2.3 Light theme

- background: white;
- foreground: slate family;
- card: white;
- border: slate-200;
- primary: red;
- ring/focus: red;
- muted: neutral/slate.

## 2.4 Dark theme

- background: `#0F172A`;
- foreground: slate-100;
- cards: slate-800 family;
- borders: slate-700;
- primary: `#EF4444`;
- sidebar: `#020617`.

## 2.5 Semantic colors

Secondary chart/status semantics remain available:

- success/healthy: green/emerald family;
- warning: amber/orange family;
- information: blue family;
- diagnostic/secondary: violet/purple family;
- destructive: red/rose family.

Semantic colors must not replace the brand identity.

---

# 3. TYPOGRAPHY

Use Geist/Geist Mono or an equivalent approved product font stack.

Typography rules:

- clear numeric hierarchy;
- strong headings;
- compact secondary labels;
- monospace for addresses, IDs, IP/MAC, log fragments, and technical values where helpful;
- avoid excessive font-weight variation.

Recommended hierarchy:

```text
Display / page title
Section title
Card title
KPI number
Body
Supporting text
Metadata / timestamp
Technical value
```

---

# 4. APPLICATION SHELL

Canonical shell:

```text
┌─────────────────────────────────────────────────────────────┐
│ Sticky Header                                               │
├───────────────┬─────────────────────────────────────────────┤
│ Dark Sidebar  │                                               │
│               │ Main Content                                  │
│               │                                               │
│               │                                               │
│               │                                               │
├───────────────┴─────────────────────────────────────────────┤
│ Footer / Status                                            │
└─────────────────────────────────────────────────────────────┘
```

Sidebar widths:

- expanded: approximately 16rem;
- icon rail: approximately 3rem;
- mobile: approximately 18rem overlay.

Header:

- `h-14` target;
- sticky;
- translucent/background blur;
- subtle bottom border.

---

# 5. SIDEBAR SPECIFICATION

Sidebar behavior:

- permanent dark navy anchor;
- red active indicator;
- active item: 3px red left border + red-tinted background + red icon + semibold text;
- logical sections;
- optional badges for live counts;
- module/license-aware visibility;
- permission-aware visibility;
- collapsed state preserves icon identity;
- keyboard navigation;
- mobile drawer.

Do not create hidden navigation items that are technically enabled but inaccessible because of arbitrary UI decisions.

Navigation derives from the canonical feature registry plus RBAC.

---

# 6. HEADER SPECIFICATION

Preserved product header capabilities include:

- current time/date;
- system health indicator;
- online subscriber count;
- RADIUS synchronization/status;
- global search / command palette;
- export entry point;
- notifications;
- sound/alert controls where configured;
- dark mode toggle;
- user menu.

Search should support:

- navigation;
- subscribers;
- devices;
- sessions;
- invoices;
- commands where permitted.

Keyboard shortcut target:

```text
⌘/Ctrl + K → command palette
⌘/Ctrl + B → sidebar toggle
```

---

# 7. PAGE LAYOUT STANDARD

Every page must follow a reusable layout system.

Recommended structure:

```text
PageShell
 ├─ PageHeader
 │   ├─ Breadcrumb / context
 │   ├─ Title / description
 │   └─ Actions
 ├─ Summary / KPI area (optional)
 ├─ Main content
 └─ Supporting panels / tabs
```

Default page rhythm:

- vertical `space-y-6` style rhythm;
- responsive grids;
- consistent card padding;
- no arbitrary margins copied page-to-page.

---

# 8. CARD SYSTEM

Cards are the fundamental grouping primitive.

Target:

- rounded-xl (~14px);
- thin border;
- subtle shadow;
- `py-6 px-6` style baseline;
- clear header/content separation;
- restrained hover polish.

Card variants:

- standard;
- KPI/stat;
- live status;
- warning;
- critical;
- chart;
- form;
- dense operational.

Do not use decorative gradients on every card. Reserve gradients for intentional identity moments.

---

# 9. DATA TABLE STANDARD

Tables are the primary operational UI for subscribers, sessions, invoices, devices, complaints, inventory, and logs.

Every large table should support the applicable subset of:

- pagination;
- search;
- filter;
- sort;
- column visibility;
- row selection;
- bulk action;
- export;
- density control;
- keyboard navigation;
- loading skeleton;
- empty state;
- error/retry.

Operational tables must visually separate:

- identity;
- status;
- key KPI;
- action column.

Never render millions of rows in the browser.

---

# 10. FORM STANDARD

Forms use a consistent schema-driven pattern:

```text
Field label
Description/helper
Control
Validation message
```

Rules:

- inline validation where useful;
- server-side validation always;
- clear required indicators;
- preserve entered data after recoverable error;
- destructive confirmation for high-impact actions;
- unsaved-change detection on complex forms;
- loading state while submitting;
- disabled state during duplicate-submit risk.

---

# 11. STATUS / STATE LANGUAGE

Standard state vocabulary:

```text
ACTIVE
INACTIVE
PENDING
PROVISIONING
DEGRADED
WARNING
ERROR
SUSPENDED
EXPIRED
TERMINATED
UNKNOWN
```

State labels must have stable semantics across modules.

Do not use one module's "green" to mean ACTIVE and another's "green" to mean merely ENABLED.

---

# 12. DESTRUCTIVE ACTIONS

High-impact operations include:

- disconnect session;
- suspend subscriber;
- terminate service;
- delete network rule;
- refund payment;
- purge data;
- remove device;
- reset configuration;
- disable security policy.

UI MUST show:

- action name;
- affected object;
- consequence;
- confirmation where appropriate;
- resulting operation/status.

For asynchronous actions, show `Accepted`, not falsely `Completed`.

---

# 13. DRAWER / DIALOG / DETAIL PATTERN

Use:

- dialogs for focused short actions;
- drawers for contextual detail;
- full pages for complex workflows;
- nested tabs only when related tasks form one clear entity boundary.

Example session experience:

```text
Session Table
   ↓ click
Session Detail Drawer
   ├─ Identity
   ├─ Access
   ├─ Policy
   ├─ Usage
   ├─ Accounting
   ├─ Events
   ├─ Dataplane status
   └─ Actions
```

---

# 14. DASHBOARD — PRESERVED PRODUCT SIGNATURE

The dashboard contains **40 widgets plus a fixed status bar**.

It is a first-class product surface, not a generic admin template.

## 14.1 Header

Preserved behavior:

- personalized greeting;
- current date/time;
- date-range selector: 7d / 30d / 90d / this_month / last_month;
- Download Report;
- Refresh;
- urgent notification popover;
- Live indicator.

## 14.2 Quick actions

Preserved examples:

- Generate Invoices;
- Add Subscriber;
- Raise Complaint;
- Collect Payment.

The final permissions determine action availability.

---

# 15. DASHBOARD WIDGET CATALOGUE

## Revenue / Finance

1. Revenue Overview
2. Revenue Forecast
3. Revenue by Payment Mode
4. Collection Performance
5. Monthly Collection Target
6. Invoice Aging
7. Payment Analytics
8. Overdue Payments
9. Top Revenue Subscribers
10. Recent Payments
11. Plan Comparison
12. Plan Performance
13. Smart Plan Recommendations

## Subscribers / Churn

14. Subscriber Growth
15. Subscriber Analytics
16. Subscriber Lifecycle
17. Retention
18. Churn Risk
19. Churn Prediction
20. Expiring Subscriptions
21. Recent Sign-ups
22. Top Revenue Areas
23. Area Distribution
24. Connection Types
25. SLA Compliance

## Network / Operations

26. Network Status
27. AI Network Health
28. Bandwidth Trends
29. ISP Health Score
30. Complaints Analytics
31. Technician Performance
32. Ticket Response Time
33. Live Activity Feed
34. System Alerts
35. Quick Actions

## System / Infrastructure

36. System Overview
37. System Health
38. System Performance
39. RADIUS Sync
40. Dashboard Status Bar

The backend/API source of each widget must be explicit in the widget registry. No widget may silently query an arbitrary page API.

---

# 16. DASHBOARD VISUAL DNA

Preserve:

- red primary;
- semantic green/teal/amber/orange/rose/purple;
- chart token variables;
- glass-like tooltips;
- compact status dots;
- progress/ring primitives;
- live badges;
- skeletons matching final geometry;
- staggered entrance animation;
- responsive grids;
- fixed bottom status bar with dark blurred backdrop and red top gradient.

---

# 17. DASHBOARD DATA FRESHNESS

The feature sheet specifies different refresh cadences; preserve the intent but make them configuration-driven rather than hard-coded in 40 independent timers.

Target classes:

| Data class | Example cadence |
|---|---:|
| Live activity | 15s |
| Network/status | 30–60s |
| Alerts | ~45–60s |
| Finance/retention analytics | ~120s |
| Manual critical refresh | always available |

A shared query/cache layer should avoid 40 unrelated duplicate HTTP requests for identical source data.

---

# 18. LOADING / EMPTY / ERROR CONTRACT

Every data surface has three mandatory non-success states.

## Loading

Use skeleton geometry matching the final shape.

## Empty

Explain:

- what is empty;
- why it may be empty;
- the next action.

## Error

Show:

- short human explanation;
- retry;
- correlation/request ID when useful;
- technical detail only behind an expandable diagnostics surface.

---

# 19. ANIMATION

Preserved microinteraction language includes:

- NProgress 3px red top bar;
- page entrance;
- live dot;
- badge pulse;
- skeleton shimmer;
- dialog entrance;
- status ring;
- subtle button press/shine.

Animation MUST respect reduced-motion preferences.

Animation never communicates a state that has not actually occurred.

---

# 20. RESPONSIVE DESIGN

Breakpoints are not just screen-size adjustments; they are information-priority rules.

Desktop:

- sidebar + dense operational tables;
- multi-column dashboard.

Tablet:

- collapsed rail;
- reduced secondary metadata;
- fewer simultaneous chart panels.

Mobile:

- drawer navigation;
- stacked cards;
- priority fields first;
- action overflow;
- bottom-sheet/drawer details.

Critical operational information must remain visible without horizontal scrolling where reasonably possible.

---

# 21. ACCESSIBILITY

Minimum requirements:

- keyboard navigable interactive controls;
- visible focus;
- semantic labels;
- sufficient contrast;
- status not communicated by color alone;
- accessible names for icon-only buttons;
- proper dialog focus management;
- screen-reader readable table headers;
- reduced-motion support;
- error messages connected to fields.

Accessibility applies to dark mode and dense NOC screens equally.

---

# 22. DARK MODE

The system must not simply invert colors.

Maintain deliberate light/dark token pairs.

Sidebar stays dark.

Charts require dark-mode token mapping with consistent semantic meaning.

Focus rings and critical statuses must remain visible against both themes.

Prevent flash-of-unstyled/incorrect-theme behavior during initial load.

---

# 23. MAP / GEO UI

Use maps only where geographic meaning adds value:

- areas;
- subscribers/sites;
- device locations;
- coverage;
- technician field operations;
- network topology context.

Avoid map widgets for purely tabular network state.

---

# 24. LOG / TECHNICAL DATA UX

Technical panels should support:

- monospace values;
- copy button;
- timestamp;
- filtering;
- expand/collapse;
- severity;
- correlation ID;
- structured fields before raw text.

Raw logs are a diagnostic surface, not the primary user experience.

---

# 25. NOC / OPERATIONS SAFETY PATTERN

For critical gateway changes, UI must show:

```text
What will change?
What is affected?
What is the expected impact?
Which policy version?
What is the current state?
What happens on failure?
```

Where supported:

- preview/diff;
- dry-run validation;
- staged apply;
- rollback/reconciliation status.

---

# 26. SELF-CARE UX

Subscriber self-care is a separate experience, not a permission-filtered admin page.

Primary tasks:

- service status;
- usage;
- plan;
- payment;
- invoices;
- complaints;
- profile;
- speed test;
- support.

The design language may reuse the brand system while reducing operational complexity.

---

# 27. ERROR RECOVERY UX

When a command is accepted but processing continues:

```text
Accepted
→ In progress
→ Completed
```

If failed:

```text
Failed
→ Error reason
→ Retry / rollback / contact action
```

The UI MUST not optimistic-render a gateway or billing state as final when only the request was accepted.

---

# 28. UX TELEMETRY

Track interaction telemetry only where useful and privacy-appropriate:

- page load performance;
- command latency;
- failed actions;
- repeated retry behavior;
- search usage;
- workflow completion;
- accessibility issues.

Never record secrets or sensitive field values in analytics.

---

# 29. COMPONENT ARCHITECTURE

Create a reusable design system layer.

Core primitives:

```text
AppShell
Sidebar
Header
Footer
PageHeader
Card
StatCard
DataTable
FilterBar
FormSection
StatusBadge
StatusDot
EmptyState
ErrorState
LoadingSkeleton
ConfirmDialog
CommandPalette
Drawer
Tabs
Timeline
MetricBar
ProgressRing
Sparkline
CustomTooltip
ChartContainer
```

Dashboard primitives:

```text
WidgetCard
WidgetHeader
WidgetRefreshButton
HealthGauge
CircularProgress
HorizontalBar
MiniBar
DonutChart
StackedBar
LiveActivityItem
DashboardStatusBar
```

---

# 30. FEATURE-DRIVEN NAVIGATION

Navigation should be generated from feature metadata plus permissions/module state.

Do not hand-maintain 100+ unrelated menu conditionals.

Each feature can define:

- label;
- icon;
- route;
- section;
- permission;
- feature flag/license;
- deployment modes;
- badge source;
- ordering;
- parent.

---

# 31. UI/API TRACEABILITY

Each page must declare:

```text
page_id
feature_id
required_permissions
queries
commands
realtime sources if any
loading states
error states
empty states
audit-sensitive actions
```

This makes the AI build agent and QA system able to test the UI systematically.

---

# 32. PERFORMANCE BUDGETS

The UI must avoid:

- fetching all subscribers to populate a dropdown;
- downloading full session history for a KPI;
- rendering thousands of DOM rows;
- polling every widget independently;
- client-side joining of huge datasets;
- blocking the initial shell on noncritical analytics.

Use pagination, server-side filtering, deferred loading, query caching, and virtualization where required.

---

# 33. SECURITY UX

The UI must clearly distinguish:

- authenticated;
- authorized;
- enabled;
- provisioned;
- active;
- healthy.

These are different states.

Permission-denied should not look like a system failure.

Authentication expiry should offer safe reauthentication without losing unsaved form data when feasible.

---

# 34. ACCEPTANCE CHECKLIST

A page is UI-complete when:

- it follows the design tokens;
- it uses standard shell/components;
- navigation is feature-registry driven;
- API states are visible;
- loading/empty/error exist;
- permissions are enforced server-side;
- high-impact actions are explicit;
- mobile behavior is defined;
- dark mode works;
- reduced motion works;
- accessibility checks pass;
- telemetry does not leak sensitive data;
- the page maps to a feature ID and API contract.

---

# 35. FINAL UI PRINCIPLE

```text
Dense enough for NOC work.
Clear enough for business operations.
Safe enough for gateway control.
Consistent enough for a large platform.
Distinctive enough to remain unmistakably Cryptsk.
```

The dashboard and visual language are part of the product identity and must not be replaced with a generic admin template.


# 36. FINAL MENU AUTHORITY

The canonical sidebar and submenu structure is defined by `11_FINAL_MENU_NAVIGATION_SPECIFICATION.md`.

The UI implementation MUST NOT reconstruct navigation from the legacy 113-page inventory alone. The implementation must use the final menu specification plus the Feature Registry for:

- module/licence visibility;
- deployment-mode visibility;
- RBAC visibility;
- vertical capability visibility;
- advanced/add-on visibility.

Important examples:

- Areas / POPs / Zones / LCOs are visible only when Organization & Scope is enabled and the selected vertical/profile uses those concepts.
- NAT Logs are presented as NAT/translation logging, not as a generic legacy "Net Kapture" menu.
- Web Surfing Logger is presented as Web Browsing / HTTP Logs.
- Multi-WAN and Gateway Management represent the gateway/multi-gateway capability; do not create a duplicate legacy "Multiple Gateways" menu.
- Cache QoS must not be added solely for 24online naming parity.
