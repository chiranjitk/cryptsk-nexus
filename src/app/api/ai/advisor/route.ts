import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { requireAuth, AuthError } from "@/lib/api-auth";

const SYSTEM_PROMPT = `You are an expert ISP business advisor for Cryptsk. Provide actionable, data-driven business insights for Internet Service Providers. Be concise but thorough. Use INR for currency. Focus on Indian ISP market.`;

async function getRealBusinessData() {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Subscriber counts
  const totalSubscribers = await db.subscriber.count();
  const activeSubscribers = await db.subscriber.count({ where: { status: "ACTIVE" } });
  const suspendedSubscribers = await db.subscriber.count({ where: { status: "SUSPENDED" } });
  const disconnectedSubscribers = await db.subscriber.count({ where: { status: "DISCONNECTED" } });

  // New subscribers this month
  const newThisMonth = await db.subscriber.count({
    where: { createdAt: { gte: firstOfMonth } },
  });

  // Revenue this month
  const paidInvoicesThisMonth = await db.invoice.findMany({
    where: {
      status: "PAID",
      paidAt: { gte: firstOfMonth },
    },
    select: { grandTotal: true, paidAmount: true },
  });
  const revenueThisMonth = paidInvoicesThisMonth.reduce((s, i) => s + i.grandTotal, 0);

  // Revenue last month
  const paidInvoicesLastMonth = await db.invoice.findMany({
    where: {
      status: "PAID",
      paidAt: { gte: firstOfLastMonth, lt: firstOfMonth },
    },
    select: { grandTotal: true },
  });
  const revenueLastMonth = paidInvoicesLastMonth.reduce((s, i) => s + i.grandTotal, 0);

  // ARPU
  const arpu = activeSubscribers > 0 ? Math.round(revenueThisMonth / activeSubscribers) : 0;

  // Collection efficiency
  const allInvoicesThisMonth = await db.invoice.findMany({
    where: { issueDate: { gte: firstOfMonth } },
    select: { grandTotal: true, paidAmount: true, status: true },
  });
  const totalBilled = allInvoicesThisMonth.reduce((s, i) => s + i.grandTotal, 0);
  const totalCollected = allInvoicesThisMonth.reduce((s, i) => s + i.paidAmount, 0);
  const collectionEfficiency = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;

  // Overdue invoices
  const overdueInvoices = await db.invoice.findMany({
    where: { status: { in: ["OVERDUE", "SENT"] }, dueDate: { lt: now } },
    select: { grandTotal: true, balanceAmount: true, dueDate: true, Subscriber: { select: { name: true, Area: { select: { name: true } } } } },
  });
  const overdueTotal = overdueInvoices.reduce((s, i) => s + i.balanceAmount, 0);

  // Top complaint types (last 30 days)
  const recentComplaints = await db.complaint.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    select: { type: true, Area: { select: { name: true } }, Subscriber: { select: { name: true } } },
  });
  const complaintTypeCounts: Record<string, number> = {};
  for (const c of recentComplaints) {
    complaintTypeCounts[c.type] = (complaintTypeCounts[c.type] || 0) + 1;
  }
  const topComplaintTypes = Object.entries(complaintTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => `${type}: ${count}`);

  // Complaint area breakdown
  const complaintAreaCounts: Record<string, number> = {};
  for (const c of recentComplaints) {
    const areaName = c.Area?.name || "Unknown";
    complaintAreaCounts[areaName] = (complaintAreaCounts[areaName] || 0) + 1;
  }
  const topComplaintAreas = Object.entries(complaintAreaCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([area, count]) => `${area}: ${count}`);

  // Plan distribution
  const planDistribution = await db.subscriber.groupBy({
    by: ["planId"],
    where: { status: "ACTIVE", planId: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 8,
  });
  const planNames = await db.plan.findMany({
    where: { id: { in: planDistribution.map((p) => p.planId!) } },
    select: { id: true, name: true, priceMonthly: true, downloadSpeed: true },
  });
  const planMap = new Map(planNames.map((p) => [p.id, p]));
  const planBreakdown = planDistribution.map((p) => {
    const plan = planMap.get(p.planId!);
    return plan ? `${plan.name} (${p._count.id} subs, ₹${plan.priceMonthly}/mo, ${plan.downloadSpeed} Mbps)` : `${p._count.id} subs on unknown plan`; // plan speeds stored in Mbps
  });

  // Payment modes this month
  const paymentsThisMonth = await db.payment.findMany({
    where: { createdAt: { gte: firstOfMonth } },
    select: { paymentMode: true, amount: true },
  });
  const paymentModeCounts: Record<string, { count: number; amount: number }> = {};
  for (const p of paymentsThisMonth) {
    if (!paymentModeCounts[p.paymentMode]) paymentModeCounts[p.paymentMode] = { count: 0, amount: 0 };
    paymentModeCounts[p.paymentMode].count++;
    paymentModeCounts[p.paymentMode].amount += p.amount;
  }
  const paymentModes = Object.entries(paymentModeCounts)
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([mode, data]) => `${mode}: ₹${Math.round(data.amount)} (${data.count} payments)`);

  // Churn indicators (disconnected last 30 days)
  const disconnectedThisMonth = await db.subscriber.count({
    where: { status: "DISCONNECTED", updatedAt: { gte: thirtyDaysAgo } },
  });
  const churnRate = totalSubscribers > 0 ? Math.round((disconnectedThisMonth / totalSubscribers) * 100 * 10) / 10 : 0;

  // Invoices by status
  const invoiceStatusCounts = await db.invoice.groupBy({
    by: ["status"],
    where: { issueDate: { gte: firstOfMonth } },
    _count: { id: true },
  });
  const invoiceStatusBreakdown = invoiceStatusCounts.map((i) => `${i.status}: ${i._count.id}`);

  return {
    totalSubscribers,
    activeSubscribers,
    suspendedSubscribers,
    disconnectedSubscribers,
    newThisMonth,
    revenueThisMonth: Math.round(revenueThisMonth),
    revenueLastMonth: Math.round(revenueLastMonth),
    revenueGrowthPercent: revenueLastMonth > 0 ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100) : 0,
    arpu,
    collectionEfficiency,
    overdueCount: overdueInvoices.length,
    overdueTotal: Math.round(overdueTotal),
    totalBilled: Math.round(totalBilled),
    recentComplaintCount: recentComplaints.length,
    topComplaintTypes,
    topComplaintAreas,
    planBreakdown,
    paymentModes,
    disconnectedThisMonth,
    churnRate,
    invoiceStatusBreakdown,
  };
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const { message } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Fetch real business data from database
    const data = await getRealBusinessData();

    // Build context from real data
    const dataContext = `## Current Cryptsk ISP Business Data (Real-time)

### Subscriber Overview
- Total Subscribers: ${data.totalSubscribers}
- Active: ${data.activeSubscribers}
- Suspended: ${data.suspendedSubscribers}
- Disconnected: ${data.disconnectedSubscribers}
- New this month: ${data.newThisMonth}
- Churn rate (last 30 days): ${data.churnRate}%

### Revenue
- Revenue this month: ₹${data.revenueThisMonth.toLocaleString("en-IN")}
- Revenue last month: ₹${data.revenueLastMonth.toLocaleString("en-IN")}
- Growth: ${data.revenueGrowthPercent > 0 ? "+" : ""}${data.revenueGrowthPercent}% MoM
- ARPU: ₹${data.arpu}
- Total billed this month: ₹${data.totalBilled.toLocaleString("en-IN")}
- Collection efficiency: ${data.collectionEfficiency}%

### Payment Collection
- Payment modes breakdown: ${data.paymentModes.join(", ") || "No payments this month"}

### Overdue / Receivables
- Overdue invoices: ${data.overdueCount}
- Total overdue amount: ₹${data.overdueTotal.toLocaleString("en-IN")}
- Invoice status this month: ${data.invoiceStatusBreakdown.join(", ")}

### Complaints (Last 30 days)
- Total complaints: ${data.recentComplaintCount}
- Top complaint types: ${data.topComplaintTypes.join(", ") || "No complaints"}
- Top complaint areas: ${data.topComplaintAreas.join(", ") || "No area data"}

### Plan Distribution (Active Subscribers)
${data.planBreakdown.join("\n") || "No active subscribers with plans"}

### Churn Indicators
- Disconnected this month: ${data.disconnectedThisMonth}
- Churn rate: ${data.churnRate}%`;

    // Call LLM with real data context
    const zai = await ZAI.create();
    const response = await zai.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Here is my current ISP business data:\n\n${dataContext}\n\nMy question: ${message}\n\nPlease analyze the data above and provide specific, actionable insights. Reference actual numbers from the data. Use INR for currency.` },
      ],
    });

    const aiResponse = response?.choices?.[0]?.message?.content || "I was unable to generate a response. Please try again.";

    return NextResponse.json({ response: aiResponse });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("AI Advisor error:", error);
    return NextResponse.json(
      { error: "Failed to get AI response. The AI service may be temporarily unavailable. Please try again." },
      { status: 500 }
    );
  }
}
