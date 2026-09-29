import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "all";
    const search = searchParams.get("search") || "";

    const where: Record<string, unknown> = {};
    if (status !== "all") where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { city: { contains: search } },
        { state: { contains: search } },
      ];
    }

    const warehouses = await db.warehouse.findMany({
      where,
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    return NextResponse.json({
      warehouses: warehouses.map((w) => ({
        id: w.id,
        name: w.name,
        address: w.address,
        city: w.city,
        state: w.state,
        pincode: w.pincode,
        isDefault: w.isDefault,
        status: w.status,
        createdAt: w.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Warehouses list error:", error);
    return NextResponse.json({ error: "Failed to fetch warehouses" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { name, address, city, state, pincode, isDefault } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Warehouse name is required" }, { status: 400 });
    }

    if (isDefault) {
      await db.warehouse.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }

    const warehouse = await db.warehouse.create({
      data: {
        name: name.trim(),
        address: address || "",
        city: city || "",
        state: state || "",
        pincode: pincode || "",
        isDefault: isDefault || false,
      },
    });

    return NextResponse.json({ warehouse }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Warehouse create error:", error);
    return NextResponse.json({ error: "Failed to create warehouse" }, { status: 500 });
  }
}
