import { db } from "@/lib/db";

// ============================================================
// CRYPTSK Nexus — Policy Compiler
// Per: docs/architecture/02_GATEWAY §29-32
//
// Translates a Policy's config JSON → RADIUS attributes
// (radgroupcheck + radgroupreply entries).
//
// Input: Policy { config: { bandwidth, fup, accessTime, dataTransfer, security, qos } }
// Output: { checkItems: [{attribute, op, value}], replyItems: [{attribute, op, value}] }
//
// The compiler supports multiple NAS types:
//   - mikrotik: uses Mikrotik-Rate-Limit, Mikrotik-* attributes
//   - cisco: uses Cisco-AVPair, vendor-specific
//   - standard: uses vendor-neutral RADIUS attributes
// ============================================================

type PolicyConfig = {
  bandwidth?: {
    downloadKbps?: number;
    uploadKbps?: number;
    burstDownloadKbps?: number;
    burstUploadKbps?: number;
    burstTimeSec?: number;
  };
  fup?: {
    thresholdGb?: number;
    postFupDownloadKbps?: number;
    postFupUploadKbps?: number;
  };
  accessTime?: {
    startTime?: string;  // "09:00"
    endTime?: string;    // "21:00"
    daysOfWeek?: string[];  // ["mon","tue",...]
    sessionTimeoutSec?: number;
  };
  dataTransfer?: {
    dailyLimitGb?: number;
    monthlyLimitGb?: number;
    sessionLimitMb?: number;
  };
  security?: {
    filterId?: string;
    nasFilterId?: string;
    ipPool?: string;
    dnsPrimary?: string;
    dnsSecondary?: string;
  };
  qos?: {
    priority?: number;
    queueType?: "priority" | "fair" | "best_effort";
  };
};

type RadiusAttribute = { attribute: string; op: string; value: string };

type CompiledPolicy = {
  checkItems: RadiusAttribute[];
  replyItems: RadiusAttribute[];
  warnings: string[];
};

export function parsePolicyConfig(configStr: string): PolicyConfig {
  try {
    return JSON.parse(configStr);
  } catch {
    return {};
  }
}

export function compilePolicy(
  config: PolicyConfig,
  options: { nasType?: string; groupname?: string } = {}
): CompiledPolicy {
  const { nasType = "mikrotik" } = options;
  const checkItems: RadiusAttribute[] = [];
  const replyItems: RadiusAttribute[] = [];
  const warnings: string[] = [];

  // ─── Bandwidth ───────────────────────────────────────────
  if (config.bandwidth) {
    const bw = config.bandwidth;
    const downMbps = (bw.downloadKbps || 0) / 1000;
    const upMbps = (bw.uploadKbps || 0) / 1000;

    if (downMbps > 0 && upMbps > 0) {
      if (nasType === "mikrotik") {
        // Mikrotik-Rate-Limit format:
        // "downM/upM [burstDownM/burstUpM burstLimit burstThreshold burstTime]"
        let rate = `${fmtSpeed(downMbps)}/${fmtSpeed(upMbps)}`;

        if (bw.burstDownloadKbps && bw.burstUploadKbps && bw.burstTimeSec) {
          const burstDown = bw.burstDownloadKbps / 1000;
          const burstUp = bw.burstUploadKbps / 1000;
          rate += ` ${fmtSpeed(burstDown)}/${fmtSpeed(burstUp)} ${fmtSpeed(burstDown)}/${fmtSpeed(burstUp)} ${fmtSpeed(downMbps)}/${fmtSpeed(upMbps)} ${bw.burstTimeSec}/${bw.burstTimeSec}/${bw.burstTimeSec}`;
        }

        checkItems.push({
          attribute: "Mikrotik-Rate-Limit",
          op: ":=",
          value: rate,
        });
      } else {
        // Vendor-neutral: Ascend attributes
        checkItems.push({ attribute: "Ascend-Data-Rate", op: ":=", value: String(bw.downloadKbps) });
        checkItems.push({ attribute: "Ascend-Xmit-Rate", op: ":=", value: String(bw.uploadKbps) });
      }
    }
  }

  // ─── FUP (Fair Usage Policy) ────────────────────────────
  if (config.fup) {
    const fup = config.fup;
    if (fup.thresholdGb && fup.postFupDownloadKbps) {
      // For Mikrotik: append FUP rate to Mikrotik-Rate-Limit
      // (The actual FUP enforcement requires the Session Engine + accounting,
      // but we set the post-FUP speed as a secondary rate)
      if (nasType === "mikrotik") {
        // FUP rate is set as a comment in the rate-limit (NAS-side enforcement needs policy engine)
        warnings.push(`FUP: ${fup.thresholdGb}GB threshold → ${fup.postFupDownloadKbps / 1000}Mbps post-FUP (enforced by Session Engine, not RADIUS)`);
      }
      // Set a session timeout based on FUP threshold (rough estimate)
      // If user downloads thresholdGb at max speed, how long until FUP kicks in?
      // thresholdGb * 1024 * 1024 * 1024 / (downloadKbps * 1000 / 8) = seconds
      if (config.bandwidth?.downloadKbps) {
        const fupSeconds = (fup.thresholdGb * 1024 * 1024 * 1024) / (config.bandwidth.downloadKbps * 1000 / 8);
        if (fupSeconds > 0 && fupSeconds < 86400 * 30) {  // cap at 30 days
          // Don't set session timeout for FUP — it's a data limit, not a time limit
          // The Session Engine handles FUP based on accounting data
        }
      }
    }
  }

  // ─── Access Time ─────────────────────────────────────────
  if (config.accessTime) {
    const at = config.accessTime;
    if (at.sessionTimeoutSec) {
      checkItems.push({
        attribute: "Session-Timeout",
        op: ":=",
        value: String(at.sessionTimeoutSec),
      });
    }
    if (at.startTime && at.endTime) {
      // Time-based access restriction (Mikrotik-specific)
      if (nasType === "mikrotik") {
        warnings.push(`Access time: ${at.startTime}-${at.endTime} (time-based enforcement needs NAS scheduler or Session Engine)`);
      }
    }
  }

  // ─── Data Transfer Limits ────────────────────────────────
  if (config.dataTransfer) {
    const dt = config.dataTransfer;
    // Daily/monthly data limits are enforced by the Session Engine (not RADIUS)
    // But we can set a per-session data limit if the NAS supports it
    if (dt.sessionLimitMb) {
      // Some NAS types support per-session octets limits
      checkItems.push({
        attribute: "Session-Data-Limit",
        op: ":=",
        value: String(dt.sessionLimitMb * 1024 * 1024),  // bytes
      });
    }
    if (dt.dailyLimitGb) {
      warnings.push(`Daily limit: ${dt.dailyLimitGb}GB (enforced by Session Engine based on daily radacct totals)`);
    }
    if (dt.monthlyLimitGb) {
      warnings.push(`Monthly limit: ${dt.monthlyLimitGb}GB (enforced by billing cron)`);
    }
  }

  // ─── Security ────────────────────────────────────────────
  if (config.security) {
    const sec = config.security;
    if (sec.filterId) {
      checkItems.push({ attribute: "Filter-Id", op: ":=", value: sec.filterId });
    }
    if (sec.nasFilterId) {
      replyItems.push({ attribute: "NAS-Filter-Id", op: ":=", value: sec.nasFilterId });
    }
    if (sec.ipPool) {
      replyItems.push({ attribute: "Framed-Pool", op: ":=", value: sec.ipPool });
    }
    if (sec.dnsPrimary) {
      replyItems.push({ attribute: "DNS-Server-Primary", op: ":=", value: sec.dnsPrimary });
    }
    if (sec.dnsSecondary) {
      replyItems.push({ attribute: "DNS-Server-Secondary", op: ":=", value: sec.dnsSecondary });
    }
  }

  // ─── QoS ─────────────────────────────────────────────────
  if (config.qos) {
    const qos = config.qos;
    if (qos.priority !== undefined) {
      if (nasType === "mikrotik") {
        // Mikrotik QoS priority (0-8, 0 = highest)
        checkItems.push({
          attribute: "Mikrotik-Wireless-Enc-Algo",
          op: ":=",
          value: String(qos.priority),
        });
      }
    }
  }

  // ─── Default reply items ──────────────────────────────────
  if (replyItems.length === 0) {
    replyItems.push({ attribute: "Service-Type", op: ":=", value: "Framed-User" });
    replyItems.push({ attribute: "Framed-Protocol", op: ":=", value: "PPP" });
  }

  return { checkItems, replyItems, warnings };
}

// ─── Sync compiled policy to RADIUS tables ─────────────────

/** Publish a policy: compile + sync to radgroupcheck/radgroupreply */
export async function publishPolicyToRadius(params: {
  policyId: string;
  groupname: string;
  config: string;
  nasType?: string;
}): Promise<{ synced: boolean; checkCount: number; replyCount: number; warnings: string[] }> {
  const { policyId, groupname, config, nasType = "mikrotik" } = params;
  const policyConfig = parsePolicyConfig(config);
  const compiled = compilePolicy(policyConfig, { nasType, groupname });

  // Delete existing entries for this group
  await db.radGroupCheck.deleteMany({ where: { groupname } });
  await db.radGroupReply.deleteMany({ where: { groupname } });

  // Insert check items
  for (const item of compiled.checkItems) {
    await db.radGroupCheck.create({
      data: { groupname, ...item, productId: policyId },
    });
  }

  // Insert reply items
  for (const item of compiled.replyItems) {
    await db.radGroupReply.create({
      data: { groupname, ...item, productId: policyId },
    });
  }

  return {
    synced: true,
    checkCount: compiled.checkItems.length,
    replyCount: compiled.replyItems.length,
    warnings: compiled.warnings,
  };
}

// ─── Simulator ─────────────────────────────────────────────

/** Simulate a policy: compile + return the RADIUS attributes without deploying */
export function simulatePolicy(
  config: string,
  options: { nasType?: string } = {}
): CompiledPolicy & { configParsed: PolicyConfig } {
  const policyConfig = parsePolicyConfig(config);
  const compiled = compilePolicy(policyConfig, options);
  return { ...compiled, configParsed: policyConfig };
}

// ─── Helpers ───────────────────────────────────────────────

function fmtSpeed(mbps: number): string {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)}G`;
  if (mbps >= 1) return `${mbps % 1 === 0 ? mbps.toFixed(0) : mbps.toFixed(2)}M`;
  return `${Math.round(mbps * 1024)}K`;
}
