import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";
import type { RadiusAttrType, RadiusAttrDataType } from "@prisma/client";

// GET /api/radius-attributes — List defs or list user attributes
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    if (action === "list-defs") {
      return handleListDefs();
    }

    if (action === "list-user") {
      const subscriberId = searchParams.get("subscriberId");
      if (!subscriberId) {
        return NextResponse.json({ error: "subscriberId query parameter is required" }, { status: 400 });
      }
      return handleListUserAttrs(subscriberId);
    }

    return NextResponse.json(
      { error: "Invalid action. Use ?action=list-defs or ?action=list-user&subscriberId=xxx" },
      { status: 400 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const status = (error as any)?.statusCode || 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

// POST /api/radius-attributes — CRUD for defs and user attributes
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");
    const body = await req.json();

    switch (action) {
      case "create-def":
        return handleCreateDef(body);
      case "update-def":
        return handleUpdateDef(body);
      case "delete-def":
        return handleDeleteDef(body);
      case "set-user":
        return handleSetUserAttr(body);
      case "remove-user":
        return handleRemoveUserAttr(body);
      case "set-bulk":
        return handleSetBulkAttrs(body);
      default:
        return NextResponse.json(
          { error: `Invalid action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const status = (error as any)?.statusCode || 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

// ─── Attribute Definition Handlers ──────────────────────────

async function handleListDefs() {
  const defs = await db.radiusAttributeDef.findMany({
    orderBy: [{ vendorId: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: { userAttributes: true },
      },
    },
  });

  return NextResponse.json({ definitions: defs });
}

async function handleCreateDef(body: Record<string, unknown>) {
  const { name, attributeName, vendorId, vendorName, attrType, dataType, description } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Attribute definition name is required" }, { status: 400 });
  }

  const existing = await db.radiusAttributeDef.findUnique({
    where: { name: name.trim() },
  });
  if (existing) {
    return NextResponse.json({ error: "Attribute definition with this name already exists" }, { status: 409 });
  }

  const def = await db.radiusAttributeDef.create({
    data: {
      name: name.trim(),
      attributeName: typeof attributeName === "string" ? attributeName : "",
      vendorId: typeof vendorId === "number" ? vendorId : 0,
      vendorName: typeof vendorName === "string" ? vendorName : "",
      attrType: (typeof attrType === "string" ? attrType : "BOTH") as RadiusAttrType,
      dataType: (typeof dataType === "string" ? dataType : "STRING") as RadiusAttrDataType,
      description: typeof description === "string" ? description : "",
    },
    include: {
      _count: { select: { userAttributes: true } },
    },
  });

  return NextResponse.json({ definition: def }, { status: 201 });
}

async function handleUpdateDef(body: Record<string, unknown>) {
  const { id, name, attributeName, vendorId, vendorName, attrType, dataType, description, enabled } = body;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Definition ID is required" }, { status: 400 });
  }

  const existing = await db.radiusAttributeDef.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Attribute definition not found" }, { status: 404 });
  }

  // Check name uniqueness if changing
  if (name && typeof name === "string" && name.trim() && name.trim() !== existing.name) {
    const duplicate = await db.radiusAttributeDef.findFirst({
      where: { name: name.trim(), NOT: { id } },
    });
    if (duplicate) {
      return NextResponse.json({ error: "Attribute definition with this name already exists" }, { status: 409 });
    }
  }

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = String(name).trim();
  if (attributeName !== undefined) updateData.attributeName = String(attributeName);
  if (vendorId !== undefined) updateData.vendorId = Number(vendorId);
  if (vendorName !== undefined) updateData.vendorName = String(vendorName);
  if (attrType !== undefined) updateData.attrType = String(attrType);
  if (dataType !== undefined) updateData.dataType = String(dataType);
  if (description !== undefined) updateData.description = String(description);
  if (enabled !== undefined) updateData.enabled = Boolean(enabled);

  const updated = await db.radiusAttributeDef.update({
    where: { id },
    data: updateData,
    include: {
      _count: { select: { userAttributes: true } },
    },
  });

  return NextResponse.json({ definition: updated });
}

async function handleDeleteDef(body: Record<string, unknown>) {
  const { id } = body;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Definition ID is required" }, { status: 400 });
  }

  const existing = await db.radiusAttributeDef.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Attribute definition not found" }, { status: 404 });
  }

  // Cascade delete will remove associated UserRadiusAttribute records
  await db.radiusAttributeDef.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

// ─── User Attribute Handlers ───────────────────────────────

async function handleListUserAttrs(subscriberId: string) {
  // Verify subscriber exists
  const subscriber = await db.subscriber.findUnique({
    where: { id: subscriberId },
    select: { id: true, code: true, name: true },
  });
  if (!subscriber) {
    return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
  }

  const attrs = await db.userRadiusAttribute.findMany({
    where: { subscriberId },
    include: {
      attributeDef: {
        select: {
          id: true,
          name: true,
          attributeName: true,
          vendorId: true,
          vendorName: true,
          attrType: true,
          dataType: true,
          description: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    Subscriber: { id: subscriber.id, code: subscriber.code, name: subscriber.name },
    attributes: attrs,
  });
}

async function handleSetUserAttr(body: Record<string, unknown>) {
  const { subscriberId, attributeDefId, value, operator } = body;

  if (!subscriberId || typeof subscriberId !== "string") {
    return NextResponse.json({ error: "Subscriber ID is required" }, { status: 400 });
  }
  if (!attributeDefId || typeof attributeDefId !== "string") {
    return NextResponse.json({ error: "Attribute definition ID is required" }, { status: 400 });
  }

  // Verify subscriber exists
  const subscriber = await db.subscriber.findUnique({ where: { id: subscriberId } });
  if (!subscriber) {
    return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
  }

  // Verify attribute definition exists
  const attrDef = await db.radiusAttributeDef.findUnique({ where: { id: attributeDefId } });
  if (!attrDef) {
    return NextResponse.json({ error: "Attribute definition not found" }, { status: 404 });
  }

  // Upsert — the unique constraint [subscriberId, attributeDefId] ensures one attr per def per user
  const attr = await db.userRadiusAttribute.upsert({
    where: {
      subscriberId_attributeDefId: {
        subscriberId,
        attributeDefId,
      },
    },
    update: {
      value: typeof value === "string" ? value : "",
      operator: typeof operator === "string" ? operator : ":=",
    },
    create: {
      subscriberId,
      attributeDefId,
      value: typeof value === "string" ? value : "",
      operator: typeof operator === "string" ? operator : ":=",
    },
    include: {
      attributeDef: {
        select: {
          id: true,
          name: true,
          attributeName: true,
          vendorId: true,
          vendorName: true,
          attrType: true,
          dataType: true,
        },
      },
    },
  });

  return NextResponse.json({ attribute: attr });
}

async function handleRemoveUserAttr(body: Record<string, unknown>) {
  const { id } = body;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "User attribute ID is required" }, { status: 400 });
  }

  const existing = await db.userRadiusAttribute.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "User attribute not found" }, { status: 404 });
  }

  await db.userRadiusAttribute.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

async function handleSetBulkAttrs(body: Record<string, unknown>) {
  const { subscriberId, attributes } = body;

  if (!subscriberId || typeof subscriberId !== "string") {
    return NextResponse.json({ error: "Subscriber ID is required" }, { status: 400 });
  }
  if (!Array.isArray(attributes) || attributes.length === 0) {
    return NextResponse.json({ error: "attributes array is required and must not be empty" }, { status: 400 });
  }

  // Verify subscriber exists
  const subscriber = await db.subscriber.findUnique({ where: { id: subscriberId } });
  if (!subscriber) {
    return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
  }

  // Validate all attribute definitions exist
  const defIds = attributes.map((a: any) => a.attributeDefId).filter(Boolean);
  if (defIds.length === 0) {
    return NextResponse.json({ error: "Each attribute must have an attributeDefId" }, { status: 400 });
  }

  const defs = await db.radiusAttributeDef.findMany({
    where: { id: { in: defIds } },
    select: { id: true },
  });
  const defIdSet = new Set(defs.map((d) => d.id));

  const invalidDefs = defIds.filter((id: string) => !defIdSet.has(id));
  if (invalidDefs.length > 0) {
    return NextResponse.json(
      { error: `${invalidDefs.length} attribute definition(s) not found` },
      { status: 400 }
    );
  }

  // Perform bulk upsert using a transaction
  const results = await db.$transaction(
    attributes.map((attr: any) =>
      db.userRadiusAttribute.upsert({
        where: {
          subscriberId_attributeDefId: {
            subscriberId,
            attributeDefId: attr.attributeDefId,
          },
        },
        update: {
          value: typeof attr.value === "string" ? attr.value : "",
          operator: typeof attr.operator === "string" ? attr.operator : ":=",
        },
        create: {
          subscriberId,
          attributeDefId: attr.attributeDefId,
          value: typeof attr.value === "string" ? attr.value : "",
          operator: typeof attr.operator === "string" ? attr.operator : ":=",
        },
        include: {
          attributeDef: {
            select: {
              id: true,
              name: true,
              attributeName: true,
              vendorId: true,
              vendorName: true,
              attrType: true,
              dataType: true,
            },
          },
        },
      })
    )
  );

  return NextResponse.json({
    success: true,
    count: results.length,
    attributes: results,
  });
}
