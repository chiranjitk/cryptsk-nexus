import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─────────────────────────────────────────────────────────────
// GET — List services, list subscriber's add-ons
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = req.nextUrl;
    const action = searchParams.get("action");

    // ── List all available add-on services ──
    if (action === "list-services") {
      const includeInactive = searchParams.get("includeInactive") === "true";

      const where: Record<string, unknown> = {};
      if (!includeInactive) {
        where.isActive = true;
      }

      const services = await db.addOnService.findMany({
        where,
        orderBy: { sortOrder: "asc" },
        include: {
          _count: {
            select: { SubscriberAddOn: true },
          },
        },
      });

      return NextResponse.json({ services });
    }

    // ── List a subscriber's active add-ons ──
    if (action === "list-subscriber") {
      const subscriberId = searchParams.get("subscriberId");
      if (!subscriberId) {
        return NextResponse.json(
          { error: "Missing required query param: subscriberId" },
          { status: 400 }
        );
      }

      const status = searchParams.get("status");
      const where: Record<string, unknown> = { subscriberId };
      if (status) {
        where.status = status;
      } else {
        // Default to active only
        where.status = "ACTIVE";
      }

      const addOns = await db.subscriberAddOn.findMany({
        where,
        include: {
          AddOnService: {
            select: {
              id: true,
              name: true,
              description: true,
              chargeType: true,
              chargeValue: true,
              validityDays: true,
              dataMb: true,
            },
          },
        },
        orderBy: { startDate: "desc" },
      });

      return NextResponse.json({ addOns });
    }

    return NextResponse.json(
      { error: "Unknown action. Valid GET actions: list-services, list-subscriber" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Add-on services GET error:", error);
    return NextResponse.json({ error: "Failed to fetch add-on services" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
// POST — CRUD for services, subscribe/unsubscribe/renew
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = req.nextUrl;
    const action = searchParams.get("action");
    const body = await req.json();

    // ── Create add-on service ──
    if (action === "create-service") {
      const { name, description, chargeType, chargeValue, validityDays, dataMb, isActive, sortOrder } = body;

      if (!name) {
        return NextResponse.json(
          { error: "Missing required field: name" },
          { status: 400 }
        );
      }

      // Check for duplicate name
      const existing = await db.addOnService.findUnique({ where: { name } });
      if (existing) {
        return NextResponse.json(
          { error: "An add-on service with this name already exists" },
          { status: 409 }
        );
      }

      // Validate chargeType
      const validChargeTypes = ["FLAT", "PER_DAY", "PER_GB", "PER_MONTH"];
      if (chargeType && !validChargeTypes.includes(chargeType)) {
        return NextResponse.json(
          { error: `Invalid chargeType. Must be one of: ${validChargeTypes.join(", ")}` },
          { status: 400 }
        );
      }

      const service = await db.addOnService.create({
        data: {
          name,
          description: description ?? "",
          chargeType: chargeType ?? "FLAT",
          chargeValue: chargeValue ?? 0,
          validityDays: validityDays ?? 30,
          dataMb: dataMb ?? null,
          isActive: isActive ?? true,
          sortOrder: sortOrder ?? 0,
        },
      });

      return NextResponse.json({ service }, { status: 201 });
    }

    // ── Update add-on service ──
    if (action === "update-service") {
      const { id, name, description, chargeType, chargeValue, validityDays, dataMb, isActive, sortOrder } = body;

      if (!id) {
        return NextResponse.json(
          { error: "Missing required field: id" },
          { status: 400 }
        );
      }

      const existing = await db.addOnService.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: "Add-on service not found" }, { status: 404 });
      }

      // If name is being changed, check for duplicate
      if (name && name !== existing.name) {
        const nameExists = await db.addOnService.findUnique({ where: { name } });
        if (nameExists) {
          return NextResponse.json(
            { error: "An add-on service with this name already exists" },
            { status: 409 }
          );
        }
      }

      // Validate chargeType if provided
      if (chargeType) {
        const validChargeTypes = ["FLAT", "PER_DAY", "PER_GB", "PER_MONTH"];
        if (!validChargeTypes.includes(chargeType)) {
          return NextResponse.json(
            { error: `Invalid chargeType. Must be one of: ${validChargeTypes.join(", ")}` },
            { status: 400 }
          );
        }
      }

      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (chargeType !== undefined) updateData.chargeType = chargeType;
      if (chargeValue !== undefined) updateData.chargeValue = chargeValue;
      if (validityDays !== undefined) updateData.validityDays = validityDays;
      if (dataMb !== undefined) updateData.dataMb = dataMb;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

      const service = await db.addOnService.update({
        where: { id },
        data: updateData,
      });

      return NextResponse.json({ service });
    }

    // ── Delete add-on service ──
    if (action === "delete-service") {
      const { id } = body;

      if (!id) {
        return NextResponse.json(
          { error: "Missing required field: id" },
          { status: 400 }
        );
      }

      const existing = await db.addOnService.findUnique({
        where: { id },
        include: {
          _count: {
            select: { SubscriberAddOn: true },
          },
        },
      });

      if (!existing) {
        return NextResponse.json({ error: "Add-on service not found" }, { status: 404 });
      }

      // Check if there are active subscriber add-ons using this service
      const activeSubscriptions = await db.subscriberAddOn.count({
        where: {
          addOnServiceId: id,
          status: "ACTIVE",
        },
      });

      if (activeSubscriptions > 0) {
        return NextResponse.json(
          {
            error: `Cannot delete add-on service. It has ${activeSubscriptions} active subscriber subscription(s). Cancel them first or deactivate the service instead.`,
          },
          { status: 400 }
        );
      }

      await db.addOnService.delete({ where: { id } });

      return NextResponse.json({ success: true, message: "Add-on service deleted" });
    }

    // ── Subscribe to add-on ──
    if (action === "subscribe") {
      const { subscriberId, addOnServiceId, chargeAmount, endDate, autoRenew } = body;

      if (!subscriberId || !addOnServiceId) {
        return NextResponse.json(
          { error: "Missing required fields: subscriberId, addOnServiceId" },
          { status: 400 }
        );
      }

      // Verify subscriber exists
      const subscriber = await db.subscriber.findUnique({
        where: { id: subscriberId },
      });
      if (!subscriber) {
        return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
      }

      // Verify service exists and is active
      const service = await db.addOnService.findUnique({
        where: { id: addOnServiceId },
      });
      if (!service) {
        return NextResponse.json({ error: "Add-on service not found" }, { status: 404 });
      }
      if (!service.isActive) {
        return NextResponse.json(
          { error: "Cannot subscribe to an inactive add-on service" },
          { status: 400 }
        );
      }

      // Check for duplicate active subscription
      const existingSub = await db.subscriberAddOn.findFirst({
        where: {
          subscriberId,
          addOnServiceId,
          status: "ACTIVE",
        },
      });
      if (existingSub) {
        return NextResponse.json(
          { error: "Subscriber already has an active subscription to this add-on service" },
          { status: 409 }
        );
      }

      // Calculate end date if not provided
      let resolvedEndDate: Date | null = endDate ? new Date(endDate) : null;
      if (!resolvedEndDate) {
        resolvedEndDate = new Date();
        resolvedEndDate.setDate(resolvedEndDate.getDate() + service.validityDays);
      }

      const addOn = await db.subscriberAddOn.create({
        data: {
          subscriberId,
          addOnServiceId,
          startDate: new Date(),
          endDate: resolvedEndDate,
          chargeAmount: chargeAmount ?? service.chargeValue,
          autoRenew: autoRenew ?? false,
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
              dataMb: true,
            },
          },
        },
      });

      return NextResponse.json({ addOn }, { status: 201 });
    }

    // ── Unsubscribe from add-on (sets status to CANCELLED) ──
    if (action === "unsubscribe") {
      const { id } = body;

      if (!id) {
        return NextResponse.json(
          { error: "Missing required field: id" },
          { status: 400 }
        );
      }

      const existing = await db.subscriberAddOn.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: "Subscriber add-on not found" }, { status: 404 });
      }

      if (existing.status !== "ACTIVE") {
        return NextResponse.json(
          { error: `Cannot unsubscribe. Add-on status is already: ${existing.status}` },
          { status: 400 }
        );
      }

      const addOn = await db.subscriberAddOn.update({
        where: { id },
        data: { status: "CANCELLED" },
      });

      return NextResponse.json({ addOn });
    }

    // ── Renew add-on ──
    if (action === "renew") {
      const { id, endDate } = body;

      if (!id) {
        return NextResponse.json(
          { error: "Missing required field: id" },
          { status: 400 }
        );
      }

      const existing = await db.subscriberAddOn.findUnique({
        where: { id },
        include: {
          AddOnService: {
            select: { validityDays: true },
          },
        },
      });

      if (!existing) {
        return NextResponse.json({ error: "Subscriber add-on not found" }, { status: 404 });
      }

      // Can only renew CANCELLED or EXPIRED add-ons
      if (existing.status === "ACTIVE") {
        return NextResponse.json(
          { error: "Cannot renew an active add-on. It is already active." },
          { status: 400 }
        );
      }

      // Calculate end date if not provided
      let resolvedEndDate: Date | null = endDate ? new Date(endDate) : null;
      if (!resolvedEndDate) {
        resolvedEndDate = new Date();
        resolvedEndDate.setDate(resolvedEndDate.getDate() + existing.AddOnService.validityDays);
      }

      const addOn = await db.subscriberAddOn.update({
        where: { id },
        data: {
          status: "ACTIVE",
          startDate: new Date(),
          endDate: resolvedEndDate,
        },
      });

      return NextResponse.json({ addOn });
    }

    return NextResponse.json(
      {
        error:
          "Unknown action. Valid POST actions: create-service, update-service, delete-service, subscribe, unsubscribe, renew",
      },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Add-on services POST error:", error);
    return NextResponse.json({ error: "Failed to perform add-on service operation" }, { status: 500 });
  }
}
