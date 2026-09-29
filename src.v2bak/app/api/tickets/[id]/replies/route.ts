import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

// ============================================================
// CRYPTSK Nexus — GET/POST /api/tickets/[id]/replies
// Reply thread (customer-visible replies + internal notes).
// GET  replies ordered createdAt asc (permission: ticket read)
// POST { message, isInternal? } — author from session user
//      (permission: ticket update — posting a reply is engagement)
// ============================================================

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

// GET /api/tickets/[id]/replies
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("ticket", "read");
    const { id } = await params;

    const ticket = await db.ticket.findUnique({ where: { id }, select: { id: true } });
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const replies = await db.ticketReply.findMany({
      where: { ticketId: id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ replies });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/tickets/[id]/replies] GET failed:", err);
    return NextResponse.json({ error: "Failed to fetch replies" }, { status: 500 });
  }
}

// POST /api/tickets/[id]/replies — add reply / internal note
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("ticket", "update");
    const { id } = await params;
    const body = await req.json();
    const { message, isInternal } = body;

    if (!message || !String(message).trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const ticket = await db.ticket.findUnique({ where: { id }, select: { id: true } });
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const reply = await db.ticketReply.create({
      data: {
        ticketId: id,
        userId: user.id,
        authorName: user.name || user.email,
        message: String(message).trim(),
        isInternal: Boolean(isInternal),
      },
    });

    return NextResponse.json({ reply }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/tickets/[id]/replies] POST failed:", err);
    return NextResponse.json({ error: "Failed to post reply" }, { status: 500 });
  }
}
