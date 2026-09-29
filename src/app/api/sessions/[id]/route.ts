import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { parseRadAcctId, serializeSession } from "../serialize";

// ============================================================
// GET /api/sessions/[id] — single RADIUS accounting session
// Permission: session.read
// ============================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("session", "read");
    const { id } = await params;

    const radacctid = parseRadAcctId(id);
    if (radacctid === null) {
      return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
    }

    const row = await db.radAcct.findUnique({ where: { radacctid } });
    if (!row) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session: serializeSession(row) });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch session" }, { status: 500 });
  }
}
