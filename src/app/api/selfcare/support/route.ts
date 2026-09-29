import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { isRedirectError } from "../common";

// ============================================================
// CRYPTSK Nexus — GET /api/selfcare/support?customerId=<cuid>
// Self-Care "Support" tab (spec §18): the customer's own tickets
// with their public reply threads.
// PRIVACY (hard rule): internal staff notes (TicketReply.isInternal)
// are filtered out server-side and internal-only fields (resolution
// drafts, assignee, createdBy, audit columns) are never selected.
// Only fields a customer may see about their own tickets are returned.
// RBAC: subscriber.list. Read-only.
// ============================================================

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("subscriber", "list");

    const customerId = new URL(req.url).searchParams.get("customerId");
    if (!customerId) {
      return NextResponse.json({ error: "customerId is required" }, { status: 400 });
    }

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
