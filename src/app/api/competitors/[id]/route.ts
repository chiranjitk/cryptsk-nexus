import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;
    const competitor = await db.competitor.findUnique({ where: { id } });
    if (!competitor) {
      return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
    }
    return NextResponse.json(competitor);
  } catch (error) {
    console.error("Competitor get error:", error);
    return NextResponse.json({ error: "Failed to fetch competitor" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;
    const body = await request.json();

    const existing = await db.competitor.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
    }

    const updated = await db.competitor.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        planName: body.planName ?? existing.planName,
        speed: body.speed ?? existing.speed,
        dataLimit: body.dataLimit ?? existing.dataLimit,
        price: body.price !== undefined ? Number(body.price) : existing.price,
        validity: body.validity ?? existing.validity,
        category: body.category ?? existing.category,
        notes: body.notes !== undefined ? body.notes : existing.notes,
      },
    });

    // Log price change in history if price was updated
    if (body.price !== undefined && Number(body.price) !== existing.price) {
      await db.competitorPriceHistory.create({
        data: {
          competitorId: id,
          planName: updated.planName,
          speed: updated.speed,
          dataLimit: updated.dataLimit,
          oldPrice: existing.price,
          newPrice: Number(body.price),
          notes: `Price updated from ${existing.price} to ${body.price}`,
        },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Competitor update error:", error);
    return NextResponse.json({ error: "Failed to update competitor" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;
    const existing = await db.competitor.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
    }

    await db.competitor.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Competitor delete error:", error);
    return NextResponse.json({ error: "Failed to delete competitor" }, { status: 500 });
  }
}
