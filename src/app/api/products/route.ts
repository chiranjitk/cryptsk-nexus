import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";

// GET /api/products — list products with plans
export async function GET(req: NextRequest) {
  try {
    await requirePermission("subscriber", "list");

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const type = searchParams.get("type") || "";
    const status = searchParams.get("status") || "";

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { productCode: { contains: search } },
        { radiusGroupName: { contains: search } },
      ];
    }

    const products = await db.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        plans: {
          where: { status: "active" },
          select: {
            id: true, planCode: true, name: true, billingCycle: true,
            basePrice: true, currency: true, status: true,
          },
        },
        _count: { select: { plans: true } },
      },
    });

    return NextResponse.json({ products });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

// POST /api/products — create product
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("subscriber", "create");
    const body = await req.json();
    const { name, description, type, downloadSpeed, uploadSpeed, dataLimitGb, fupDataLimitGb, fupDownloadSpeed, radiusGroupName, status } = body;

    if (!name || !type) {
      return NextResponse.json({ error: "name and type required" }, { status: 400 });
    }

    // Generate product code
    const count = await db.product.count();
    const productCode = `PROD-${type.toUpperCase().slice(0, 3)}-${String(count + 1).padStart(3, "0")}`;

    // Check radiusGroupName duplicate
    if (radiusGroupName) {
      const existing = await db.product.findUnique({ where: { radiusGroupName } });
      if (existing) return NextResponse.json({ error: "RADIUS group name already exists" }, { status: 409 });
    }

    const product = await db.product.create({
      data: {
        productCode, name, description, type,
        downloadSpeed: downloadSpeed ? Number(downloadSpeed) : null,
        uploadSpeed: uploadSpeed ? Number(uploadSpeed) : null,
        dataLimitGb: dataLimitGb ? Number(dataLimitGb) : null,
        fupDataLimitGb: fupDataLimitGb ? Number(fupDataLimitGb) : null,
        fupDownloadSpeed: fupDownloadSpeed ? Number(fupDownloadSpeed) : null,
        radiusGroupName: radiusGroupName || null,
        status: status || "draft",
        createdBy: user.id, updatedBy: user.id,
      },
    });

    await auditCreateEntity({
      userId: user.id, action: "create", resource: "product",
      resourceId: product.id, resourceName: product.productCode,
      after: { productCode, name, type, radiusGroupName },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
