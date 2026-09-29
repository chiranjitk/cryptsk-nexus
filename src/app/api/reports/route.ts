import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";

function getPeriodStart(now: Date, period: string): Date {
  switch (period) {
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "week": {
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
    }
    case "last_month":
      return new Date(now.getFullYear(), now.getMonth() - 1, 1);
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "quarter": {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      return new Date(now.getFullYear(), qMonth, 1);
    }
    case "year":
      return new Date(now.getFullYear(), 0, 1);
    default:
      return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

function getPeriodEnd(now: Date, period: string): Date {
  switch (period) {
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    case "week":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - now.getDay()), 23, 59, 59, 999);
    case "last_month":
      return new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    case "month":
      return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    case "quarter": {
      const qMonth = Math.floor(now.getMonth() / 3) * 3 + 3;
      return new Date(now.getFullYear(), qMonth, 0, 23, 59, 59, 999);
    }
    case "year":
      return new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    default:
      return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }
}

export const GET = withAuth(async (req: NextRequest) => {
  try {
    const { searchParams } = req.nextUrl;
    const tab = searchParams.get("tab") || "financial";
    const period = searchParams.get("period") || "month";

    const now = new Date();

    // Support custom date range
    const startParam = searchParams.get("startDate");
    const endParam = searchParams.get("endDate");
    let periodStart: Date;
    let periodEnd: Date;

    if (startParam && endParam) {
      periodStart = new Date(startParam);
      periodEnd = new Date(endParam);
    } else {
      periodStart = getPeriodStart(now, period);
      periodEnd = getPeriodEnd(now, period);
    }

    switch (tab) {
      case "financial": {
        // ── Financial Reports ──
        const invoices = await db.invoice.findMany({
          where: {
            issueDate: { gte: periodStart, lte: periodEnd },
            status: { not: "CANCELLED" },
          },
          include: {
            Plan: { select: { name: true, category: true } },
            Subscriber: { select: { areaId: true, Area: { select: { name: true } } } },
          },
        });

        const payments = await db.payment.findMany({
          where: {
            createdAt: { gte: periodStart, lte: periodEnd },
            status: "VERIFIED",
          },
        });

        // Stats
        const totalRevenue = invoices.reduce((s, i) => s + (i.grandTotal || 0), 0);
        const totalPaid = invoices.reduce((s, i) => s + (i.paidAmount || 0), 0);
        const outstanding = invoices.reduce((s, i) => s + (i.balanceAmount || 0), 0);
        const collectionRate = totalRevenue > 0 ? Math.round((totalPaid / totalRevenue) * 100) : 0;

        // Separate overdue invoices (all-time)
        const overdueInvoices = await db.invoice.findMany({
          where: { status: "OVERDUE" },
          select: { balanceAmount: true },
        });
        const overdueTotal = overdueInvoices.reduce((s, i) => s + (i.balanceAmount || 0), 0);

        const activeSubs = await db.subscriber.count({ where: { status: "ACTIVE" } });
        const arpu = activeSubs > 0 ? Math.round(totalRevenue / activeSubs) : 0;

        // GST
        const cgst = invoices.reduce((s, i) => s + (i.cgstAmount || 0), 0);
        const sgst = invoices.reduce((s, i) => s + (i.sgstAmount || 0), 0);
        const igst = invoices.reduce((s, i) => s + (i.igstAmount || 0), 0);

        // Monthly revenue trend (last 12 months)
        const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        const allInvoices = await db.invoice.findMany({
          where: {
            issueDate: { gte: twelveMonthsAgo },
            status: { not: "CANCELLED" },
          },
          select: { issueDate: true, grandTotal: true, paidAmount: true },
        });
        const monthlyMap: Record<string, { revenue: number; collected: number }> = {};
        for (const inv of allInvoices) {
          const d = new Date(inv.issueDate);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (!monthlyMap[key]) monthlyMap[key] = { revenue: 0, collected: 0 };
          monthlyMap[key].revenue += inv.grandTotal || 0;
          monthlyMap[key].collected += inv.paidAmount || 0;
        }
        const monthlyRevenueTrend = Object.entries(monthlyMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, data]) => {
            const [y, m] = key.split("-");
            const date = new Date(Number(y), Number(m) - 1, 1);
            return {
              month: date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
              revenue: Math.round(data.revenue),
              collected: Math.round(data.collected),
            };
          });

        // Revenue by plan
        const planRevenue: Record<string, number> = {};
        for (const inv of invoices) {
          const planName = inv.Plan?.name || "Other";
          planRevenue[planName] = (planRevenue[planName] || 0) + (inv.grandTotal || 0);
        }
        const revenueByPlan = Object.entries(planRevenue)
          .map(([plan, revenue]) => ({ plan, revenue: Math.round(revenue) }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 10);

        // Revenue by area
        const areaRevenue: Record<string, number> = {};
        for (const inv of invoices) {
          const areaName = inv.Subscriber?.Area?.name || "Unassigned";
          areaRevenue[areaName] = (areaRevenue[areaName] || 0) + (inv.grandTotal || 0);
        }
        const revenueByArea = Object.entries(areaRevenue)
          .map(([area, revenue]) => ({ area, revenue: Math.round(revenue) }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 8);

        // Payment mode breakdown
        const modeBreakdown: Record<string, number> = {};
        const totalPaidAmount = payments.reduce((s, p) => s + (p.amount || 0), 0);
        for (const p of payments) {
          const mode = p.paymentMode || "CASH";
          modeBreakdown[mode] = (modeBreakdown[mode] || 0) + (p.amount || 0);
        }
        const paymentModeBreakdown = Object.entries(modeBreakdown)
          .map(([mode, amount]) => ({
            mode: mode.charAt(0) + mode.slice(1).toLowerCase().replace(/_/g, " "),
            amount: Math.round(amount),
            percentage: totalPaidAmount > 0 ? Math.round((amount / totalPaidAmount) * 1000) / 10 : 0,
          }))
          .sort((a, b) => b.amount - a.amount);

        return NextResponse.json({
          stats: {
            totalRevenue: Math.round(totalRevenue),
            outstanding: Math.round(outstanding),
            overdueTotal: Math.round(overdueTotal),
            collectionRate,
            arpu,
          },
          monthlyRevenueTrend,
          revenueByPlan,
          revenueByArea,
          paymentModeBreakdown: paymentModeBreakdown.length > 0 ? paymentModeBreakdown : [{ mode: "No Payments", amount: 0, percentage: 0 }],
          gst: { cgst: Math.round(cgst), sgst: Math.round(sgst), igst: Math.round(igst) },
        });
      }

      case "subscriber": {
        // ── Subscriber Reports ──
        const totalActive = await db.subscriber.count({ where: { status: "ACTIVE" } });
        const totalSuspended = await db.subscriber.count({ where: { status: "SUSPENDED" } });
        const totalDisconnected = await db.subscriber.count({ where: { status: "DISCONNECTED" } });

        // New this period
        const newThisPeriod = await db.subscriber.count({
          where: {
            status: { in: ["ACTIVE", "PENDING_ACTIVATION"] },
            createdAt: { gte: periodStart, lte: periodEnd },
          },
        });

        // Churned: subscribers with SUSPENDED/DISCONNECTED status where updatedAt is in period
        const churnedThisPeriod = await db.subscriber.count({
          where: {
            status: { in: ["SUSPENDED", "DISCONNECTED"] },
            updatedAt: { gte: periodStart, lte: periodEnd },
          },
        });

        const netGrowth = newThisPeriod - churnedThisPeriod;

        // Subscriber growth trend (last 12 months)
        const growthData: Record<string, { active: number; newSubs: number; churned: number }> = {};
        const startOfEachMonth: string[] = [];
        for (let i = 11; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          startOfEachMonth.push(key);
          growthData[key] = { active: 0, newSubs: 0, churned: 0 };
        }

        const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

        // New subs by month
        const newSubsByMonth = await db.subscriber.groupBy({
          by: ["createdAt"],
          where: { createdAt: { gte: twelveMonthsAgo } },
          _count: true,
        });
        // Simplified: count created in each month
        const allSubsRecent = await db.subscriber.findMany({
          where: { createdAt: { gte: twelveMonthsAgo } },
          select: { createdAt: true },
        });
        for (const s of allSubsRecent) {
          const d = new Date(s.createdAt);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (growthData[key]) growthData[key].newSubs++;
        }

        // Churned by month
        const churnedSubs = await db.subscriber.findMany({
          where: { status: { in: ["SUSPENDED", "DISCONNECTED"] }, updatedAt: { gte: twelveMonthsAgo } },
          select: { updatedAt: true },
        });
        for (const s of churnedSubs) {
          const d = new Date(s.updatedAt);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (growthData[key]) growthData[key].churned++;
        }

        // Active count per month (cumulative)
        for (const key of startOfEachMonth) {
          const [y, m] = key.split("-");
          const monthEnd = new Date(Number(y), Number(m), 0, 23, 59, 59);
          growthData[key].active = await db.subscriber.count({
            where: { status: "ACTIVE", createdAt: { lte: monthEnd } },
          });
        }

        const growthTrend = startOfEachMonth.map((key) => {
          const g = growthData[key];
          const [y, m] = key.split("-");
          const date = new Date(Number(y), Number(m) - 1, 1);
          return {
            month: date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
            active: g.active,
            newSubs: g.newSubs,
            churned: g.churned,
          };
        });

        // Connection type (plan) distribution
        const connectionTypeDist = await db.subscriber.groupBy({
          by: ["connectionType"],
          where: { status: "ACTIVE" },
          _count: true,
        });
        const planDistribution = connectionTypeDist.map((p) => ({
          type: p.connectionType,
          count: p._count,
          percentage: totalActive > 0 ? Math.round((p._count / totalActive) * 1000) / 10 : 0,
        }));

        // Plan name distribution
        const planNameDist = await db.subscriber.findMany({
          where: { status: "ACTIVE", planId: { not: null } },
          select: { Plan: { select: { name: true } } },
        });
        const planCountMap: Record<string, number> = {};
        for (const s of planNameDist) {
          const name = s.Plan?.name || "Unknown";
          planCountMap[name] = (planCountMap[name] || 0) + 1;
        }
        const planNameDistribution = Object.entries(planCountMap)
          .map(([name, count]) => ({ plan: name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        // Status distribution (all-time)
        const statusDist = await db.subscriber.groupBy({
          by: ["status"],
          _count: true,
        });
        const statusDistribution = statusDist.map((s) => ({
          status: s.status,
          count: s._count,
        }));

        // Area-wise distribution
        const areas = await db.area.findMany({
          select: { id: true, name: true },
        });
        const areaDistribution = await Promise.all(
          areas.map(async (area) => {
            const total = await db.subscriber.count({ where: { areaId: area.id } });
            const active = await db.subscriber.count({ where: { areaId: area.id, status: "ACTIVE" } });
            return { area: area.name, total, active, suspended: total - active };
          })
        );
        const areaWiseDistribution = areaDistribution
          .filter((a) => a.total > 0)
          .sort((a, b) => b.total - a.total)
          .slice(0, 10);

        // Top growth areas
        const topGrowthAreas = await Promise.all(
          areas.map(async (area) => {
            const newSubs = await db.subscriber.count({
              where: { areaId: area.id, status: { in: ["ACTIVE", "PENDING_ACTIVATION"] }, createdAt: { gte: periodStart, lte: periodEnd } },
            });
            const prevSubs = await db.subscriber.count({
              where: { areaId: area.id, status: "ACTIVE", createdAt: { lt: periodStart } },
            });
            const growth = prevSubs > 0 ? Math.round((newSubs / prevSubs) * 1000) / 10 : 0;
            return { area: area.name, growth, newSubs };
          })
        );
        const topGrowthAreasFiltered = topGrowthAreas
          .filter((a) => a.newSubs > 0)
          .sort((a, b) => b.growth - a.growth)
          .slice(0, 6);

        // Conversion funnel
        const totalPending = await db.subscriber.count({ where: { status: "PENDING_ACTIVATION" } });
        const trialCount = await db.subscriber.count({ where: { status: "TRIAL" } });
        const trialConversion = [
          { stage: "Total Signups", count: newThisPeriod + totalPending + trialCount },
          { stage: "Pending Activation", count: totalPending },
          { stage: "Trial", count: trialCount },
          { stage: "Activated This Period", count: newThisPeriod },
          { stage: "Currently Active", count: totalActive },
        ];

        return NextResponse.json({
          stats: { totalActive, totalSuspended, newThisMonth: newThisPeriod, churnedThisMonth: churnedThisPeriod, netGrowth },
          growthTrend,
          planDistribution,
          planNameDistribution,
          statusDistribution,
          areaWiseDistribution,
          trialConversion,
          topGrowthAreas: topGrowthAreasFiltered,
        });
      }

      case "network": {
        // ── Network Reports ──
        const devices = await db.networkDevice.findMany({
          select: { id: true, name: true, type: true, status: true, createdAt: true, uptimeSeconds: true, areaId: true, cpuUsage: true, memoryUsage: true },
        });

        // Device status distribution
        const statusDist: Record<string, number> = {};
        for (const d of devices) {
          statusDist[d.status] = (statusDist[d.status] || 0) + 1;
        }
        const deviceStatusDistribution = Object.entries(statusDist)
          .map(([status, count]) => ({ status, count, percentage: devices.length > 0 ? Math.round((count / devices.length) * 1000) / 10 : 0 }))
          .sort((a, b) => b.count - a.count);

        // Device type breakdown
        const typeDist: Record<string, number> = {};
        for (const d of devices) {
          typeDist[d.type] = (typeDist[d.type] || 0) + 1;
        }
        const deviceTypeBreakdown = Object.entries(typeDist)
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count);

        // Avg uptime
        const onlineDevices = devices.filter((d) => d.status === "ONLINE").length;
        const totalDevices = devices.length || 1;
        const avgUptime = onlineDevices > 0 ? (onlineDevices / totalDevices) * 100 : 0;

        const peakConcurrent = await db.subscriber.count({ where: { status: "ACTIVE" } });

        // Bandwidth by area
        const areas = await db.area.findMany({ select: { id: true, name: true } });
        const areaBandwidth = await Promise.all(
          areas.map(async (area) => {
            const areaDevices = devices.filter((d) => d.areaId === area.id);
            if (areaDevices.length === 0) return { area: area.name, tb: 0 };
            const ids = areaDevices.map((d) => d.id);
            const agg = await db.bandwidthLog.groupBy({
              by: ["deviceId"],
              where: { deviceId: { in: ids } },
              _sum: { totalBps: true },
            });
            const totalBps = agg.reduce((s, a) => s + (a._sum.totalBps || 0), 0);
            return { area: area.name, tb: Math.round((totalBps / (1000 * 1000 * 1000 / 8)) * 100) / 100 };
          })
        );
        const bandwidthByArea = areaBandwidth
          .filter((a) => a.tb > 0)
          .sort((a, b) => b.tb - a.tb)
          .slice(0, 8);

        // Device uptime table
        const deviceUptime = devices.slice(0, 10).map((d) => {
          let uptime = 0;
          if (d.createdAt) {
            const ageHours = (now.getTime() - new Date(d.createdAt).getTime()) / 3600000;
            if (d.uptimeSeconds && d.uptimeSeconds > 0) {
              const uptimeHours = d.uptimeSeconds / 3600;
              uptime = ageHours > 0 ? Math.min((uptimeHours / ageHours) * 100, 100) : 100;
            } else {
              uptime = d.status === "ONLINE" ? 100 : d.status === "WARNING" ? 50 : 0;
            }
          }
          return { device: d.name, type: d.type, uptime: Math.round(uptime * 100) / 100 };
        });

        // Peak usage hours from RadiusSession
        const allSessions = await db.radiusSession.findMany({
          select: { startTime: true },
          where: { startTime: { gte: periodStart, lte: periodEnd } },
        });
        const hourlySessionCounts = new Array(24).fill(0);
        for (const s of allSessions) {
          if (s.startTime) {
            const hour = new Date(s.startTime).getHours();
            hourlySessionCounts[hour]++;
          }
        }
        const peakUsageHours = Array.from({ length: 24 }, (_, i) => ({
          hour: `${String(i).padStart(2, "0")}:00`,
          users: hourlySessionCounts[i],
        }));

        // Capacity utilization (based on real device metrics)
        const devicesWithMetrics = await db.networkDevice.findMany({
          select: { name: true, status: true, cpuUsage: true, memoryUsage: true },
          take: 5,
        });
        const capacityUtilization = devicesWithMetrics.map((d) => {
          const util = d.status === "ONLINE" ? Math.max(d.cpuUsage || 0, d.memoryUsage || 0) : d.status === "WARNING" ? 85 : 0;
          return { device: d.name, current: Math.round(util * 10), max: 100, utilization: Math.round(util * 10) / 10 };
        });

        // Top bandwidth users (from real UsageLog data)
        const usageAgg = await db.usageLog.groupBy({
          by: ["subscriberId"],
          _sum: { downloadBytes: true, uploadBytes: true, totalBytes: true },
          orderBy: { _sum: { totalBytes: "desc" } },
          take: 10,
        });
        const topBandwidthUsers = await Promise.all(usageAgg.map(async (u) => {
          const sub = await db.subscriber.findUnique({
            where: { id: u.subscriberId },
            select: { name: true, Plan: { select: { name: true } } },
          });
          const toGB = (bytes: bigint | null) => Math.round(Number(bytes || 0) / (1024 * 1024 * 1024) * 100) / 100;
          return {
            name: sub?.name || "Unknown",
            plan: sub?.Plan?.name || "Unknown",
            download: toGB(u._sum.downloadBytes),
            upload: toGB(u._sum.uploadBytes),
            total: toGB(u._sum.totalBytes),
          };
        }));

        // Network alerts in period
        const alerts = await db.networkAlert.findMany({
          where: { createdAt: { gte: periodStart, lte: periodEnd } },
        });
        const alertSeverityDist: Record<string, number> = {};
        for (const a of alerts) {
          alertSeverityDist[a.severity] = (alertSeverityDist[a.severity] || 0) + 1;
        }
        const alertSummary = Object.entries(alertSeverityDist)
          .map(([severity, count]) => ({ severity, count }))
          .sort((a, b) => b.count - a.count);

        const totalBandwidth = await db.bandwidthLog.aggregate({ _sum: { totalBps: true } });
        const totalBandwidthTb = totalBandwidth._sum.totalBps
          ? (totalBandwidth._sum.totalBps / (1000 * 1000 * 1000 * 1000 / 8)).toFixed(1)
          : "0";

        return NextResponse.json({
          stats: {
            avgUptime: Math.round(avgUptime * 100) / 100,
            totalDevices: devices.length,
            totalBandwidth: totalBandwidthTb,
            peakConcurrent,
            totalAlerts: alerts.length,
          },
          deviceStatusDistribution,
          deviceTypeBreakdown,
          deviceUptime,
          bandwidthByArea,
          topBandwidthUsers,
          peakUsageHours,
          capacityUtilization,
          alertSummary,
        });
      }

      case "operations": {
        // ── Operations Reports ──
        const complaints = await db.complaint.findMany({
          where: { createdAt: { gte: periodStart, lte: periodEnd } },
          include: {
            assignedTo: { select: { name: true, totalResolved: true, avgResolutionTime: true, rating: true } },
          },
        });

        const totalComplaints = complaints.length;
        const resolvedComplaints = complaints.filter(
          (c) => c.status === "RESOLVED" || c.status === "CLOSED"
        );

        // Calculate avg resolution time from actual timestamps (hours)
        const resolvedWithDates = resolvedComplaints.filter(
          (c) => c.resolvedAt && c.createdAt
        );
        const avgResolutionMs =
          resolvedWithDates.length > 0
            ? resolvedWithDates.reduce(
                (s, c) =>
                  s + (new Date(c.resolvedAt!).getTime() - new Date(c.createdAt).getTime()),
                0
              ) / resolvedWithDates.length
            : 0;
        const avgResolutionHours = avgResolutionMs / (1000 * 60 * 60);
        const avgResolutionTime =
          avgResolutionHours >= 1
            ? `${avgResolutionHours.toFixed(1)}h`
            : `${Math.round(avgResolutionHours * 60)}m`;

        // SLA compliance
        const slaMet = complaints.filter((c) => {
          if (c.status !== "RESOLVED" && c.status !== "CLOSED") return false;
          if (!c.slaDeadline || !c.resolvedAt) return true;
          return new Date(c.resolvedAt) <= new Date(c.slaDeadline);
        }).length;
        const slaComplaints = resolvedComplaints.length || 1;
        const slaCompliance = Math.round((slaMet / slaComplaints) * 100);

        // Technician utilization
        const technicians = await db.technician.findMany({
          where: { status: "available" },
        });
        const technicianUtilization =
          technicians.length > 0
            ? Math.min(
                Math.round(
                  (technicians.reduce((s, t) => s + (t.totalResolved || 0), 0) /
                    (technicians.length * 20)) *
                    100
                ),
                100
              )
            : 0;

        // Complaints by type
        const typeBreakdown: Record<string, number> = {};
        for (const c of complaints) {
          typeBreakdown[c.type] = (typeBreakdown[c.type] || 0) + 1;
        }
        const complaintsByType = Object.entries(typeBreakdown)
          .map(([type, count]) => ({ type: type.replace(/_/g, " "), count }))
          .sort((a, b) => b.count - a.count);

        // Complaints by priority
        const priorityBreakdown: Record<string, number> = {};
        for (const c of complaints) {
          priorityBreakdown[c.priority] = (priorityBreakdown[c.priority] || 0) + 1;
        }
        const complaintsByPriority = Object.entries(priorityBreakdown)
          .map(([priority, count]) => ({
            priority: priority.replace(/_/g, " "),
            count,
            percentage:
              totalComplaints > 0
                ? Math.round((count / totalComplaints) * 1000) / 10
                : 0,
          }))
          .sort((a, b) => b.count - a.count);

        // Technician leaderboard with real SLA compliance
        const techList = await db.technician.findMany({
          orderBy: [{ totalResolved: "desc" }],
          take: 8,
        });
        const technicianLeaderboard = await Promise.all(
          techList.map(async (t, i) => {
            const techComplaints = await db.complaint.findMany({
              where: { assignedToId: t.id, status: { in: ["RESOLVED", "CLOSED"] } },
              select: { slaDeadline: true, resolvedAt: true },
            });
            const techSlaMet = techComplaints.filter((c) => {
              if (!c.slaDeadline || !c.resolvedAt) return true;
              return new Date(c.resolvedAt) <= new Date(c.slaDeadline);
            }).length;
            const techSlaCompliance =
              techComplaints.length > 0
                ? Math.round((techSlaMet / techComplaints.length) * 100)
                : 100;

            // Calculate real avg resolution for this tech
            const techResolvedWithDates = await db.complaint.findMany({
              where: {
                assignedToId: t.id,
                status: { in: ["RESOLVED", "CLOSED"] },
                resolvedAt: { not: null },
              },
              select: { createdAt: true, resolvedAt: true },
            });
            const techAvgMs =
              techResolvedWithDates.length > 0
                ? techResolvedWithDates.reduce((s, c) => {
                    const rt = c.resolvedAt ? new Date(c.resolvedAt).getTime() : 0;
                    return s + (rt - new Date(c.createdAt).getTime());
                  }, 0) / techResolvedWithDates.length
                : 0;
            const techAvgHours = techAvgMs / (1000 * 60 * 60);
            const techAvgTime =
              techAvgHours >= 1
                ? `${techAvgHours.toFixed(1)}h`
                : `${Math.round(techAvgHours * 60)}m`;

            return {
              rank: i + 1,
              name: t.name,
              resolved: t.totalResolved,
              avgTime: techAvgTime,
              rating: t.rating || 0,
              slaCompliance: techSlaCompliance,
            };
          })
        );

        // Agent collection leaderboard
        const agents = await db.collectionAgent.findMany({
          include: { User: { select: { name: true } } },
          orderBy: { id: "asc" },
        });
        const agentCollectionLeaderboard = agents.map((a, i) => ({
          rank: i + 1,
          name: a.User?.name || `Agent ${i + 1}`,
          target: a.monthlyTarget || 300000,
          collected: Math.round(a.totalCollectedMonth || 0),
          achieved: a.monthlyTarget
            ? Math.round((a.totalCollectedMonth / a.monthlyTarget) * 1000) / 10
            : 0,
        }));

        // Installation metrics
        const installations = await db.installation.findMany({
          where: { scheduledDate: { gte: periodStart, lte: periodEnd } },
        });
        const installCompleted = installations.filter(
          (inst) => inst.status === "COMPLETED"
        ).length;
        const installPending = installations.filter(
          (inst) => inst.status === "SCHEDULED" || inst.status === "IN_PROGRESS"
        ).length;
        const installCancelled = installations.filter(
          (inst) => inst.status === "CANCELLED" || inst.status === "NO_SHOW"
        ).length;

        // Monthly operations summary (last 6 months)
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        const monthlyOps: Record<
          string,
          { connections: number; complaints: number; revenue: number }
        > = {};

        const recentSubs = await db.subscriber.findMany({
          where: { createdAt: { gte: sixMonthsAgo } },
          select: { createdAt: true },
        });
        for (const s of recentSubs) {
          const d = new Date(s.createdAt);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (!monthlyOps[key]) monthlyOps[key] = { connections: 0, complaints: 0, revenue: 0 };
          monthlyOps[key].connections++;
        }

        const recentComplaints = await db.complaint.findMany({
          where: { createdAt: { gte: sixMonthsAgo } },
          select: { createdAt: true },
        });
        for (const c of recentComplaints) {
          const d = new Date(c.createdAt);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (!monthlyOps[key]) monthlyOps[key] = { connections: 0, complaints: 0, revenue: 0 };
          monthlyOps[key].complaints++;
        }

        const recentInvoices = await db.invoice.findMany({
          where: { issueDate: { gte: sixMonthsAgo }, status: { not: "CANCELLED" } },
          select: { issueDate: true, grandTotal: true },
        });
        for (const inv of recentInvoices) {
          const d = new Date(inv.issueDate);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (!monthlyOps[key]) monthlyOps[key] = { connections: 0, complaints: 0, revenue: 0 };
          monthlyOps[key].revenue += inv.grandTotal || 0;
        }

        const monthlyOperationsSummary = Object.entries(monthlyOps)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-6)
          .map(([key, data]) => {
            const [y, m] = key.split("-");
            const date = new Date(Number(y), Number(m) - 1, 1);
            return {
              month: date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
              connections: data.connections,
              complaints: data.complaints,
              avgResolution: avgResolutionTime,
              revenue: Math.round(data.revenue),
            };
          });

        return NextResponse.json({
          stats: {
            totalComplaints,
            avgResolutionTime,
            slaCompliance,
            technicianUtilization,
            installCompleted,
            installPending,
            installCancelled,
            totalInstallations: installations.length,
          },
          complaintsByType,
          complaintsByPriority,
          technicianLeaderboard,
          agentCollectionLeaderboard,
          monthlyOperationsSummary,
        });
      }

      case "usage": {
        // ── Subscriber Usage Report ──
        const planIdFilter = searchParams.get("planId");
        const areaIdFilter = searchParams.get("areaId");

        const whereClause: Record<string, unknown> = {
          timestamp: { gte: periodStart, lte: periodEnd },
        };
        if (planIdFilter) {
          const subsWithPlan = await db.subscriber.findMany({ where: { planId: planIdFilter }, select: { id: true } });
          whereClause.subscriberId = { in: subsWithPlan.map(s => s.id) };
        }
        if (areaIdFilter) {
          const subsInArea = await db.subscriber.findMany({ where: { areaId: areaIdFilter }, select: { id: true } });
          if (whereClause.subscriberId) {
            const existing = whereClause.subscriberId as string[];
            whereClause.subscriberId = { in: existing.filter(id => subsInArea.some(s => s.id === id)) };
          } else {
            whereClause.subscriberId = { in: subsInArea.map(s => s.id) };
          }
        }

        const usageLogs = await db.usageLog.findMany({
          where: whereClause,
          include: {
            Subscriber: {
              select: {
                name: true, code: true, phone: true,
                Plan: { select: { id: true, name: true, category: true } },
                Area: { select: { id: true, name: true } },
                connectionType: true,
              },
            },
          },
          orderBy: { totalBytes: "desc" },
        });

        // Aggregate per subscriber
        const subMap: Record<string, {
          name: string; code: string; phone: string; plan: string; planCategory: string;
          area: string; connectionType: string;
          downloadBytes: bigint; uploadBytes: bigint; totalBytes: bigint;
          totalDuration: number; sessionCount: number;
        }> = {};

        for (const log of usageLogs) {
          const sid = log.subscriberId;
          if (!subMap[sid]) {
            subMap[sid] = {
              name: log.Subscriber?.name || "Unknown",
              code: log.Subscriber?.code || "",
              phone: log.Subscriber?.phone || "",
              plan: log.Subscriber?.Plan?.name || "Unknown",
              planCategory: log.Subscriber?.Plan?.category || "FTTH",
              area: log.Subscriber?.Area?.name || "Unassigned",
              connectionType: log.Subscriber?.connectionType || "FTTH",
              downloadBytes: 0n, uploadBytes: 0n, totalBytes: 0n,
              totalDuration: 0, sessionCount: 0,
            };
          }
          subMap[sid].downloadBytes += log.downloadBytes;
          subMap[sid].uploadBytes += log.uploadBytes;
          subMap[sid].totalBytes += log.totalBytes;
          subMap[sid].totalDuration += log.sessionDuration;
          subMap[sid].sessionCount++;
        }

        const toGB = (bytes: bigint) => Math.round(Number(bytes) / (1024 * 1024 * 1024) * 100) / 100;
        const formatDuration = (seconds: number) => {
          const h = Math.floor(seconds / 3600);
          const m = Math.floor((seconds % 3600) / 60);
          return h > 0 ? `${h}h ${m}m` : `${m}m`;
        };

        const subscriberUsage = Object.values(subMap)
          .map(s => ({
            ...s,
            downloadGB: toGB(s.downloadBytes),
            uploadGB: toGB(s.uploadBytes),
            totalGB: toGB(s.totalBytes),
            avgSessionDuration: s.sessionCount > 0 ? formatDuration(Math.round(s.totalDuration / s.sessionCount)) : "0m",
          }))
          .sort((a, b) => Number(b.totalBytes) - Number(a.totalBytes));

        const topConsumers = subscriberUsage.slice(0, 15);

        // Stats
        const totalDownloadGB = usageLogs.reduce((s, l) => s + Number(l.downloadBytes), 0) / (1024 ** 3);
        const totalUploadGB = usageLogs.reduce((s, l) => s + Number(l.uploadBytes), 0) / (1024 ** 3);
        const totalUsageGB = totalDownloadGB + totalUploadGB;
        const uniqueSubs = Object.keys(subMap).length;
        const avgUsagePerSub = uniqueSubs > 0 ? totalUsageGB / uniqueSubs : 0;

        // Usage by plan
        const planUsageMap: Record<string, { download: bigint; upload: bigint; total: bigint; count: number }> = {};
        for (const s of Object.values(subMap)) {
          if (!planUsageMap[s.Plan]) planUsageMap[s.Plan] = { download: 0n, upload: 0n, total: 0n, count: 0 };
          planUsageMap[s.Plan].download += subMap[Object.keys(subMap).find(k => subMap[k].name === s.name) || ""]?.downloadBytes || 0n;
          planUsageMap[s.Plan].count++;
        }
        // Recalculate properly
        for (const sid in subMap) {
          const s = subMap[sid];
          if (!planUsageMap[s.Plan]) planUsageMap[s.Plan] = { download: 0n, upload: 0n, total: 0n, count: 0 };
          planUsageMap[s.Plan].download += s.downloadBytes;
          planUsageMap[s.Plan].upload += s.uploadBytes;
          planUsageMap[s.Plan].total += s.totalBytes;
          planUsageMap[s.Plan].count++;
        }
        const usageByPlan = Object.entries(planUsageMap)
          .map(([plan, data]) => ({ plan, downloadGB: toGB(data.download), uploadGB: toGB(data.upload), totalGB: toGB(data.total), subscribers: data.count }))
          .sort((a, b) => b.totalGB - a.totalGB);

        // Usage by area
        const areaUsageMap: Record<string, { download: bigint; upload: bigint; total: bigint; count: number }> = {};
        for (const sid in subMap) {
          const s = subMap[sid];
          if (!areaUsageMap[s.Area]) areaUsageMap[s.Area] = { download: 0n, upload: 0n, total: 0n, count: 0 };
          areaUsageMap[s.Area].download += s.downloadBytes;
          areaUsageMap[s.Area].upload += s.uploadBytes;
          areaUsageMap[s.Area].total += s.totalBytes;
          areaUsageMap[s.Area].count++;
        }
        const usageByArea = Object.entries(areaUsageMap)
          .map(([area, data]) => ({ area, downloadGB: toGB(data.download), uploadGB: toGB(data.upload), totalGB: toGB(data.total), subscribers: data.count }))
          .sort((a, b) => b.totalGB - a.totalGB);

        // Available plans and areas for filters
        const plans = await db.plan.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
        const areas = await db.area.findMany({ select: { id: true, name: true } });

        return NextResponse.json({
          success: true,
          stats: {
            totalUsageGB: Math.round(totalUsageGB * 100) / 100,
            totalDownloadGB: Math.round(totalDownloadGB * 100) / 100,
            totalUploadGB: Math.round(totalUploadGB * 100) / 100,
            uniqueSubscribers: uniqueSubs,
            avgUsagePerSub: Math.round(avgUsagePerSub * 100) / 100,
            totalSessions: usageLogs.length,
          },
          topConsumers,
          usageByPlan,
          usageByArea,
          filters: {
            plans: plans.map(p => ({ id: p.id, name: p.name })),
            areas: areas.map(a => ({ id: a.id, name: a.name })),
          },
        });
      }

      case "revenue": {
        // ── Revenue Analytics ──
        const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

        // Monthly revenue trend (last 12 months)
        const allInvoices = await db.invoice.findMany({
          where: { issueDate: { gte: twelveMonthsAgo }, status: { not: "CANCELLED" } },
          select: { issueDate: true, grandTotal: true, paidAmount: true, Plan: { select: { category: true } } },
        });
        const monthlyMap: Record<string, { revenue: number; collected: number; invoices: number }> = {};
        for (const inv of allInvoices) {
          const d = new Date(inv.issueDate);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (!monthlyMap[key]) monthlyMap[key] = { revenue: 0, collected: 0, invoices: 0 };
          monthlyMap[key].revenue += inv.grandTotal || 0;
          monthlyMap[key].collected += inv.paidAmount || 0;
          monthlyMap[key].invoices++;
        }
        const monthlyTrend = Object.entries(monthlyMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, data]) => {
            const [y, m] = key.split("-");
            const date = new Date(Number(y), Number(m) - 1, 1);
            return {
              month: date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
              revenue: Math.round(data.revenue),
              collected: Math.round(data.collected),
              invoices: data.invoices,
              collectionRate: data.revenue > 0 ? Math.round((data.collected / data.revenue) * 100) : 0,
            };
          });

        // Plan-wise revenue breakdown
        const planRevenueMap: Record<string, { revenue: number; count: number }> = {};
        for (const inv of allInvoices) {
          const planName = inv.Plan?.category || "Other";
          if (!planRevenueMap[planName]) planRevenueMap[planName] = { revenue: 0, count: 0 };
          planRevenueMap[planName].revenue += inv.grandTotal || 0;
          planRevenueMap[planName].count++;
        }
        const planWiseRevenue = Object.entries(planRevenueMap)
          .map(([plan, data]) => ({ plan, revenue: Math.round(data.revenue), invoices: data.count }))
          .sort((a, b) => b.revenue - a.revenue);

        // Revenue by connection type (from invoices → subscriber → connectionType)
        const invoicesWithSubs = await db.invoice.findMany({
          where: { issueDate: { gte: periodStart, lte: periodEnd }, status: { not: "CANCELLED" } },
          select: { grandTotal: true, Subscriber: { select: { connectionType: true } } },
        });
        const connectionRevenue: Record<string, number> = {};
        for (const inv of invoicesWithSubs) {
          const ct = inv.Subscriber?.connectionType || "OTHER";
          connectionRevenue[ct] = (connectionRevenue[ct] || 0) + (inv.grandTotal || 0);
        }
        const revenueByConnectionType = Object.entries(connectionRevenue)
          .map(([type, revenue]) => ({ type, revenue: Math.round(revenue) }))
          .sort((a, b) => b.revenue - a.revenue);

        // MRR trend
        const currentMonthInvoices = await db.invoice.findMany({
          where: {
            issueDate: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
            status: { not: "CANCELLED" },
          },
        });
        const mrr = currentMonthInvoices.reduce((s, i) => s + (i.grandTotal || 0), 0);

        // Collection efficiency for period
        const periodInvoices = await db.invoice.findMany({
          where: { issueDate: { gte: periodStart, lte: periodEnd }, status: { not: "CANCELLED" } },
        });
        const totalRev = periodInvoices.reduce((s, i) => s + (i.grandTotal || 0), 0);
        const totalCollected = periodInvoices.reduce((s, i) => s + (i.paidAmount || 0), 0);
        const collectionEfficiency = totalRev > 0 ? Math.round((totalCollected / totalRev) * 100) : 0;

        const activeSubs = await db.subscriber.count({ where: { status: "ACTIVE" } });
        const arpu = activeSubs > 0 ? Math.round(mrr / activeSubs) : 0;

        // ARPU trend (last 6 months)
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        const arpuTrend: Array<{ month: string; arpu: number; subscribers: number }> = [];
        for (let i = 5; i >= 0; i--) {
          const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
          const mInvoices = await db.invoice.findMany({
            where: { issueDate: { gte: mStart, lte: mEnd }, status: { not: "CANCELLED" } },
            select: { grandTotal: true },
          });
          const mRevenue = mInvoices.reduce((s, inv) => s + (inv.grandTotal || 0), 0);
          const mActive = await db.subscriber.count({ where: { status: "ACTIVE", createdAt: { lte: mEnd } } });
          const mArpu = mActive > 0 ? Math.round(mRevenue / mActive) : 0;
          arpuTrend.push({
            month: mStart.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
            arpu: mArpu,
            subscribers: mActive,
          });
        }

        return NextResponse.json({
          success: true,
          stats: {
            mrr: Math.round(mrr),
            arpu,
            collectionEfficiency,
            activeSubscribers: activeSubs,
            totalRevenue: Math.round(totalRev),
            totalCollected: Math.round(totalCollected),
          },
          monthlyTrend,
          planWiseRevenue,
          revenueByConnectionType,
          arpuTrend,
        });
      }

      case "network_health": {
        // ── Network Health Report ──
        const devices = await db.networkDevice.findMany({
          select: {
            id: true, name: true, type: true, status: true, Vendor: true, model: true,
            ipAddress: true, createdAt: true, uptimeSeconds: true, areaId: true,
            cpuUsage: true, memoryUsage: true, temperature: true, lastSeenAt: true,
          },
        });

        const onlineCount = devices.filter(d => d.status === "ONLINE").length;
        const offlineCount = devices.filter(d => d.status === "OFFLINE").length;
        const warningCount = devices.filter(d => d.status === "WARNING").length;
        const totalDevCount = devices.length || 1;

        // Avg uptime
        const avgUptime = (onlineCount / totalDevCount) * 100;

        // Device uptime details
        const deviceUptimeStats = devices.map(d => {
          let uptime = 0;
          if (d.createdAt) {
            const ageHours = (now.getTime() - new Date(d.createdAt).getTime()) / 3600000;
            if (d.uptimeSeconds && d.uptimeSeconds > 0) {
              const uptimeHours = d.uptimeSeconds / 3600;
              uptime = ageHours > 0 ? Math.min((uptimeHours / ageHours) * 100, 100) : 100;
            } else {
              uptime = d.status === "ONLINE" ? 100 : d.status === "WARNING" ? 50 : 0;
            }
          }
          return {
            id: d.id, name: d.name, type: d.type, vendor: d.vendor, model: d.model,
            ipAddress: d.ipAddress, status: d.status,
            uptime: Math.round(uptime * 100) / 100,
            cpuUsage: d.cpuUsage || 0,
            memoryUsage: d.memoryUsage || 0,
            temperature: d.temperature,
            lastSeen: d.lastSeenAt,
          };
        }).sort((a, b) => b.uptime - a.uptime);

        // Bandwidth utilization by link (recent logs per device)
        const bandwidthByLink: Array<{ device: string; interface: string; downloadMbps: number; uploadMbps: number; totalMbps: number; timestamp: Date }> = [];
        for (const dev of devices.slice(0, 10)) {
          const latestLog = await db.bandwidthLog.findFirst({
            where: { deviceId: dev.id },
            orderBy: { timestamp: "desc" },
            select: { downloadBps: true, uploadBps: true, totalBps: true, interfaceName: true, timestamp: true },
          });
          if (latestLog) {
            bandwidthByLink.push({
              device: dev.name,
              interface: latestLog.interfaceName || "default",
              downloadMbps: Math.round((latestLog.downloadBps || 0) / 1000000 * 100) / 100,
              uploadMbps: Math.round((latestLog.uploadBps || 0) / 1000000 * 100) / 100,
              totalMbps: Math.round((latestLog.totalBps || 0) / 1000000 * 100) / 100,
              timestamp: latestLog.timestamp,
            });
          }
        }

        // Critical alerts summary
        const alerts = await db.networkAlert.findMany({
          where: { createdAt: { gte: periodStart, lte: periodEnd } },
          orderBy: { createdAt: "desc" },
          take: 20,
        });
        const criticalAlerts = alerts.filter(a => a.severity === "CRITICAL" || a.severity === "HIGH");
        const alertSeverityDist: Record<string, number> = {};
        for (const a of alerts) {
          alertSeverityDist[a.severity] = (alertSeverityDist[a.severity] || 0) + 1;
        }
        const alertBySeverity = Object.entries(alertSeverityDist)
          .map(([severity, count]) => ({ severity, count }))
          .sort((a, b) => {
            const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
            return (order[a.severity] ?? 5) - (order[b.severity] ?? 5);
          });

        // SLA compliance metrics
        const plans = await db.plan.findMany({ select: { name: true, slaUptime: true } });
        const avgSlaTarget = plans.length > 0
          ? plans.reduce((s, p) => s + (p.slaUptime || 99), 0) / plans.length
          : 99.5;
        const slaMet = avgUptime >= avgSlaTarget;
        const slaCompliance = avgUptime;

        return NextResponse.json({
          success: true,
          stats: {
            avgUptime: Math.round(avgUptime * 100) / 100,
            totalDevices: devices.length,
            onlineDevices: onlineCount,
            offlineDevices: offlineCount,
            warningDevices: warningCount,
            criticalAlerts: criticalAlerts.length,
            totalAlerts: alerts.length,
            slaCompliance: Math.round(slaCompliance * 100) / 100,
            slaTarget: Math.round(avgSlaTarget * 100) / 100,
          },
          deviceUptimeStats,
          bandwidthByLink,
          alertSummary: alertBySeverity,
          recentAlerts: alerts.slice(0, 10).map(a => ({
            id: a.id, title: a.title, severity: a.severity, status: a.status,
            source: a.source, deviceName: a.deviceId,
            createdAt: a.createdAt, resolvedAt: a.resolvedAt,
          })),
        });
      }

      case "accounting": {
        // ── RADIUS Accounting Report ──
        const radLogs = await db.radiusAccountingLog.findMany({
          where: {
            createdAt: { gte: periodStart, lte: periodEnd },
          },
          orderBy: { createdAt: "desc" },
        });

        // Auth stats from RadiusSession + RadiusAccountingLog
        const sessions = await db.radiusSession.findMany({
          where: { startTime: { gte: periodStart, lte: periodEnd } },
          include: {
            RadiusUser: {
              select: { Subscriber: { select: { name: true, Plan: { select: { name: true } } } } },
            },
          },
        });

        const totalSessions = sessions.length;
        const successfulSessions = sessions.filter(s => s.stopTime !== null || s.lastUpdate !== null).length;
        const activeSessions = sessions.filter(s => !s.stopTime).length;
        const successRate = totalSessions > 0 ? Math.round((successfulSessions / totalSessions) * 100) : 0;

        // Session duration distribution
        const durationBuckets = [
          { label: "< 5 min", min: 0, max: 300, count: 0 },
          { label: "5-30 min", min: 300, max: 1800, count: 0 },
          { label: "30 min - 1h", min: 1800, max: 3600, count: 0 },
          { label: "1-4 hours", min: 3600, max: 14400, count: 0 },
          { label: "4-12 hours", min: 14400, max: 43200, count: 0 },
          { label: "> 12 hours", min: 43200, max: Infinity, count: 0 },
        ];
        for (const s of sessions) {
          const dur = s.acctSessionTime || 0;
          for (const bucket of durationBuckets) {
            if (dur >= bucket.min && dur < bucket.max) {
              bucket.count++;
              break;
            }
          }
        }
        const sessionDurationDistribution = durationBuckets.map(b => ({ range: b.label, count: b.count }));

        // Average session duration
        const sessionsWithDuration = sessions.filter(s => s.acctSessionTime > 0);
        const avgSessionTime = sessionsWithDuration.length > 0
          ? sessionsWithDuration.reduce((s, sess) => s + sess.acctSessionTime, 0) / sessionsWithDuration.length
          : 0;
        const formatSec = (sec: number) => {
          const h = Math.floor(sec / 3600);
          const m = Math.floor((sec % 3600) / 60);
          return h > 0 ? `${h}h ${m}m` : `${m}m`;
        };

        // Top NAS devices by sessions
        const nasMap: Record<string, { sessions: number; totalDuration: number; totalInput: bigint; totalOutput: bigint }> = {};
        for (const s of sessions) {
          const nas = s.nasIp || "Unknown";
          if (!nasMap[nas]) nasMap[nas] = { sessions: 0, totalDuration: 0, totalInput: 0n, totalOutput: 0n };
          nasMap[nas].sessions++;
          nasMap[nas].totalDuration += s.acctSessionTime || 0;
          nasMap[nas].totalInput += s.inputOctets;
          nasMap[nas].totalOutput += s.outputOctets;
        }
        // Also count from accounting logs
        for (const log of radLogs) {
          const nas = log.nasIp || "Unknown";
          if (!nasMap[nas]) nasMap[nas] = { sessions: 0, totalDuration: 0, totalInput: 0n, totalOutput: 0n };
          nasMap[nas].sessions++;
          nasMap[nas].totalDuration += log.sessionTime || 0;
          nasMap[nas].totalInput += log.inputOctets;
          nasMap[nas].totalOutput += log.outputOctets;
        }
        const toGB = (bytes: bigint) => Math.round(Number(bytes) / (1024 * 1024 * 1024) * 100) / 100;
        const topNasDevices = Object.entries(nasMap)
          .map(([nasIp, data]) => ({
            nasIp,
            sessions: data.sessions,
            totalDuration: formatSec(data.totalDuration),
            avgDuration: data.sessions > 0 ? formatSec(Math.round(data.totalDuration / data.sessions)) : "0m",
            downloadGB: toGB(data.totalInput),
            uploadGB: toGB(data.totalOutput),
            totalGB: toGB(data.totalInput + data.totalOutput),
          }))
          .sort((a, b) => b.RadiusSession - a.RadiusSession)
          .slice(0, 10);

        // Terminate cause distribution
        const termCauseMap: Record<string, number> = {};
        for (const s of sessions) {
          const cause = s.terminateCause || "Active";
          termCauseMap[cause] = (termCauseMap[cause] || 0) + 1;
        }
        for (const log of radLogs) {
          const cause = log.terminateCause || "Unknown";
          termCauseMap[cause] = (termCauseMap[cause] || 0) + 1;
        }
        const terminateCauseDistribution = Object.entries(termCauseMap)
          .map(([cause, count]) => ({ cause: cause.replace(/_/g, " "), count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8);

        // Total data transferred
        const totalInputBytes = radLogs.reduce((s, l) => s + Number(l.inputOctets), 0) +
          sessions.reduce((s, sess) => s + Number(sess.inputOctets), 0);
        const totalOutputBytes = radLogs.reduce((s, l) => s + Number(l.outputOctets), 0) +
          sessions.reduce((s, sess) => s + Number(sess.outputOctets), 0);

        return NextResponse.json({
          success: true,
          stats: {
            totalSessions: totalSessions + radLogs.length,
            successfulSessions,
            activeSessions,
            successRate,
            avgSessionDuration: formatSec(Math.round(avgSessionTime)),
            totalDownloadGB: toGB(BigInt(Math.round(totalInputBytes))),
            totalUploadGB: toGB(BigInt(Math.round(totalOutputBytes))),
            uniqueNasDevices: Object.keys(nasMap).length,
            totalAccountingLogs: radLogs.length,
          },
          topNasDevices,
          sessionDurationDistribution,
          terminateCauseDistribution,
        });
      }

      default:
        return NextResponse.json({ error: "Invalid tab" }, { status: 400 });
    }
  } catch (error) {
    console.error("Reports API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch report data" },
      { status: 500 }
    );
  }
});
