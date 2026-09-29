import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";

// GET /api/customers — list customers with subscriber counts
export async function GET(req: NextRequest) {
  try {
    await requirePermission("subscriber", "list");

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const type = searchParams.get("type") || "";

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (search) {
      where.OR = [
        { displayName: { contains: search } },
        { customerCode: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
        { companyName: { contains: search } },
      ];
    }

    const customers = await db.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, customerCode: true, type: true, status: true,
        displayName: true, email: true, phone: true,
        companyName: true, gstin: true, pan: true, kycVerified: true,
        createdAt: true, updatedAt: true,
        _count: { select: { subscribers: true, subscriptions: true } },
      },
    });

    return NextResponse.json({ customers });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch customers" }, { status: 500 });
  }
}

// POST /api/customers — create new customer
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("subscriber", "create");
    const body = await req.json();
    const { type, firstName, lastName, companyName, gstin, pan, email, phone, whatsappNumber, status } = body;

    if (!type || (!companyName && !firstName)) {
      return NextResponse.json({ error: "type and name/companyName required" }, { status: 400 });
    }

    // Generate customer code
    const count = await db.customer.count();
    const customerCode = `CUST-${String(count + 1).padStart(5, "0")}`;

    const displayName = type === "individual"
      ? `${firstName} ${lastName || ""}`.trim()
      : companyName;

    // Check email duplicate
    if (email) {
      const existing = await db.customer.findUnique({ where: { email } });
      if (existing) return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }

    const customer = await db.customer.create({
      data: {
        customerCode, type, status: status || "active",
        firstName, lastName, companyName, gstin, pan,
        displayName, email, phone, whatsappNumber,
        createdBy: user.id, updatedBy: user.id,
      },
    });

    await auditCreateEntity({
      userId: user.id, action: "create", resource: "customer",
      resourceId: customer.id, resourceName: customer.customerCode,
      after: { customerCode, type, displayName, email },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ customer }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}
