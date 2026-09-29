import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/subscribers/[id]/360 — Unified 360° Customer View
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(_req);
    const { id } = await params;

    // ─── 1. Core Subscriber Profile ────────────────────────────
    const subscriber = await db.subscriber.findUnique({
      where: { id },
      include: {
        Area: { select: { id: true, name: true, code: true } },
        Plan: {
          select: {
            id: true, name: true, priceMonthly: true, downloadSpeed: true, uploadSpeed: true,
            dataLimitGb: true, description: true, status: true,
            RadiusGroup: { select: { id: true, name: true } },
          },
        },
        RadiusGroup: { select: { id: true, name: true, speedLimitDown: true, speedLimitUp: true, dataLimit: true } },
        RadiusUser: { select: { id: true, createdAt: true } },
        NetworkDevice: { select: { id: true, name: true, ipAddress: true, type: true, status: true } },
        Subscriber: { select: { id: true, name: true, phone: true } },
        _count: {
          select: {
            Invoice: true,
            Payment: true,
            Complaint: true,
            other_Subscriber: true,
          },
        },
      },
    });

    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    // ─── 2. Invoices (latest 10) + billing summary ────────────
    const invoices = await db.invoice.findMany({
      where: { subscriberId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true, invoiceNumber: true, issueDate: true, dueDate: true,
        subtotal: true, totalTax: true, totalAmount: true, status: true,
        paymentMode: true, paidAt: true,
      },
    });

    const billingAgg = await db.invoice.aggregate({
      where: { subscriberId: id },
      _sum: { totalAmount: true },
      _count: true,
    });
    const totalBilled = billingAgg._sum.totalAmount || 0;
    const totalInvoices = billingAgg._count;

    const unpaidInvoices = await db.invoice.findMany({
      where: { subscriberId: id, status: { in: ["SENT", "OVERDUE", "PARTIALLY_PAID"] } },
      select: { totalAmount: true, paidAmount: true },
    });
    const outstandingBalance = unpaidInvoices.reduce((sum, inv) => sum + (inv.totalAmount - (inv.paidAmount || 0)), 0);
    const overdueCount = unpaidInvoices.filter(inv => {
      try { return new Date(inv.dueDate || "") < new Date(); } catch { return false; }
    }).length;

    // ─── 3. Payments (latest 10) + payment summary ────────────
    const payments = await db.payment.findMany({
      where: { subscriberId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true, amount: true, paymentMode: true, status: true,
        transactionRef: true, receiptNumber: true, createdAt: true,
        User_Payment_collectedByIdToUser: { select: { name: true } },
        User_Payment_verifiedByIdToUser: { select: { name: true } },
      },
    });

    const paymentAgg = await db.payment.aggregate({
      where: { subscriberId: id, status: "VERIFIED" },
      _sum: { amount: true },
      _count: true,
    });
    const totalPaid = paymentAgg._sum.amount || 0;
    const totalPayments = paymentAgg._count;

    // ─── 4. Complaints / Tickets ──────────────────────────────
    const complaints = await db.complaint.findMany({
      where: { subscriberId: id },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true, ticketNumber: true, type: true, priority: true,
        description: true, status: true, slaHours: true, slaDeadline: true,
        createdAt: true, resolvedAt: true,
        Technician: { select: { id: true, name: true } },
      },
    });

    const complaintStats = await db.complaint.groupBy({
      by: ["status"],
      where: { subscriberId: id },
      _count: true,
    });

    // ─── 5. Notifications / Communications ────────────────────
    const notifications = await db.notification.findMany({
      where: { subscriberId: id },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true, type: true, category: true, title: true, message: true,
        status: true, sentAt: true, deliveredAt: true, readAt: true,
        createdAt: true,
      },
    });

    // ─── 6. Agent Follow-ups ──────────────────────────────────
    const followUpsRaw = await db.agentFollowUp.findMany({
      where: { subscriberId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true, type: true, notes: true, dueDate: true, status: true,
        createdAt: true, agentId: true,
      },
    });
    // AgentFollowUp has no agent relation in schema, so we fetch agent names separately
    const agentIds = [...new Set(followUpsRaw.map(f => f.agentId).filter(Boolean))];
    const agentMap = new Map<string, { id: string; name: string; phone: string }>();
    if (agentIds.length > 0) {
      const agents = await db.user.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, name: true, phone: true },
      });
      agents.forEach(a => agentMap.set(a.id, a));
    }
    const followUps = followUpsRaw.map(f => ({
      ...f,
      agent: f.agentId ? agentMap.get(f.agentId) || null : null,
    }));

    // ─── 7. Installation records ──────────────────────────────
    const installations = await db.installation.findMany({
      where: { subscriberId: id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true, status: true, scheduledDate: true, completedAt: true,
        Technician: { select: { id: true, name: true, phone: true } },
      },
    });

    // ─── 8. Churn Risk ────────────────────────────────────────
    let churnTracking: any = null;
    try {
      const churn = await db.churnTracking.findFirst({
        where: { subscriberId: id },
        orderBy: { createdAt: "desc" },
      });
      if (churn) {
        // ChurnCommunication has no Prisma relation to ChurnTracking, fetch separately
        const comms = await db.churnCommunication.findMany({
          where: { trackingId: churn.id },
          orderBy: { createdAt: "desc" },
          take: 5,
        });
        churnTracking = { ...churn, communications: comms };
      }
    } catch {
      // churn table may not be available
    }

    // ─── 9. Audit trail ───────────────────────────────────────
    const auditLogs = await db.auditLog.findMany({
      where: { entity: "Subscriber", entityId: id },
      orderBy: { timestamp: "desc" },
      take: 15,
      select: {
        id: true, action: true, details: true, userName: true,
        timestamp: true, ipAddress: true,
      },
    });

    // ─── 10. Lead source ──────────────────────────────────────
    let leadSource: any = null;
    try {
      const lead = await db.lead.findFirst({
        where: { convertedSubscriberId: id },
        select: {
          id: true, source: true, score: true, assignedToId: true,
          communications: { orderBy: { date: "desc" }, take: 5, select: { type: true, notes: true, date: true, outcome: true } },
        },
      });
      if (lead && lead.assignedToId) {
        const assignedUser = await db.user.findUnique({ where: { id: lead.assignedToId }, select: { name: true } });
        leadSource = { ...lead, assignedTo: assignedUser };
      } else {
        leadSource = lead ? { ...lead, assignedTo: null } : null;
      }
    } catch {
      // lead table may not be available
    }

    // ─── 11. RADIUS Sessions ──────────────────────────────────
    let radiusSessions: any[] = [];
    try {
      // RadiusSession has no username field — query via RadiusUser relation
      if (subscriber.RadiusUser) {
        radiusSessions = await db.radiusSession.findMany({
          where: { radiusUserId: subscriber.RadiusUser.id },
          orderBy: { startTime: "desc" },
          take: 5,
        });
      }
    } catch {
      // radiusSession table may not exist
    }

    // ─── Assemble response ────────────────────────────────────
    return NextResponse.json({
      // Profile
      subscriber: {
        id: subscriber.id,
        code: subscriber.code,
        name: subscriber.name,
        email: subscriber.email,
        phone: subscriber.phone,
        altPhone: subscriber.altPhone,
        address: subscriber.address,
        landmark: subscriber.landmark,
        pincode: subscriber.pincode,
        area: subscriber.Area,
        plan: subscriber.Plan,
        connectionType: subscriber.connectionType,
        status: subscriber.status,
        serviceUsername: subscriber.serviceUsername,
        ipAddress: subscriber.ipAddress,
        ipType: subscriber.ipType,
        macAddress: subscriber.macAddress,
        assignedDevice: subscriber.NetworkDevice,
        gstin: subscriber.gstin,
        panNumber: subscriber.panNumber,
        kycAadhaarNumber: subscriber.kycAadhaarNumber,
        kycDocPath: subscriber.kycDocPath,
        profilePhotoPath: subscriber.profilePhotoPath,
        kycVerified: subscriber.kycVerified,
        balance: subscriber.balance,
        notes: subscriber.notes,
        internalNotes: subscriber.internalNotes,
        activationDate: subscriber.activationDate,
        billingStartDate: subscriber.billingStartDate,
        routerRented: subscriber.routerRented,
        routerSerial: subscriber.routerSerial,
        routerDeposit: subscriber.routerDeposit,
        radiusEnabled: subscriber.radiusEnabled,
        radiusGroup: subscriber.RadiusGroup,
        radiusUser: subscriber.RadiusUser,
        ipStackType: subscriber.ipStackType,
        ipv6Address: subscriber.ipv6Address,
        ipv6Prefix: subscriber.ipv6Prefix,
        ipv6PrefixLength: subscriber.ipv6PrefixLength,
        ipv6Duid: subscriber.ipv6Duid,
        ipv6AssignmentMode: subscriber.ipv6AssignmentMode,
        referredBy: subscriber.Subscriber,
        createdAt: subscriber.createdAt,
        updatedAt: subscriber.updatedAt,
      },

      // Billing Summary
      billing: {
        totalBilled,
        totalPaid,
        outstandingBalance,
        overdueCount,
        totalInvoices,
        totalPayments,
        currentBalance: subscriber.balance,
        invoices,
        payments,
      },

      // Support
      support: {
        complaints,
        complaintStats: complaintStats.map(s => ({ status: s.status, count: s._count })),
        openTicketCount: complaintStats.find(s => s.status === "OPEN")?._count || 0,
      },

      // Communications
      communications: {
        notifications,
        followUps,
        leadSource,
      },

      // Service & Installation
      service: {
        installations,
        radiusSessions,
      },

      // Churn
      churn: {
        tracking: churnTracking,
        atRisk: !!churnTracking && churnTracking.status !== "RESOLVED" && churnTracking.status !== "CHURNED",
      },

      // Activity
      activity: {
        auditLogs,
      },

      // Quick stats
      stats: {
        customerSince: subscriber.createdAt,
        daysActive: Math.floor((Date.now() - subscriber.createdAt.getTime()) / 86400000),
        totalInvoices,
        totalPayments,
        totalBilled,
        totalPaid,
        lifetimeValue: totalPaid,
        avgMonthlyPayment: totalInvoices > 0 ? totalPaid / Math.max(1, Math.ceil((Date.now() - (subscriber.billingStartDate || subscriber.createdAt).getTime()) / (30 * 86400000))) : 0,
        outstandingBalance,
        openTickets: complaintStats.find(s => s.status === "OPEN")?._count || 0,
        totalComplaints: complaints.length,
        isKYCVerified: subscriber.kycVerified === true,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[360° View] Error:", error instanceof Error ? error.message : error);
    console.error("[360° View] Stack:", error instanceof Error ? error.stack : 'N/A');
    return NextResponse.json({ error: "Failed to load 360° customer view" }, { status: 500 });
  }
}
