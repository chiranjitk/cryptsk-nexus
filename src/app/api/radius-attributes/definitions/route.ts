import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";
import type { RadiusAttrType, RadiusAttrDataType } from "@prisma/client";

// GET /api/radius-attributes/definitions — List all attribute definitions
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const defs = await db.radiusAttributeDef.findMany({
      where: { enabled: true },
      orderBy: [{ vendorName: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: { userAttributes: true },
        },
      },
    });

    // Map to the format the page component expects
    const mapped = defs.map((d) => ({
      id: d.id,
      name: d.name,
      attributeName: d.attributeName,
      vendor: d.vendorName || "RADIUS Standard",
      type: mapAttrType(d.attrType),
      dataType: mapDataType(d.dataType),
      description: d.description,
      usageCount: d._count.userAttributes,
      createdAt: d.createdAt.toISOString(),
    }));

    return NextResponse.json({ attributeDefinitions: mapped });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("RADIUS attribute definitions GET error:", error);
    return NextResponse.json({ error: "Failed to fetch attribute definitions" }, { status: 500 });
  }
}

// POST /api/radius-attributes/definitions — Create a new attribute definition
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { name, attributeName, vendor, type, dataType, description } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!attributeName || !attributeName.trim()) {
      return NextResponse.json({ error: "Attribute name is required" }, { status: 400 });
    }

    // Check for duplicate name
    const existing = await db.radiusAttributeDef.findUnique({ where: { name: name.trim() } });
    if (existing) {
      return NextResponse.json({ error: "Attribute definition with this name already exists" }, { status: 409 });
    }

    const def = await db.radiusAttributeDef.create({
      data: {
        name: name.trim(),
        attributeName: attributeName.trim(),
        vendorName: vendor || "RADIUS Standard",
        vendorId: getVendorId(vendor),
        attrType: mapToAttrType(type),
        dataType: mapToDataType(dataType),
        description: description || "",
      },
      include: {
        _count: { select: { userAttributes: true } },
      },
    });

    return NextResponse.json({
      attributeDefinition: {
        id: def.id,
        name: def.name,
        attributeName: def.attributeName,
        vendor: def.vendorName,
        type: mapAttrType(def.attrType),
        dataType: mapDataType(def.dataType),
        description: def.description,
        usageCount: def._count.userAttributes,
        createdAt: def.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("RADIUS attribute definitions POST error:", error);
    return NextResponse.json({ error: "Failed to create attribute definition" }, { status: 500 });
  }
}

// Helper: Map page type to Prisma enum
function mapToAttrType(type: string): RadiusAttrType {
  switch (type) {
    case "check": return "CHECK";
    case "reply": return "REPLY";
    case "vendor-specific": return "BOTH";
    default: return "BOTH";
  }
}

// Helper: Map Prisma enum to page type
function mapAttrType(type: RadiusAttrType): string {
  switch (type) {
    case "CHECK": return "check";
    case "REPLY": return "reply";
    case "BOTH": return "vendor-specific";
    default: return "vendor-specific";
  }
}

// Helper: Map page dataType to Prisma enum
function mapToDataType(dt: string): RadiusAttrDataType {
  switch (dt) {
    case "integer": return "INTEGER";
    case "ipaddr": return "IP_ADDRESS";
    case "ipv6addr": return "IP_ADDRESS";
    case "ipv6prefix": return "OCTETS";
    case "octets": return "OCTETS";
    case "date": return "INTEGER";
    case "abinary": return "OCTETS";
    case "ifid": return "OCTETS";
    default: return "STRING";
  }
}

// Helper: Map Prisma dataType to page dataType
function mapDataType(dt: RadiusAttrDataType): string {
  switch (dt) {
    case "INTEGER": return "integer";
    case "IP_ADDRESS": return "ipaddr";
    case "OCTETS": return "octets";
    default: return "string";
  }
}

// Helper: Get vendor ID from vendor name
function getVendorId(vendor?: string): number {
  if (!vendor) return 0;
  switch (vendor) {
    case "Mikrotik": return 14988;
    case "Cisco": return 9;
    case "Huawei": return 2011;
    case "Juniper": return 2636;
    default: return 0;
  }
}
