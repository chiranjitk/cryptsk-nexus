import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const subscriberId = searchParams.get("subscriberId");

    const where: Record<string, unknown> = {};
    if (subscriberId) where.subscriberId = subscriberId;

    const baselines = await db.diagnosisBaseline.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(baselines);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Baselines fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch baselines" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const { subscriberId, riskScore, issuesCount, speedDown, speedUp, ping, summary, fullResult } = await request.json();

    if (!subscriberId) {
      return NextResponse.json({ error: "subscriberId is required" }, { status: 400 });
    }

    // Upsert: update existing baseline or create new one
    const existing = await db.diagnosisBaseline.findFirst({
      where: { subscriberId },
    });

    const baseline = existing
      ? await db.diagnosisBaseline.update({
          where: { id: existing.id },
          data: {
            riskScore: riskScore ?? existing.riskScore,
            issuesCount: issuesCount ?? existing.issuesCount,
            speedDown: speedDown ?? existing.speedDown,
            speedUp: speedUp ?? existing.speedUp,
            ping: ping ?? existing.ping,
            summary: summary ?? existing.summary,
            fullResult: fullResult ?? existing.fullResult,
          },
        })
      : await db.diagnosisBaseline.create({
          data: {
            subscriberId,
            riskScore: riskScore ?? 0,
            issuesCount: issuesCount ?? 0,
            speedDown: speedDown ?? "",
            speedUp: speedUp ?? "",
            ping: ping ?? "",
            summary: summary ?? "",
            fullResult: fullResult ?? "{}",
          },
        });

    return NextResponse.json(baseline, { status: existing ? 200 : 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Baseline save error:", error);
    return NextResponse.json({ error: "Failed to save baseline" }, { status: 500 });
  }
}
