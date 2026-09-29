import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(_request);
    const { id } = await params;
    const command = await db.botCommand.findUnique({ where: { id } });
    if (!command) {
      return NextResponse.json({ error: "Command not found" }, { status: 404 });
    }
    return NextResponse.json(command);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bot command get error:", error);
    return NextResponse.json({ error: "Failed to fetch command" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = await request.json();

    const existing = await db.botCommand.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Command not found" }, { status: 404 });
    }

    const updated = await db.botCommand.update({
      where: { id },
      data: {
        trigger: body.trigger ?? existing.trigger,
        response: body.response ?? existing.response,
        description: body.description ?? existing.description,
        enabled: body.enabled !== undefined ? body.enabled : existing.enabled,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bot command update error:", error);
    return NextResponse.json({ error: "Failed to update command" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(_request);
    const { id } = await params;
    const existing = await db.botCommand.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Command not found" }, { status: 404 });
    }

    await db.botCommand.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bot command delete error:", error);
    return NextResponse.json({ error: "Failed to delete command" }, { status: 500 });
  }
}
