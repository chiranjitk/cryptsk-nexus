# CRYPTSK NEXUS — FINAL MENU & NAVIGATION SPECIFICATION
## Canonical Enterprise Information Architecture — v4.0

**Status:** LOCKED FINAL MENU DESIGN BASELINE — v4.0  
**Purpose:** Define the canonical product menu, submenu hierarchy, business purpose, commercial structure, policy-engine structure, deployment applicability, and Base vs Add-on boundaries.  
**Authority:** This document is the canonical navigation specification. The Feature Catalogue remains the authority for the complete functional inventory; this document determines **how those capabilities are presented and grouped**.

---

# 1. PRODUCT POSITIONING

The product must **not read as an ISP-only subscriber management application**.

The base information architecture must be useful across multiple access, network-service, and managed-connectivity segments:

- ISP / broadband
- WISP / wireless access
- telecom / access providers
- enterprise network operations
- managed service providers
- campus / institutional networks
- hospitality / guest access
- captive portal / Wi-Fi operators
- hybrid AAA + gateway deployments

The common product model is intentionally **industry-neutral**:

```text
Customer / Organization
        ↓
Product / Service
        ↓
Policy Engine
        ↓
AAA / Session / Access
        ↓
Network / Gateway Enforcement (when applicable)
        ↓
Billing / Payment / Reporting
        ↓
Operations / Support / Intelligence
```

Industry-specific structures such as **POP, LCO, Zone, Property, Venue, Branch, Campus, Region, Site, Business Unit, or Dealer Territory** are contextual dimensions and must not define the universal base product.

## 1.1 Vertical capability model

The platform should separate:

```text
Universal Core
   +
Deployment Foundation
   +
Vertical / Organizational Extensions
   +
Advanced Add-ons
```

Examples:

```text
ISP deployment
  Organization & Scope → Areas / POPs → Zones / LCOs

Enterprise deployment
  Organization & Scope → Business Units / Sites / Branches

Hospitality deployment
  Organization & Scope → Properties / Venues / Guest Networks
```

The underlying customer, product, policy, access, billing, session, reporting, and audit engines remain shared.

# 2. CORE INFORMATION-ARCHITECTURE PRINCIPLES

## 2.1 Business concepts first

The sidebar must use durable business concepts:

- Dashboard
- Customers & Services
- Products & Packages
- Policy Engine
- Billing & Finance
- Access & AAA
- Network & Gateway
- Operations & Support
- Monitoring & Diagnostics
- Reports & Analytics
- Administration

Technology names such as RADIUS, VPP, GoVPP, nDPI, PostgreSQL, TC, nftables, or internal workers must never define the primary navigation.

## 2.2 Commercial lifecycle is a first-class product pillar

Billing must support a complete commercial lifecycle, not merely invoice generation:

```text
Product / Package
      ↓
Pricing / Eligibility
      ↓
Prepaid / Postpaid / Usage Billing
      ↓
Customer Service Assignment
      ↓
Usage / Policy / Service State
      ↓
Invoice or Balance Deduction
      ↓
Payment
      ↓
Allocation / Reconciliation
      ↓
Collection / Recovery / Adjustment
      ↓
Accounting / Reporting / Audit
```

Prepaid, postpaid, top-up, credits, deposits, recurring charges, usage charges, taxes, payment tracking, and reconciliation are part of the **commercial engine design**. Their visibility can vary by licensed deployment or vertical.

## 2.3 Policy Engine is a first-class product pillar

Policy is not just bandwidth control. The Policy Engine must support reusable, composable policy domains such as:

- Surfing Quota
- Access Time
- Bandwidth
- Data Transfer Policy
- Fair Access Policy
- Application / Content controls
- Security profiles
- Access / authentication policy
- Policy groups / bundles
- Assignment and inheritance
- Priority / precedence
- Effective dates / schedules
- Conflict detection
- Simulation / testing
- Policy audit / history

The UI represents business intent. Runtime enforcement belongs to the Policy Engine plus the applicable AAA/session/gateway enforcement path.

## 2.4 Organization & Scope is optional, contextual, and reusable

There must be a reusable **Organization & Scope capability**, but it is **not part of the universal Base navigation**.

It should be enabled when the deployment requires hierarchical scope such as:

- ISP: Area / POP / Zone / LCO
- Enterprise: Organization / Business Unit / Site / Branch
- Hospitality: Property / Venue / Guest Network
- Managed Services: Customer / Region / Site / Contract Scope
- Campus: Campus / Building / Network Segment

The system must not hard-code the concepts POP or LCO into the universal customer, billing, policy, or session engines.

## 2.5 Base vs Add-on vs Vertical module must be explicit

The commercial model uses three layers:

| Layer | Meaning |
|---|---|
| Universal Base | Required business/platform capabilities common across supported deployments |
| Deployment Foundation | Capabilities required by the selected AAA-only, Gateway-only, or Multi-mode deployment |
| Vertical / Optional Module | Industry-specific or organizational-scope capabilities enabled only where needed |

Advanced add-ons extend these layers without creating duplicate customer, product, policy, session, or billing engines.

## 2.6 Segment-neutral terminology

Use generic product terminology at the platform level:

- Customer / Subscriber = service-consuming identity
- Product / Package = commercial service definition
- Service = activated customer entitlement
- Scope = organizational or location context
- Policy = authorization / consumption / enforcement rules
- Session = active access state

Vertical labels can be applied in UI configuration without changing the underlying domain model.

# 3. FINAL TOP-LEVEL MENU

```text
CRYPTSK
│
├── 01. Dashboard
│
├── 02. Customers & Services
│   ├── Customers / Subscribers
│   ├── Customer 360°
│   ├── Products & Packages
│   │   ├── Product Catalog
│   │   ├── Packages
│   │   ├── Prepaid Packages
│   │   ├── Postpaid Packages
│   │   ├── Top-Up Products
│   │   ├── Ancillary Services
│   │   └── Service Assignment & Migration
│   └── Provisioning
│       └── Batch Provisioning
│
├── 03. Organization & Scope [OPTIONAL / LICENSED]
│   ├── Organizations / Business Units
│   ├── Sites / Locations
│   ├── Scope / Zone Definitions
│   ├── Delegated Administrators
│   ├── Scope Mapping
│   ├── Commercial Scope Rules
│   ├── Package Availability by Scope
│   ├── Scope Collections
│   └── Scope Reports
│
├── 04. Policy Engine
│   ├── Policy Overview
│   ├── Policy Groups
│   ├── Surfing Quota
│   ├── Access Time
│   ├── Bandwidth
│   ├── Data Transfer Policy
│   ├── Fair Access Policy
│   ├── Application & Content Policy
│   ├── Security Profiles
│   ├── Access / Authentication Policy
│   ├── Policy Assignment
│   ├── Policy Priority & Precedence
│   ├── Policy Simulator / Test
│   └── Policy Audit / History
│
├── 05. Billing & Finance
│   ├── Billing Overview
│   ├── Prepaid Billing
│   ├── Postpaid Billing
│   ├── Invoices
│   ├── Invoice Templates
│   ├── Payments & Payment Tracking
│   ├── Collections
│   ├── Due Recovery
│   ├── Vouchers / Credits
│   ├── Cyclic Billing
│   ├── Grace Periods
│   ├── Charge Overrides
│   ├── Credits / Adjustments
│   ├── Ancillary Charges
│   ├── Tax Information
│   ├── Revenue Leakage
│   ├── Smart Collections
│   └── Financial Analytics
│       ├── Revenue Reports
│       └── Revenue Forecast
│
├── 06. Access & AAA
│   ├── NAS / Access Clients
│   ├── Active Sessions
│   ├── Session History
│   ├── Authentication Logs
│   ├── CoA / Session Actions
│   ├── Walk-in / Temporary Access [optional]
│   ├── Enterprise Authentication
│   ├── RADIUS Proxy
│   ├── WiFi Offload / Diameter
│   └── Advanced AAA
│       └── RADIUS Attributes
│
├── 07. Network & Gateway
│   ├── Network Devices
│   ├── System Interfaces
│   ├── IP Address Management
│   ├── DHCP / DHCPv6
│   ├── DNS
│   ├── PPPoE
│   ├── Routing
│   ├── Multi-WAN / Gateway Management
│   ├── FTTH / GPON
│   └── Captive Portal & Hotspot
│
├── 08. Security & Advanced Services
│   ├── Firewall
│   ├── IPS / Threat Detection
│   ├── DDoS Protection
│   ├── VPN
│   ├── Application Awareness / DPI
│   ├── Content & DNS Filtering
│   ├── TR-069 ACS
│   ├── SNMP Manager
│   ├── MikroTik Manager
│   └── SSH Device Manager
│
├── 09. Operations & Support
│   ├── Complaints & Support
│   ├── Incidents
│   ├── Installations
│   ├── Technicians
│   ├── Technician Performance
│   ├── Service Contracts / AMC [optional]
│   ├── Inventory & Equipment
│   ├── Sales & Collection Agents
│   ├── Announcements
│   └── Action History
│
├── 10. Monitoring & Diagnostics
│   ├── Network Health
│   ├── Bandwidth Monitoring
│   ├── Traffic Analytics
│   ├── Uptime Monitoring
│   ├── Latency Monitoring
│   ├── Network Alerts
│   ├── NAT Logs
│   ├── Web Browsing / HTTP Logs
│   ├── Syslog
│   ├── Diagnostic Tools
│   ├── Speed Test
│   ├── IP-MAC History
│   └── External Dashboards
│
├── 11. Reports & Analytics
│   ├── Report Center
│   ├── Customer / Usage Reports
│   ├── Bandwidth Reports
│   ├── Revenue & Collection Reports
│   ├── Compliance & SLA
│   └── Data Export
│
├── 12. Sales, Partners & Engagement
│   ├── Leads
│   ├── Resellers / Partners
│   ├── Promotions
│   ├── Referral Program
│   ├── Loyalty & Gamification
│   ├── WhatsApp Business
│   ├── Notifications
│   └── Knowledge Base
│
├── 13. AI & Intelligence
│   ├── AI Advisor
│   ├── AI Network Diagnosis
│   ├── Churn Alerts
│   ├── Churn Prediction
│   ├── Competitor Intelligence
│   └── Competitor Analysis
│
└── 14. Administration
│   ├── Organization / Company Profile
│   ├── Admin Users & Roles
│   ├── Integrations
│   ├── API Keys
│   ├── Audit Log
│   ├── Backup & Restore
│   ├── Module & Licensing Manager
│   └── System / Advanced Settings
│
```

### ISP-specific terminology inside Organization & Scope

When the ISP vertical is enabled, the generic scope module may be presented as:

```text
Organization & Scope → Areas & Zones
├── Areas / POPs
├── Zones / LCOs
├── Zone Administrators
├── Area ↔ Zone Mapping
├── Zone Commercial Rules
├── Zone Package Availability
├── Zone Collections
└── Zone Reports
```

This menu must **not appear in the universal Base product unless the Organization & Scope capability is enabled**.

# 4. MENU PURPOSES

## 4.1 Dashboard

### Overview

Purpose: Provide one operational view across:

- customer/service status
- active sessions
- billing and collections
- network health
- policy events
- complaints/incidents
- SLA indicators
- alerts
- AI insights
- recent actions

### Customize Dashboard

Purpose: Allow authorized users to create role-aware dashboards using the preserved Cryptsk widget system.

---

# 5. CUSTOMERS & SERVICES

## 5.1 Customers / Subscribers

Purpose: Manage the customer lifecycle for residential, enterprise, corporate, hotspot, or other supported service types.

Includes:

- customer identity
- subscriber/service identity
- KYC/GST/PAN where applicable
- contact and service addresses
- customer type
- service status
- service/package assignment
- IP/device assignment
- credentials
- suspension / activation
- session actions
- imports / exports
- bulk operations

The underlying RADIUS user record is not the primary customer concept.

## 5.2 Customer 360°

Purpose: Unified view of customer identity, services, packages, policies, sessions, invoices, payments, complaints, IP information, devices, and activity.

## 5.3 Packages & Services

This is the **commercial service catalog**.

### Package Catalog

Purpose: Define reusable commercial/network packages including:

- price
- duration
- service type
- speed
- policy bundle
- quota
- data transfer limits
- access-time rules
- FUP behavior
- IPv4/IPv6 behavior
- tax behavior
- eligibility
- scope availability (when enabled)

### Prepaid Packages

Purpose: Define services where service balance/validity is consumed from advance value.

Expected functions:

- prepaid validity
- balance / wallet consumption
- quota association
- top-up compatibility
- expiry rules
- grace/renewal behavior
- package activation and renewal
- package-level policy binding

### Postpaid Packages

Purpose: Define services billed on a recurring cycle or after service consumption.

Expected functions:

- billing cycle
- recurring charge
- usage/rating inputs
- invoice generation
- due date
- grace period
- suspension rules
- package-level policy binding

### Top-Up Products

Purpose: Define prepaid balance/data/time top-up products and their eligibility, validity, and usage rules.

### PIN / Voucher Management

Purpose: Manage prepaid/temporary-access PIN or voucher inventories without coupling issuance to one vertical.

Core capabilities:

- PIN/voucher pool generation
- batch creation/import
- activation/deactivation
- expiry
- package/value association
- redemption/usage history
- printable/exportable voucher representation

### Ancillary Services

Purpose: Define billable services outside the base package, such as add-on connectivity/services or other commercial charges.

### Package Assignment & Migration

Purpose: Assign, change, renew, upgrade, downgrade, and migrate customer services while preserving effective dates, policy, and billing history.

## 5.4 Provisioning > Batch Provisioning

Purpose: High-volume onboarding and service provisioning with templates, validation, bulk jobs, progress, retry, and error reporting.

---

# 6. OPTIONAL ORGANIZATION & SCOPE MODULE

This capability is intentionally **not part of the universal Base product**. It is enabled for deployments that require organizational, geographic, property, branch, POP, zone, LCO, or delegated operational hierarchy.

## 6.1 Scope Model

Purpose: Define reusable organizational/location scopes without forcing ISP terminology into every deployment.

Generic model:

```text
Organization
   └── Business Unit / Region
       └── Site / Location
           └── Scope / Zone
               └── Services / Customers
```

A deployment may enable only the hierarchy it needs.

## 6.2 Delegated Administrators

Purpose: Assign administrative scope without granting system-wide access.

Supports:

- scope-limited users
- scope-limited customer visibility
- scope-limited packages
- scope-limited billing/payment visibility
- scope-limited support operations
- scope-limited reports

## 6.3 Scope Mapping

Purpose: Map customers, services, packages, policies, devices, technicians, payments, and reports to organizational scopes.

## 6.4 Commercial Scope Rules

Purpose: Apply optional scope-specific behavior such as:

- product availability
- pricing overrides
- collection responsibility
- payment ownership
- service restrictions
- policy defaults

## 6.5 Scope Reports

Purpose: Report by the enabled organizational hierarchy.

## 6.6 ISP Vertical Profile — Areas / POPs / Zones / LCOs

When configured for ISP operations:

- **Area = POP / access area**
- **Zone = LCO / delegated commercial-operational zone**
- **Zone Administrator = delegated LCO operator**

ISP-specific functions include:

- Area/POP network scope
- Zone/LCO customer scope
- scope package availability
- scope pricing
- zone collections
- zone reports
- technician and complaint scope

These remain **vertical capabilities**, not universal base capabilities.

# 7. POLICY ENGINE

Policy Engine is a **core platform module**.

It translates business policy into runtime authorization/enforcement decisions for AAA/session/gateway layers.

The **policy engine is universal; individual policy types are capability-controlled**. ISP deployments may expose Surfing Quota and Fair Access Policy, while enterprise deployments may expose bandwidth, access-time, security, application, data-transfer, and authorization policies without requiring ISP-specific policy screens.

## 7.1 Policy Overview

Purpose: Show active policies, policy health, affected customers, conflicts, recent deployments, and enforcement status.

## 7.2 Policy Groups

Purpose: Create reusable bundles of policy rules that can be assigned to packages, customers, zones, or services.

## 7.3 Surfing Quota

Purpose: Define permitted browsing/usage quota rules.

Examples:

- cycle quota
- daily quota
- monthly quota
- time-window quota
- post-quota behavior
- package/scope/customer assignment

## 7.4 Access Time

Purpose: Control when a customer/service is allowed to access the network or specific services.

Examples:

- allowed hours
- blocked hours
- weekday/weekend rules
- holiday calendars
- scope-specific schedules

## 7.5 Bandwidth

Purpose: Define service speed and traffic treatment.

Examples:

- upload speed
- download speed
- burst behavior
- priority
- QoS class
- subscriber/service limits
- zone/device pools

## 7.6 Data Transfer Policy

Purpose: Control data-volume limits and actions.

Examples:

- total transfer quota
- upload quota
- download quota
- cycle limits
- overage behavior
- alert thresholds
- reset behavior

## 7.7 Fair Access Policy

Purpose: Implement controlled FUP/Fair Usage behavior without hard-coding it into package definitions.

Examples:

- threshold
- reduced speed
- restricted policy
- reset date/time
- exception rules
- restore conditions

## 7.8 Application & Content Policy

Purpose: Apply application/category/content restrictions and application-aware service policy where supported.

## 7.9 Security Profiles

Purpose: Reusable policy bundles for port controls, DNS/content restrictions, security controls, and subscriber protection.

## 7.10 Policy Assignment

Purpose: Assign policies to:

- package
- customer
- service
- scope
- scope (when enabled)
- device/class
- enterprise group

Assignment must be effective-dated and auditable.

## 7.11 Policy Priority & Precedence

Purpose: Define how overlapping policies are resolved.

The system must explicitly represent precedence rather than relying on hidden ordering.

Recommended evaluation model:

```text
Global
  ↓
Organization / Scope (when enabled)
  ↓
Product / Package
  ↓
Customer / Service
  ↓
Session / Dynamic Override
```

For an ISP profile, Organization / Scope may resolve as Area / POP → Zone / LCO. For an enterprise profile, it may resolve as Business Unit → Site / Branch. The final implementation may use a more precise rule engine, but precedence must remain deterministic and inspectable.

## 7.12 Policy Simulator / Test

Purpose: Allow authorized operators to answer:

- Which policy would apply?
- Why did this policy win?
- What would change if the package changed?
- What would happen after quota exhaustion?
- Which rule blocked the service?

The simulator must explain the effective decision without requiring packet-path debugging.

## 7.13 Policy Audit / History

Purpose: Record policy creation, change, assignment, deployment, rollback, and enforcement status.

---

# 8. BILLING & FINANCE

Billing is a **core platform module**.

The billing architecture must support prepaid, postpaid, recurring, usage-rated, credit/deposit, and adjustment models under one financial domain while keeping each accounting behavior distinct.

The billing engine is universal; the visible billing workflows are capability-controlled so that each deployment exposes only the commercial models it actually uses.

## 8.1 Billing Overview

Purpose: Executive and operational view of:

- billed
- collected
- outstanding
- prepaid balances
- postpaid dues
- invoices
- payments
- collection performance
- scope performance (when enabled)
- revenue trends

## 8.2 Prepaid Billing

Purpose: Manage advance-value services.

Core capabilities:

- prepaid wallet/balance
- package activation
- validity tracking
- top-up credit
- balance deduction
- renewal
- expiry
- grace handling
- insufficient-balance behavior
- transaction ledger

## 8.3 Postpaid Billing

Purpose: Manage recurring/usage-based billing.

Core capabilities:

- billing cycle
- rating/charge inputs
- invoice generation
- due date
- grace period
- service restriction/suspension
- payment allocation
- credit/debit adjustments
- collection workflow

## 8.4 Invoices

Purpose: Create, generate, review, issue, cancel, export, and audit invoices.

## 8.5 Invoice Templates

Purpose: Manage invoice/document layout, numbering, tax presentation, branding, and print/export format.

## 8.6 Payments & Payment Tracking

Purpose: Provide a full payment lifecycle and financial ledger.

Must cover:

- payment entry
- online gateway transaction
- offline payment
- cash/bank/mobile-wallet methods where configured
- payment reference
- subscriber/customer
- invoice allocation
- prepaid balance credit
- receipt generation
- verification
- refund
- chargeback/dispute tracking
- reconciliation
- payment history
- payment status
- failed transactions
- duplicate protection
- scope attribution (when enabled)

## 8.7 Collections

Purpose: Track collection targets, collection agents, receipts, scope collections (when enabled), reconciliation, disputes, and performance.

## 8.8 Due Recovery

Purpose: Manage overdue balances through promises, reminders, installment plans, assignment, suspension, reactivation, and write-off workflows.

## 8.9 Vouchers

Purpose: Support prepaid/voucher-driven commercial models, including generation, activation, usage history, import, templates, and reporting.

## 8.10 Cyclic Billing

Purpose: Define recurring billing cycles, milestones, effective dates, and package associations.

## 8.11 Grace Periods

Purpose: Define controlled post-due service grace behavior before restriction, suspension, or recovery workflows.

## 8.12 Charge Overrides

Purpose: Apply audited customer/service-specific charge overrides without changing the package catalog.

## 8.13 Credits / Adjustments

Purpose: Controlled financial adjustments with reason, approval, audit trail, and customer/zone attribution.

## 8.14 Ancillary Charges

Purpose: Manage charges generated by ancillary services and non-package commercial items.

## 8.15 Tax Information

Purpose: Tax configuration, invoice tax treatment, HSN/SAC, TDS/TCS, GST-oriented reporting, and tax audit requirements where applicable.

## 8.16 Revenue Leakage

Purpose: Identify missing charges, abnormal adjustments, uncollected invoices, aging anomalies, and commercial leakage patterns.

## 8.17 Smart Collections

Purpose: Prioritize collection work using overdue age, subscriber value, scope context (when enabled), communication channel, promise-to-pay state, and recovery performance.

## 8.18 Financial Analytics

Purpose: Consolidated revenue, cashflow, collections, aging, payment, forecast, and commercial performance analysis.

### Revenue Reports

Purpose: Revenue, collections, agent, invoice-aging, expense, KPI, and tax-related reporting.

### Revenue Forecast

Purpose: Forecast revenue and cashflow from current billing, collection, and subscriber/service data.

---

# 9. ACCESS & AAA

## 9.1 NAS Clients

Purpose: Manage devices requesting AAA services and their credentials/connection settings.

## 9.2 Active Sessions

Purpose: Real-time service/session visibility and controlled disconnect/termination actions.

## 9.3 Walk-in / Temporary Access [optional]

Purpose: Support temporary or walk-in access for deployments such as hospitality, hotspots, campuses, events, or controlled temporary services.

Capabilities may include:

- temporary identity
- voucher/PIN-based access
- validity window
- session limits
- optional payment linkage
- usage/session history


## 9.4 Session History

Purpose: Historical session records for billing, support, audit, and analytics.

## 9.5 Authentication Logs

Purpose: Authentication accept/reject investigation and operational evidence.

## 9.6 CoA / Session Actions

Purpose: Track dynamic session changes including plan, bandwidth, reauthentication, and disconnect operations.

## 9.7 Enterprise Authentication

Purpose: Support enterprise/corporate authentication identity and policy scenarios without changing the core customer model.

## 9.8 RADIUS Proxy

Purpose: Realm-based proxy and external AAA relationships.

## 9.9 WiFi Offload / Diameter

Purpose: Support applicable offload and Diameter-based authentication/service workflows.

## 9.10 Advanced AAA > RADIUS Attributes

Purpose: Expert-level dictionary and custom attribute management.

---

# 10. NETWORK & GATEWAY

## 10.1 Network Devices

Routers, switches, OLTs, gateway devices, and infrastructure inventory.

## 10.2 System Interfaces

Physical/VLAN/bridge/bond and permitted system-level interface administration.

## 10.3 IP Address Management

Subnets, pools, assignments, reservations, IPv4/IPv6, conflict detection, history, and CGNAT-related allocation.

## 10.4 DHCP / DHCPv6

Lease, reservation, pool, prefix-delegation, and subscriber/device assignment operations.

## 10.5 DNS

DNS records, generated configuration, service status, captive-portal records, and supported policy behavior.

## 10.6 PPPoE

Profiles, address pools, service behavior, session visibility, and controlled disconnect.

## 10.7 Routing

Static and supported dynamic routing capabilities.

## 10.8 Multi-WAN / Gateway Management

Purpose: Manage one or more gateway instances and their WAN paths without creating a separate legacy "Multiple Gateways" product concept.

Capabilities include:

- gateway inventory
- gateway role/state
- capacity/health
- WAN attachment
- failover/failback
- gateway assignment
- gateway-group visibility where deployed

Multi-WAN is the WAN-path/failover capability; Gateway Management is the gateway-instance lifecycle/visibility capability.

## 10.9 FTTH / GPON

OLT, PON, splitter, template, capacity, and FTTH service operations.

## 10.10 Captive Portal & Hotspot

Portal definitions, venue/location profiles, authentication, vouchers, schedules, allowlists, analytics, live sessions, and revenue.

---

# 11. SECURITY & ADVANCED SERVICES

These capabilities remain separate from the core Policy Engine because they represent specialized gateway/security services.

## 11.1 Firewall

Gateway traffic filtering and security rule management.

## 11.2 IPS / Threat Detection

Intrusion detection/prevention rules, threat events, block rules, and response.

## 11.3 DDoS Protection

Traffic anomaly/threshold detection and mitigation workflows.

## 11.4 VPN

Supported VPN server/client, peers/connections, service status, and logs.

## 11.5 Application Awareness / DPI

Application classification, usage visibility, and application-aware policy integration.

## 11.6 Content & DNS Filtering

Advanced content and DNS filtering services where separately licensed/configured.

## 11.7 TR-069 ACS

CPE/device management using the supported TR-069 integration stack.

## 11.8 SNMP Manager

SNMP-based device/interface/metric administration.

## 11.9 MikroTik Manager

MikroTik-specific device integration.

## 11.10 SSH Device Manager

Controlled SSH device operations and approved batch/quick-command functions.

---

# 12. OPERATIONS & SUPPORT

## 12.1 Complaints & Support

Customer support lifecycle, assignment, comments, SLA, escalation, resolution, and analytics.

## 12.2 Incidents

Service/network incident lifecycle, correlation, assignment, maintenance, root-cause analysis, and resolution.

## 12.3 Installations

Service installation workflow and technician dispatch.

## 12.4 Technicians

Technician management, schedule, attendance, leave, dispatch, and SLA.

## 12.5 Technician Performance

Operational KPI and field-performance analytics.

## 12.6 Inventory & Equipment

Equipment, stock, warehouses, purchase orders, transfers, returns, repairs, and adjustments.

## 12.7 Sales & Collection Agents

Agent management, follow-ups, commission/payout workflows, collection scope, and reconciliation.

## 12.8 Announcements

Operational and customer-facing announcements.

## 12.9 Action History

Operational action history and supported reversible actions.

---

# 13. MONITORING & DIAGNOSTICS

## 13.1 Network Health

Device, link, service, and infrastructure health.

## 13.2 Bandwidth Monitoring

Real-time throughput and utilization views.

## 13.3 Traffic Analytics

Protocol, interface, customer/session, optional-scope, and utilization analytics.

## 13.4 Uptime Monitoring

HTTP/TCP/service availability and outage tracking.

## 13.5 Latency Monitoring

Latency measurements and history.

## 13.6 Network Alerts

Rules, severity, escalation, suppression, maintenance windows, assignments, and history.

## 13.7 NAT Logs

NAT translation records and operational/compliance search. This is the Cryptsk equivalent of the reference-product "Net Kapture" requirement for NAT/IP translation traceability.

Expected correlation fields include private/source address and port, public/translated address and port, protocol, timestamp, gateway, and customer/session correlation where available.

## 13.8 Web Browsing / HTTP Logs

HTTP/web browsing visibility where technically available, legally/configurationally enabled, and supported by the deployed traffic-observability path.

Expected functions:

- timestamp
- source/customer/session correlation
- destination host/domain
- URL/path where available
- HTTP method/status where available
- search/filter
- retention
- export

This is intentionally distinct from NAT Logs and DPI/Application Awareness.

## 13.9 Syslog

Infrastructure log collection and search.

## 13.10 Diagnostic Tools

Ping, traceroute, approved capture workflows, and other controlled diagnostics.

## 13.11 Speed Test

Service performance checks.

## 13.12 IP-MAC History

Historical IP/MAC relationship tracking.

## 13.13 Scope Budgets (optional; requires Organization & Scope)

Zone-level bandwidth/data budget tracking.

## 13.14 External Dashboards > Grafana

Advanced observability views without replacing the product UI.

---

# 14. SALES & PARTNERS

## 14.1 Leads

Prospect pipeline and sales follow-up.

## 14.2 Resellers / Partners

Partner management, plan pricing, commissions, credit, subscriber assignment, and payout workflows.

## 14.3 Promotions

Commercial promotion campaigns.

## 14.4 Referral Program

Referral and rewards management.

## 14.5 Loyalty & Gamification

Points, tiers, badges, and rewards.

## 14.6 WhatsApp Business

Business messaging, templates, conversations, commands, quick replies, broadcasts, webhooks, schedules, and logs.

## 14.7 Notifications

Notification history, rules, retries, analytics, and dispatch.

## 14.8 Knowledge Base

Articles, FAQs, categories, versions, and support knowledge.

---

# 15. REPORTS & ANALYTICS

## 15.1 Report Center

Central report search, execution, filtering, saved reports, and custom report workflows.

## 15.2 Subscriber & Usage Reports

Customer/subscriber, session, product/service, scope (when enabled), and usage reporting.

## 15.3 Bandwidth Reports

Pool, subnet, subscriber, session, and utilization reports.

## 15.4 Revenue & Collection Reports

Revenue, payment, invoice, aging, collection, and scope-based commercial reporting when enabled.

## 15.5 Reseller Intelligence

Partner performance, commission, credit, payout, and risk analysis.

## 15.6 Compliance & SLA

SLA, KYC, data-retention, audit, and regulatory reporting.

## 15.7 Data Export

Authorized CSV/Excel and supported bulk export workflows.

---

# 16. AI & INTELLIGENCE

AI is optional and must never be required for core customer service, policy enforcement, AAA, billing, or packet forwarding.

## 16.1 AI Advisor

Business and operational assistant.

## 16.2 AI Network Diagnosis

Network/subscriber troubleshooting and evidence-based diagnosis.

## 16.3 Churn Alerts

Churn-risk workflow and retention actions.

## 16.4 Churn Prediction

Predictive churn analytics and recommendations.

## 16.5 Competitor Intelligence

Competitor plan/pricing/market intelligence.

## 16.6 Competitor Analysis

Comparison, pricing intelligence, market share, and win/loss analytics.

---

# 17. ADMINISTRATION

Administration is limited to platform governance and system control. Operational business hierarchies such as Areas and Zones must remain outside this section.

## 17.1 Organization / ISP Profile

Company/organization identity, branding, tax identity, banking and document defaults.

## 17.2 Admin Users & Roles

Administrative users, roles, permissions, sessions, and access reviews.

## 17.3 Integrations

Payment, communication, webhook, and external-system configurations.

## 17.4 API Keys

Machine-to-machine credentials, scopes, expiry, rotation, and webhook testing.

## 17.5 Audit Log

Immutable security/operation audit trail and anomaly review.

## 17.6 Backup & Restore

Backup lifecycle, verification, restore, retention, and disaster recovery controls.

## 17.7 Module & Licensing Manager

Display:

- Base modules
- Licensed add-ons
- Enabled/disabled state
- Deployment applicability
- License expiry/entitlement where applicable
- dependency status

## 17.8 System / Advanced Settings

Low-frequency platform settings and carefully permission-gated advanced controls.

---

# 18. SELF-CARE PORTAL — SEPARATE PRODUCT NAVIGATION

Self-care is a separate subscriber/customer-facing application shell.

```text
Self-Care
├── Dashboard
├── My Usage
├── Billing
├── Payments
├── Support
├── My Profile
├── Service Status
├── Speed History
└── Plan Comparison
```

Self-care must never expose internal administration, raw AAA configuration, infrastructure controls, or privileged finance operations.

---

# 19. BASE MODULES VS DEPLOYMENT FOUNDATIONS VS ADD-ONS

The commercial architecture must distinguish between universal product capabilities and deployment/vertical capabilities.

## 19.1 UNIVERSAL BASE — INDUSTRY-NEUTRAL

These capabilities should make sense across ISP, enterprise, managed access, hospitality, campus, and similar deployments.

| Base module | Purpose |
|---|---|
| Dashboard & Core UI | Common management experience and role dashboards |
| Customers & Services | Customer/service lifecycle |
| Products & Packages | Product catalog, package definitions, service assignment |
| Policy Engine | Quota, time, bandwidth, transfer, FUP, authorization and precedence framework |
| Billing & Finance | Billing, prepaid/postpaid framework, invoices, payments, collections, tax and adjustments |
| Access & AAA Core | Authentication, authorization, accounting, active sessions and lifecycle |
| Core Reporting | Standard operational and commercial reports |
| RBAC & Audit | Users, roles, permissions, audit trail |
| API / Integration Core | Core API, webhook and integration framework |
| Self-Care / Customer Portal | Standard customer-facing service and billing access |
| Core Monitoring | Service/session/system health and alerts |
| Module & Licensing Framework | Entitlements, dependencies and feature lifecycle |

**Areas & Zones are NOT in this table.**

## 19.2 DEPLOYMENT FOUNDATION

The selected deployment mode determines which infrastructure foundation is included.

### AAA-only foundation

- RADIUS / AAA runtime
- session lifecycle
- NAS/access integration
- accounting
- CoA / disconnect
- applicable access integrations

### Gateway-only foundation

- DPDK/VPP dataplane foundation
- interface management
- IPAM
- DHCP/DHCPv6
- DNS
- routing foundation
- NAT foundation
- firewall foundation
- policy enforcement foundation

### Multi-mode foundation

Combines both foundations through the shared Session Engine, Policy Engine, and Gateway/AAA adapters.

## 19.3 VERTICAL / ORGANIZATIONAL MODULES

These are enabled only where the business model needs them.

| Vertical / optional module | Typical examples |
|---|---|
| Organization & Scope | ISP Areas/POP/Zones/LCO, enterprise sites/branches, hospitality properties/venues |
| Prepaid Commerce Extensions | Wallet, top-up, vouchers, prepaid campaigns |
| Reseller / LCO Commerce | Partner settlements, commissions, credit limits |
| Captive Portal / Hotspot | Guest access, vouchers, portal analytics |
| FTTH / GPON | OLT/ONU/port/splitter/capacity operations |
| Field Service | Advanced dispatch/work-order operations |

## 19.4 ADVANCED ADD-ONS

| Add-on family | Included capabilities |
|---|---|
| Advanced Security | IPS, DDoS, advanced threat controls |
| DPI / Application Intelligence | Application Awareness, deep traffic classification |
| Advanced Content Filtering | Advanced DNS/content filtering |
| Advanced Routing | BGP/OSPF/RIP/BFD |
| Multi-WAN / Gateway Management | Multi-link policy, gateway lifecycle/visibility, failover/failback, advanced WAN health |
| VPN | Advanced VPN server/client capabilities |
| Device Management Packs | TR-069, MikroTik, SNMP, SSH and vendor-specific adapters |
| RADIUS Proxy / Diameter / Offload | External AAA/proxy/offload integrations |
| Communications | Advanced WhatsApp/SMS communication capabilities |
| AI & Intelligence | AI Advisor, diagnosis, churn, competitor intelligence |
| Advanced Analytics | Forecasts, specialized intelligence and advanced analytics |
| Traffic Traceability | NAT Logs and Web Browsing / HTTP Logs; distinct from DPI/application analytics |
| Guest / Temporary Access | Walk-in access, vouchers/PINs, temporary service validity |
| Service Contracts | AMC/SLA/entitlement management for managed-service deployments |
| Loyalty / Referral | Advanced engagement and gamification |

## 19.5 LICENSING RULE

Add-ons and vertical modules must extend the shared Base domains. They must not create competing implementations of:

- Customer
- Product / Package
- Service
- Policy
- Session
- Billing
- Payment
- Audit

Example:

```text
Universal Base
      ↓
Organization & Scope (optional)
      ↓
ISP profile: Areas / POPs / Zones / LCOs

Universal Base
      ↓
Organization & Scope (optional)
      ↓
Enterprise profile: Business Units / Sites / Branches

Universal Base
      ↓
Advanced Policy Add-on
      ↓
DPI / Application Intelligence
```

# 20. OPTIONAL SCOPE-BASED COMMERCIAL MODEL

Commercial scope is available when the **Organization & Scope** module is enabled. It must not become a mandatory dimension for every customer.

Generic model:

```text
Global Product Catalog
        ↓
Optional Scope Availability
        ↓
Optional Scope Pricing / Commercial Rule
        ↓
Customer / Service Assignment
        ↓
Policy Assignment
        ↓
Billing / Payment
```

When scope is not enabled:

```text
Global Product
      ↓
Customer / Service
      ↓
Policy
      ↓
Billing
```

When scope is enabled, it may influence:

- product availability
- price overrides
- promotional eligibility
- collection responsibility
- policy defaults
- service availability
- reporting dimensions

## 20.1 ISP example

```text
scope
   ↓
scope
   ↓
Package availability / pricing
   ↓
Subscriber service
   ↓
Policy
   ↓
Billing / Payment / Collection
```

## 20.2 Enterprise example

```text
Business Unit
   ↓
Site / Branch
   ↓
Service catalog / entitlement
   ↓
User / device service
   ↓
Policy
   ↓
Billing / reporting
```

The second model is not forced to use the ISP terms Areas, POPs, Zones, or LCOs.

# 21. PAYMENT TRACKING MODEL

Payment tracking is a core feature, not only a transaction table.

The UI should provide:

```text
Payment
├── Reference
├── Customer / Subscriber
├── scope
├── scope
├── Payment Method
├── Amount
├── Status
├── Gateway / Channel
├── Invoice Allocation
├── Prepaid Balance Credit
├── Receipt
├── Refund / Reversal
├── Reconciliation
└── Audit Trail
```

The product must distinguish:

- payment received
- payment verified
- payment allocated
- payment reconciled
- payment refunded/reversed
- payment failed
- payment disputed

This prevents the Billing UI from becoming a simple "mark paid" workflow.

---

# 22. POLICY ENGINE OPERATING MODEL

Policy should be reusable and independently assignable from packages.

Recommended model:

```text
Policy Template
      ↓
Policy Group
      ↓
Package / Zone / Customer Assignment
      ↓
Policy Compilation
      ↓
Session Decision
      ↓
Runtime Enforcement
```

A package may reference one or more policy groups.

A customer/service may receive an additional policy override.

Zone/Area rules may constrain what packages/policies are available.

The final effective policy must always be explainable.

---

# 23. PAGES THAT SHOULD NOT BE NORMAL TOP-LEVEL MENU ITEMS

These capabilities remain hidden, contextual, or advanced:

| Legacy / Technical page | Final treatment |
|---|---|
| AAA Users | Hidden; use Customers / Subscribers |
| AAA Groups | Hidden; use Packages / Policy Groups |
| AAA Sessions | Hidden; use Active Sessions |
| Session Engine | Internal runtime |
| VPP / GoVPP controls | Internal runtime / advanced diagnostics |
| RADIUS Attributes | Advanced AAA |
| Raw nftables / tc | Never a normal business workflow |
| Database administration | Outside normal product navigation |
| Worker/process controls | Internal operations |
| Generated configuration internals | Contextual/advanced |

Capabilities must not be deleted merely because they are hidden from the sidebar.

---

# 24. LEGACY PAGE CONSOLIDATION

| Legacy concept | Canonical location |
|---|---|
| Subscribers | Customers & Services → Customers / Subscribers |
| RADIUS Users | Customers & Services / Access & AAA implementation views |
| Plans / RADIUS Groups | Customers & Services → Products & Packages |
| Prepaid | Customers & Services + Billing & Finance |
| Postpaid | Customers & Services + Billing & Finance |
| Top-Ups | Products & Packages → Top-Up Products + Billing where enabled |
| Voucher management | Billing & Finance → Vouchers / Captive Portal where enabled |
| Areas / POPs / LCOs | Optional Organization & Scope → ISP profile |
| Enterprise sites / branches | Optional Organization & Scope → Enterprise profile |
| Bandwidth | Policy Engine → Bandwidth |
| Time Access | Policy Engine → Access Time |
| Surfing Quota | Policy Engine → Surfing Quota |
| Data Transfer | Policy Engine → Data Transfer Policy |
| FUP | Policy Engine → Fair Access Policy |
| QoS | Policy Engine / Monitoring where applicable |
| Billing | Billing & Finance |
| Invoice | Billing & Finance → Invoices |
| Invoice Template | Billing & Finance → Invoice Templates |
| Payment | Billing & Finance → Payments & Payment Tracking |
| Tax | Billing & Finance → Tax Information |
| Inventory + Equipment | Operations & Support → Inventory & Equipment |
| BW Reports | Reports & Analytics → Bandwidth Reports |
| Revenue Reports | Reports & Analytics → Revenue & Collection Reports |
| Revenue Forecast | Billing & Finance / Reports & Analytics depending on role/license |
| Competitor Intel / Analysis | AI & Intelligence |

# 25. ROLE-BASED DEFAULT MENU EMPHASIS

| Role | Primary workspace |
|---|---|
| Super Admin | Dashboard / Administration / all licensed modules |
| Administrator | Dashboard / Customers / Billing / licensed scope modules |
| NOC Operator | Dashboard / Access & AAA / Network / Monitoring |
| Network Engineer | Network & Gateway / Policy Engine / Security / Monitoring |
| Policy Manager | Policy Engine / Customers & Services |
| Billing Manager | Billing & Finance / Customers / Reports |
| Finance User | Billing & Finance / Reports |
| Scope Administrator | Organization & Scope / Customers / Products / Billing / Support within assigned scope |
| LCO / Partner Operator | Assigned Scope / Customers / Products / Payments / Collections |
| Support Lead | Customers / Access & AAA / Operations / Monitoring |
| Support Agent | Customers / Complaints / Active Sessions |
| Field Manager | Operations & Support / licensed scope module |
| Technician | Assigned Operations / Diagnostics |
| Sales Agent | Customers / Products / Leads / Promotions |
| Reseller / Partner | Assigned commercial and subscriber scope |
| Auditor | Reports / Audit / Compliance |

RBAC decides visibility and action rights. A role must not receive Organization & Scope access simply because it is present elsewhere in the product.

# 26. HEADER / GLOBAL ACTIONS

The global header should expose:

- global search
- command palette
- notifications
- system health
- active session count
- billing/payment alerts where authorized
- user menu
- theme control
- context refresh/export controls

Search must be permission and module aware.

---

# 27. DASHBOARD QUICK ACTIONS

Recommended high-frequency actions:

- Add Customer / Subscriber
- Create Package
- Add Prepaid Package
- Add Postpaid Package
- Add Top-Up Product
- Assign Package
- Create Policy
- Add scope
- Collect Payment
- Generate Invoice
- Disconnect Session
- Raise Complaint
- Add Network Device
- Run Diagnostic
- Open Report Center

---

# 28. MENU BADGES / LIVE COUNTS

Use live badges only where operationally useful:

- Active Sessions
- Network Alerts
- Complaints
- Incidents
- Due Recovery
- Unread Notifications
- Churn Alerts where enabled
- Pending Payments/Reconciliation where enabled

Do not continuously poll every menu item.

---

# 29. MENU STATE RULES

The navigation must support:

- active route highlighting
- expanded/collapsed groups
- responsive/mobile navigation
- command palette access
- RBAC filtering
- module/licensing filtering
- meaningful live badges
- keyboard navigation
- persistent navigation state where appropriate

Visual identity remains aligned to the existing Cryptsk design system:

- dark navy sidebar
- Cryptsk red active state
- red focus/selection treatment
- preserved dashboard visual language

---

# 30. FINAL NAVIGATION AUTHORITY

This document is locked for the current design baseline. Any menu rename, move, addition, deletion, Base/Add-on classification change, or vertical-visibility change requires an ADR and coordinated updates to `04_PRODUCT_FEATURE_CATALOGUE.md`, Feature Registry, UI implementation rules, permissions, tests, and this document before implementation continues.


This document defines the **canonical product navigation**, not the complete feature inventory.

Every capability in the Feature Catalogue must map to exactly one of:

```text
VISIBLE UNIVERSAL BASE MENU
        OR
DEPLOYMENT FOUNDATION MENU
        OR
OPTIONAL / LICENSED VERTICAL MENU
        OR
CONTEXTUAL / DETAIL PAGE
        OR
PERMISSION-GATED ADVANCED PAGE
        OR
INTERNAL RUNTIME CAPABILITY
```

The following are now explicit product-design decisions:

1. **Areas & Zones are NOT Universal Base capabilities.**
2. **Organization & Scope is an optional reusable capability for hierarchical business/network/location management.**
3. **ISP deployments may present Organization & Scope as Areas / POPs / Zones / LCOs.**
4. **Enterprise deployments may present Organization & Scope as Business Units / Sites / Branches.**
5. **Hospitality deployments may present Organization & Scope as Properties / Venues / Guest Networks.**
6. **Prepaid, postpaid, top-up, invoice, payment tracking, collection, reconciliation, and tax capabilities belong to the shared commercial engine; their exposure is controlled by deployment and licensing.**
7. **Policy Engine is a first-class top-level product domain.**
8. **Surfing Quota, Access Time, Bandwidth, Data Transfer Policy, and Fair Access Policy are explicit policy modules.**
9. **Universal Base consists of industry-neutral customer/service, product/package, policy, billing, access/AAA, reporting, RBAC/audit, API/integration, self-care, monitoring, and licensing foundations.**
10. **AAA-only, Gateway-only, and Multi-mode deployments add their respective deployment foundations.**
11. **Advanced gateway, security, DPI, FTTH, VPN, device management, AI, communications, reseller, and other specialized capabilities are separately licensable where appropriate.**
12. **No vertical or add-on module may create a competing customer, product, policy, session, billing, or payment model.**
13. **The product must read as an enterprise-grade access, policy, OSS/BSS, and gateway platform — not as an ISP-only CRM.**


# 31. FINAL REFERENCE-PARITY DECISIONS

The supplied 24online module list is treated only as a **capability parity reference**. Cryptsk does not clone its historical module naming or create redundant menus.

The following are final product decisions:

| Reference term | Cryptsk treatment |
|---|---|
| Cache QoS | Intentionally not required; do not add solely for parity |
| Multiple Gateways Management | Covered by Multi-WAN / Gateway Management |
| Net Kapture | Represented as NAT Logs / NAT translation traceability |
| Web Surfing Logger | Represented as Web Browsing / HTTP Logs |
| POP Management | Organization & Scope → ISP Areas / POPs, optional |
| Zone Management | Organization & Scope → ISP Zones / LCOs, optional |
| Payment Tracking | Billing & Finance → Payments & Payment Tracking |
| Payment Gateway | Billing/Payments + Integrations; provider-specific connection is optional |
| PIN Management | Products & Packages → PIN / Voucher Management |
| Topup Package | Products & Packages → Top-Up Products |
| Walk-in Users | Access & AAA → Walk-in / Temporary Access, optional |
| SNAT IP Address Management | IPAM / NAT / CGNAT capability |
| AMC Support | Operations & Support → Service Contracts / AMC, optional |

The feature registry must use capability identifiers rather than reference-product module names, while maintaining a traceability note to the reference where applicable.
