import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (agentId) where.agentId = agentId;
    if (status) where.status = status;

    const records = await db.commissionPayout.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ records });
  } catch (error) {
    console.error("Payouts GET error:", error);
    return NextResponse.json({ error: "Failed to fetch payouts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const body = await req.json();
    const { agentId, amount, period, status } = body;

    if (!agentId || !amount || !period) {
      return NextResponse.json({ error: "agentId, amount and period are required" }, { status: 400 });
    }

    const agent = await db.collectionAgent.findUnique({ where: { id: agentId } });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const record = await db.commissionPayout.create({
      data: {
        agentId,
        amount,
        period,
        status: status || "PENDING",
        approvedBy: userId,
      },
    });

    await auditCreate(req, "CommissionPayout", record.id, { agentId, amount, period, status: status || "PENDING" });
    return NextResponse.json({ record }, { status: 201 });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const e = error as { statusCode: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error("Payouts POST error:", error);
    return NextResponse.json({ error: "Failed to create payout" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, paidOn } = body;

    if (!id || !status) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400 });
    }

    const validStatuses = ["PENDING", "APPROVED", "PAID"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status. Use PENDING, APPROVED, or PAID." }, { status: 400 });
    }

    const existing = await db.commissionPayout.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Payout not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = { status };
    if (status === "PAID" && paidOn) {
      updateData.paidOn = new Date(paidOn);
    } else if (status === "PAID") {
      updateData.paidOn = new Date();
    }

    const record = await db.commissionPayout.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ record });
  } catch (error) {
    console.error("Payouts PUT error:", error);
    return NextResponse.json({ error: "Failed to update payout" }, { status: 500 });
  }
}
