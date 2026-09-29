import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { requireSelfcareAccess } from "@/lib/portal-auth";
import { authOptions } from "@/lib/auth";
import { auditUpdate } from "@/lib/audit";
import { isRedirectError } from "../../../common";

// ============================================================
// CRYPTSK Nexus — POST /api/selfcare/support/[id]/replies
// Self-Care "Support" tab (spec §18): the customer replies on the
// public thread of their OWN ticket.
// AUTH: requireSelfcareAccess — customer sessions only; the ticket's
// customerId must equal the session's customerId (unknown or foreign
// ticket → 404, never a leak that it exists). Staff get 403 — they
// reply from the admin ticket desk (/api/tickets/[id]/replies).
// PRIVACY (hard rule): isInternal is FORCED false — a customer can
// never write an internal staff note, only public thread replies.
// userId is stored null (ticket_replies.user_id is a staff users FK);
// authorship is the denormalized authorName from the session.
// Behavior: replying to a resolved/closed ticket REOPENS it
// (status → open, resolvedAt/closedAt cleared, reopenedAt stamped,
// updatedAt bumps).
// ============================================================

export const dynamic = "force-dynamic";

// POST /api/selfcare/support/[id]/replies — reply to own ticket (customer mode ONLY)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSelfcareAccess({});

    // Staff preview stays read-only — staff replies go through the
    // admin ticket desk.
    if (ctx.mode !== "customer") {
      return NextResponse.json({ error: "Staff accounts use the admin ticket desk" }, { status: 403 });
    }

    const { id } = await params;

    // Ownership scope — another customer's (or unknown) ticket → 404
    const ticket = await db.ticket.findUnique({
      where: { id },
      select: { id: true, customerId: true, ticketNumber: true, status: true },
    });
    if (!ticket || ticket.customerId !== ctx.customerId) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (message.length < 1 || message.length > 4000) {
      return NextResponse.json({ error: "Reply message is required" }, { status: 400 });
    }

    // Display author from the customer session (portal ids are not
    // staff users FKs, so the reply's userId stays null)
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    const authorName = sessionUser?.customerName || sessionUser?.name || "Customer";

    const reply = await db.ticketReply.create({
      data: {
        ticketId: id,
        userId: null,
        authorName,
        message,
        isInternal: false, // FORCED — customers can never write internal notes
      },
      select: { id: true, authorName: true, message: true, createdAt: true },
    });

    // Customer-reopen: a reply on a resolved/closed ticket reopens it
    let reopened = false;
    let ticketStatus = ticket.status;
    if (ticket.status === "closed" || ticket.status === "resolved") {
      const updated = await db.ticket.update({
        where: { id },
        data: { status: "open", resolvedAt: null, closedAt: null, reopenedAt: new Date() },
        select: { status: true },
      });
      reopened = true;
      ticketStatus = updated.status; // "open" (updatedAt auto-bumps)
    }

    // Audit never blocks the response (rbac.ts convention); userId null —
    // audit_events.user_id is a staff users FK (portal ids would fail).
    // action "update" — a reply is engagement on an existing ticket.
    try {
      await auditUpdate({
        userId: null,
        resource: "ticket",
        resourceId: ticket.id,
        resourceName: ticket.ticketNumber,
        after: { replyLength: message.length, reopened },
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
      });
    } catch (auditErr) {
      console.error("[/api/selfcare/support/[id]/replies] failed to audit reply:", auditErr);
    }

    return NextResponse.json({ reply: { ...reply, ticketStatus } }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/selfcare/support/[id]/replies] POST failed:", err);
    return NextResponse.json({ error: "Failed to post reply" }, { status: 500 });
  }
}
