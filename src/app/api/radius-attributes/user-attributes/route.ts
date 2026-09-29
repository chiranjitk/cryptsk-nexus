import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";

// GET /api/radius-attributes/user-attributes?subscriberId=xxx — List user attributes
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const subscriberId = searchParams.get("subscriberId");

    if (!subscriberId) {
      return NextResponse.json({ error: "subscriberId is required" }, { status: 400 });
    }

    // Verify subscriber exists
    const subscriber = await db.subscriber.findUnique({
      where: { id: subscriberId },
      select: { id: true, name: true, code: true, serviceUsername: true },
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
            vendorName: true,
            attrType: true,
            dataType: true,
            description: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Map to the format the page component expects
    const mapped = attrs.map((a) => ({
      id: a.id,
      subscriberId: a.subscriberId,
      attributeDefId: a.attributeDefId,
      value: a.value,
      createdAt: a.createdAt.toISOString(),
      attributeDef: {
        id: a.attributeDef.id,
        name: a.attributeDef.name,
        attributeName: a.attributeDef.attributeName,
        vendor: a.attributeDef.vendorName,
        type: mapAttrType(a.attributeDef.attrType),
        dataType: mapDataType(a.attributeDef.dataType),
        description: a.attributeDef.description,
      },
      Subscriber: {
        id: subscriber.id,
        name: subscriber.name,
        code: subscriber.code,
        serviceUsername: subscriber.serviceUsername,
      },
    }));

    return NextResponse.json({ userAttributes: mapped });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("User attributes GET error:", error);
    return NextResponse.json({ error: "Failed to fetch user attributes" }, { status: 500 });
  }
}

// POST /api/radius-attributes/user-attributes — Set a user attribute
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { subscriberId, attributeDefId, value } = body;

    if (!subscriberId) {
      return NextResponse.json({ error: "subscriberId is required" }, { status: 400 });
    }
    if (!attributeDefId) {
      return NextResponse.json({ error: "attributeDefId is required" }, { status: 400 });
    }
    if (!value && value !== "0") {
      return NextResponse.json({ error: "value is required" }, { status: 400 });
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

    // Upsert using unique constraint [subscriberId, attributeDefId]
    const attr = await db.userRadiusAttribute.upsert({
      where: {
        subscriberId_attributeDefId: { subscriberId, attributeDefId },
      },
      update: { value: String(value) },
      create: {
        subscriberId,
        attributeDefId,
        value: String(value),
      },
      include: {
        attributeDef: {
          select: {
            id: true, name: true, attributeName: true,
            vendorName: true, attrType: true, dataType: true,
          },
        },
      },
    });

    return NextResponse.json({ attribute: attr }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("User attributes POST error:", error);
    return NextResponse.json({ error: "Failed to set user attribute" }, { status: 500 });
  }
}

function mapAttrType(type: string): string {
  switch (type) {
    case "CHECK": return "check";
    case "REPLY": return "reply";
    case "BOTH": return "vendor-specific";
    default: return "vendor-specific";
  }
}

function mapDataType(dt: string): string {
  switch (dt) {
    case "INTEGER": return "integer";
    case "IP_ADDRESS": return "ipaddr";
    case "OCTETS": return "octets";
    default: return "string";
  }
}
