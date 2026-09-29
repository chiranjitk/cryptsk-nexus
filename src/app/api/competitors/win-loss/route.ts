import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const { competitorId, subscriberName, reason, notes } = await request.json();

    if (!competitorId || !subscriberName) {
      return NextResponse.json({ error: "Competitor ID and subscriber name are required" }, { status: 400 });
    }

    const competitor = await db.competitor.findUnique({ where: { id: competitorId } });
    if (!competitor) {
      return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
    }

    const record = await db.winLossAnalysis.create({
      data: {
        subscriberId: subscriberName,
        competitorId,
        competitorName: competitor.name,
        result: "LOSS",
        reason: reason || "",
        notes: notes || "",
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Win/Loss report error:", error);
    return NextResponse.json({ error: "Failed to report loss" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const records = await db.winLossAnalysis.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Build summary per competitor
    const summary: Record<string, { total: number; lost: number }> = {};
    for (const r of records) {
      if (!summary[r.competitorName]) summary[r.competitorName] = { total: 0, lost: 0 };
      summary[r.competitorName].total++;
      if (r.result === "LOSS") summary[r.competitorName].lost++;
    }

    return NextResponse.json({ records, summary });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Win/Loss fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch win/loss data" }, { status: 500 });
  }
}
