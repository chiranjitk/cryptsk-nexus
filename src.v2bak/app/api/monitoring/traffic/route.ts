import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

// ============================================================
// CRYPTSK Nexus — GET /api/monitoring/traffic?limit=10&hours=168
// Top talkers by total RADIUS accounting bytes over a window,
// enriched with the subscriber's display name and plan via the
// username → subscribers.radiusUsername link (same real join as
// the dashboard top-talkers panel).
// RBAC: monitoring.list
// ============================================================

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission("monitoring", "list");

    const { searchParams } = new URL(req.url);
    let limit = Number(searchParams.get("limit"));
    if (!Number.isFinite(limit) || limit <= 0) limit = 10;
    limit = Math.min(Math.round(limit), 50);
    let hours = Number(searchParams.get("hours"));
    if (!Number.isFinite(hours) || hours <= 0) hours = 168;
    hours = Math.min(Math.round(hours), 720);

    const windowStart = new Date(Date.now() - hours * 3600 * 1000);

    const [talkerRows, totalsRows] = await Promise.all([
      db.$queryRaw<Array<{ username: string; inb: bigint; outb: bigint; sessions: bigint; lastSeen: Date | null }>>`
        SELECT username,
               SUM(COALESCE(acctinputoctets, 0)) AS inb,
               SUM(COALESCE(acctoutputoctets, 0)) AS outb,
               COUNT(*) AS sessions,
               MAX(COALESCE(acctstoptime, acctstarttime)) AS "lastSeen"
        FROM radacct
        WHERE acctstarttime >= ${windowStart} AND username IS NOT NULL AND username <> ''
        GROUP BY username
        ORDER BY (SUM(COALESCE(acctinputoctets, 0)) + SUM(COALESCE(acctoutputoctets, 0))) DESC
        LIMIT ${limit}`,
      db.$queryRaw<Array<{ inb: bigint | null; outb: bigint | null; sessions: bigint; users: bigint }>>`
        SELECT SUM(COALESCE(acctinputoctets, 0)) AS inb,
               SUM(COALESCE(acctoutputoctets, 0)) AS outb,
               COUNT(*) AS sessions,
               COUNT(DISTINCT username) AS users
        FROM radacct
        WHERE acctstarttime >= ${windowStart}`,
    ]);

    // Enrich with subscriber display name + plan (real BSS join)
    const usernames = talkerRows.map((r) => r.username);
    const subs = usernames.length
      ? await db.subscriber.findMany({
          where: { radiusUsername: { in: usernames } },
          select: {
            radiusUsername: true,
            fullName: true,
            customer: { select: { displayName: true } },
            plan: { select: { name: true } },
          },
        })
      : [];
    const subMap = new Map(
      subs.map((s) => [s.radiusUsername, { displayName: s.fullName || s.customer?.displayName || null, planName: s.plan?.name ?? null }])
    );

    const topTalkers = talkerRows.map((r) => {
      const enriched = subMap.get(r.username);
      const inBytes = Number(r.inb);
      const outBytes = Number(r.outb);
      return {
        username: r.username,
        displayName: enriched?.displayName ?? null,
        planName: enriched?.planName ?? null,
        inBytes,
        outBytes,
        totalBytes: inBytes + outBytes,
        sessions: Number(r.sessions),
        lastSeen: r.lastSeen,
      };
    });

    const totals = totalsRows[0]
      ? {
          inBytes: Number(totalsRows[0].inb ?? 0),
          outBytes: Number(totalsRows[0].outb ?? 0),
          sessions: Number(totalsRows[0].sessions),
          distinctUsers: Number(totalsRows[0].users),
        }
      : { inBytes: 0, outBytes: 0, sessions: 0, distinctUsers: 0 };

    return NextResponse.json({ topTalkers, totals });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/monitoring/traffic] GET failed:", err);
    return NextResponse.json({ error: "Failed to compute traffic analytics" }, { status: 500 });
  }
}
