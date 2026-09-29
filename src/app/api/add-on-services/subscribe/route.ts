import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";

// POST /api/add-on-services/subscribe — Subscribe a subscriber to an add-on service
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { subscriberId, serviceId } = body;

    if (!subscriberId) {
      return NextResponse.json({ error: "subscriberId is required" }, { status: 400 });
    }
    if (!serviceId) {
      return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
    }

    // Verify subscriber exists
    const subscriber = await db.subscriber.findUnique({
      where: { id: subscriberId },
      select: { id: true, name: true, code: true },
    });
    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    // Verify service exists and is active
    const service = await db.addOnService.findUnique({
      where: { id: serviceId },
    });
    if (!service) {
      return NextResponse.json({ error: "Add-on service not found" }, { status: 404 });
    }
    if (!service.isActive) {
      return NextResponse.json({ error: "Cannot subscribe to an inactive add-on service" }, { status: 400 });
    }

    // Check for duplicate active subscription
    const existingSub = await db.subscriberAddOn.findFirst({
      where: {
        subscriberId,
        addOnServiceId: serviceId,
        status: "ACTIVE",
      },
    });
    if (existingSub) {
      return NextResponse.json(
        { error: "Subscriber already has an active subscription to this add-on service" },
        { status: 409 }
      );
    }

    // Calculate end date
    let endDate: Date | null = null;
    if (service.validityDays > 0) {
      endDate = new Date();
      endDate.setDate(endDate.getDate() + service.validityDays);
    }

    const addOn = await db.subscriberAddOn.create({
      data: {
        subscriberId,
        addOnServiceId: serviceId,
        startDate: new Date(),
        endDate,
        chargeAmount: service.chargeValue,
        autoRenew: false,
      },
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
    });

    return NextResponse.json({
      subscription: mapSubscription(addOn, subscriber),
    }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Add-on subscribe POST error:", error);
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }
}

// Helper: Map to page format
function mapSubscription(addOn: any, subscriber: any) {
  return {
    id: addOn.id,
    subscriberId: addOn.subscriberId,
    subscriberName: subscriber.name,
    subscriberCode: subscriber.code,
    serviceId: addOn.addOnServiceId,
    serviceName: addOn.AddOnService?.name || "Unknown",
    serviceType: mapChargeType(addOn.AddOnService?.chargeType),
    subscribedAt: addOn.startDate.toISOString(),
    expiresAt: addOn.endDate ? addOn.endDate.toISOString() : null,
    status: addOn.status,
    pricePaid: addOn.chargeAmount,
    autoRenew: addOn.autoRenew,
  };
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
