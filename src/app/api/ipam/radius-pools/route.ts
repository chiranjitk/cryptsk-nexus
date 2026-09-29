import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// Helper: convert an IPv4 string to a 32-bit integer
function ipToLong(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

// Helper: convert a 32-bit integer back to IPv4 string
function longToIp(num: number): string {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255,
  ].join(".");
}

// ─── GET: Query radippool entries ─────────────────────────────
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const { searchParams } = new URL(request.url);
    const poolName = searchParams.get("pool_name") || "";
    const status = searchParams.get("status") || "";

    // Build dynamic WHERE clause
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (poolName) {
      conditions.push(`pool_name = $${paramIndex++}`);
      params.push(poolName);
    }

    if (status === "active") {
      conditions.push(`expiry_time > NOW()`);
    } else if (status === "expired") {
      conditions.push(`expiry_time <= NOW()`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Fetch pool entries
    const pools = await db.$queryRawUnsafe<any[]>(
      `SELECT * FROM radippool ${whereClause} ORDER BY pool_name, "FramedIPAddress"`,
      ...params,
    );

    // Fetch aggregate stats (always without status filter)
    const [statsResult, activeResult, expiredResult] = await Promise.all([
      db.$queryRawUnsafe<[{ count: bigint }]>(
        poolName
          ? `SELECT COUNT(*) as count FROM radippool WHERE pool_name = $1`
          : `SELECT COUNT(*) as count FROM radippool`,
        ...(poolName ? [poolName] : []),
      ),
      db.$queryRawUnsafe<[{ count: bigint }]>(
        poolName
          ? `SELECT COUNT(*) as count FROM radippool WHERE pool_name = $1 AND expiry_time > NOW()`
          : `SELECT COUNT(*) as count FROM radippool WHERE expiry_time > NOW()`,
        ...(poolName ? [poolName] : []),
      ),
      db.$queryRawUnsafe<[{ count: bigint }]>(
        poolName
          ? `SELECT COUNT(*) as count FROM radippool WHERE pool_name = $1 AND expiry_time <= NOW()`
          : `SELECT COUNT(*) as count FROM radippool WHERE expiry_time <= NOW()`,
        ...(poolName ? [poolName] : []),
      ),
    ]);

    // Get unique pool names
    const uniqueNamesResult = await db.$queryRawUnsafe<[{ pool_name: string }]>(
      poolName
        ? `SELECT DISTINCT pool_name FROM radippool WHERE pool_name = $1`
        : `SELECT DISTINCT pool_name FROM radippool`,
      ...(poolName ? [poolName] : []),
    );

    const stats = {
      totalPools: Number(statsResult[0].count),
      activeLeases: Number(activeResult[0].count),
      expiredLeases: Number(expiredResult[0].count),
      uniquePoolNames: uniqueNamesResult.length,
    };

    // Serialize INET fields to string for JSON response
    const serializedPools = pools.map((entry) => ({
      id: entry.id,
      pool_name: entry.pool_name,
      FramedIPAddress: typeof entry.FramedIPAddress === "string" ? entry.FramedIPAddress : String(entry.FramedIPAddress),
      NASIPAddress: entry.NASIPAddress || "",
      pool_key: entry.pool_key || "",
      CalledStationId: entry.CalledStationId || "",
      CallingStationId: entry.CallingStationId || "",
      expiry_time: entry.expiry_time ? entry.expiry_time.toISOString() : null,
      username: entry.username || "",
    }));

    return NextResponse.json({ pools: serializedPools, stats });
  } catch (error) {
    console.error("Radius Pools GET error:", error);
    return NextResponse.json({ error: "Failed to fetch RADIUS pool data" }, { status: 500 });
  }
}

// ─── POST: Manage radippool entries ───────────────────────────
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const body = await request.json();
    const { action } = body;

    switch (action) {
      // ── populate-pool: Bulk-insert IPs into radippool ────────
      case "populate-pool": {
        const { poolName, subnetId, startIp, endIp, gateway } = body;
        if (!poolName || !subnetId || !startIp || !endIp) {
          return NextResponse.json(
            { error: "poolName, subnetId, startIp, and endIp are required" },
            { status: 400 },
          );
        }

        const start = ipToLong(startIp);
        const end = ipToLong(endIp);

        if (start > end) {
          return NextResponse.json(
            { error: "startIp must be less than or equal to endIp" },
            { status: 400 },
          );
        }

        const totalIps = end - start + 1;
        if (totalIps > 10000) {
          return NextResponse.json(
            { error: "Range too large (max 10,000 IPs per populate call)" },
            { status: 400 },
          );
        }

        // Generate IP entries and batch insert
        const values: string[] = [];
        for (let i = 0; i <= end - start; i++) {
          const ip = longToIp(start + i);
          values.push(`('${poolName.replace(/'/g, "''")}', '${ip}'::inet, '${(gateway || "").replace(/'/g, "''")}', NOW())`);
        }

        // Use a single INSERT with multiple value rows, but limit batch size
        const batchSize = 500;
        let inserted = 0;
        for (let i = 0; i < values.length; i += batchSize) {
          const batch = values.slice(i, i + batchSize);
          await db.$executeRawUnsafe(
            `INSERT INTO radippool (pool_name, "FramedIPAddress", "NASIPAddress", expiry_time) VALUES ${batch.join(", ")} ON CONFLICT DO NOTHING`,
          );
          inserted += batch.length;
        }

        return NextResponse.json({
          success: true,
          message: `Populated ${inserted} IPs into pool "${poolName}"`,
          totalInserted: inserted,
        });
      }

      // ── clear-pool: Delete all entries for a pool ────────────
      case "clear-pool": {
        const { poolName } = body;
        if (!poolName) {
          return NextResponse.json({ error: "poolName is required" }, { status: 400 });
        }

        const result = await db.$executeRawUnsafe(
          `DELETE FROM radippool WHERE pool_name = $1`,
          poolName,
        );

        return NextResponse.json({
          success: true,
          message: `Cleared all entries from pool "${poolName}"`,
        });
      }

      // ── release-lease: Expire a single lease by id ───────────
      case "release-lease": {
        const { id } = body;
        if (!id) {
          return NextResponse.json({ error: "id is required" }, { status: 400 });
        }

        const result = await db.$executeRawUnsafe(
          `UPDATE radippool SET expiry_time = NOW() WHERE id = $1`,
          id,
        );

        return NextResponse.json({
          success: true,
          message: `Lease ${id} released (expired)`,
        });
      }

      // ── sync-to-ipam: Bridge radippool ↔ IPAM IpAddress ─────
      case "sync-to-ipam": {
        const { poolName, subnetId } = body;
        if (!poolName || !subnetId) {
          return NextResponse.json(
            { error: "poolName and subnetId are required" },
            { status: 400 },
          );
        }

        // Fetch all active leases for this pool from radippool
        const activeLeases = await db.$queryRawUnsafe<any[]>(
          `SELECT * FROM radippool WHERE pool_name = $1 AND expiry_time > NOW()`,
          poolName,
        );

        const activeIpSet = new Set<string>();
        const syncedCount = { created: 0, updated: 0, freed: 0 };

        // For each active lease, create or update corresponding IpAddress
        for (const lease of activeLeases) {
          const ipStr = typeof lease.FramedIPAddress === "string"
            ? lease.FramedIPAddress
            : String(lease.FramedIPAddress);
          const username = lease.username || "";
          activeIpSet.add(ipStr);

          const existing = await db.ipAddress.findFirst({
            where: { address: ipStr, subnetId },
          });

          if (existing) {
            // Update existing IP to "used" with FR-POOL description
            await db.ipAddress.update({
              where: { id: existing.id },
              data: {
                status: "used",
                description: username ? `FR-POOL:${username}` : "FR-POOL",
              },
            });
            syncedCount.updated++;
          } else {
            // Create new IP address record
            await db.ipAddress.create({
              data: {
                address: ipStr,
                subnetId,
                status: "used",
                description: username ? `FR-POOL:${username}` : "FR-POOL",
              },
            });
            syncedCount.created++;
          }
        }

        // Mark IPs in IPAM (for this subnet) that are NOT in the active pool as "free"
        // Only touch IPs that were previously marked with FR-POOL description
        const subnetIps = await db.ipAddress.findMany({
          where: {
            subnetId,
            status: "used",
            description: { startsWith: "FR-POOL" },
          },
        });

        for (const ip of subnetIps) {
          if (!activeIpSet.has(ip.address)) {
            await db.ipAddress.update({
              where: { id: ip.id },
              data: { status: "free", description: "" },
            });
            syncedCount.freed++;
          }
        }

        return NextResponse.json({
          success: true,
          message: `Synced pool "${poolName}" to IPAM subnet ${subnetId}`,
          activeLeases: activeLeases.length,
          ...syncedCount,
        });
      }

      default:
        return NextResponse.json(
          { error: "Unknown action. Valid: populate-pool, clear-pool, release-lease, sync-to-ipam" },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("Radius Pools POST error:", error);
    return NextResponse.json({ error: "Failed to process RADIUS pool request" }, { status: 500 });
  }
}
