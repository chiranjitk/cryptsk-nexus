import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const competitorId = searchParams.get("competitorId");

    if (!competitorId) {
      return NextResponse.json({ error: "competitorId is required" }, { status: 400 });
    }

    const history = await db.competitorPriceHistory.findMany({
      where: { competitorId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(history);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Price history fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch price history" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const { competitorId, oldPrice, newPrice, notes } = await request.json();

    if (!competitorId || oldPrice === undefined || newPrice === undefined) {
      return NextResponse.json({ error: "competitorId, oldPrice, and newPrice are required" }, { status: 400 });
    }

    const competitor = await db.competitor.findUnique({ where: { id: competitorId } });
    if (!competitor) {
      return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
    }

    const history = await db.competitorPriceHistory.create({
      data: {
        competitorId,
        planName: competitor.planName,
        speed: competitor.speed,
        dataLimit: competitor.dataLimit,
        oldPrice: Number(oldPrice),
        newPrice: Number(newPrice),
        notes: notes || "",
      },
    });

    return NextResponse.json(history, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Price history save error:", error);
    return NextResponse.json({ error: "Failed to save price history" }, { status: 500 });
  }
}
