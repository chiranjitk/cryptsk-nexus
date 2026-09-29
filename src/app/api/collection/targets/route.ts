import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: Request) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const agents = await db.collectionAgent.findMany({
      include: {
        User: { select: { id: true, name: true, status: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ agents });
  } catch (error) {
    console.error("Collection targets GET error:", error);
    return NextResponse.json({ error: "Failed to fetch targets" }, { status: 500 });
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
    const { agentId, monthlyTarget } = body;

    if (!agentId || monthlyTarget === undefined) {
      return NextResponse.json({ error: "agentId and monthlyTarget are required" }, { status: 400 });
    }

    const agent = await db.collectionAgent.findUnique({ where: { id: agentId } });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const updated = await db.collectionAgent.update({
      where: { id: agentId },
      data: { monthlyTarget: parseFloat(monthlyTarget) },
    });

    return NextResponse.json({ agent: updated });
  } catch (error) {
    console.error("Collection targets PUT error:", error);
    return NextResponse.json({ error: "Failed to update target" }, { status: 500 });
  }
}
