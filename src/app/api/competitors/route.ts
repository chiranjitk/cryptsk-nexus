import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auditCreate } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const competitors = await db.competitor.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Attach price history for each competitor
    const enriched = await Promise.all(competitors.map(async (c) => {
      const priceHistory = await db.competitorPriceHistory.findMany({
        where: { competitorId: c.id },
        orderBy: { createdAt: "desc" },
      });
      return { ...c, priceHistory };
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Competitors fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch competitors" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { name, planName, speed, dataLimit, price, validity, category, notes } = body;

    if (!name || !planName || price === undefined) {
      return NextResponse.json({ error: "Name, plan name, and price are required" }, { status: 400 });
    }

    const competitor = await db.competitor.create({
      data: {
        name,
        planName,
        speed: speed || "",
        dataLimit: dataLimit || "",
        price: Number(price),
        validity: validity || "30 days",
        category: category || "FTTH",
        notes: notes || "",
      },
    });

    await auditCreate(request, "Competitor", competitor.id, { name, planName, price });
    return NextResponse.json(competitor, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Competitor create error:", error);
    return NextResponse.json({ error: "Failed to create competitor" }, { status: 500 });
  }
}
