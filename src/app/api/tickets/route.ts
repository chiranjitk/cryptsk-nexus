import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";

// ============================================================
// CRYPTSK Nexus — GET/POST /api/tickets
// Support tickets & complaints (Operations & Support module)
// GET  filters: ?status ?priority ?category ?search ?limit
//      search matches subject / ticketNumber / customer displayName
// POST create: auto ticketNumber, SLA deadline per priority policy
//      critical +4h · high +8h · medium +24h · low +72h
// ============================================================

const VALID_CATEGORIES = ["complaint", "technical", "billing", "installation", "other"];
const VALID_PRIORITIES = ["low", "medium", "high", "critical"];
const VALID_STATUSES = ["open", "in_progress", "pending", "resolved", "closed"];

// SLA response policy (hours) per priority
const SLA_HOURS: Record<string, number> = {
  critical: 4,
  high: 8,
  medium: 24,
  low: 72,
};

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission("ticket", "list");

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "";
    const priority = searchParams.get("priority") || "";
    const category = searchParams.get("category") || "";
    const search = searchParams.get("search") || "";
    const limit = Math.min(Number(searchParams.get("limit")) || 200, 500);

    const where: Record<string, unknown> = {};
    if (status && VALID_STATUSES.includes(status)) where.status = status;
    if (priority && VALID_PRIORITIES.includes(priority)) where.priority = priority;
    if (category && VALID_CATEGORIES.includes(category)) where.category = category;
    if (search) {
      where.OR = [
        { subject: { contains: search } },
        { ticketNumber: { contains: search } },
        { customer: { displayName: { contains: search } } },
      ];
    }

    const [tickets, open, inProgress, pending, resolved, closed, critical, unassigned] =
      await Promise.all([
        db.ticket.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          include: {
            customer: { select: { id: true, displayName: true, customerCode: true } },
            subscriber: { select: { id: true, radiusUsername: true, subscriberCode: true } },
            assignee: { select: { id: true, name: true, email: true } },
            _count: { select: { replies: true } },
          },
        }),
        // Global stats — real parallel counts, independent of list filters
        db.ticket.count({ where: { status: "open" } }),
        db.ticket.count({ where: { status: "in_progress" } }),
        db.ticket.count({ where: { status: "pending" } }),
        db.ticket.count({ where: { status: "resolved" } }),
        db.ticket.count({ where: { status: "closed" } }),
        db.ticket.count({ where: { priority: "critical", status: { in: ["open", "in_progress", "pending"] } } }),
        db.ticket.count({ where: { assignedTo: null, status: { in: ["open", "in_progress", "pending"] } } }),
      ]);

    return NextResponse.json({
      tickets,
      stats: { open, inProgress, pending, resolved, closed, critical, unassigned },
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/tickets] GET failed:", err);
    return NextResponse.json({ error: "Failed to fetch tickets" }, { status: 500 });
  }
}

// POST /api/tickets — create a support ticket
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("ticket", "create");
    const body = await req.json();
    const { customerId, subscriberId, category, priority, subject, description } = body;

    if (!subject || !subject.trim() || !description || !description.trim()) {
      return NextResponse.json({ error: "subject and description are required" }, { status: 400 });
    }
    if (category && !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "invalid category" }, { status: 400 });
    }
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return NextResponse.json({ error: "invalid priority" }, { status: 400 });
    }

    // Validate optional relations
    if (customerId) {
      const customer = await db.customer.findUnique({ where: { id: customerId } });
      if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 400 });
    }
    if (subscriberId) {
      const subscriber = await db.subscriber.findUnique({ where: { id: subscriberId } });
      if (!subscriber) return NextResponse.json({ error: "Subscriber not found" }, { status: 400 });
    }

    const effectivePriority = priority || "medium";
    const count = await db.ticket.count();
    const ticketNumber = `TKT-2026-${String(count + 1).padStart(5, "0")}`;

    // SLA deadline per priority policy
    const slaDueAt = new Date(Date.now() + (SLA_HOURS[effectivePriority] || 24) * 3600 * 1000);

    const ticket = await db.ticket.create({
      data: {
        ticketNumber,
        customerId: customerId || null,
        subscriberId: subscriberId || null,
        category: category || "other",
        priority: effectivePriority,
        status: "open",
        subject: subject.trim(),
        description: description.trim(),
        slaDueAt,
        createdBy: user.id,
      },
      include: {
        customer: { select: { id: true, displayName: true, customerCode: true } },
        subscriber: { select: { id: true, radiusUsername: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    await auditCreateEntity({
      userId: user.id, action: "create", resource: "ticket",
      resourceId: ticket.id, resourceName: ticketNumber,
      after: { ticketNumber, category: ticket.category, priority: ticket.priority, subject: ticket.subject },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/tickets] POST failed:", err);
    return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
  }
}
