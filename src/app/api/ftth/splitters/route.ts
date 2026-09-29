import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/ftth/splitters?oltId=xxx&portId=xxx&status=xxx&search=xxx
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const oltId = searchParams.get("oltId") || "";
    const portId = searchParams.get("portId") || "";
    const status = searchParams.get("status") || "";
    const search = searchParams.get("search") || "";

    const where: Record<string, unknown> = {};
    if (oltId) where.oltId = oltId;
    if (portId) where.portId = portId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { type: { contains: search } },
        { location: { contains: search } },
      ];
    }

    const splitters = await db.splitter.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ splitters });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to fetch splitters" }, { status: 500 });
  }
}

// POST /api/ftth/splitters - Create splitter
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { oltId, portId, name, type, splitRatio, ratio, location, connectedCount, maxCount, status } = body;

    if (!oltId) return NextResponse.json({ error: "OLT ID is required" }, { status: 400 });

    const splitterType = type || splitRatio || "1:8";
    const max = maxCount || parseInt(splitterType.split(":")[1]) || 8;

    const splitter = await db.splitter.create({
      data: {
        oltId,
        portId: portId || "",
        name: name || "",
        type: splitterType,
        splitRatio: splitRatio || splitterType,
        ratio: ratio || splitterType,
        location: location || "",
        connectedCount: connectedCount || 0,
        maxCount: max,
        status: status || "ACTIVE",
      },
    });

    return NextResponse.json({ splitter }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to create splitter" }, { status: 500 });
  }
}

// PUT /api/ftth/splitters - Update splitter
export async function PUT(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

    const existing = await db.splitter.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Splitter not found" }, { status: 404 });

    const splitter = await db.splitter.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.splitRatio !== undefined && { splitRatio: data.splitRatio }),
        ...(data.ratio !== undefined && { ratio: data.ratio }),
        ...(data.location !== undefined && { location: data.location }),
        ...(data.connectedCount !== undefined && { connectedCount: data.connectedCount }),
        ...(data.maxCount !== undefined && { maxCount: data.maxCount }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.oltId !== undefined && { oltId: data.oltId }),
        ...(data.portId !== undefined && { portId: data.portId }),
      },
    });

    return NextResponse.json({ splitter });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to update splitter" }, { status: 500 });
  }
}

// DELETE /api/ftth/splitters?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

    await db.splitter.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to delete splitter" }, { status: 500 });
  }
}
