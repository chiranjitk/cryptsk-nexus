import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSelfcareAccess } from "@/lib/portal-auth";
import { isRedirectError } from "../common";

// ============================================================
// CRYPTSK Nexus — GET /api/selfcare/support?customerId=<cuid>
// Self-Care "Support" tab (spec §18): the customer's own tickets
// with their public reply threads.
// AUTH: requireSelfcareAccess — customer logins have customerId
// FORCED from their session (a differing query customerId → 404);
// staff pass ?customerId= (RBAC: subscriber.list).
// PRIVACY (hard rule): internal staff notes (TicketReply.isInternal)
// are filtered out server-side and internal-only fields (resolution
// drafts, assignee, createdBy, audit columns) are never selected.
// Only fields a customer may see about their own tickets are returned.
// Read-only.
// ============================================================

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
