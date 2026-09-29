# CRYPTSK NEXUS — SECURITY, RBAC & TRUST BOUNDARY SPECIFICATION
## Identity, authorization, secrets, gateway isolation, audit, secure operations, and security lifecycle

**Status:** LOCKED SECURITY / RBAC BASELINE
**Authority:** Subordinate to the Master Architecture and Gateway Architecture.

---

# 1. PURPOSE

Security is a cross-plane architectural property.

The system must protect:

- administrator accounts;
- subscriber accounts;
- financial data;
- network configuration;
- RADIUS credentials/shared secrets;
- device credentials;
- API keys;
- gateway control interfaces;
- personal data;
- audit records;
- AI data;
- integration credentials;
- the packet-processing dataplane.

Security controls MUST be explicit, testable, observable, and fail safely.

---

# 2. TRUST ZONES

```text
Zone A — Internet / Untrusted clients
        |
        v
Zone B — Public management/API edge
        |
        v
Zone C — Management/Application plane
        |
        +-------- PostgreSQL / durable stores
        |
        +-------- Integration egress
        |
        v
Zone D — Gateway control plane
        |
        v
Zone E — VPP / DPDK dataplane

Zone F — External NAS / RADIUS peers
Zone G — Subscriber networks / access edge
```

Trust MUST NOT flow simply because two processes run on the same machine.

Localhost is not an authorization model.

---

# 3. CORE SECURITY PRINCIPLES

1. Least privilege.
2. Explicit trust boundaries.
3. Defense in depth.
4. Secure defaults.
5. Fail closed for authorization.
6. Fail safely for optional integrations.
7. Auditable privileged operations.
8. No secret leakage through logs/UI/errors.
9. No hidden gateway control path.
10. Security controls must survive service restart and recovery.

---

# 4. ADMINISTRATOR AUTHENTICATION

Administrator authentication MUST support a strong identity model.

Baseline:

- unique user identity;
- password policy;
- secure password hashing;
- session expiration;
- session revocation;
- login throttling;
- lockout/risk controls;
- MFA capability;
- audit of authentication events.

Preferred production capability:

- TOTP/WebAuthn or enterprise IdP integration;
- recovery process with privileged audit;
- step-up authentication for highly sensitive operations.

Do not store plaintext passwords.

---

# 5. ADMIN SESSION SECURITY

Admin browser sessions should use secure cookies where cookie authentication is used:

- Secure;
- HttpOnly;
- appropriate SameSite policy;
- bounded lifetime;
- rotation where appropriate;
- server-side invalidation/revocation capability.

Bearer/API tokens must be protected from browser local-storage exposure where a safer mechanism is available.

Do not log tokens.

---

# 6. SERVICE-TO-SERVICE AUTHENTICATION

Internal services must authenticate to each other.

Preferred mechanisms may include:

- mTLS;
- signed service identity tokens;
- short-lived credentials;
- Unix-domain socket permissions for tightly local components.

Long-lived shared static admin secrets between internal processes are discouraged.

The gateway control path MUST be independently protected from the public management API.

---

# 7. RBAC MODEL

RBAC is the primary authorization model, with contextual constraints where required.

Conceptual hierarchy:

```text
User
  ↓
Role
  ↓
Permissions
  ↓
Resource + Action
  ↓
Optional Scope/Condition
```

Permissions follow stable verbs:

```text
read
list
create
update
delete
approve
execute
export
manage
```

Examples:

```text
subscriber.read
subscriber.manage
session.read
session.disconnect
policy.read
policy.publish
billing.invoice.generate
billing.payment.refund
network.device.manage
audit.read
security.policy.manage
admin.role.manage
```

---

# 8. ROLE DESIGN

The source product includes multiple operational roles. The new role catalogue should cover at least:

- Super Administrator;
- Platform Administrator;
- NOC Operator;
- Network Engineer;
- AAA Operator;
- Billing Manager;
- Finance Operator;
- Support Lead;
- Support Agent;
- Field/Technician user;
- Sales/Collection Agent;
- Reseller/Partner;
- Read-only Auditor/Analyst.

Roles are permission bundles; do not encode business logic directly in role names.

---

# 9. SCOPE / ABAC

Where required, add contextual scope such as:

- tenant;
- organization;
- optional scope;
- branch/site;
- subscriber segment;
- business unit;
- assigned team.

Example:

```text
complaint.update
AND scope IN user's assigned scopes
```

Scope rules must be enforced server-side.

---

# 10. BREAK-GLASS / SUPER-ADMIN

Highly privileged roles require:

- stronger authentication;
- explicit audit;
- restricted assignment;
- session monitoring;
- optional just-in-time approval;
- clear distinction from normal operator roles.

Do not create a universal "admin" permission check around every endpoint.

---

# 11. API AUTHORIZATION

Every protected API handler MUST perform:

```text
Authenticate
 → Resolve principal
 → Resolve tenant/scope
 → Check permission
 → Validate resource ownership/scope
 → Execute
 → Audit if required
```

A route existing in the server is not evidence that it is secured.

Authorization tests are mandatory.

---

# 12. COMMAND AUTHORIZATION

Commands affecting real-world state require explicit permissions.

High-risk examples:

- disconnect subscriber session;
- suspend account;
- publish gateway policy;
- enable firewall bypass;
- change NAT/security rules;
- refund payment;
- delete data;
- restore backup;
- rotate keys;
- change RADIUS secret;
- alter admin roles.

Some commands may require approval or two-person control depending on deployment policy.

---

# 13. GATEWAY SECURITY BOUNDARY

The gateway control plane must be isolated from the packet path.

```text
Management API
    |
 authenticated control command
    v
Session/Policy Control
    |
 protected internal interface
    v
VPP Adapter
    |
 VPP Binary API
    v
VPP
```

Do not permit arbitrary user/API input to become arbitrary VPP calls.

All gateway operations must map to a controlled domain command.

---

# 14. VPP / DPDK HARDENING

Security requirements include:

- dedicated service accounts;
- minimal Linux capabilities;
- controlled hugepage ownership/permissions;
- restricted VPP API socket/interface access;
- controlled startup configuration;
- bounded plugin set;
- protected management interface;
- no public exposure of internal control sockets;
- audit of privileged configuration changes.

The exact OS hardening baseline is deployment-specific but must be documented and reproducible.

---

# 15. FREERADIUS SECURITY

Protect:

- RADIUS shared secrets;
- client/NAS definitions;
- LDAP/AD credentials;
- EAP certificates/keys;
- SQL credentials;
- accounting endpoints.

Requirements:

- strong unique shared secrets;
- source-address/client validation;
- protected administration;
- secure certificate storage;
- replay/abuse considerations;
- RADIUS-specific rate limiting where needed;
- clear proxy trust boundaries.

Never expose RADIUS administration interfaces to untrusted networks.

---

# 16. RADIUS ATTRIBUTE SAFETY

Do not allow arbitrary operator-supplied RADIUS attributes to bypass policy constraints.

Attributes should be classified:

- allowed;
- constrained;
- sensitive;
- internal-only;
- forbidden.

Policy compilation must validate attribute combinations before projection.

---

# 17. INPUT VALIDATION

All external input is untrusted.

Validate:

- JSON/schema shape;
- string lengths;
- enum values;
- numeric ranges;
- IP/CIDR syntax;
- MAC syntax;
- timestamps;
- filenames;
- URLs;
- identifiers;
- bulk-import content.

Use allowlists for high-risk formats.

---

# 18. COMMON APPLICATION SECURITY CONTROLS

Defend against:

- SQL injection;
- command injection;
- SSRF;
- path traversal;
- unsafe file upload;
- XSS;
- CSRF where cookie-authenticated mutations exist;
- open redirects;
- broken object-level authorization;
- excessive data exposure;
- replay attacks;
- brute-force authentication.

Do not assume framework defaults remove all business-level security defects.

---

# 19. CSRF / CORS

For cookie-authenticated browser APIs:

- apply a safe CSRF strategy to state-changing requests;
- configure SameSite correctly;
- do not use wildcard CORS with credentials;
- allow only approved origins.

For bearer APIs, protect token acquisition and storage instead of assuming bearer authentication automatically solves browser risks.

---

# 20. SECRET MANAGEMENT

Secrets include:

- database passwords;
- RADIUS shared secrets;
- payment gateway secrets;
- SMTP credentials;
- SMS/WhatsApp tokens;
- API keys;
- TLS private keys;
- device passwords;
- LDAP credentials;
- AI provider keys.

Rules:

- never commit secrets;
- never put secrets in source-controlled seed files;
- never print them in logs;
- encrypt at rest where practical;
- minimize secret exposure duration;
- support rotation;
- track secret version where required.

The feature sheet's historical credentials are reference data only and MUST NOT be reused.

---

# 21. ENCRYPTION

Use TLS for network communications where supported and appropriate.

Protect stored sensitive material with encryption-at-rest controls appropriate to the deployment.

For application-level secrets, use authenticated encryption where application encryption is required.

Avoid custom cryptographic algorithms.

---

# 22. FILE UPLOAD SECURITY

Uploads may include:

- imports;
- documents;
- diagnostic files;
- backup files;
- CSV data.

Controls:

- allowed type/extension;
- content validation;
- size limit;
- temporary/quarantined storage;
- non-executable filesystem location;
- malware scanning when appropriate;
- authorization on download;
- retention policy.

---

# 23. AUDIT REQUIREMENTS

Audit high-impact actions:

- login/logout/failure;
- role/permission changes;
- subscriber lifecycle changes;
- plan/policy changes;
- session disconnects;
- network rule changes;
- device configuration;
- billing adjustments/refunds;
- data exports;
- backup/restore;
- integration secret changes;
- security control changes.

Audit must capture who, what, where, when, result, correlation ID, and affected entity.

---

# 24. AUDIT IMMUTABILITY

Normal operators cannot edit audit records.

Audit deletion, retention changes, or bulk export require special permissions and are themselves audited.

---

# 25. DATA ACCESS / PII

Classify fields by sensitivity.

UI and exports must respect classification.

Support users should not automatically see:

- payment gateway secret material;
- network device credentials;
- admin recovery data;
- unrelated tenant data;
- sensitive security evidence.

---

# 26. API KEY SECURITY

API keys must support:

- creation with shown-once secret where appropriate;
- scoped permissions;
- expiration;
- rotation;
- revocation;
- last-used information;
- audit.

Store only the verifier/hash needed to validate where possible.

---

# 27. WEBHOOK SECURITY

Outbound:

- signed payload;
- timestamp;
- anti-replay window;
- secret rotation.

Inbound:

- signature verification;
- timestamp validation;
- replay protection;
- schema validation;
- idempotency.

---

# 28. RATE LIMITING / ABUSE CONTROLS

At minimum protect:

- login;
- password reset;
- token issuance;
- search;
- exports;
- diagnostics;
- report generation;
- AI endpoints;
- bulk provisioning;
- webhook ingestion.

Gateway/RADIUS paths need separate high-throughput protection that does not introduce expensive generic web middleware into the packet path.

---

# 29. LOGGING SAFETY

Never log:

- passwords;
- full API tokens;
- private keys;
- RADIUS shared secrets;
- payment secrets;
- session cookies.

Use structured redaction.

Security logs must preserve enough context for incident investigation without becoming another secret store.

---

# 30. DEPENDENCY SECURITY

CI must support:

- dependency vulnerability scanning;
- lockfile integrity;
- image/package provenance where applicable;
- static analysis;
- secret scanning;
- container/base-image scanning if containers are used.

Versions are pinned through the tested platform BOM rather than arbitrary upgrades during feature development.

---

# 31. SECURE DEVELOPMENT LIFECYCLE

Every feature passes:

```text
Threat consideration
→ secure design
→ implementation
→ unit/security tests
→ dependency check
→ integration test
→ audit review
→ release gate
```

Security is not a final hardening phase only.

---

# 32. THREAT MODEL COVERAGE

Core threat categories:

- external attacker;
- compromised subscriber device;
- compromised admin account;
- malicious insider;
- compromised integration credential;
- rogue/compromised NAS;
- gateway control-plane compromise;
- VPP control interface abuse;
- database compromise;
- data exfiltration through reports/exports;
- malicious configuration;
- denial of service;
- supply-chain compromise.

Threat models should be maintained for major feature families.

---

# 33. FAILURE / DEGRADATION SECURITY

Security controls must define behavior when dependencies fail.

Examples:

- identity provider unavailable;
- policy service unavailable;
- database unavailable;
- VPP unavailable;
- notification provider unavailable;
- AI provider unavailable.

Never default to unrestricted network access merely because a control service is down unless that behavior is explicitly designed and approved.

---

# 34. BACKUP / RESTORE SECURITY

Backups must be:

- encrypted;
- integrity checked;
- access controlled;
- retention governed;
- tested by restore;
- audited.

A backup that has never been restored successfully is not a verified recovery asset.

---

# 35. ADMIN OPERATIONAL SAFETY

The UI/API must make the blast radius of a command visible.

Examples:

```text
Disconnect one session
Disconnect subscriber sessions
Disconnect NAS sessions
```

These must be distinct permissions/commands, not ambiguous text strings.

---

# 36. SECURITY TESTING

Tests must include:

- authentication bypass attempts;
- BOLA/IDOR checks;
- privilege escalation;
- CSRF/CORS;
- injection;
- path traversal;
- secret leakage;
- rate-limit bypass;
- malformed RADIUS attributes;
- gateway command authorization;
- tenant isolation;
- export authorization;
- audit integrity.

---

# 37. SECURITY ACCEPTANCE GATE

A module is security-complete when:

- threat boundary is known;
- authN requirements defined;
- authZ permissions mapped;
- sensitive fields classified;
- secrets protected;
- audit requirements implemented;
- rate limits applied;
- failure behavior defined;
- security tests exist;
- privileged operations are traceable.

---

# 38. FINAL SECURITY PRINCIPLE

```text
The browser is not trusted.
The API request is not trusted.
The subscriber device is not trusted.
The integration provider is not trusted by default.
Localhost is not automatically trusted.
Only explicit authenticated and authorized commands cross trust boundaries.
```
