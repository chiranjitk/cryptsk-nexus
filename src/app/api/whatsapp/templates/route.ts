import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (category && category !== "ALL") where.category = category;
    if (status && status !== "ALL") where.status = status;

    const templates = await db.whatsAppTemplate.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(templates);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("WhatsApp templates fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const { name, category, content, status } = await request.json();

    if (!name || !content) {
      return NextResponse.json({ error: "Name and content are required" }, { status: 400 });
    }

    // Auto-detect variables from content
    const variableRegex = /\{\{(\w+)\}\}/g;
    const variables: string[] = [];
    let match;
    while ((match = variableRegex.exec(content)) !== null) {
      if (!variables.includes(match[1])) variables.push(match[1]);
    }

    const template = await db.whatsAppTemplate.create({
      data: {
        name,
        category: category || "General",
        content,
        variables: JSON.stringify(variables),
        status: status || "ACTIVE",
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("WhatsApp template create error:", error);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
