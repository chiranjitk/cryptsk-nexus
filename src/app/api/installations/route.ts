import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";

// ============================================================
// CRYPTSK Nexus — GET/POST /api/installations
// Field installation jobs (new / upgrade / relocation / maintenance)
// GET  filters: ?status ?search (installNumber|technicianName) ?upcoming=1
//      upcoming → scheduledAt >= now, status scheduled, soonest first (limit 10)
// POST create: auto installNumber INS-2026-NNNNN
// ============================================================

const VALID_STATUSES = ["scheduled", "in_progress", "completed", "failed", "rescheduled"];

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission("installation", "list");

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "";
    const search = searchParams.get("search") || "";
    const upcoming = searchParams.get("upcoming") === "1";

    const where: Record<string, unknown> = {};
    if (status && VALID_STATUSES.includes(status)) where.status = status;
    if (search) {
      where.OR = [
        { installNumber: { contains: search } },
        { technicianName: { contains: search } },
      ];
    }
    if (upcoming) {
      where.status = "scheduled";
      where.scheduledAt = { gte: new Date() };
    }

    const [installations, scheduled, inProgress, completed, failed, rescheduled, today] =
      await Promise.all([
        db.installation.findMany({
          where,
          orderBy: upcoming ? { scheduledAt: "asc" } : { createdAt: "desc" },
          take: upcoming ? 10 : 200,
          include: {
            customer: { select: { id: true, displayName: true, customerCode: true } },
            subscriber: { select: { id: true, radiusUsername: true, subscriberCode: true } },
          },
        }),
        // Global stats — real parallel counts, independent of list filters
        db.installation.count({ where: { status: "scheduled" } }),
        db.installation.count({ where: { status: "in_progress" } }),
        db.installation.count({ where: { status: "completed" } }),
        db.installation.count({ where: { status: "failed" } }),
        db.installation.count({ where: { status: "rescheduled" } }),
        db.installation.count({
          where: {
            scheduledAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
              lt: new Date(new Date().setHours(24, 0, 0, 0)),
            },
          },
        }),
      ]);

    return NextResponse.json({
      installations,
      stats: { scheduled, inProgress, completed, failed, rescheduled, today },
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/installations] GET failed:", err);
    return NextResponse.json({ error: "Failed to fetch installations" }, { status: 500 });
  }
}

// POST /api/installations — schedule an installation job
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("installation", "create");
    const body = await req.json();
    const { customerId, subscriberId, type, scheduledAt, technicianName, address, notes } = body;

    if (!customerId) {
      return NextResponse.json({ error: "customerId is required" }, { status: 400 });
    }
    if (!scheduledAt || isNaN(new Date(scheduledAt).getTime())) {
      return NextResponse.json({ error: "A valid scheduledAt date is required" }, { status: 400 });
    }

    const customer = await db.customer.findUnique({ where: { id: customerId } });
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 400 });

    if (subscriberId) {
      const subscriber = await db.subscriber.findUnique({ where: { id: subscriberId } });
      if (!subscriber) return NextResponse.json({ error: "Subscriber not found" }, { status: 400 });
    }

    const count = await db.installation.count();
    const installNumber = `INS-2026-${String(count + 1).padStart(5, "0")}`;

    const installation = await db.installation.create({
      data: {
        installNumber,
        customerId,
        subscriberId: subscriberId || null,
        type: type || "new",
        status: "scheduled",
        scheduledAt: new Date(scheduledAt),
        technicianName: technicianName?.trim() || null,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
        createdBy: user.id,
      },
      include: {
        customer: { select: { id: true, displayName: true, customerCode: true } },
        subscriber: { select: { id: true, radiusUsername: true } },
      },
    });

    await auditCreateEntity({
      userId: user.id, action: "create", resource: "installation",
      resourceId: installation.id, resourceName: installNumber,
      after: { installNumber, type: installation.type, scheduledAt: installation.scheduledAt },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ installation }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/installations] POST failed:", err);
    return NextResponse.json({ error: "Failed to create installation" }, { status: 500 });
  }
}
