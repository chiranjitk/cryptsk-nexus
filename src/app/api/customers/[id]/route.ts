import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditUpdate, auditDelete } from "@/lib/audit";

const VALID_CUSTOMER_STATUSES = ["active", "inactive", "suspended", "blacklisted", "prospect"];

// GET /api/customers/[id] — full Customer 360 payload
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("subscriber", "read");
    const { id } = await params;

    const customer = await db.customer.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: { createdAt: "asc" } },
        addresses: { orderBy: { createdAt: "asc" } },
        subscribers: {
          orderBy: { createdAt: "desc" },
          include: {
            plan: { select: { id: true, planCode: true, name: true, billingCycle: true, basePrice: true } },
            subscriptions: {
              where: { status: "active" },
              include: { plan: { include: { product: { select: { name: true, productCode: true } } } } },
              take: 1,
              orderBy: { createdAt: "desc" },
            },
          },
        },
        subscriptions: {
          orderBy: { createdAt: "desc" },
          include: {
            plan: { include: { product: { select: { name: true, productCode: true } } } },
            subscriber: { select: { id: true, radiusUsername: true, subscriberCode: true, status: true } },
          },
        },
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        payments: {
          orderBy: { receivedAt: "desc" },
          take: 20,
        },
        wallet: { select: { id: true, balance: true, currency: true } },
      },
    });

    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    // Sessions — last 20 RadAcct entries for any of this customer's subscriber usernames
    const usernames = customer.subscribers.map((s) => s.radiusUsername);
    let sessions: Record<string, unknown>[] = [];
    if (usernames.length > 0) {
      const radacct = await db.radAcct.findMany({
        where: { username: { in: usernames } },
        orderBy: { acctstarttime: "desc" },
        take: 20,
      });
      // Convert BigInt fields — JSON.stringify cannot serialize BigInt
      sessions = radacct.map((s) => ({
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
    }

    // Activity — last 20 audit events for this entity + its related records
    const relatedIds = [
      customer.id,
      ...customer.subscribers.map((s) => s.id),
      ...customer.subscriptions.map((s) => s.id),
      ...customer.invoices.map((i) => i.id),
      ...customer.payments.map((p) => p.id),
    ];
    const auditEvents = await db.auditEvent.findMany({
      where: { resourceId: { in: relatedIds } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { name: true, email: true } } },
    });

    // Computed totals
    const [activeSubscriptions, revenueAgg, outstandingAgg] = await Promise.all([
      db.subscription.count({ where: { customerId: id, status: "active" } }),
      db.payment.aggregate({
        where: { customerId: id, status: "completed" },
        _sum: { amount: true },
      }),
      db.invoice.aggregate({
        where: { customerId: id, status: { notIn: ["paid", "cancelled", "void"] } },
        _sum: { balanceDue: true },
      }),
    ]);

    const totals = {
      subscriberCount: customer.subscribers.length,
      activeSubscriptions,
      lifetimeRevenue: revenueAgg._sum.amount || 0,
      outstanding: outstandingAgg._sum.balanceDue || 0,
    };

    return NextResponse.json({ customer, sessions, auditEvents, totals });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch customer" }, { status: 500 });
  }
}

// PATCH /api/customers/[id] — update editable fields
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("subscriber", "update");
    const { id } = await params;
    const body = await req.json();
    const { displayName, email, phone, whatsappNumber, companyName, gstin, pan, status, kycVerified, notes } = body;

    const existing = await db.customer.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    const data: Record<string, unknown> = { updatedBy: user.id };
    if (displayName !== undefined) {
      if (!displayName || typeof displayName !== "string" || !displayName.trim()) {
        return NextResponse.json({ error: "displayName cannot be empty" }, { status: 400 });
      }
      data.displayName = displayName.trim();
    }
    if (email !== undefined) {
      if (email) {
        const dup = await db.customer.findUnique({ where: { email } });
        if (dup && dup.id !== id) {
          return NextResponse.json({ error: "Email already exists on another customer" }, { status: 409 });
        }
      }
      data.email = email || null;
    }
    if (phone !== undefined) data.phone = phone || null;
    if (whatsappNumber !== undefined) data.whatsappNumber = whatsappNumber || null;
    if (companyName !== undefined) data.companyName = companyName || null;
    if (gstin !== undefined) data.gstin = gstin || null;
    if (pan !== undefined) data.pan = pan || null;
    if (status !== undefined) {
      if (!VALID_CUSTOMER_STATUSES.includes(status)) {
        return NextResponse.json({ error: `Invalid status — must be one of: ${VALID_CUSTOMER_STATUSES.join(", ")}` }, { status: 400 });
      }
      data.status = status;
    }
    if (kycVerified !== undefined) data.kycVerified = Boolean(kycVerified);
    if (notes !== undefined) data.notes = notes || null;

    const updated = await db.customer.update({ where: { id }, data });

    await auditUpdate({
      userId: user.id,
      resource: "customer",
      resourceId: id,
      resourceName: existing.customerCode,
      before: {
        displayName: existing.displayName, email: existing.email, phone: existing.phone,
        whatsappNumber: existing.whatsappNumber, companyName: existing.companyName,
        gstin: existing.gstin, pan: existing.pan, status: existing.status,
        kycVerified: existing.kycVerified, notes: existing.notes,
      },
      after: {
        displayName: updated.displayName, email: updated.email, phone: updated.phone,
        whatsappNumber: updated.whatsappNumber, companyName: updated.companyName,
        gstin: updated.gstin, pan: updated.pan, status: updated.status,
        kycVerified: updated.kycVerified, notes: updated.notes,
      },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ customer: updated });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 });
  }
}

// DELETE /api/customers/[id] — delete (blocked if subscribers or unpaid invoices exist)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("subscriber", "delete");
    const { id } = await params;

    const existing = await db.customer.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    const [subscriberCount, unpaidInvoices] = await Promise.all([
      db.subscriber.count({ where: { customerId: id } }),
      db.invoice.count({
        where: { customerId: id, balanceDue: { gt: 0 }, status: { notIn: ["cancelled", "void"] } },
      }),
    ]);

    if (subscriberCount > 0 || unpaidInvoices > 0) {
      return NextResponse.json(
        {
          error: "Cannot delete customer with linked records. Remove subscribers and settle or cancel unpaid invoices first.",
          code: "FK_CONSTRAINT",
          details: { subscribers: subscriberCount, unpaidInvoices },
        },
        { status: 409 }
      );
    }

    await db.contact.deleteMany({ where: { customerId: id } });
    await db.address.deleteMany({ where: { customerId: id } });
    await db.customer.delete({ where: { id } });

    await auditDelete({
      userId: user.id,
      resource: "customer",
      resourceId: id,
      resourceName: existing.customerCode,
      before: { customerCode: existing.customerCode, displayName: existing.displayName, email: existing.email },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 });
  }
}
