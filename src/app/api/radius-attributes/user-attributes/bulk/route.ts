import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";

// POST /api/radius-attributes/user-attributes/bulk — Bulk assign attributes to users
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { subscriberIds, attributeDefId, value } = body;

    if (!subscriberIds || !Array.isArray(subscriberIds) || subscriberIds.length === 0) {
      return NextResponse.json({ error: "subscriberIds array is required and must not be empty" }, { status: 400 });
    }
    if (!attributeDefId) {
      return NextResponse.json({ error: "attributeDefId is required" }, { status: 400 });
    }
    if (!value && value !== "0") {
      return NextResponse.json({ error: "value is required" }, { status: 400 });
    }

    // Verify attribute definition exists
    const attrDef = await db.radiusAttributeDef.findUnique({ where: { id: attributeDefId } });
    if (!attrDef) {
      return NextResponse.json({ error: "Attribute definition not found" }, { status: 404 });
    }

    // Verify all subscribers exist
    const subscribers = await db.subscriber.findMany({
      where: { id: { in: subscriberIds } },
      select: { id: true },
    });
    const subscriberIdSet = new Set(subscribers.map((s) => s.id));
    const invalidIds = subscriberIds.filter((id: string) => !subscriberIdSet.has(id));
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: `${invalidIds.length} subscriber(s) not found` },
        { status: 400 }
      );
    }

    // Bulk upsert using a transaction
    const results = await db.$transaction(
      subscriberIds.map((subId: string) =>
        db.userRadiusAttribute.upsert({
          where: {
            subscriberId_attributeDefId: {
              subscriberId: subId,
              attributeDefId,
            },
          },
          update: { value: String(value) },
          create: {
            subscriberId: subId,
            attributeDefId,
            value: String(value),
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      count: results.length,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bulk user attributes POST error:", error);
    return NextResponse.json({ error: "Failed to bulk-set user attributes" }, { status: 500 });
  }
}
