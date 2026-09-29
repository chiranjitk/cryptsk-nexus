import { db } from "@/lib/db";
import { auditConfigChange } from "@/lib/audit";

// ============================================================
// CRYPTSK Nexus — RADIUS Sync Service
// Per: docs/architecture/06_DATABASE §12, 02_GATEWAY §90
//
// Syncs OSS/BSS data → FreeRADIUS tables:
//   Subscriber.radiusUsername + password → radcheck
//   Subscriber → Plan.radiusGroupName    → radusergroup
//   Product.radiusGroupName + bandwidth  → radgroupcheck
//   Product.radiusGroupName + IP pool     → radgroupreply
//
// Design: OSS/BSS is the single source of truth.
//         RADIUS tables are derived/synced — never edited directly.
// ============================================================

type SyncResult = { synced: boolean; tables: string[]; error?: string };

// ─── Subscriber Sync ──────────────────────────────────────────

/** Sync a Subscriber's credentials + group assignment to FreeRADIUS */
export async function syncSubscriberToRadius(params: {
  username: string;
  password: string;        // cleartext password (will be stored in radcheck as Cleartext-Password)
  groupname?: string | null;  // RADIUS group (= Plan.radiusGroupName or Product.radiusGroupName)
  subscriberId: string;
}): Promise<SyncResult> {
  const { username, password, groupname, subscriberId } = params;
  const tables: string[] = [];

  try {
    // 1. Delete existing radcheck entries for this user
    await db.radCheck.deleteMany({ where: { username } });

    // 2. Insert Cleartext-Password check item
    await db.radCheck.create({
      data: {
        username,
        attribute: "Cleartext-Password",
        op: ":=",
        value: password,
        subscriberId,
      },
    });
    tables.push("radcheck");

    // 3. Delete + re-insert radusergroup (if group assigned)
    await db.radUserGroup.deleteMany({ where: { username } });

    if (groupname) {
      await db.radUserGroup.create({
        data: {
          username,
          groupname,
          priority: 1,
          subscriberId,
        },
      });
      tables.push("radusergroup");
    }

    return { synced: true, tables };
  } catch (err: any) {
    return { synced: false, tables, error: err.message };
  }
}

/** Remove a Subscriber from all FreeRADIUS tables (on delete/deactivate) */
export async function deleteSubscriberFromRadius(username: string): Promise<SyncResult> {
  const tables: string[] = [];
  try {
    await db.radCheck.deleteMany({ where: { username } });
    tables.push("radcheck");
    await db.radReply.deleteMany({ where: { username } });
    tables.push("radreply");
    await db.radUserGroup.deleteMany({ where: { username } });
    tables.push("radusergroup");
    return { synced: true, tables };
  } catch (err: any) {
    return { synced: false, tables, error: err.message };
  }
}

// ─── Product Sync ─────────────────────────────────────────────

/** Sync a Product's bandwidth + FUP attributes to FreeRADIUS group tables */
export async function syncProductToRadius(params: {
  groupname: string;           // = Product.radiusGroupName
  downloadSpeed?: number | null;  // kbps
  uploadSpeed?: number | null;    // kbps
  dataLimitGb?: number | null;   // null = unlimited
  fupDataLimitGb?: number | null;
  fupDownloadSpeed?: number | null;
  productId: string;
  nasType?: string;              // "mikrotik" | "cisco" | "pppoe" | "other"
}): Promise<SyncResult> {
  const { groupname, downloadSpeed, uploadSpeed, dataLimitGb, fupDataLimitGb, fupDownloadSpeed, productId, nasType = "mikrotik" } = params;
  const tables: string[] = [];

  try {
    // 1. Delete existing radgroupcheck entries for this group
    await db.radGroupCheck.deleteMany({ where: { groupname } });

    const checks: { attribute: string; op: string; value: string }[] = [];

    // 2. Build bandwidth attributes based on NAS type
    if (downloadSpeed) {
      const downMbps = downloadSpeed / 1000;
      const upMbps = (uploadSpeed || downloadSpeed) / 1000;

      if (nasType === "mikrotik") {
        // Mikrotik-Rate-Limit format: "downM/upM [burst] [limit] [threshold]"
        let rateLimit = `${fmtSpeed(downMbps)}/${fmtSpeed(upMbps)}`;

        // Add FUP if configured
        if (fupDataLimitGb && fupDownloadSpeed) {
          const fupDownMbps = fupDownloadSpeed / 1000;
          rateLimit += ` ${fmtSpeed(fupDownMbps)}/${fmtSpeed(fupDownMbps)}`;
        }

        checks.push({
          attribute: "Mikrotik-Rate-Limit",
          op: ":=",
          value: rateLimit,
        });
      } else {
        // Standard RADIUS attributes (vendor-neutral)
        checks.push({ attribute: "Ascend-Data-Rate", op: ":=", value: String(downloadSpeed) });
        checks.push({ attribute: "Ascend-Xmit-Rate", op: ":=", value: String(uploadSpeed || downloadSpeed) });
      }
    }

    // 3. Data limit → Session-Timeout or volume-based quota
    if (dataLimitGb) {
      // For PPPoE/PPPoE: set daily session timeout based on data limit
      // This is a simplified heuristic — real FUP requires policy engine (Phase 5)
      checks.push({
        attribute: "Session-Timeout",
        op: ":=",
        value: String(86400), // 24h default session timeout
      });
    }

    // 4. Insert all check items
    for (const check of checks) {
      await db.radGroupCheck.create({
        data: { groupname, ...check, productId },
      });
    }
    tables.push("radgroupcheck");

    // 5. Delete + re-insert radgroupreply (IP pool, DNS, etc.)
    await db.radGroupReply.deleteMany({ where: { groupname } });

    // Reply attributes (vendor-neutral defaults)
    const replies: { attribute: string; op: string; value: string }[] = [
      { attribute: "Service-Type", op: ":=", value: "Framed-User" },
      { attribute: "Framed-Protocol", op: ":=", value: "PPP" },
    ];

    for (const reply of replies) {
      await db.radGroupReply.create({
        data: { groupname, ...reply, productId },
      });
    }
    tables.push("radgroupreply");

    return { synced: true, tables };
  } catch (err: any) {
    return { synced: false, tables, error: err.message };
  }
}

/** Remove a Product's group from FreeRADIUS (on delete/deprecate) */
export async function deleteProductFromRadius(groupname: string): Promise<SyncResult> {
  const tables: string[] = [];
  try {
    await db.radGroupCheck.deleteMany({ where: { groupname } });
    tables.push("radgroupcheck");
    await db.radGroupReply.deleteMany({ where: { groupname } });
    tables.push("radgroupreply");
    // Also remove user-group mappings (subscribers will need reassignment)
    await db.radUserGroup.deleteMany({ where: { groupname } });
    tables.push("radusergroup");
    return { synced: true, tables };
  } catch (err: any) {
    return { synced: false, tables, error: err.message };
  }
}

// ─── NAS Sync ─────────────────────────────────────────────────

/** Sync a NAS device to the FreeRADIUS nas table */
export async function syncNasToRadius(params: {
  nasname: string;
  shortname?: string | null;
  type: string;
  secret: string;
  ports?: number | null;
  description?: string | null;
}): Promise<SyncResult> {
  const tables: string[] = [];
  try {
    await db.nas.upsert({
      where: { nasname: params.nasname },
      create: {
        nasname: params.nasname,
        shortname: params.shortname || params.nasname,
        type: params.type,
        secret: params.secret,
        ports: params.ports || null,
        description: params.description || null,
      },
      update: {
        shortname: params.shortname || params.nasname,
        type: params.type,
        secret: params.secret,
        ports: params.ports || null,
        description: params.description || null,
      },
    });
    tables.push("nas");
    return { synced: true, tables };
  } catch (err: any) {
    return { synced: false, tables, error: err.message };
  }
}

/** Remove a NAS device from FreeRADIUS */
export async function deleteNasFromRadius(nasname: string): Promise<SyncResult> {
  try {
    await db.nas.deleteMany({ where: { nasname } });
    return { synced: true, tables: ["nas"] };
  } catch (err: any) {
    return { synced: false, tables: ["nas"], error: err.message };
  }
}

// ─── Full Resync ──────────────────────────────────────────────

/** Resync ALL subscribers + products to FreeRADIUS (admin operation) */
export async function resyncAllToRadius(): Promise<{
  subscribers: SyncResult;
  products: SyncResult;
}> {
  // Sync all active subscribers
  const subscribers = await db.subscriber.findMany({
    where: { status: { in: ["active", "pending_activation"] } },
    select: { id: true, radiusUsername: true, radiusPasswordHash: true, planId: true, plan: { select: { radiusGroupName: true, product: { select: { radiusGroupName: true } } } } },
  });

  let subSynced = 0;
  for (const sub of subscribers) {
    if (!sub.radiusUsername) continue;
    const groupname = sub.plan?.radiusGroupName || sub.plan?.product?.radiusGroupName || null;
    await syncSubscriberToRadius({
      username: sub.radiusUsername,
      password: sub.radiusPasswordHash || "",
      groupname,
      subscriberId: sub.id,
    });
    subSynced++;
  }

  // Sync all active products
  const products = await db.product.findMany({
    where: { status: "active", radiusGroupName: { not: null } },
    select: { id: true, radiusGroupName: true, downloadSpeed: true, uploadSpeed: true, dataLimitGb: true, fupDataLimitGb: true, fupDownloadSpeed: true },
  });

  let prodSynced = 0;
  for (const prod of products) {
    if (!prod.radiusGroupName) continue;
    await syncProductToRadius({
      groupname: prod.radiusGroupName,
      downloadSpeed: prod.downloadSpeed,
      uploadSpeed: prod.uploadSpeed,
      dataLimitGb: prod.dataLimitGb,
      fupDataLimitGb: prod.fupDataLimitGb,
      fupDownloadSpeed: prod.fupDownloadSpeed,
      productId: prod.id,
    });
    prodSynced++;
  }

  return {
    subscribers: { synced: true, tables: [`radcheck:${subSynced}`, `radusergroup:${subSynced}`] },
    products: { synced: true, tables: [`radgroupcheck:${prodSynced}`, `radgroupreply:${prodSynced}`] },
  };
}

// ─── Helpers ──────────────────────────────────────────────────

/** Format speed for Mikrotik-Rate-Limit: 50 → "50M", 0.5 → "512K" */
function fmtSpeed(mbps: number): string {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)}G`;
  if (mbps >= 1) return `${mbps % 1 === 0 ? mbps.toFixed(0) : mbps.toFixed(2)}M`;
  return `${Math.round(mbps * 1024)}K`;
}
