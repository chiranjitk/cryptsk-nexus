import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditUpdate, auditDelete } from "@/lib/audit";

// ============================================================
// CRYPTSK Nexus — GET/PATCH/DELETE /api/tickets/[id]
// Ticket detail + workflow state machine.
// Transitions: open→in_progress|pending · in_progress→pending|resolved
//              pending→in_progress|resolved · resolved→closed|open(reopen)
// closed is terminal (only reachable from resolved). Resolve requires
// resolution text; reopen clears resolution/resolvedAt/closedAt.
// ============================================================

const VALID_CATEGORIES = ["complaint", "technical", "billing", "installation", "other"];
const VALID_PRIORITIES = ["low", "medium", "high", "critical"];

const SLA_HOURS: Record<string, number> = { critical: 4, high: 8, medium: 24, low: 72 };

const TICKET_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "pending"],
  in_progress: ["pending", "resolved"],
  pending: ["in_progress", "resolved"],
  resolved: ["closed", "open"],
  closed: [],
};

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

// GET /api/tickets/[id] — full detail (ticket + replies + relations)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("ticket", "read");
    const { id } = await params;

    const ticket = await db.ticket.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, displayName: true, customerCode: true, email: true, phone: true } },
        subscriber: { select: { id: true, radiusUsername: true, subscriberCode: true, fullName: true, status: true } },
        assignee: { select: { id: true, name: true, email: true } },
        replies: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // Related context: invoices count for the linked customer (real, optional)
    const invoiceCount = ticket.customerId
      ? await db.invoice.count({ where: { customerId: ticket.customerId } })
      : 0;

    return NextResponse.json({ ticket, invoiceCount });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/tickets/[id]] GET failed:", err);
    return NextResponse.json({ error: "Failed to fetch ticket" }, { status: 500 });
  }
}

// PATCH /api/tickets/[id] — workflow + field updates
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("ticket", "update");
    const { id } = await params;
    const body = await req.json();
    const { status, priority, category, resolution } = body;
    const assignedTo = "assignedTo" in body ? (body.assignedTo || null) : undefined;
    const slaDueAt = "slaDueAt" in body ? (body.slaDueAt ? new Date(body.slaDueAt) : null) : undefined;

    const current = await db.ticket.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return NextResponse.json({ error: "invalid priority" }, { status: 400 });
    }
    if (category && !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "invalid category" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (priority) data.priority = priority;
    if (category) data.category = category;
    if (assignedTo !== undefined) {
      if (assignedTo) {
        const assignee = await db.user.findUnique({ where: { id: assignedTo } });
        if (!assignee) return NextResponse.json({ error: "Assignee user not found" }, { status: 400 });
      }
      data.assignedTo = assignedTo;
    }
    if (slaDueAt !== undefined) data.slaDueAt = slaDueAt;

    // ---- Status workflow validation ----
    if (status && status !== current.status) {
      const allowed = TICKET_TRANSITIONS[current.status] || [];
      if (!allowed.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status transition: ${current.status} → ${status}` },
          { status: 400 }
        );
      }

      data.status = status;

      if (status === "resolved") {
        const resolutionText = typeof resolution === "string" ? resolution.trim() : "";
        if (!resolutionText) {
          return NextResponse.json(
            { error: "A resolution note is required to resolve a ticket" },
            { status: 400 }
          );
        }
        data.resolution = resolutionText;
        data.resolvedAt = new Date();
        data.closedAt = null;
      }

      if (status === "closed") {
        // Only reachable from resolved (transition map enforces this)
        data.closedAt = new Date();
      }

      if (status === "open") {
        // Reopen — clear resolution artifacts
        data.resolution = null;
        data.resolvedAt = null;
        data.closedAt = null;
      }
    }

    // Priority change on a still-active ticket recomputes the SLA deadline
    const finalStatus = (data.status as string) || current.status;
    if (data.priority && !["resolved", "closed"].includes(finalStatus)) {
      data.slaDueAt = new Date(Date.now() + (SLA_HOURS[data.priority as string] || 24) * 3600 * 1000);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No changes provided" }, { status: 400 });
    }

    const ticket = await db.ticket.update({
      where: { id },
      data,
      include: {
        customer: { select: { id: true, displayName: true, customerCode: true } },
        subscriber: { select: { id: true, radiusUsername: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    await auditUpdate({
      userId: user.id, action: "update", resource: "ticket",
      resourceId: ticket.id, resourceName: ticket.ticketNumber,
      before: { status: current.status, priority: current.priority, category: current.category, assignedTo: current.assignedTo },
      after: { status: ticket.status, priority: ticket.priority, category: ticket.category, assignedTo: ticket.assignedTo },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ ticket });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/tickets/[id]] PATCH failed:", err);
    return NextResponse.json({ error: "Failed to update ticket" }, { status: 500 });
  }
}

// DELETE /api/tickets/[id] — only closed tickets are deletable
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("ticket", "delete");
    const { id } = await params;

    const ticket = await db.ticket.findUnique({ where: { id } });
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    if (ticket.status !== "closed") {
      return NextResponse.json(
        { error: `Only closed tickets can be deleted — this ticket is "${ticket.status}". Close it first.` },
        { status: 409 }
      );
    }

    await db.ticket.delete({ where: { id } });

    await auditDelete({
      userId: user.id, action: "delete", resource: "ticket",
      resourceId: id, resourceName: ticket.ticketNumber,
      before: { ticketNumber: ticket.ticketNumber, status: ticket.status, subject: ticket.subject },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/tickets/[id]] DELETE failed:", err);
    return NextResponse.json({ error: "Failed to delete ticket" }, { status: 500 });
  }
}
