import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const commands = await db.botCommand.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(commands);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bot commands fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch bot commands" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const { trigger, response, description, enabled } = await request.json();

    if (!trigger || !response) {
      return NextResponse.json({ error: "Trigger and response are required" }, { status: 400 });
    }

    // Check for duplicate trigger
    const existing = await db.botCommand.findFirst({ where: { trigger } });
    if (existing) {
      return NextResponse.json({ error: "A command with this trigger already exists" }, { status: 409 });
    }

    const command = await db.botCommand.create({
      data: {
        trigger,
        response,
        description: description || "",
        enabled: enabled !== false,
      },
    });

    return NextResponse.json(command, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bot command create error:", error);
    return NextResponse.json({ error: "Failed to create bot command" }, { status: 500 });
  }
}
