import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";

// GET /api/add-on-services/subscriptions?subscriberId=xxx — List subscriber's add-on subscriptions
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
      select: { id: true, name: true, code: true },
    });
    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    const addOns = await db.subscriberAddOn.findMany({
      where: { subscriberId },
      include: {
        AddOnService: {
          select: {
            id: true,
            name: true,
            description: true,
            chargeType: true,
            chargeValue: true,
            validityDays: true,
          },
        },
      },
      orderBy: { startDate: "desc" },
    });

    const mapped = addOns.map((a) => ({
      id: a.id,
      subscriberId: a.subscriberId,
      subscriberName: subscriber.name,
      subscriberCode: subscriber.code,
      serviceId: a.addOnServiceId,
      serviceName: a.AddOnService?.name || "Unknown",
      serviceType: mapChargeType(a.AddOnService?.chargeType),
      subscribedAt: a.startDate.toISOString(),
      expiresAt: a.endDate ? a.endDate.toISOString() : null,
      status: a.status,
      pricePaid: a.chargeAmount,
      autoRenew: a.autoRenew,
    }));

    return NextResponse.json({ subscriptions: mapped });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Add-on subscriptions GET error:", error);
    return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 });
  }
}

// DELETE /api/add-on-services/subscriptions/:id — Unsubscribe (cancel) from an add-on
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;

    const existing = await db.subscriberAddOn.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    if (existing.status !== "ACTIVE") {
      return NextResponse.json(
        { error: `Cannot unsubscribe. Subscription status is: ${existing.status}` },
        { status: 400 }
      );
    }

    const addOn = await db.subscriberAddOn.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({ success: true, subscription: addOn });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Add-on subscription DELETE error:", error);
    return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 });
  }
}

function mapChargeType(chargeType?: string): string {
  switch (chargeType) {
    case "FLAT": return "SPEED_BOOST";
    case "PER_DAY": return "DATA_TOPUP";
    case "PER_GB": return "DATA_TOPUP";
    case "PER_MONTH": return "PREMIUM_SUPPORT";
    default: return "CUSTOM";
  }
}
