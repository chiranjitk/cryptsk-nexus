import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { requireSelfcareAccess } from "@/lib/portal-auth";
import { authOptions } from "@/lib/auth";
import { auditCreateEntity } from "@/lib/audit";
import { isRedirectError } from "../common";

// ============================================================
// CRYPTSK Nexus — GET/POST /api/selfcare/support
// Self-Care "Support" tab (spec §18): the customer's own tickets
// with their public reply threads.
// GET  ?customerId=<cuid> — the customer's own tickets + public replies.
// POST { subject, category?, priority?, description } — create a ticket
//      (customer mode ONLY — staff get 403: they use the admin desk).
// AUTH: requireSelfcareAccess — customer logins have customerId
// FORCED from their session (a differing query customerId → 404);
// staff pass ?customerId= (RBAC: subscriber.list).
// PRIVACY (hard rule): internal staff notes (TicketReply.isInternal)
// are filtered out server-side and internal-only fields (resolution
// drafts, assignee, createdBy, audit columns) are never selected.
// Only fields a customer may see about their own tickets are returned.
// Audit userId stays NULL — audit_events.user_id FKs to the staff users
// table; the portal identity lives in Ticket.createdBy ("portal:<id>").
// ============================================================

// Same maps as the staff desk (/api/tickets) — kept in sync by convention
const VALID_CATEGORIES = ["complaint", "technical", "billing", "installation", "other"];
const VALID_PRIORITIES = ["low", "medium", "high", "critical"];

// SLA response policy (hours) per priority
const SLA_HOURS: Record<string, number> = {
  critical: 4,
  high: 8,
  medium: 24,
  low: 72,
};

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ctx = await requireSelfcareAccess({
      customerId: searchParams.get("customerId"),
      subscriberId: searchParams.get("subscriberId"),
    });

    if (!ctx.customerId) {
      return ctx.mode === "staff"
        ? NextResponse.json({ error: "customerId is required" }, { status: 400 })
        : NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
    const customerId = ctx.customerId;

    // Never leak another customer's tickets — unknown id → 404
    const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const tickets = await db.ticket.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        status: true,
        priority: true,
        category: true,
        description: true,
        createdAt: true,
        slaDueAt: true,
        resolvedAt: true,
        replies: {
          where: { isInternal: false }, // internal notes never leave the back office
          orderBy: { createdAt: "asc" },
          select: { authorName: true, message: true, createdAt: true },
        },
      },
    });

    return NextResponse.json({ tickets });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/selfcare/support] GET failed:", err);
    return NextResponse.json({ error: "Failed to load support tickets" }, { status: 500 });
  }
}

// POST /api/selfcare/support — create a ticket (customer mode ONLY)
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSelfcareAccess({});

    // Staff preview stays read-only — the back office raises tickets on
    // the admin ticket desk (/api/tickets).
    if (ctx.mode !== "customer") {
      return NextResponse.json({ error: "Staff accounts use the admin ticket desk" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const { category, priority } = body;

    if (subject.length < 3 || subject.length > 150) {
      return NextResponse.json({ error: "Subject must be between 3 and 150 characters" }, { status: 400 });
    }
    if (description.length < 5 || description.length > 4000) {
      return NextResponse.json({ error: "Please describe the issue in at least 5 characters" }, { status: 400 });
    }
    if (category && !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "invalid category" }, { status: 400 });
    }
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return NextResponse.json({ error: "invalid priority" }, { status: 400 });
    }

    // Session identity for the audit trail — requireSelfcareAccess has
    // already proven this is a live customer login (status re-checked).
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    const portalUserId = String(sessionUser?.id ?? "");

    const effectivePriority = priority || "medium";
    // Same SLA deadline policy as the staff desk
    const slaDueAt = new Date(Date.now() + (SLA_HOURS[effectivePriority] || 24) * 3600 * 1000);

    // Ticket numbers share the staff desk's scheme (TKT-2026-#####), so a
    // concurrent staff create can win the unique race — recompute the count
    // and retry (max 3 attempts).
    const createPortalTicket = async () => {
      const count = await db.ticket.count();
      const ticketNumber = `TKT-2026-${String(count + 1).padStart(5, "0")}`;
      return db.ticket.create({
        data: {
          ticketNumber,
          customerId: ctx.customerId,
          subscriberId: ctx.subscriberId, // nullable — may have no service yet
          category: category || "other",
          priority: effectivePriority,
          status: "open",
          subject,
          description,
          slaDueAt,
          createdBy: `portal:${portalUserId}`,
        },
        select: {
          id: true,
          ticketNumber: true,
          subject: true,
          status: true,
          category: true,
          priority: true,
          createdAt: true,
          slaDueAt: true,
        },
      });
    };

    let ticket: Awaited<ReturnType<typeof createPortalTicket>> | null = null;
    for (let attempt = 0; attempt < 3 && !ticket; attempt++) {
      try {
        ticket = await createPortalTicket();
      } catch (e: any) {
        if (e?.code !== "P2002") throw e; // unique-race only — recompute + retry
      }
    }
    if (!ticket) {
      throw new Error("ticketNumber collision persisted after 3 attempts");
    }

    // Audit never blocks the response (rbac.ts convention); userId MUST be
    // null — audit_events.user_id is a staff users FK (portal ids would fail).
    try {
      await auditCreateEntity({
        userId: null,
        resource: "ticket",
        resourceId: ticket.id,
        resourceName: ticket.ticketNumber,
        after: { ticketNumber: ticket.ticketNumber, category: ticket.category, priority: ticket.priority, subject: ticket.subject },
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
      });
    } catch (auditErr) {
      console.error("[/api/selfcare/support] failed to audit ticket create:", auditErr);
    }

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/selfcare/support] POST failed:", err);
    return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
  }
}
