import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditUpdate, auditDelete } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;

    const agent = await db.collectionAgent.findUnique({
      where: { id },
      include: {
        User: { select: { id: true, email: true, status: true, lastLoginAt: true } },
        areasAssigned: { select: { id: true, name: true, code: true } },
      },
    });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Get collection data for this agent
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

    const todayPayments = await db.payment.findMany({
      where: {
        collectedById: agent.userId,
        status: "VERIFIED",
        createdAt: { gte: startOfDay },
      },
      select: { amount: true },
    });
    const todayCollected = todayPayments.reduce((sum, p) => sum + p.amount, 0);

    const monthPayments = await db.payment.findMany({
      where: {
        collectedById: agent.userId,
        status: "VERIFIED",
        createdAt: { gte: startOfMonth },
      },
      select: { amount: true },
    });
    const monthCollected = monthPayments.reduce((sum, p) => sum + p.amount, 0);

    const commission = monthCollected * (agent.commissionRate / 100);

    // Fetch recent transactions (last 20 payments/collections by this agent)
    const transactions = await db.payment.findMany({
      where: {
        collectedById: agent.userId,
      },
      include: {
        Subscriber: { select: { id: true, name: true, code: true } },
        Invoice: { select: { invoiceNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      agent,
      stats: {
        todayCollected,
        monthCollected,
        commission,
        dailyTargetPercent: agent.dailyTarget > 0 ? Math.round((todayCollected / agent.dailyTarget) * 100) : 0,
        monthlyTargetPercent: agent.monthlyTarget > 0 ? Math.round((monthCollected / agent.monthlyTarget) * 100) : 0,
      },
      transactions: transactions.map((t) => ({
        id: t.id,
        date: t.createdAt.toISOString(),
        subscriber: t.Subscriber?.name || "Unknown",
        subscriberCode: t.Subscriber?.code || "",
        amount: t.amount,
        type: t.status === "VERIFIED" ? "Collection" : t.status === "PENDING" ? "Pending" : t.status,
        paymentMode: t.paymentMode,
        receiptNumber: t.receiptNumber,
        invoiceNumber: t.Invoice?.invoiceNumber || "",
      })),
    });
  } catch (error) {
    console.error("Agent GET by ID error:", error);
    return NextResponse.json({ error: "Failed to fetch agent" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;
    const body = await req.json();

    const existing = await db.collectionAgent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.assignedAreaIds !== undefined) updateData.assignedAreaIds = JSON.stringify(body.assignedAreaIds);
    if (body.dailyTarget !== undefined) updateData.dailyTarget = body.dailyTarget;
    if (body.monthlyTarget !== undefined) updateData.monthlyTarget = body.monthlyTarget;
    if (body.commissionRate !== undefined) updateData.commissionRate = body.commissionRate;
    if (body.totalCollectedToday !== undefined) updateData.totalCollectedToday = body.totalCollectedToday;
    if (body.totalCollectedMonth !== undefined) updateData.totalCollectedMonth = body.totalCollectedMonth;
    if (body.totalCommission !== undefined) updateData.totalCommission = body.totalCommission;

    // Update linked user if name changed
    if (body.name) {
      await db.user.update({ where: { id: existing.userId }, data: { name: body.name } });
    }

    // Handle area assignment via relation
    if (body.assignedAreaIds !== undefined) {
      const areaIds: string[] = Array.isArray(body.assignedAreaIds) ? body.assignedAreaIds : [];
      await db.collectionAgent.update({
        where: { id },
        data: {
          ...updateData,
          areasAssigned: {
            set: areaIds.map((areaId: string) => ({ id: areaId })),
          },
        },
        include: {
          User: { select: { id: true, email: true, status: true } },
          areasAssigned: { select: { id: true, name: true, code: true } },
        },
      });

      await auditUpdate(req, "CollectionAgent", id, updateData, existing);
      return NextResponse.json({ success: true });
    }

    const agent = await db.collectionAgent.update({
      where: { id },
      data: updateData,
      include: {
        User: { select: { id: true, email: true, status: true } },
        areasAssigned: { select: { id: true, name: true, code: true } },
      },
    });

    await auditUpdate(req, "CollectionAgent", id, updateData, existing);
    return NextResponse.json({ agent });
  } catch (error) {
    console.error("Agent PUT error:", error);
    return NextResponse.json({ error: "Failed to update agent" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;

    const existing = await db.collectionAgent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const deletedRecord = { ...existing };
    await db.collectionAgent.delete({ where: { id } });
    await auditDelete(req, "CollectionAgent", id, deletedRecord);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Agent DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete agent" }, { status: 500 });
  }
}
