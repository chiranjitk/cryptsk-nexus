import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(_request);
    const { id } = await params;
    const reply = await db.quickReply.findUnique({ where: { id } });
    if (!reply) {
      return NextResponse.json({ error: "Quick reply not found" }, { status: 404 });
    }
    return NextResponse.json(reply);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Quick reply get error:", error);
    return NextResponse.json({ error: "Failed to fetch quick reply" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = await request.json();

    const existing = await db.quickReply.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Quick reply not found" }, { status: 404 });
    }

    const updated = await db.quickReply.update({
      where: { id },
      data: {
        shortcut: body.shortcut ?? existing.shortcut,
        message: body.message ?? existing.message,
        category: body.category ?? existing.category,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Quick reply update error:", error);
    return NextResponse.json({ error: "Failed to update quick reply" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(_request);
    const { id } = await params;
    const existing = await db.quickReply.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Quick reply not found" }, { status: 404 });
    }

    await db.quickReply.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Quick reply delete error:", error);
    return NextResponse.json({ error: "Failed to delete quick reply" }, { status: 500 });
  }
}
