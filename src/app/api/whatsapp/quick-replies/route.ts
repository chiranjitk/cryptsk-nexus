import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    const where: Record<string, unknown> = {};
    if (category && category !== "ALL") where.category = category;

    const replies = await db.quickReply.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(replies);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Quick replies fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch quick replies" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const { shortcut, message, category } = await request.json();

    if (!shortcut || !message) {
      return NextResponse.json({ error: "Shortcut and message are required" }, { status: 400 });
    }

    const existing = await db.quickReply.findFirst({ where: { shortcut } });
    if (existing) {
      return NextResponse.json({ error: "A quick reply with this shortcut already exists" }, { status: 409 });
    }

    const reply = await db.quickReply.create({
      data: {
        shortcut,
        message,
        category: category || "General",
      },
    });

    return NextResponse.json(reply, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Quick reply create error:", error);
    return NextResponse.json({ error: "Failed to create quick reply" }, { status: 500 });
  }
}
