import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/ftth/templates
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const ponType = searchParams.get("ponType") || "";

    const where: Record<string, unknown> = {};
    if (ponType) where.ponType = ponType;

    const templates = await db.oltTemplate.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ templates });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}

// POST /api/ftth/templates - Create template
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { name, description, vendor, ponType, config } = body;

    if (!name?.trim()) return NextResponse.json({ error: "Template name is required" }, { status: 400 });

    const template = await db.oltTemplate.create({
      data: {
        name: name.trim(),
        description: description || "",
        vendor: vendor || "",
        ponType: ponType || "GPON",
        config: typeof config === "string" ? config : JSON.stringify(config || {}),
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}

// PUT /api/ftth/templates - Update template
export async function PUT(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { id, name, description, vendor, ponType, config } = body;

    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

    const existing = await db.oltTemplate.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const template = await db.oltTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description || "" }),
        ...(vendor !== undefined && { vendor: vendor || "" }),
        ...(ponType !== undefined && { ponType: ponType }),
        ...(config !== undefined && { config: typeof config === "string" ? config : JSON.stringify(config) }),
      },
    });

    return NextResponse.json({ template });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
}

// DELETE /api/ftth/templates?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

    await db.oltTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
