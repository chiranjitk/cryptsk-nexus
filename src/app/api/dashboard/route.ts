import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
    const { searchParams } = request.nextUrl;
    const range = searchParams.get("range") || "30d";
    const now = new Date();

    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const startOfLastMonth = new Date(currentYear, currentMonth - 1, 1);
    const endOfLastMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
    const startOfDay = new Date(currentYear, currentMonth, now.getDate());

    // ── Date range calculation ──
    let rangeDays: number;
    let rangeStart: Date;

    if (range === "this_month") {
      rangeDays = Math.max(1, now.getDate());
      rangeStart = new Date(startOfMonth);
    } else if (range === "last_month") {
      rangeDays = new Date(currentYear, currentMonth, 0).getDate();
      rangeStart = new Date(startOfLastMonth);
    } else {
      rangeDays = range === "7d" ? 7 : range === "90d" ? 90 : 30;
      rangeStart = new Date(now);
      rangeStart.setDate(rangeStart.getDate() - rangeDays);
      rangeStart.setHours(0, 0, 0, 0);
    }

    // ── 1. Total Subscribers (batch counts) ──
    const [
      totalActive,
      totalSubscribers,
      newThisMonth,
      newInRange,
      churnedInRange,
    ] = await Promise.all([
      db.subscriber.count({ where: { status: "ACTIVE" } }),
      db.subscriber.count(),
      db.subscriber.count({ where: { createdAt: { gte: startOfMonth } } }),
      db.subscriber.count({ where: { createdAt: { gte: rangeStart } } }),
      db.subscriber.count({
        where: { status: "DISCONNECTED", updatedAt: { gte: rangeStart } },
      }),
    ]);

    // ── 2. Revenue (batched queries) ──
    const prevRangeStart = new Date(rangeStart);
    prevRangeStart.setDate(prevRangeStart.getDate() - rangeDays);

    const [
      aggThisMonth,
      aggInRange,
      aggPrevRange,
      aggLastMonth,
    ] = await Promise.all([
      db.invoice.aggregate({
        _sum: { grandTotal: true },
        where: { status: "PAID", paidAt: { gte: startOfMonth, lte: now } },
      }),
      db.invoice.aggregate({
        _sum: { grandTotal: true },
        where: { status: "PAID", paidAt: { gte: rangeStart, lte: now } },
      }),
      db.invoice.aggregate({
        _sum: { grandTotal: true },
        where: { status: "PAID", paidAt: { gte: prevRangeStart, lte: rangeStart } },
      }),
      db.invoice.aggregate({
        _sum: { grandTotal: true },
        where: { status: "PAID", paidAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
      }),
    ]);

    const revenueThisMonth = aggThisMonth._sum.grandTotal || 0;
    const revenueInRange = aggInRange._sum.grandTotal || 0;
    const revenuePrevRange = aggPrevRange._sum.grandTotal || 0;
    const revenueLastMonth = aggLastMonth._sum.grandTotal || 0;

    const revenueChangePercent =
      revenuePrevRange > 0
        ? Math.round(((revenueInRange - revenuePrevRange) / revenuePrevRange) * 100)
        : 0;

    // ── 3. ARPU ──
    const arpu = totalActive > 0 ? Math.round(revenueThisMonth / totalActive) : 0;

    // ── 4. MRR (optimized: group by plan instead of loading all subscribers) ──
    const mrrPlanAgg = await db.plan.findMany({
      where: { status: "ACTIVE" },
      include: { _count: { select: { Subscriber: { where: { status: 'ACTIVE' } } } } },
    });
    let mrr = 0;
    for (const plan of mrrPlanAgg) {
      mrr += (plan.priceMonthly || 0) * plan._count.Subscriber;
    }
    mrr = Math.round(mrr);

    // ── 5. Churn Rate ──
    const churnRate =
      totalSubscribers > 0
        ? Math.round((churnedInRange / totalSubscribers) * 10000) / 100
        : 0;

    const activeConnections = totalActive;

    // ── 6-7. Open Complaints + Network + Payments (batched) ──
    const [
      offlineCount,
      openComplaints,
      criticalCount,
      todayPaymentsAgg,
      totalDevices,
      onlineDevices,
      warningDevices,
      devicesSeenRecently,
    ] = await Promise.all([
      db.subscriber.count({
        where: { status: { in: ["SUSPENDED", "DISCONNECTED"] } },
      }),
      db.complaint.count({
        where: { status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"] } },
      }),
      db.complaint.count({
        where: {
          status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"] },
          priority: { in: ["P1_CRITICAL", "P2_HIGH"] },
        },
      }),
      db.payment.aggregate({
        _sum: { amount: true },
        where: { status: "VERIFIED", createdAt: { gte: startOfDay, lte: now } },
      }),
      db.networkDevice.count(),
      db.networkDevice.count({ where: { status: "ONLINE" } }),
      db.networkDevice.count({ where: { status: "WARNING" } }),
      db.networkDevice.count({ where: { lastSeenAt: { gte: rangeStart } } }),
    ]);

    const collectionToday = todayPaymentsAgg._sum.amount || 0;

    // Use ISP Settings KPI targets if available, otherwise calculate from revenue
    let ispKpiTargets = null;
    try {
      const ispSettings = await db.ispSettings.findUnique({
        where: { id: "default" },
        select: { kpiTargets: true },
      });
      if (ispSettings?.kpiTargets) {
        ispKpiTargets = typeof ispSettings.kpiTargets === "string"
          ? JSON.parse(ispSettings.kpiTargets)
          : ispSettings.kpiTargets;
      }
    } catch { /* use fallback */ }

    const dailyTarget = ispKpiTargets?.dailyCollectionTarget || Math.round((Math.round(revenueLastMonth * 1.1) || Math.round(revenueThisMonth * 1.1)) / 30);

    // ── 9. Network Uptime ──
    const networkUptime =
      totalDevices > 0
        ? Math.round(((onlineDevices + warningDevices) / totalDevices) * 1000) / 10
        : 100;
    const uptimeTrendRaw =
      totalDevices > 0
        ? Math.round((devicesSeenRecently / totalDevices) * 1000) / 10 - networkUptime
        : 0;
    const uptimeTrendDisplay = Math.max(-5, Math.min(5, Math.round(uptimeTrendRaw * 10) / 10));

    // ═══════════════════════════════════════════════════════════
    // OPTIMIZED: 10. Monthly Revenue Data (single query)
    // PostgreSQL: paidAt is a TIMESTAMP, use TO_CHAR for date extraction.
    // ═══════════════════════════════════════════════════════════
    const monthlyRevenueRaw: Array<{ month: string; total: number }> = await db.$queryRaw`
      SELECT
        TO_CHAR("paidAt", 'MM') AS month_num,
        CAST(SUM("grandTotal") AS float) AS total
      FROM "Invoice"
      WHERE status = 'PAID'
        AND "paidAt" >= ${new Date(currentYear, currentMonth - 5, 1)}
        AND "paidAt" <= ${now}
      GROUP BY TO_CHAR("paidAt", 'YYYY-MM'), TO_CHAR("paidAt", 'MM')
      ORDER BY TO_CHAR("paidAt", 'YYYY-MM') ASC
    `;
    // Map month numbers to short names
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mappedRevenue = monthlyRevenueRaw.map(r => ({
      month: monthNames[parseInt(r.month_num) - 1] || r.month_num,
      total: r.total
    }));

    // Fill in months with no data (for chart continuity)
    const monthlyRevenueData: Array<{ month: string; revenue: number }> = [];
    const monthMap = new Map(mappedRevenue.map((r) => [r.month, Math.round(r.total)]));
    for (let m = 5; m >= 0; m--) {
      const mStart = new Date(currentYear, currentMonth - m, 1);
      const monthLabel = mStart.toLocaleString("en-IN", { month: "short" });
      monthlyRevenueData.push({
        month: monthLabel,
        revenue: monthMap.get(monthLabel) || 0,
      });
    }

    // ═══════════════════════════════════════════════════════════
    // OPTIMIZED: 11. Subscriber Growth Data (single query)
    // PostgreSQL: use TO_CHAR for date formatting.
    // ═══════════════════════════════════════════════════════════
    const dailySubStep = rangeDays <= 7 ? 1 : rangeDays <= 30 ? 3 : 7;
    const subscriberGrowthRaw: Array<{ dayLabel: string; additions: number }> = await db.$queryRaw`
      SELECT
        TO_CHAR("createdAt", 'DD Mon') AS dayLabel,
        CAST(COUNT(*) AS int) AS additions
      FROM "Subscriber"
      WHERE "createdAt" >= ${rangeStart}
        AND "createdAt" <= ${now}
      GROUP BY TO_CHAR("createdAt", 'YYYY-MM-DD'), TO_CHAR("createdAt", 'DD Mon')
      ORDER BY MIN("createdAt") ASC
    `;

    // Re-sample to the desired step size
    const subGrowthMap = new Map(
      subscriberGrowthRaw.map((r) => [r.dayLabel, r.additions])
    );
    const subscriberGrowthData: Array<{ month: string; additions: number }> = [];
    for (let d = rangeDays; d >= 0; d -= dailySubStep) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - d);
      dayStart.setHours(0, 0, 0, 0);
      const dayLabel = dayStart.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
      });
      subscriberGrowthData.push({
        month: dayLabel,
        additions: subGrowthMap.get(dayLabel) || 0,
      });
    }

    // ═══════════════════════════════════════════════════════════
    // OPTIMIZED: 12. Complaint Trend Data (single query)
    // PostgreSQL: use TO_CHAR for date formatting.
    // ═══════════════════════════════════════════════════════════
    const complaintStep = rangeDays <= 7 ? 1 : rangeDays <= 30 ? 3 : 7;
    const complaintTrendRaw: Array<{ dayLabel: string; complaints: number }> = await db.$queryRaw`
      SELECT
        TO_CHAR("createdAt", 'DD Mon') AS dayLabel,
        CAST(COUNT(*) AS int) AS complaints
      FROM "Complaint"
      WHERE "createdAt" >= ${rangeStart}
        AND "createdAt" <= ${now}
      GROUP BY TO_CHAR("createdAt", 'YYYY-MM-DD'), TO_CHAR("createdAt", 'DD Mon')
      ORDER BY MIN("createdAt") ASC
    `;

    const complaintMap = new Map(
      complaintTrendRaw.map((r) => [r.dayLabel, r.complaints])
    );
    const complaintTrendData: Array<{ date: string; complaints: number }> = [];
    for (let d = rangeDays; d >= 0; d -= complaintStep) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - d);
      dayStart.setHours(0, 0, 0, 0);
      const dayLabel = dayStart.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
      });
      complaintTrendData.push({
        date: dayLabel,
        complaints: complaintMap.get(dayLabel) || 0,
      });
    }

    // ═══════════════════════════════════════════════════════════
    // OPTIMIZED: 13. Plan Distribution (single query with include)
    // ═══════════════════════════════════════════════════════════
    const activeSubsWithPlans = await db.subscriber.findMany({
      where: { status: "ACTIVE", planId: { not: null } },
      select: { planId: true, Plan: { select: { name: true } } },
      take: 10000,
    });
    const planCountMap = new Map<string, number>();
    for (const sub of activeSubsWithPlans) {
      const name = sub.Plan?.name || "Unknown";
      planCountMap.set(name, (planCountMap.get(name) || 0) + 1);
    }
    const planDistData: Array<{ plan: string; count: number }> = Array.from(planCountMap.entries())
      .map(([plan, count]) => ({ plan, count }))
      .sort((a, b) => b.count - a.count);

    // ═══════════════════════════════════════════════════════════
    // OPTIMIZED: 14. Area-wise Revenue (single query with includes)
    // ═══════════════════════════════════════════════════════════
    const paidInvoicesWithArea = await db.invoice.findMany({
      where: {
        status: "PAID",
        paidAt: { gte: startOfMonth, lte: now },
        
      },
      select: {
        grandTotal: true,
        Subscriber: {
          select: {
            Area: { select: { name: true } },
          },
        },
      },
      take: 10000,
    });

    const areaRevenueMap: Record<string, number> = {};
    for (const inv of paidInvoicesWithArea) {
      const areaName = inv.Subscriber?.Area?.name;
      if (areaName) {
        areaRevenueMap[areaName] = (areaRevenueMap[areaName] || 0) + inv.grandTotal;
      }
    }
    const areaWiseRevenue: Array<{ area: string; revenue: number }> = Object.entries(areaRevenueMap)
      .map(([area, revenue]) => ({ area, revenue: Math.round(revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    // ═══════════════════════════════════════════════════════════
    // OPTIMIZED: 15. Top complaint areas (single query with include)
    // ═══════════════════════════════════════════════════════════
    const complaintsWithArea = await db.complaint.findMany({
      where: {
        status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"] },
        areaId: { not: null },
      },
      select: {
        areaId: true,
        Area: { select: { name: true } },
      },
      take: 5000,
    });
    const complaintAreaMap = new Map<string, number>();
    for (const c of complaintsWithArea) {
      if (c.Area?.name) {
        complaintAreaMap.set(c.Area.name, (complaintAreaMap.get(c.Area.name) || 0) + 1);
      }
    }
    const topComplaintAreas: Array<{ area: string; count: number }> = Array.from(complaintAreaMap.entries())
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // ── 16. Recent Complaints ──
    const recentComplaints = await db.complaint.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { Subscriber: { select: { name: true } } },
    });

    // ── 17. Recent Payments ──
    const recentPayments = await db.payment.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { Subscriber: { select: { name: true } } },
    });

    // ── 18. Overdue Invoices ──
    const [overdueInvoices, overdueTotalAmount, overdueCount] = await Promise.all([
      db.invoice.findMany({
        where: {
          status: { in: ["SENT", "OVERDUE"] },
          dueDate: { lt: now },
          balanceAmount: { gt: 0 },
          
        },
        orderBy: { dueDate: "asc" },
        take: 10,
        include: {
          Subscriber: { select: { name: true, phone: true, areaId: true } },
        },
      }),
      db.invoice.aggregate({
        where: {
          status: { in: ["SENT", "OVERDUE"] },
          dueDate: { lt: now },
          balanceAmount: { gt: 0 },
        },
        _sum: { balanceAmount: true },
      }),
      db.invoice.count({
        where: {
          status: { in: ["SENT", "OVERDUE"] },
          dueDate: { lt: now },
          balanceAmount: { gt: 0 },
        },
      }),
    ]);

    // ═══════════════════════════════════════════════════════════
    // OPTIMIZED: 19. Top Revenue Customers (single query with includes)
    // ═══════════════════════════════════════════════════════════
    const topInvoiceRows = await db.invoice.findMany({
      where: {
        status: "PAID",
        paidAt: { gte: startOfMonth, lte: now },
        
      },
      select: {
        subscriberId: true,
        grandTotal: true,
        Subscriber: {
          select: { name: true, phone: true, Area: { select: { name: true } } },
        },
      },
      take: 10000,
    });

    // Aggregate by subscriber in-memory (much faster than N+1 DB queries)
    const subscriberRevenueMap = new Map<
      string,
      { totalPaid: number; name: string; phone: string; area: string }
    >();
    for (const inv of topInvoiceRows) {
      const existing = subscriberRevenueMap.get(inv.subscriberId);
      if (existing) {
        existing.totalPaid += inv.grandTotal;
      } else {
        subscriberRevenueMap.set(inv.subscriberId, {
          totalPaid: inv.grandTotal,
          name: inv.Subscriber?.name || "Unknown",
          phone: inv.Subscriber?.phone || "",
          area: inv.Subscriber?.Area?.name || "",
        });
      }
    }
    const topRevenueCustomers = Array.from(subscriberRevenueMap.entries())
      .map(([subscriberId, data]) => ({
        subscriberId,
        name: data.name,
        phone: data.phone,
        area: data.area,
        totalPaid: Math.round(data.totalPaid),
      }))
      .sort((a, b) => b.totalPaid - a.totalPaid)
      .slice(0, 5);

    // ── 20. Upcoming Renewals ──
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    sevenDaysFromNow.setHours(23, 59, 59, 999);

    const upcomingRenewals = await db.subscriber.findMany({
      where: {
        status: "ACTIVE",
        activationDate: { not: null },
        planId: { not: null },
      },
      include: {
        Plan: { select: { name: true, priceMonthly: true, validityDays: true } },
      },
      take: 50,
    });

    const filteredRenewals = upcomingRenewals
      .filter((sub) => {
        if (!sub.activationDate || !sub.Plan) return false;
        const validityDays = sub.Plan.validityDays || 30;
        const activated = new Date(sub.activationDate);
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const elapsed = today.getTime() - activated.getTime();
        const elapsedDays = Math.floor(elapsed / (1000 * 60 * 60 * 24));
        const currentCycle = Math.floor(elapsedDays / validityDays);
        const nextRenewalDate = new Date(activated);
        nextRenewalDate.setDate(nextRenewalDate.getDate() + (currentCycle + 1) * validityDays);
        (sub as unknown as Record<string, Date>)._nextRenewal = nextRenewalDate;
        return nextRenewalDate <= sevenDaysFromNow && nextRenewalDate >= today;
      })
      .sort((a, b) => {
        const aDate = (a as unknown as Record<string, Date>)._nextRenewal;
        const bDate = (b as unknown as Record<string, Date>)._nextRenewal;
        return aDate.getTime() - bDate.getTime();
      })
      .slice(0, 5);

    const upcomingRenewalsData = filteredRenewals.map((sub) => {
      const nextRenewal = (sub as unknown as Record<string, Date>)._nextRenewal;
      return {
        id: sub.id,
        name: sub.name,
        phone: sub.phone,
        planName: sub.Plan?.name || "No Plan",
        planPrice: sub.Plan?.priceMonthly || 0,
        nextRenewalDate: nextRenewal.toISOString(),
        daysUntilRenewal: Math.max(0, Math.ceil((nextRenewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))),
      };
    });

    // ── 21. AI Insight ──
    const insights: string[] = [];

    if (revenueChangePercent > 0) {
      insights.push(
        `Revenue is up ${revenueChangePercent}% vs the previous ${rangeDays}-day period`
      );
    } else if (revenueChangePercent < 0) {
      insights.push(
        `Revenue is down ${Math.abs(revenueChangePercent)}% vs the previous ${rangeDays}-day period — consider reviewing pricing or follow up on pending invoices`
      );
    } else {
      insights.push("Revenue has remained stable compared to the previous period");
    }

    if (topComplaintAreas.length > 0) {
      const topArea = topComplaintAreas[0];
      insights.push(
        `${topArea.area} has the highest open complaints (${topArea.count} active) — consider assigning a dedicated technician`
      );
    }

    if (churnedInRange > 0) {
      insights.push(
        `${churnedInRange} subscriber(s) disconnected in the last ${rangeDays} days (churn rate: ${churnRate}%)`
      );
    }

    if (overdueCount > 5) {
      insights.push(
        `${overdueCount} overdue invoices totaling ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(overdueTotalAmount._sum.balanceAmount || 0)} need immediate attention`
      );
    }

    if (warningDevices > 0) {
      insights.push(
        `${warningDevices} device(s) in WARNING state — proactive maintenance recommended`
      );
    }

    if (dailyTarget > 0) {
      const todayPct = Math.round((collectionToday / dailyTarget) * 100);
      if (todayPct < 50) {
        insights.push(
          `Today's collection is only ${todayPct}% of the daily target — dispatch collection agents to high-balance areas`
        );
      }
    }

    if (filteredRenewals.length > 0) {
      const renewalRevenue = filteredRenewals.reduce((sum, sub) => sum + (sub.Plan?.priceMonthly || 0), 0);
      insights.push(
        `${filteredRenewals.length} subscription(s) expiring within 7 days — proactively contact subscribers to secure ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(renewalRevenue)} in renewals`
      );
    }

    const aiInsight = insights.length > 0 ? insights.join(". ") + "." : "All systems operating normally. No immediate actions required.";

    // ── 22. Urgent Items ──
    const slaBreaches = await db.complaint.count({
      where: {
        status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"] },
        slaDeadline: { not: null, lte: now },
      },
    });
    const urgentItems = {
      criticalComplaints: criticalCount,
      overdueInvoices: overdueCount,
      deviceWarnings: warningDevices,
      slaBreaches,
      total: criticalCount + overdueCount + warningDevices + slaBreaches,
    };

    // ── 23. Bandwidth / Traffic Usage ──
    const twentyFourHoursAgo = new Date(now);
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    const bandwidthLogs = await db.bandwidthLog.findMany({
      where: { timestamp: { gte: twentyFourHoursAgo } },
      orderBy: { timestamp: "asc" },
      take: 100000,
    });

    const bandwidthMap: Record<string, { downloadBps: number; uploadBps: number }> = {};
    for (const log of bandwidthLogs) {
      const hour = new Date(log.timestamp).getHours();
      const key = `${hour.toString().padStart(2, "0")}:00`;
      if (!bandwidthMap[key]) {
        bandwidthMap[key] = { downloadBps: 0, uploadBps: 0 };
      }
      bandwidthMap[key].downloadBps += log.downloadBps;
      bandwidthMap[key].uploadBps += log.uploadBps;
    }

    const bandwidthUsageData = Object.entries(bandwidthMap).map(([hour, data]) => ({
      hour,
      downloadBps: data.downloadBps,
      uploadBps: data.uploadBps,
    }));

    const peakBandwidth = bandwidthLogs.length > 0
      ? Math.max(...bandwidthLogs.map((l) => l.totalBps))
      : 0;
    const currentBandwidth = bandwidthLogs.length > 0
      ? bandwidthLogs[bandwidthLogs.length - 1].totalBps
      : 0;

    // ── 24. SLA Breach Warnings ──
    const next24h = new Date(now);
    next24h.setHours(next24h.getHours() + 24);
    const slaBreachComplaints = await db.complaint.findMany({
      where: {
        status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"] },
        slaDeadline: { not: null, lte: next24h },
      },
      orderBy: { slaDeadline: "asc" },
      take: 5,
      include: { Subscriber: { select: { name: true } } },
    });

    const slaBreachesList = slaBreachComplaints.map((c) => {
      const hoursRemaining = c.slaDeadline
        ? Math.round((new Date(c.slaDeadline).getTime() - now.getTime()) / (1000 * 60 * 60) * 10) / 10
        : 0;
      return {
        id: c.id,
        ticketNumber: c.ticketNumber,
        customerName: c.Subscriber?.name || "Unknown",
        priority: c.priority,
        slaDeadline: c.slaDeadline?.toISOString() || "",
        hoursRemaining,
        status: c.status,
      };
    });

    // ── 25. Network Device Health (single groupBy) ──
    const deviceStatusCounts = await db.networkDevice.groupBy({
      by: ["status"],
      _count: { id: true },
    });
    const deviceStatusMap = new Map(deviceStatusCounts.map((d) => [d.status, d._count.id]));
    const deviceOnline = deviceStatusMap.get("ONLINE") || 0;
    const deviceOffline = deviceStatusMap.get("OFFLINE") || 0;
    const deviceWarning = deviceStatusMap.get("WARNING") || 0;
    const deviceUnknown = deviceStatusMap.get("UNKNOWN") || 0;

    const topDevices = await db.networkDevice.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: 8,
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        cpuUsage: true,
        memoryUsage: true,
        lastSeenAt: true,
      },
    });

    const deviceHealth = {
      online: deviceOnline,
      offline: deviceOffline,
      warning: deviceWarning,
      unknown: deviceUnknown,
      topDevices: topDevices.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        status: d.status,
        cpuUsage: d.cpuUsage,
        memoryUsage: d.memoryUsage,
        lastSeenAt: d.lastSeenAt?.toISOString() || null,
      })),
    };

    // ═══════════════════════════════════════════════════════════
    // OPTIMIZED: 26. CAC (two queries with include instead of N×2)
    // ═══════════════════════════════════════════════════════════
    const [completedInstallationsThisMonth, prevMonthNewSubs, completedInstallationsPrevMonth] = await Promise.all([
      db.installation.findMany({
        where: {
          status: "COMPLETED",
          completedAt: { gte: startOfMonth, lte: now },
        },
        include: {
          Subscriber: {
            select: {
              planId: true,
              Plan: { select: { installationCharge: true } },
            },
          },
        },
        take: 5000,
      }),
      db.subscriber.count({
        where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
      }),
      db.installation.findMany({
        where: {
          status: "COMPLETED",
          completedAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        },
        include: {
          Subscriber: {
            select: {
              planId: true,
              Plan: { select: { installationCharge: true } },
            },
          },
        },
        take: 5000,
      }),
    ]);

    let installationCostThisMonth = 0;
    for (const inst of completedInstallationsThisMonth) {
      installationCostThisMonth += inst.Subscriber?.Plan?.installationCharge || 0;
    }

    let cac = 0;
    if (newThisMonth > 0 && installationCostThisMonth > 0) {
      cac = Math.round(installationCostThisMonth / newThisMonth);
    } else if (newThisMonth > 0) {
      cac = Math.round((revenueThisMonth * 0.15) / newThisMonth);
    }

    let prevInstallationCost = 0;
    for (const inst of completedInstallationsPrevMonth) {
      prevInstallationCost += inst.Subscriber?.Plan?.installationCharge || 0;
    }

    let cacPrev = 0;
    if (prevMonthNewSubs > 0 && prevInstallationCost > 0) {
      cacPrev = Math.round(prevInstallationCost / prevMonthNewSubs);
    } else if (prevMonthNewSubs > 0) {
      cacPrev = Math.round((revenueLastMonth * 0.15) / prevMonthNewSubs);
    }

    const cacTrend = cacPrev > 0 ? Math.round(((cac - cacPrev) / cacPrev) * 100) : 0;

    // ═══════════════════════════════════════════════════════════
    // OPTIMIZED: 27. Plan Revenue Breakdown (single query with include)
    // ═══════════════════════════════════════════════════════════
    const paidInvoicesPlans = await db.invoice.findMany({
      where: {
        status: "PAID",
        paidAt: { gte: startOfMonth, lte: now },
        planId: { not: null },
      },
      select: {
        planId: true,
        grandTotal: true,
        subscriberId: true,
        Plan: { select: { name: true } },
      },
      take: 10000,
    });

    const planRevMap: Record<string, { revenue: number; subscribers: Set<string>; name: string }> = {};
    for (const inv of paidInvoicesPlans) {
      if (!inv.planId) continue;
      const name = inv.Plan?.name || "Unknown";
      if (!planRevMap[name]) {
        planRevMap[name] = { revenue: 0, subscribers: new Set() };
      }
      planRevMap[name].revenue += inv.grandTotal;
      planRevMap[name].subscribers.add(inv.subscriberId);
    }

    const planRevenueBreakdown: Array<{ plan: string; revenue: number; subscribers: number; arpu: number }> = Object.entries(planRevMap)
      .map(([plan, data]) => {
        const subs = data.subscribers.size;
        return {
          plan,
          revenue: Math.round(data.revenue),
          subscribers: subs,
          arpu: subs > 0 ? Math.round(data.revenue / subs) : 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    return NextResponse.json({
      // Core stats
      totalActive,
      totalSubscribers,
      newThisMonth,
      newInRange,
      revenueThisMonth: Math.round(revenueThisMonth),
      revenueInRange: Math.round(revenueInRange),
      revenueLastMonth: Math.round(revenueLastMonth),
      revenueChangePercent,
      activeConnections,
      offlineCount,
      openComplaints,
      criticalCount,
      collectionToday: Math.round(collectionToday),
      dailyTarget,
      monthlyTarget: ispKpiTargets?.monthlyCollectionTarget || Math.round(revenueThisMonth * 1.2) || 15000,
      networkUptime,
      uptimeTrend: uptimeTrendDisplay,
      onlineDevices,
      totalDevices,
      warningDevices,

      // New metrics
      arpu,
      mrr,
      churnRate,
      churnedInRange,

      // Chart data
      monthlyRevenueData,
      subscriberGrowthData,
      complaintTrendData,
      planDistribution: planDistData,
      areaWiseRevenue: areaWiseRevenue.slice(0, 8),

      // Lists
      recentComplaints: recentComplaints.map((c) => ({
        id: c.id,
        ticketNumber: c.ticketNumber,
        customerName: c.Subscriber?.name || "Unknown",
        type: c.type,
        priority: c.priority,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
      })),
      recentPayments: recentPayments.map((p) => ({
        id: p.id,
        receiptNumber: p.receiptNumber,
        customerName: p.Subscriber?.name || "Unknown",
        amount: p.amount,
        paymentMode: p.paymentMode,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      })),

      // Overdue invoices
      overdueInvoices: overdueInvoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.Subscriber?.name || "Unknown",
        phone: inv.Subscriber?.phone || "",
        dueDate: inv.dueDate.toISOString(),
        balanceAmount: Math.round(inv.balanceAmount),
        grandTotal: Math.round(inv.grandTotal),
      })),
      overdueTotal: Math.round(overdueTotalAmount._sum.balanceAmount || 0),
      overdueCount,

      // Top revenue customers
      topRevenueCustomers,

      // Upcoming renewals
      upcomingRenewals: upcomingRenewalsData,

      // AI insight
      aiInsight,

      // New features
      urgentItems,
      bandwidthUsageData,
      peakBandwidth,
      currentBandwidth,
      slaBreaches: slaBreachesList,
      deviceHealth,
      cac,
      cacTrend,
      planRevenueBreakdown,

      // Range info
      range,
      rangeDays,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
