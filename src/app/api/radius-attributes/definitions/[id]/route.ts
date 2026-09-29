import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";
import type { RadiusAttrType, RadiusAttrDataType } from "@prisma/client";

// PUT /api/radius-attributes/definitions/:id — Update attribute definition
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;
    const body = await req.json();
    const { name, attributeName, vendor, type, dataType, description } = body;

    const existing = await db.radiusAttributeDef.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Attribute definition not found" }, { status: 404 });
    }

    // Check name uniqueness if changing
    if (name && name.trim() && name.trim() !== existing.name) {
      const duplicate = await db.radiusAttributeDef.findFirst({
        where: { name: name.trim(), NOT: { id } },
      });
      if (duplicate) {
        return NextResponse.json({ error: "Attribute definition with this name already exists" }, { status: 409 });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (attributeName !== undefined) updateData.attributeName = attributeName.trim();
    if (vendor !== undefined) {
      updateData.vendorName = vendor;
      updateData.vendorId = getVendorId(vendor);
    }
    if (type !== undefined) updateData.attrType = mapToAttrType(type);
    if (dataType !== undefined) updateData.dataType = mapToDataType(dataType);
    if (description !== undefined) updateData.description = description;

    const updated = await db.radiusAttributeDef.update({
      where: { id },
      data: updateData,
      include: { _count: { select: { userAttributes: true } } },
    });

    return NextResponse.json({
      attributeDefinition: {
        id: updated.id,
        name: updated.name,
        attributeName: updated.attributeName,
        vendor: updated.vendorName,
        type: mapAttrType(updated.attrType),
        dataType: mapDataType(updated.dataType),
        description: updated.description,
        usageCount: updated._count.userAttributes,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("RADIUS attribute definition PUT error:", error);
    return NextResponse.json({ error: "Failed to update attribute definition" }, { status: 500 });
  }
}

// DELETE /api/radius-attributes/definitions/:id — Delete attribute definition
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;

    const existing = await db.radiusAttributeDef.findUnique({
      where: { id },
      include: { _count: { select: { userAttributes: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Attribute definition not found" }, { status: 404 });
    }

    // Cascade delete will remove associated UserRadiusAttribute records
    await db.radiusAttributeDef.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("RADIUS attribute definition DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete attribute definition" }, { status: 500 });
  }
}

function mapToAttrType(type: string): RadiusAttrType {
  switch (type) {
    case "check": return "CHECK";
    case "reply": return "REPLY";
    case "vendor-specific": return "BOTH";
    default: return "BOTH";
  }
}

function mapAttrType(type: RadiusAttrType): string {
  switch (type) {
    case "CHECK": return "check";
    case "REPLY": return "reply";
    case "BOTH": return "vendor-specific";
    default: return "vendor-specific";
  }
}

function mapToDataType(dt: string): RadiusAttrDataType {
  switch (dt) {
    case "integer": return "INTEGER";
    case "ipaddr": return "IP_ADDRESS";
    case "octets": return "OCTETS";
    default: return "STRING";
  }
}

function mapDataType(dt: RadiusAttrDataType): string {
  switch (dt) {
    case "INTEGER": return "integer";
    case "IP_ADDRESS": return "ipaddr";
    case "OCTETS": return "octets";
    default: return "string";
  }
}

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
