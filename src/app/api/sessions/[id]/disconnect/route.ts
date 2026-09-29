import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreate } from "@/lib/audit";
import { parseRadAcctId, serializeSession } from "../../serialize";

// ============================================================
// POST /api/sessions/[id]/disconnect — administratively stop a
// live RADIUS session.
//
// 1. If SESSION_ENGINE_URL is configured, a real CoA/Disconnect-
//    Request is attempted via the session engine. On success the
//    NAS sends Accounting-Stop to FreeRADIUS, which writes the
//    stop record itself — we do NOT touch the DB in that case.
// 2. Fallback (engine unset or unreachable): mark the session
//    stopped directly in the radacct table (acctstoptime=now,
//    terminate cause Admin-Reset) so billing/UI reflect reality.
//
// The `source` field in the response always reports the path
// that was actually used. Permission: session.execute
// ============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("session", "execute");
    const { id } = await params;

    const radacctid = parseRadAcctId(id);
    if (radacctid === null) {
      return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
    }

    let row = await db.radAcct.findUnique({ where: { radacctid } });
    if (!row) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (row.acctstoptime !== null) {
      return NextResponse.json(
        { error: "Session already stopped", stoppedAt: row.acctstoptime.toISOString() },
        { status: 409 }
      );
    }

    const engineUrl = process.env.SESSION_ENGINE_URL;
    let source: "session-engine" | "database" = "database";
    let engineError: string | null = null;

    if (engineUrl) {
      try {
        const res = await fetch(
          `${engineUrl.replace(/\/+$/, "")}/sessions/${id}`,
          { method: "DELETE", signal: AbortSignal.timeout(2500) }
        );
        if (res.ok) {
          source = "session-engine";
        } else {
          engineError = `session-engine responded ${res.status}`;
        }
      } catch (err: any) {
        engineError = err?.message || "session-engine unreachable";
      }
    } else {
      engineError = "SESSION_ENGINE_URL not configured";
    }

    if (source === "database") {
      // Fallback: authoritative DB write. Never reports "session-engine".
      const now = new Date();
      const sessionTimeSec = row.acctstarttime
        ? Math.max(0, Math.floor((now.getTime() - row.acctstarttime.getTime()) / 1000))
        : row.acctsessiontime !== null
          ? Number(row.acctsessiontime)
          : 0;

      const updated = await db.radAcct.update({
        where: { radacctid },
        data: {
          acctstoptime: now,
          acctsessiontime: sessionTimeSec,
          acctterminatecause: "Admin-Reset",
        },
      });
      row = updated;
    }
    // session-engine path: row stays as loaded (still open until the
    // NAS Accounting-Stop arrives) — we don't fabricate a stop record.

    await auditCreate({
      userId: user.id,
      action: "execute",
      resource: "session",
      resourceId: row.radacctid.toString(),
      resourceName: row.username || row.framedipaddress,
      before: { acctstoptime: null, status: "active" },
      after: { source, acctterminatecause: source === "database" ? "Admin-Reset" : row.acctterminatecause },
      metadata: { source, engineConfigured: Boolean(engineUrl), engineError },
      result: "success",
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
      userAgent: req.headers.get("user-agent") || undefined,
    });

    return NextResponse.json({ success: true, source, session: serializeSession(row) });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json(
      { error: "Failed to disconnect session", detail: err?.message },
      { status: 500 }
    );
  }
}
