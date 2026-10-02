import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─────────────────────────────────────────────────────────────
// GET — List milestones, list cycles, get active cycle
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = req.nextUrl;
    const action = searchParams.get("action") || "list";

    // ── List milestones for a plan ──
    if (action === "list-milestones") {
      const planId = searchParams.get("planId");
      if (!planId) {
        return NextResponse.json(
          { error: "Missing required query param: planId" },
          { status: 400 }
        );
      }

      const rows = await db.billingMilestone.findMany({
        where: { planId },
        orderBy: { priority: "asc" },
      });

      // Map storage units → UI shape (thresholdDataMb → thresholdGb)
      const milestones = rows.map((m) => ({
        ...m,
        thresholdGb: Math.round(((m.thresholdDataMb || 0) / 1024) * 100) / 100,
      }));

      return NextResponse.json({ milestones });
    }

    // ── List billing cycles for a subscriber ──
    if (action === "list-cycles") {
      const subscriberId = searchParams.get("subscriberId");
      const search = (searchParams.get("search") || "").trim(); // subscriber code or name

      if (!subscriberId && !search) {
        return NextResponse.json(
          { error: "Missing required query param: subscriberId or search" },
          { status: 400 }
        );
      }

      const page = parseInt(searchParams.get("page") || "1");
      const limit = parseInt(searchParams.get("limit") || "25");
      const status = searchParams.get("status");

      const where: Record<string, unknown> = {};
      if (subscriberId) {
        where.subscriberId = subscriberId;
      } else if (search) {
        where.Subscriber = {
          OR: [
            { code: { contains: search, mode: "insensitive" as const } },
            { name: { contains: search, mode: "insensitive" as const } },
          ],
        };
      }
      if (status) {
        where.status = status;
      }

      const [rows, total] = await Promise.all([
        db.userBillingCycle.findMany({
          where,
          include: { Subscriber: { select: { id: true, code: true, name: true } } },
          orderBy: { cycleStartDate: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.userBillingCycle.count({ where }),
      ]);

      // Map storage units → the shape the UI renders (Mb → GB, ISO dates)
      const cycles = rows.map(({ Subscriber, ...c }) => ({
        id: c.id,
        subscriberId: c.subscriberId,
        subscriberCode: Subscriber?.code ?? null,
        subscriberName: Subscriber?.name ?? null,
        planName: null,
        cycleStart: c.cycleStartDate,
        cycleEnd: c.cycleEndDate,
        dataUsedGb: Math.round(((c.usedTotalMb || 0) / 1024) * 100) / 100,
        dataAllottedGb: Math.round(((c.allottedTotalMb || 0) / 1024) * 100) / 100,
        currentSpeedDownKbps: 0,
        currentSpeedUpKbps: 0,
        currentMilestone: c.currentMilestoneId,
        status: (c.status || "active").toUpperCase(),
        nextResetAt: c.cycleEndDate,
      }));

      return NextResponse.json({ cycles, total, page, limit });
    }

    // ── Get the currently active cycle for a subscriber ──
    if (action === "active-cycle") {
      const subscriberId = searchParams.get("subscriberId");
      if (!subscriberId) {
        return NextResponse.json(
          { error: "Missing required query param: subscriberId" },
          { status: 400 }
        );
      }

      const activeCycle = await db.userBillingCycle.findFirst({
        where: {
          subscriberId,
          status: "active",
        },
        orderBy: { cycleStartDate: "desc" },
      });

      return NextResponse.json({ activeCycle: activeCycle || null });
    }

    return NextResponse.json(
      { error: "Unknown action. Valid GET actions: list-milestones, list-cycles, active-cycle" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Cyclic billing GET error:", error);
    return NextResponse.json({ error: "Failed to fetch cyclic billing data" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
// POST — Create / update / delete milestones and cycles
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = req.nextUrl;
    const action = searchParams.get("action");
    const body = await req.json();

    // ── Create milestone ──
    if (action === "create-milestone") {
      const { planId, name, thresholdDataMb, speedDownKbps, speedUpKbps, priority, enabled } = body;

      if (!planId || !name) {
        return NextResponse.json(
          { error: "Missing required fields: planId, name" },
          { status: 400 }
        );
      }

      // Verify plan exists
      const plan = await db.plan.findUnique({ where: { id: planId } });
      if (!plan) {
        return NextResponse.json({ error: "Plan not found" }, { status: 404 });
      }

      const milestone = await db.billingMilestone.create({
        data: {
          planId,
          name,
          thresholdDataMb: thresholdDataMb ?? 0,
          speedDownKbps: speedDownKbps ?? 0,
          speedUpKbps: speedUpKbps ?? 0,
          priority: priority ?? 0,
          enabled: enabled ?? true,
        },
      });

      return NextResponse.json({ milestone }, { status: 201 });
    }

    // ── Update milestone ──
    if (action === "update-milestone") {
      const { id, name, thresholdDataMb, speedDownKbps, speedUpKbps, priority, enabled } = body;

      if (!id) {
        return NextResponse.json(
          { error: "Missing required field: id" },
          { status: 400 }
        );
      }

      const existing = await db.billingMilestone.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: "Billing milestone not found" }, { status: 404 });
      }

      const milestone = await db.billingMilestone.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(thresholdDataMb !== undefined && { thresholdDataMb }),
          ...(speedDownKbps !== undefined && { speedDownKbps }),
          ...(speedUpKbps !== undefined && { speedUpKbps }),
          ...(priority !== undefined && { priority }),
          ...(enabled !== undefined && { enabled }),
        },
      });

      return NextResponse.json({ milestone });
    }

    // ── Delete milestone ──
    if (action === "delete-milestone") {
      const { id } = body;

      if (!id) {
        return NextResponse.json(
          { error: "Missing required field: id" },
          { status: 400 }
        );
      }

      const existing = await db.billingMilestone.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: "Billing milestone not found" }, { status: 404 });
      }

      await db.billingMilestone.delete({ where: { id } });

      return NextResponse.json({ success: true, message: "Billing milestone deleted" });
    }

    // ── Create billing cycle ──
    if (action === "create-cycle") {
      const {
        subscriberId,
        cycleType,
        cycleStartDate,
        allottedTimeSec,
        allottedUploadMb,
        allottedDownloadMb,
        allottedTotalMb,
      } = body;

      if (!subscriberId || !cycleStartDate) {
        return NextResponse.json(
          { error: "Missing required fields: subscriberId, cycleStartDate" },
          { status: 400 }
        );
      }

      // Verify subscriber exists
      const subscriber = await db.subscriber.findUnique({
        where: { id: subscriberId },
      });
      if (!subscriber) {
        return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
      }

      const cycle = await db.userBillingCycle.create({
        data: {
          subscriberId,
          cycleType: cycleType ?? "MONTHLY",
          cycleStartDate: new Date(cycleStartDate),
          allottedTimeSec: allottedTimeSec ?? 0,
          allottedUploadMb: allottedUploadMb ?? 0,
          allottedDownloadMb: allottedDownloadMb ?? 0,
          allottedTotalMb: allottedTotalMb ?? 0,
        },
      });

      return NextResponse.json({ cycle }, { status: 201 });
    }

    // ── Update billing cycle (usage + status) ──
    if (action === "update-cycle") {
      const {
        id,
        usedTimeSec,
        usedUploadMb,
        usedDownloadMb,
        usedTotalMb,
        topupUploadMb,
        topupDownloadMb,
        topupTotalMb,
        currentMilestoneId,
        status,
      } = body;

      if (!id) {
        return NextResponse.json(
          { error: "Missing required field: id" },
          { status: 400 }
        );
      }

      const existing = await db.userBillingCycle.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: "Billing cycle not found" }, { status: 404 });
      }

      // If a milestone ID is provided, verify it exists
      if (currentMilestoneId) {
        const milestoneExists = await db.billingMilestone.findUnique({
          where: { id: currentMilestoneId },
        });
        if (!milestoneExists) {
          return NextResponse.json({ error: "Referenced milestone not found" }, { status: 404 });
        }
      }

      // If status is being set to "completed" or "expired", set cycleEndDate
      const updateData: Record<string, unknown> = {};
      if (usedTimeSec !== undefined) updateData.usedTimeSec = usedTimeSec;
      if (usedUploadMb !== undefined) updateData.usedUploadMb = usedUploadMb;
      if (usedDownloadMb !== undefined) updateData.usedDownloadMb = usedDownloadMb;
      if (usedTotalMb !== undefined) updateData.usedTotalMb = usedTotalMb;
      if (topupUploadMb !== undefined) updateData.topupUploadMb = topupUploadMb;
      if (topupDownloadMb !== undefined) updateData.topupDownloadMb = topupDownloadMb;
      if (topupTotalMb !== undefined) updateData.topupTotalMb = topupTotalMb;
      if (currentMilestoneId !== undefined) updateData.currentMilestoneId = currentMilestoneId || null;
      if (status !== undefined) {
        updateData.status = status;
        if (status === "completed" || status === "expired") {
          updateData.cycleEndDate = new Date();
        }
      }

      const cycle = await db.userBillingCycle.update({
        where: { id },
        data: updateData,
      });

      return NextResponse.json({ cycle });
    }

    return NextResponse.json(
      {
        error:
          "Unknown action. Valid POST actions: create-milestone, update-milestone, delete-milestone, create-cycle, update-cycle",
      },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Cyclic billing POST error:", error);
    return NextResponse.json({ error: "Failed to perform cyclic billing operation" }, { status: 500 });
  }
}
