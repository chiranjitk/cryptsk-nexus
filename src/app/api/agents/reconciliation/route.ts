import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");
    const status = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(50, parseInt(searchParams.get("limit") || "20"));

    const where: Record<string, unknown> = {};
    if (agentId) where.agentId = agentId;
    if (status) where.status = status;

    const [records, total] = await Promise.all([
      db.agentReconciliation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.agentReconciliation.count({ where }),
    ]);

    return NextResponse.json({ records, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Reconciliation GET error:", error);
    return NextResponse.json({ error: "Failed to fetch reconciliations" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    const body = await req.json();
    const { agentId, date, expectedAmount, collectedAmount } = body;

    if (!agentId || !date) {
      return NextResponse.json({ error: "agentId and date are required" }, { status: 400 });
    }

    const diff = (collectedAmount || 0) - (expectedAmount || 0);
    const status = Math.abs(diff) < 0.01 ? "MATCHED" : "MISMATCH";

    const agent = await db.collectionAgent.findUnique({ where: { id: agentId } });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Check for existing reconciliation for this agent+date
    const existing = await db.agentReconciliation.findFirst({
      where: { agentId, date: new Date(date) },
    });

    let record;
    if (existing) {
      record = await db.agentReconciliation.update({
        where: { id: existing.id },
        data: {
          expectedAmount: expectedAmount || 0,
          collectedAmount: collectedAmount || 0,
          difference: diff,
          status,
          reconciledBy: userId,
        },
      });
    } else {
      record = await db.agentReconciliation.create({
        data: {
          agentId,
          date: new Date(date),
          expectedAmount: expectedAmount || 0,
          collectedAmount: collectedAmount || 0,
          difference: diff,
          status,
          reconciledBy: userId,
        },
      });
    }

    await auditCreate(req, "AgentReconciliation", record.id, { agentId, date, expectedAmount, collectedAmount, difference: diff, status });

    return NextResponse.json({ record });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const e = error as { statusCode: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error("Reconciliation POST error:", error);
    return NextResponse.json({ error: "Failed to create reconciliation" }, { status: 500 });
  }
}
