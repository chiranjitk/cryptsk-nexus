import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditUpdate, auditDelete } from "@/lib/audit";

const VALID_SUBSCRIBER_STATUSES = ["active", "inactive", "suspended", "terminated", "pending_activation", "expired"];

// GET /api/subscribers/[id] — subscriber detail with subscription, plan and recent sessions
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("subscriber", "read");
    const { id } = await params;

    const subscriber = await db.subscriber.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, customerCode: true, displayName: true, status: true } },
        plan: { include: { product: { select: { name: true, productCode: true } } } },
        subscriptions: {
          orderBy: { createdAt: "desc" },
          include: { plan: { include: { product: { select: { name: true, productCode: true } } } } },
        },
      },
    });

    if (!subscriber) return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });

    // Recent RADIUS sessions for this subscriber's username
    const radacct = await db.radAcct.findMany({
      where: { username: subscriber.radiusUsername },
      orderBy: { acctstarttime: "desc" },
      take: 20,
    });
    // Convert BigInt fields — JSON.stringify cannot serialize BigInt
    const sessions = radacct.map((s) => ({
      radacctid: String(s.radacctid),
      username: s.username,
      acctsessionid: s.acctsessionid,
      acctstarttime: s.acctstarttime,
      acctstoptime: s.acctstoptime,
      acctsessiontime: s.acctsessiontime !== null ? Number(s.acctsessiontime) : null,
      acctinputoctets: s.acctinputoctets !== null ? Number(s.acctinputoctets) : null,
      acctoutputoctets: s.acctoutputoctets !== null ? Number(s.acctoutputoctets) : null,
      nasipaddress: s.nasipaddress,
      framedipaddress: s.framedipaddress,
      acctterminatecause: s.acctterminatecause,
      calledstationid: s.calledstationid,
      callingstationid: s.callingstationid,
    }));

    return NextResponse.json({ subscriber, sessions });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch subscriber" }, { status: 500 });
  }
}

// PATCH /api/subscribers/[id] — update fields / status transitions (suspend, resume, terminate)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("subscriber", "update");
    const { id } = await params;
    const body = await req.json();
    const { status, fullName, email, mobile, planId, nasId, staticIp, vlanId, expiresAt, radiusPassword } = body;

    const existing = await db.subscriber.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });

    const data: Record<string, unknown> = { updatedBy: user.id };
    let statusChangedTo: string | null = null;

    if (status !== undefined) {
      if (!VALID_SUBSCRIBER_STATUSES.includes(status)) {
        return NextResponse.json({ error: `Invalid status — must be one of: ${VALID_SUBSCRIBER_STATUSES.join(", ")}` }, { status: 400 });
      }
      data.status = status;
      if (status !== existing.status) {
        statusChangedTo = status;
        if (status === "active") {
          data.activatedAt = existing.activatedAt || new Date();
          data.suspendedAt = null;
        } else if (status === "suspended") {
          data.suspendedAt = new Date();
        } else if (status === "terminated") {
          data.terminatedAt = new Date();
        }
      }
    }
    if (fullName !== undefined) data.fullName = fullName || null;
    if (email !== undefined) data.email = email || null;
    if (mobile !== undefined) data.mobile = mobile || null;
    if (nasId !== undefined) data.nasId = nasId || null;
    if (staticIp !== undefined) data.staticIp = staticIp || null;
    if (vlanId !== undefined) data.vlanId = vlanId === null || vlanId === "" ? null : Number(vlanId);
    if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (planId !== undefined) {
      if (planId) {
        const plan = await db.plan.findUnique({ where: { id: planId } });
        if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
      }
      data.planId = planId || null;
    }
    if (radiusPassword) {
      data.radiusPasswordHash = await bcrypt.hash(String(radiusPassword), 12);
    }

    const updated = await db.subscriber.update({
      where: { id },
      data,
      include: { plan: { select: { id: true, planCode: true, name: true } } },
    });

    // Keep RADIUS credential in sync when password rotated
    if (radiusPassword) {
      const radcheck = await db.radCheck.findFirst({
        where: { username: existing.radiusUsername, attribute: "Cleartext-Password" },
      });
      if (radcheck) {
        await db.radCheck.update({ where: { id: radcheck.id }, data: { value: String(radiusPassword) } });
      } else {
        await db.radCheck.create({
          data: {
            username: existing.radiusUsername,
            attribute: "Cleartext-Password",
            op: ":=",
            value: String(radiusPassword),
            subscriberId: id,
          },
        });
      }
    }

    // Keep RADIUS group membership in sync when plan changes
    if (planId !== undefined) {
      await db.radUserGroup.deleteMany({ where: { username: existing.radiusUsername } });
      if (planId) {
        const plan = await db.plan.findUnique({
          where: { id: planId },
          include: { product: { select: { radiusGroupName: true } } },
        });
        const groupName = plan?.radiusGroupName || plan?.product?.radiusGroupName;
        if (groupName) {
          await db.radUserGroup.create({
            data: { username: existing.radiusUsername, groupname: groupName, priority: 1, subscriberId: id },
          });
        }
      }
    }

    await auditUpdate({
      userId: user.id,
      resource: "subscriber",
      resourceId: id,
      resourceName: existing.subscriberCode,
      before: {
        status: existing.status, fullName: existing.fullName, email: existing.email,
        mobile: existing.mobile, planId: existing.planId, staticIp: existing.staticIp,
      },
      after: {
        status: updated.status, fullName: updated.fullName, email: updated.email,
        mobile: updated.mobile, planId: updated.planId, staticIp: updated.staticIp,
        passwordRotated: Boolean(radiusPassword), statusChangedTo,
      },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ subscriber: updated });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to update subscriber" }, { status: 500 });
  }
}

// DELETE /api/subscribers/[id] — delete (blocked while an active subscription exists)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("subscriber", "delete");
    const { id } = await params;

    const existing = await db.subscriber.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });

    const activeSubscription = await db.subscription.findFirst({
      where: { subscriberId: id, status: "active" },
    });
    if (activeSubscription) {
      return NextResponse.json(
        {
          error: "Cannot delete subscriber with an active subscription. Suspend or terminate it first.",
          code: "FK_CONSTRAINT",
          details: { activeSubscriptions: 1, subscriptionCode: activeSubscription.subscriptionCode },
        },
        { status: 409 }
      );
    }

    // Remove RADIUS credentials and group membership for this username
    await db.radCheck.deleteMany({ where: { username: existing.radiusUsername } });
    await db.radUserGroup.deleteMany({ where: { username: existing.radiusUsername } });
    await db.subscriber.delete({ where: { id } });

    await auditDelete({
      userId: user.id,
      resource: "subscriber",
      resourceId: id,
      resourceName: existing.subscriberCode,
      before: { subscriberCode: existing.subscriberCode, radiusUsername: existing.radiusUsername, status: existing.status },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to delete subscriber" }, { status: 500 });
  }
}
