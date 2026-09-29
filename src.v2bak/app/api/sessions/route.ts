import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { serializeSession } from "./serialize";

// ============================================================
// GET /api/sessions — RADIUS accounting sessions (radacct table)
// Real source of truth: FreeRADIUS radacct. No session-engine
// dependency — the engine (if deployed) only handles CoA.
//
// Query params:
//   status=active|history|all  (default active)
//   search=<username|ip|mac>   (case-insensitive contains)
//   nas=<nasipaddress>
//   limit=50  page=1
// ============================================================
export async function GET(req: NextRequest) {
  try {
    await requirePermission("session", "list");

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "active";
    const search = (searchParams.get("search") || "").trim();
    const nas = (searchParams.get("nas") || "").trim();
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), 200);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);

    // Row filters
    const where: Record<string, unknown> = {};
    if (status === "active") where.acctstoptime = null;
    else if (status === "history") where.acctstoptime = { not: null };
    // status === "all" → no stop-time filter
    if (nas) where.nasipaddress = nas;
    if (search) {
      where.OR = [
        { username: { contains: search, mode: "insensitive" } },
        { framedipaddress: { contains: search } },
        { callingstationid: { contains: search, mode: "insensitive" } },
        { acctsessionid: { contains: search, mode: "insensitive" } },
      ];
    }

    // Start of the current UTC day
    const nowDate = new Date();
    const startOfUtcDay = new Date(
      Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate())
    );

    const [rows, total, activeCount, historyCount, todayCount, trafficAgg, nasRows, nasRegistry] =
      await Promise.all([
        db.radAcct.findMany({
          where: where as Prisma.RadAcctWhereInput,
          orderBy: { acctstarttime: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.radAcct.count({ where: where as Prisma.RadAcctWhereInput }),
        db.radAcct.count({ where: { acctstoptime: null } }),
        db.radAcct.count({ where: { acctstoptime: { not: null } } }),
        db.radAcct.count({ where: { acctstarttime: { gte: startOfUtcDay } } }),
        db.radAcct.aggregate({
          where: { acctstarttime: { gte: startOfUtcDay } },
          _sum: { acctinputoctets: true, acctoutputoctets: true },
        }),
        // Distinct NAS IPs seen in accounting data (for the filter dropdown)
        db.radAcct.findMany({
          distinct: ["nasipaddress"],
          select: { nasipaddress: true },
          orderBy: { nasipaddress: "asc" },
        }),
        // NAS registry — enrich IPs with friendly shortnames
        db.nas.findMany({
          select: { nasname: true, shortname: true },
          orderBy: { nasname: "asc" },
        }),
      ]);

    const shortnameByIp = new Map<string, string>();
    for (const n of nasRegistry) {
      if (n.shortname) shortnameByIp.set(n.nasname, n.shortname);
    }

    const sessions = rows.map(serializeSession);
    const stats = {
      activeCount,
      historyCount,
      todayCount,
      totalTrafficBytesToday:
        (trafficAgg._sum.acctinputoctets ? Number(trafficAgg._sum.acctinputoctets) : 0) +
        (trafficAgg._sum.acctoutputoctets ? Number(trafficAgg._sum.acctoutputoctets) : 0),
    };
    const nasList = nasRows
      .map((r) => r.nasipaddress)
      .filter((ip): ip is string => Boolean(ip))
      .map((ip) => ({ ip, shortname: shortnameByIp.get(ip) || null }));

    return NextResponse.json({ sessions, total, page, pageSize: limit, stats, nasList });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}
