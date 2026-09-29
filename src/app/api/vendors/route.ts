import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate, auditUpdate, auditDelete } from "@/lib/services/audit-service";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || "";
    const search = searchParams.get("search") || "";

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { contactPerson: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const vendors = await db.vendor.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { Equipment: true } } },
    });

    return NextResponse.json({ vendors });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Vendors fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch vendors" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { name, contactPerson, phone, email, address, gstin, category, rating, notes } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Vendor name is required" }, { status: 400 });
    }

    const vendor = await db.vendor.create({
      data: {
        name: name.trim(),
        contactPerson: contactPerson || "",
        phone: phone || "",
        email: email || "",
        address: address || "",
        gstin: gstin || "",
        category: category || "general",
        rating: rating !== undefined ? Math.min(5, Math.max(0, Number(rating))) : 0,
        notes: notes || "",
      },
    });

    await auditCreate(request, "Vendor", vendor.id, { name: vendor.name, category: vendor.category }, { userId });
    return NextResponse.json({ vendor }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Vendor create error:", error);
    return NextResponse.json({ error: "Failed to create vendor" }, { status: 500 });
  }
}
