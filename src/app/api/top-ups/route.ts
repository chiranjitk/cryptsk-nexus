import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ============================================================
// Top-Ups — Products & Subscriber Purchases
// ============================================================

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = req.nextUrl;
    const action = searchParams.get("action");

    // ── List all top-up products ───────────────────────────
    if (action === "list-products") {
      const type = searchParams.get("type");
      const activeOnly = searchParams.get("active") !== "false";

      const where: Record<string, unknown> = {};
      if (type && type !== "ALL") {
        where.type = type;
      }
      if (activeOnly) {
        where.isActive = true;
      }

      const products = await db.topUpProduct.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
      });

      return NextResponse.json({ products });
    }

    // ── List subscriber's top-up purchases ─────────────────
    if (action === "list-subscriber") {
      const subscriberId = searchParams.get("subscriberId");
      if (!subscriberId) {
        return NextResponse.json(
          { error: "Missing required parameter: subscriberId" },
          { status: 400 }
        );
      }

      const subscriber = await db.subscriber.findUnique({
        where: { id: subscriberId },
        select: { id: true, name: true, code: true },
      });

      if (!subscriber) {
        return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
      }

      const purchases = await db.subscriberTopUp.findMany({
        where: { subscriberId },
        include: {
          TopUpProduct: {
            select: {
              id: true,
              name: true,
              type: true,
              value: true,
              validityHours: true,
            },
          },
        },
        orderBy: { purchasedAt: "desc" },
      });

      return NextResponse.json({ subscriber, purchases });
    }

    // ── Get active (non-expired) top-ups for a subscriber ──
    if (action === "active") {
      const subscriberId = searchParams.get("subscriberId");
      if (!subscriberId) {
        return NextResponse.json(
          { error: "Missing required parameter: subscriberId" },
          { status: 400 }
        );
      }

      const subscriber = await db.subscriber.findUnique({
        where: { id: subscriberId },
        select: { id: true, name: true, code: true },
      });

      if (!subscriber) {
        return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
      }

      const now = new Date();

      const activeTopUps = await db.subscriberTopUp.findMany({
        where: {
          subscriberId,
          status: "ACTIVE",
          OR: [
            { expiresAt: null }, // No expiry
            { expiresAt: { gt: now } }, // Not yet expired
          ],
        },
        include: {
          TopUpProduct: {
            select: {
              id: true,
              name: true,
              type: true,
              value: true,
              validityHours: true,
            },
          },
        },
        orderBy: { purchasedAt: "desc" },
      });

      // Also mark any that have expired since last check
      const expiredSinceLastCheck = await db.subscriberTopUp.findMany({
        where: {
          subscriberId,
          status: "ACTIVE",
          expiresAt: { lte: now },
        },
        select: { id: true },
      });

      if (expiredSinceLastCheck.length > 0) {
        await db.subscriberTopUp.updateMany({
          where: {
            id: { in: expiredSinceLastCheck.map((t) => t.id) },
          },
          data: { status: "EXPIRED" },
        });
      }

      return NextResponse.json({
        subscriber,
        activeTopUps,
        expiredCount: expiredSinceLastCheck.length,
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Use: list-products, list-subscriber, active" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Top-Ups GET error:", error);
    return NextResponse.json({ error: "Failed to fetch top-up data" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = req.nextUrl;
    const action = searchParams.get("action");
    const body = await req.json();

    // ── Create top-up product ──────────────────────────────
    if (action === "create-product") {
      const { name, description, type, value, validityHours, price, isActive, sortOrder } = body;

      if (!name || !type || price === undefined) {
        return NextResponse.json(
          { error: "Missing required fields: name, type, price" },
          { status: 400 }
        );
      }

      const validTypes = ["DATA", "TIME", "SPEED_BOOST"];
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
          { status: 400 }
        );
      }

      const product = await db.topUpProduct.create({
        data: {
          name,
          description: description || "",
          type,
          value: value ?? 0,
          validityHours: validityHours ?? 24,
          price: parseFloat(price),
          isActive: isActive ?? true,
          sortOrder: sortOrder ?? 0,
        },
      });

      return NextResponse.json({ product }, { status: 201 });
    }

    // ── Update top-up product ──────────────────────────────
    if (action === "update-product") {
      const { id, name, description, type, value, validityHours, price, isActive, sortOrder } = body;

      if (!id) {
        return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
      }

      const existing = await db.topUpProduct.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }

      const product = await db.topUpProduct.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(type !== undefined && { type }),
          ...(value !== undefined && { value }),
          ...(validityHours !== undefined && { validityHours }),
          ...(price !== undefined && { price: parseFloat(price) }),
          ...(isActive !== undefined && { isActive }),
          ...(sortOrder !== undefined && { sortOrder }),
        },
      });

      return NextResponse.json({ product });
    }

    // ── Delete top-up product ──────────────────────────────
    if (action === "delete-product") {
      const { id } = body;

      if (!id) {
        return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
      }

      const existing = await db.topUpProduct.findUnique({
        where: { id },
        include: {
          purchases: {
            where: { status: "ACTIVE" },
            select: { id: true },
          },
        },
      });

      if (!existing) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }

      if (existing.purchases.length > 0) {
        return NextResponse.json(
          {
            error: "Cannot delete product with active purchases. Deactivate it instead.",
            activePurchases: existing.purchases.length,
          },
          { status: 409 }
        );
      }

      await db.topUpProduct.delete({ where: { id } });

      return NextResponse.json({ success: true });
    }

    // ── Purchase top-up ────────────────────────────────────
    if (action === "purchase") {
      const { subscriberId, topUpProductId, transactionId } = body;

      if (!subscriberId || !topUpProductId) {
        return NextResponse.json(
          { error: "Missing required fields: subscriberId, topUpProductId" },
          { status: 400 }
        );
      }

      // Verify subscriber
      const subscriber = await db.subscriber.findUnique({
        where: { id: subscriberId },
        select: { id: true, name: true, code: true, status: true },
      });
      if (!subscriber) {
        return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
      }

      // Verify product
      const product = await db.topUpProduct.findUnique({ where: { id: topUpProductId } });
      if (!product) {
        return NextResponse.json({ error: "Top-up product not found" }, { status: 404 });
      }

      if (!product.isActive) {
        return NextResponse.json({ error: "This top-up product is currently inactive." }, { status: 400 });
      }

      // Calculate expiry
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + product.validityHours);

      // Create purchase
      const purchase = await db.subscriberTopUp.create({
        data: {
          subscriberId,
          topUpProductId,
          purchasedAt: new Date(),
          expiresAt,
          usedAmount: 0,
          remainingAmount: product.value,
          status: "ACTIVE",
          transactionId: transactionId || null,
        },
        include: {
          TopUpProduct: {
            select: {
              id: true,
              name: true,
              type: true,
              value: true,
              validityHours: true,
            },
          },
          Subscriber: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      return NextResponse.json({ purchase }, { status: 201 });
    }

    // ── Consume from top-up ────────────────────────────────
    if (action === "consume") {
      const { id, usedAmount } = body;

      if (!id) {
        return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
      }

      if (!usedAmount || usedAmount <= 0) {
        return NextResponse.json({ error: "usedAmount must be a positive number" }, { status: 400 });
      }

      const topUp = await db.subscriberTopUp.findUnique({
        where: { id },
        include: {
          TopUpProduct: { select: { type: true, value: true } },
        },
      });

      if (!topUp) {
        return NextResponse.json({ error: "Top-up purchase not found" }, { status: 404 });
      }

      if (topUp.status !== "ACTIVE") {
        return NextResponse.json(
          { error: `Cannot consume from a ${topUp.status} top-up.` },
          { status: 400 }
        );
      }

      // Check expiry
      if (topUp.expiresAt && topUp.expiresAt < new Date()) {
        await db.subscriberTopUp.update({
          where: { id },
          data: { status: "EXPIRED" },
        });
        return NextResponse.json({ error: "This top-up has expired." }, { status: 400 });
      }

      const newUsed = topUp.usedAmount + usedAmount;
      const newValue = topUp.TopUpProduct.value;

      if (newUsed >= newValue) {
        // Fully consumed
        const updated = await db.subscriberTopUp.update({
          where: { id },
          data: {
            usedAmount: newValue,
            remainingAmount: 0,
            status: "USED",
          },
        });

        return NextResponse.json({
          topUp: updated,
          fullyConsumed: true,
        });
      } else {
        const updated = await db.subscriberTopUp.update({
          where: { id },
          data: {
            usedAmount: newUsed,
            remainingAmount: newValue - newUsed,
          },
        });

        return NextResponse.json({
          topUp: updated,
          fullyConsumed: false,
        });
      }
    }

    return NextResponse.json(
      {
        error:
          "Invalid action. Use: create-product, update-product, delete-product, purchase, consume",
      },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Top-Ups POST error:", error);
    return NextResponse.json({ error: "Failed to process top-up request" }, { status: 500 });
  }
}
