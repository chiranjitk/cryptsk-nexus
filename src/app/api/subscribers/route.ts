import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";

const VALID_SUBSCRIBER_STATUSES = ["active", "inactive", "suspended", "terminated", "pending_activation", "expired"];

// GET /api/subscribers — list subscribers (filters: customerId, status, search, limit)
export async function GET(req: NextRequest) {
  try {
    await requirePermission("subscriber", "list");

    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customerId") || "";
    const status = searchParams.get("status") || "";
    const search = searchParams.get("search") || "";
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);

    const where: Record<string, unknown> = {};
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { radiusUsername: { contains: search } },
        { fullName: { contains: search } },
        { subscriberCode: { contains: search } },
        { email: { contains: search } },
        { mobile: { contains: search } },
      ];
    }

    const subscribers = await db.subscriber.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        plan: { select: { id: true, planCode: true, name: true, billingCycle: true, basePrice: true } },
        subscriptions: {
          take: 1,
          orderBy: { createdAt: "desc" },
          include: { plan: { include: { product: { select: { name: true, productCode: true } } } } },
        },
        customer: { select: { id: true, customerCode: true, displayName: true } },
      },
    });

    return NextResponse.json({ subscribers });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch subscribers" }, { status: 500 });
  }
}

// POST /api/subscribers — create subscriber (RADIUS user)
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("subscriber", "create");
    const body = await req.json();
    const {
      customerId, radiusUsername, password, fullName, email, mobile,
      planId, nasId, staticIp, vlanId, status, installationAddressId,
    } = body;

    if (!customerId || !radiusUsername) {
      return NextResponse.json({ error: "customerId and radiusUsername are required" }, { status: 400 });
    }

    const customer = await db.customer.findUnique({ where: { id: customerId } });
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    const dup = await db.subscriber.findUnique({ where: { radiusUsername } });
    if (dup) return NextResponse.json({ error: "RADIUS username already exists" }, { status: 409 });

    if (planId) {
      const plan = await db.plan.findUnique({ where: { id: planId } });
      if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // Generate subscriber code: SUB-XXXXXX
    const count = await db.subscriber.count();
    const subscriberCode = `SUB-${String(count + 1).padStart(6, "0")}`;

    // Schema stores bcrypt hash in Subscriber.radiusPasswordHash
    const radiusPasswordHash = password ? await bcrypt.hash(String(password), 12) : "";

    const subscriber = await db.subscriber.create({
      data: {
        customerId,
        subscriberCode,
        radiusUsername,
        radiusPasswordHash,
        status: status && VALID_SUBSCRIBER_STATUSES.includes(status) ? status : "pending_activation",
        planId: planId || null,
        nasId: nasId || null,
        fullName: fullName || null,
        email: email || null,
        mobile: mobile || null,
        staticIp: staticIp || null,
        vlanId: vlanId !== undefined && vlanId !== null && vlanId !== "" ? Number(vlanId) : null,
        installationAddressId: installationAddressId || null,
        createdBy: user.id,
        updatedBy: user.id,
      },
      include: {
        plan: { select: { id: true, planCode: true, name: true } },
        customer: { select: { id: true, customerCode: true, displayName: true } },
      },
    });

    // Sync RADIUS credentials to radcheck (Cleartext-Password := value)
    if (password) {
      await db.radCheck.create({
        data: {
          username: radiusUsername,
          attribute: "Cleartext-Password",
          op: ":=",
          value: String(password),
          subscriberId: subscriber.id,
        },
      });
    }

    // Sync RADIUS group membership when a plan with a RADIUS group is attached
    if (planId) {
      const plan = await db.plan.findUnique({
        where: { id: planId },
        include: { product: { select: { radiusGroupName: true } } },
      });
      const groupName = plan?.radiusGroupName || plan?.product?.radiusGroupName;
      if (groupName) {
        await db.radUserGroup.create({
          data: { username: radiusUsername, groupname: groupName, priority: 1, subscriberId: subscriber.id },
        });
      }
    }

    await auditCreateEntity({
      userId: user.id,
      resource: "subscriber",
      resourceId: subscriber.id,
      resourceName: subscriberCode,
      after: { subscriberCode, radiusUsername, customerId, planId: planId || null, status: subscriber.status },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ subscriber }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to create subscriber" }, { status: 500 });
  }
}
