import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { searchParams } = req.nextUrl;
    const invoiceId = searchParams.get("invoiceId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (invoiceId) where.invoiceId = invoiceId;
    if (status) where.status = status;

    const disputes = await db.dispute.findMany({
      where,
      include: {
        Subscriber: { select: { id: true, name: true, code: true, phone: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ disputes });
  } catch (error) {
    console.error("Disputes GET error:", error);
    return NextResponse.json({ error: "Failed to fetch disputes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const body = await req.json();
    const { subscriberId, invoiceId, amount, reason } = body;

    if (!subscriberId || !invoiceId || !amount || !reason) {
      return NextResponse.json({ error: "subscriberId, invoiceId, amount, and reason are required" }, { status: 400 });
    }

    const dispute = await db.dispute.create({
      data: {
        subscriberId,
        invoiceId,
        amount: parseFloat(amount),
        reason,
        status: "OPEN",
      },
      include: {
        Subscriber: { select: { id: true, name: true, code: true } },
      },
    });

    await auditLog(req, "CREATE", "Dispute", dispute.id, { subscriberId, invoiceId, amount, reason });

    return NextResponse.json({ dispute }, { status: 201 });
  } catch (error) {
    console.error("Disputes POST error:", error);
    return NextResponse.json({ error: "Failed to create dispute" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const body = await req.json();
    const { id, status, resolution, resolvedById } = body;

    if (!id) {
      return NextResponse.json({ error: "Dispute ID is required" }, { status: 400 });
    }

    const dispute = await db.dispute.findUnique({ where: { id } });
    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    const updated = await db.dispute.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(resolution !== undefined && { resolution }),
        ...(resolvedById && { resolvedById }),
        ...(resolvedById && { updatedAt: new Date() }),
      },
    });

    await auditLog(req, "UPDATE", "Dispute", id, { status, resolution, resolvedById });

    return NextResponse.json({ dispute: updated });
  } catch (error) {
    console.error("Disputes PUT error:", error);
    return NextResponse.json({ error: "Failed to update dispute" }, { status: 500 });
  }
}
