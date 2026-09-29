import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";
import { SEVERITY_LABELS, parseSyslogLine } from "@/lib/monitoring";

// ============================================================
// CRYPTSK Nexus — GET/POST /api/monitoring/syslog
// GET  ?severity=0-7 &search= &hours=24 &limit=100 (max 500)
//      Real syslog entries from devices/network gear ingested via
//      the UDP listener (port 30514) or POST. Returns entries plus
//      per-severity counts across the whole window.
// POST ingest (audit-logged):
//      - application/json: {message, host?, tag?, facility?, severity?}
//      - text/plain: raw RFC3164/5424 lines (one per \n, PRI parsed,
//        tolerant — parse failures never throw, remainder kept as message)
// RBAC: GET monitoring.list · POST monitoring.update
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
    let hours = Number(searchParams.get("hours"));
    if (!Number.isFinite(hours) || hours <= 0) hours = 24;
    hours = Math.min(Math.round(hours), 720);
    let limit = Number(searchParams.get("limit"));
    if (!Number.isFinite(limit) || limit <= 0) limit = 100;
    limit = Math.min(Math.round(limit), 500);
    const severityParam = searchParams.get("severity");
    const search = (searchParams.get("search") || "").trim();
    const windowStart = new Date(Date.now() - hours * 3600 * 1000);

    const where: Record<string, unknown> = { receivedAt: { gte: windowStart } };
    if (severityParam !== null && severityParam !== "") {
      const severity = Number(severityParam);
      if (!Number.isInteger(severity) || severity < 0 || severity > 7) {
        return NextResponse.json({ error: "severity must be an integer 0-7" }, { status: 400 });
      }
      where.severity = severity;
    }
    if (search) {
      where.OR = [{ message: { contains: search } }, { host: { contains: search } }, { tag: { contains: search } }];
    }

    const [entries, total, severityGroups] = await Promise.all([
      db.syslogEntry.findMany({ where, orderBy: { receivedAt: "desc" }, take: limit }),
      db.syslogEntry.count({ where }),
      db.syslogEntry.groupBy({ by: ["severity"], where: { receivedAt: { gte: windowStart } }, _count: true }),
    ]);

    // Per-severity counts across the whole window (independent of search filter)
    const counts: Record<(typeof SEVERITY_LABELS)[number], number> = {
      emerg: 0, alert: 0, crit: 0, err: 0, warning: 0, notice: 0, info: 0, debug: 0,
    };
    for (const g of severityGroups) {
      if (g.severity >= 0 && g.severity <= 7) counts[SEVERITY_LABELS[g.severity]] = g._count;
    }

    return NextResponse.json({
      entries: entries.map((e) => ({
        id: e.id.toString(),
        facility: e.facility,
        severity: e.severity,
        severityLabel: SEVERITY_LABELS[e.severity] ?? "info",
        tag: e.tag,
        host: e.host,
        sourceIp: e.sourceIp,
        message: e.message,
        receivedAt: e.receivedAt,
      })),
      counts,
      total,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/monitoring/syslog] GET failed:", err);
    return NextResponse.json({ error: "Failed to fetch syslog" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("monitoring", "update");
    const contentType = req.headers.get("content-type") || "";

    let rows: Array<{ facility: number; severity: number; tag: string | null; host: string | null; sourceIp: string | null; message: string }> = [];

    if (contentType.includes("text/plain")) {
      // Raw RFC3164/5424 line(s) — split, tolerant parse, never throw
      const raw = await req.text();
      const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 500);
      const senderIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
      rows = lines.map((line) => {
        const parsed = parseSyslogLine(line);
        return {
          facility: parsed.facility,
          severity: parsed.severity,
          tag: parsed.tag,
          host: parsed.host,
          sourceIp: senderIp,
          message: parsed.message,
        };
      });
    } else {
      // JSON single entry
      const body = await req.json();
      if (typeof body.message !== "string" || !body.message.trim()) {
        return NextResponse.json({ error: "message is required" }, { status: 400 });
      }
      const facility = Number.isInteger(body.facility) && body.facility >= 0 && body.facility <= 23 ? body.facility : 16;
      const severity = Number.isInteger(body.severity) && body.severity >= 0 && body.severity <= 7 ? body.severity : 6;
      rows = [
        {
          facility,
          severity,
          tag: typeof body.tag === "string" && body.tag.trim() ? body.tag.trim() : null,
          host: typeof body.host === "string" && body.host.trim() ? body.host.trim() : null,
          sourceIp: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
          message: body.message.trim(),
        },
      ];
    }

    if (!rows.length) {
      return NextResponse.json({ error: "no syslog lines to ingest" }, { status: 400 });
    }

    const result = await db.syslogEntry.createMany({ data: rows });
    const ingested = result.count;

    await auditCreateEntity({
      userId: user.id,
      action: "create",
      resource: "syslog",
      resourceName: `ingest-${ingested}`,
      metadata: { ingested, contentType: contentType || "application/json" },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ ingested }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/monitoring/syslog] POST failed:", err);
    return NextResponse.json({ error: "Failed to ingest syslog" }, { status: 500 });
  }
}
