import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    let userId: string | undefined;
    try {
      userId = await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
    if (!userId) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    void userId;
  } catch {
    // Allow unauthenticated read for display purposes
  }
  try {
    const templates = await db.voucherTemplate.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Voucher templates GET error:", error);
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { name, denomination, description, validityDays, isActive, planId } = body;

    if (!name || !denomination) {
      return NextResponse.json({ error: "Name and denomination are required" }, { status: 400 });
    }

    const template = await db.voucherTemplate.create({
      data: {
        name,
        denomination: parseFloat(denomination),
        description: description || "",
        validityDays: validityDays || 30,
        isActive: isActive !== false,
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Voucher templates POST error:", error);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
