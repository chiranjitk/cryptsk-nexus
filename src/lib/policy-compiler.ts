/**
 * CRYPTSK Nexus — Policy Compiler
 * Per: docs/architecture/12_IMPLEMENTATION_PHASE_ROADMAP.md Phase 5
 *
 * Compiles effective subscriber policy → RADIUS enforcement attributes.
 *
 * Resolution chain (highest priority first):
 *   1. Subscriber-level overrides (currentSpeedDown/Up, sessionTimeout, idleTimeout)
 *   2. Subscriber.radiusGroup (RadiusGroup.speedLimitDown/Up, dataLimit, sessionTimeout)
 *   3. Plan.group (linked RadiusGroup on the plan)
 *   4. Plan itself (downloadSpeed/uploadSpeed, dataLimitGb)
 *
 * Output: compiled RADIUS attributes for enforcement adapters
 * (Mikrotik-Rate-Limit, Session-Timeout, Idle-Timeout, Filter-Id, etc.)
 */

export interface ResolvedPolicy {
  // ─── Bandwidth ───────────────────────────────────────────
  speedDownKbps: number;
  speedUpKbps: number;
  burstDownKbps?: number;
  burstUpKbps?: number;
  burstDurationSec?: number;
  ceilingDownKbps?: number;
  ceilingUpKbps?: number;

  // ─── Data Transfer / FUP ─────────────────────────────────
  dataLimitMb: number | null;
  fupSpeedDownKbps?: number; // speed after FUP
  fupSpeedUpKbps?: number;

  // ─── Session / Time ──────────────────────────────────────
  sessionTimeoutSec: number | null;
  idleTimeoutSec: number | null;
  maxConcurrentSessions: number;

  // ─── Resolution Chain (for transparency/explanation) ───
  chain: Array<{
    source: string;
    speedDown: number;
    speedUp: number;
    dataLimitMb: number | null;
    sessionTimeout: number | null;
    idleTimeout: number | null;
  }>;
}

export interface CompiledEnforcement {
  // RADIUS attributes (standard + vendor-specific)
  attributes: Array<{
    name: string;
    value: string;
    op: string; // := for assignment, == for comparison
  }>;
  // Mikrotik-specific (most common NAS in Indian ISPs)
  mikrotikRateLimit: string;
  // Human-readable explanation
  explanation: string;
}

export interface PolicyInput {
  radiusGroup?: {
    name: string;
    speedLimitDown: number;
    speedLimitUp: number;
    dataLimit: number | null;
    sessionTimeout: number | null;
  } | null;
  plan?: {
    name: string;
    downloadSpeed: number; // Kbps
    uploadSpeed: number; // Kbps
    dataLimitGb: number | null;
    maxConcurrentSessions: number;
    burstSpeed?: number | null;
    burstDuration?: number | null;
    sessionTimeout?: number | null;
    group?: {
      name: string;
      speedLimitDown: number;
      speedLimitUp: number;
      dataLimit: number | null;
      sessionTimeout: number | null;
    } | null;
  } | null;
  currentSpeedDown?: number; // Mbps
  currentSpeedUp?: number; // Mbps
  sessionTimeout?: number | null;
  idleTimeout?: number | null;
}

// ─── Resolve effective policy (deterministic) ─────────────────
export function resolvePolicy(input: PolicyInput): ResolvedPolicy {
  const chain: ResolvedPolicy["chain"] = [];

  // Level 1: Subscriber radius group (highest priority)
  if (input.radiusGroup?.speedLimitDown) {
    chain.push({
      source: `radiusGroup (${input.radiusGroup.name})`,
      speedDown: input.radiusGroup.speedLimitDown * 1000,
      speedUp: input.radiusGroup.speedLimitUp * 1000,
      dataLimitMb: input.radiusGroup.dataLimit,
      sessionTimeout: input.radiusGroup.sessionTimeout,
      idleTimeout: null,
    });
  }

  // Level 2: Plan's linked group
  if (input.plan?.group?.speedLimitDown) {
    chain.push({
      source: `plan.group (${input.plan.group.name})`,
      speedDown: input.plan.group.speedLimitDown * 1000,
      speedUp: input.plan.group.speedLimitUp * 1000,
      dataLimitMb: input.plan.group.dataLimit,
      sessionTimeout: input.plan.group.sessionTimeout,
      idleTimeout: null,
    });
  }

  // Level 3: Plan itself
  if (input.plan?.downloadSpeed) {
    chain.push({
      source: `plan (${input.plan.name})`,
      speedDown: input.plan.downloadSpeed,
      speedUp: input.plan.uploadSpeed,
      dataLimitMb: input.plan.dataLimitGb ? Math.round(input.plan.dataLimitGb * 1024) : null,
      sessionTimeout: input.plan.sessionTimeout ?? null,
      idleTimeout: null,
    });
  }

  // Level 4: Subscriber-level current speeds (lowest priority)
  if (input.currentSpeedDown) {
    chain.push({
      source: `subscriber.currentSpeed`,
      speedDown: input.currentSpeedDown * 1000,
      speedUp: (input.currentSpeedUp || 0) * 1000,
      dataLimitMb: null,
      sessionTimeout: input.sessionTimeout ?? null,
      idleTimeout: input.idleTimeout ?? null,
    });
  }

  // Effective = first (highest priority) source
  const effective = chain[0] || {
    source: "default",
    speedDown: 0,
    speedUp: 0,
    dataLimitMb: null,
    sessionTimeout: null,
    idleTimeout: null,
  };

  return {
    speedDownKbps: effective.speedDown,
    speedUpKbps: effective.speedUp,
    dataLimitMb: effective.dataLimitMb,
    sessionTimeoutSec: effective.sessionTimeout,
    idleTimeoutSec: effective.idleTimeout,
    maxConcurrentSessions: input.plan?.maxConcurrentSessions ?? 1,
    burstDownKbps: input.plan?.burstSpeed || undefined,
    burstUpKbps: input.plan?.burstSpeed || undefined,
    burstDurationSec: input.plan?.burstDuration || undefined,
    chain,
  };
}

// ─── Compile to RADIUS enforcement attributes ────────────────
export function compileEnforcement(policy: ResolvedPolicy): CompiledEnforcement {
  const attributes: CompiledEnforcement["attributes"] = [];

  // ── Session-Timeout (RFC 2865) ──
  if (policy.sessionTimeoutSec) {
    attributes.push({
      name: "Session-Timeout",
      value: String(policy.sessionTimeoutSec),
      op: ":=",
    });
  }

  // ── Idle-Timeout (RFC 2865) ──
  if (policy.idleTimeoutSec) {
    attributes.push({
      name: "Idle-Timeout",
      value: String(policy.idleTimeoutSec),
      op: ":=",
    });
  }

  // ── Mikrotik-Rate-Limit (vendor-specific, most common in Indian ISPs) ──
  // Format: <down>K/<up>K <burst_down>K/<burst_up>K <burst_duration> <ceiling_down>K/<ceiling_up>K
  // Example: 51200K/25600K 102400K/51200K 32 0/0
  let mikrotikRateLimit = "";
  if (policy.speedDownKbps > 0) {
    const down = policy.speedDownKbps;
    const up = policy.speedUpKbps;
    const burstDown = policy.burstDownKbps || 0;
    const burstUp = policy.burstUpKbps || 0;
    const burstDur = policy.burstDurationSec || 0;
    const ceilDown = policy.ceilingDownKbps || 0;
    const ceilUp = policy.ceilingUpKbps || 0;
    mikrotikRateLimit = `${down}K/${up}K ${burstDown}K/${burstUp}K ${burstDur} ${ceilDown}K/${ceilUp}K`;
    attributes.push({
      name: "Mikrotik-Rate-Limit",
      value: mikrotikRateLimit,
      op: ":=",
    });
  }

  // ── Filter-Id (for ACL/policy mapping on NAS) ──
  if (policy.dataLimitMb) {
    attributes.push({
      name: "Filter-Id",
      value: `data_limit_${policy.dataLimitMb}MB`,
      op: ":=",
    });
  }

  // ── Explanation (human-readable) ──
  const chainExplain = policy.chain
    .map((c) => `  ${c.source}: ↓${c.speedDown}Kbps ↑${c.speedUp}Kbps${c.dataLimitMb ? ` data=${c.dataLimitMb}MB` : ""}${c.sessionTimeout ? ` timeout=${c.sessionTimeout}s` : ""}`)
    .join("\n");

  const explanation = `Effective policy (resolved from ${policy.chain.length} sources, highest priority first):
${chainExplain}

Compiled enforcement:
  Speed: ↓${policy.speedDownKbps}Kbps ↑${policy.speedUpKbps}Kbps${policy.burstDownKbps ? ` (burst: ${policy.burstDownKbps}Kbps for ${policy.burstDurationSec}s)` : ""}
  Data limit: ${policy.dataLimitMb ? policy.dataLimitMb + "MB" : "unlimited"}
  Session timeout: ${policy.sessionTimeoutSec ? policy.sessionTimeoutSec + "s" : "none"}
  Idle timeout: ${policy.idleTimeoutSec ? policy.idleTimeoutSec + "s" : "none"}
  Max concurrent sessions: ${policy.maxConcurrentSessions}

RADIUS attributes:
${attributes.map((a) => `  ${a.name} ${a.op} "${a.value}"`).join("\n")}
`;

  return { attributes, mikrotikRateLimit, explanation };
}

// ─── Convenience: resolve + compile in one call ──────────────
export function evaluatePolicy(input: PolicyInput): {
  resolved: ResolvedPolicy;
  compiled: CompiledEnforcement;
} {
  const resolved = resolvePolicy(input);
  const compiled = compileEnforcement(resolved);
  return { resolved, compiled };
}
