import { db } from "@/lib/db";
import { auditConfigChange } from "@/lib/audit";

// ============================================================
// CRYPTSK Nexus — AI Service
// Per: docs/architecture/10_AI_AGENT_MASTER_BUILD_SPECIFICATION.md
//      ADR-030: AI is advisory-only, never packet-path
//
// Uses z-ai-web-dev-sdk (backend-only!)
// All AI outputs are recommendations for human review.
// ============================================================

type ChatMessage = { role: "assistant" | "user"; content: string };

// ─── LLM Client (singleton) ──────────────────────────────────
let _zaiInstance: any = null;

async function getLLM() {
  if (!_zaiInstance) {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    _zaiInstance = await ZAI.create();
  }
  return _zaiInstance;
}

// ─── Generic LLM Chat ────────────────────────────────────────

export async function llmChat(messages: ChatMessage[]): Promise<string> {
  const zai = await getLLM();
  const completion = await zai.chat.completions.create({
    messages,
    thinking: { type: "disabled" },
  });
  return completion.choices[0]?.message?.content || "";
}

// ─── AI Advisor (business/operational assistant) ────────────

export async function aiAdvisor(question: string, userId: string): Promise<string> {
  // Gather platform context
  const [
    userCount, customerCount, subscriberCount, activeSessions,
    invoiceCount, totalRevenue, outstandingAmount, productCount,
  ] = await Promise.all([
    db.user.count(),
    db.customer.count(),
    db.subscriber.count(),
    db.radAcct.count({ where: { acctstoptime: null } }),
    db.invoice.count(),
    db.invoice.aggregate({ _sum: { total: true } }),
    db.invoice.aggregate({ _sum: { balanceDue: true } }),
    db.product.count(),
  ]);

  const context = `
CRYPTSK Nexus Platform — Real-time Data:
- Platform users: ${userCount}
- Customers: ${customerCount}
- Subscribers (RADIUS users): ${subscriberCount}
- Active RADIUS sessions: ${activeSessions}
- Invoices issued: ${invoiceCount}
- Total revenue (all invoices): ₹${totalRevenue._sum.total?.toFixed(2) || "0"}
- Outstanding balance: ₹${outstandingAmount._sum.balanceDue?.toFixed(2) || "0"}
- Products configured: ${productCount}
- Database: PostgreSQL 18.6 with 51 tables
- FreeRADIUS 3.2.10 running (DHCPv4 via Kea 3.0.3, DNS via BIND 9.18.33)
- VPP adapter running (software mode, config generation)
`;

  const systemPrompt = `You are CRYPTSK Nexus AI Advisor, an intelligent assistant for ISP/telecom operators. You have access to real-time platform data. Provide actionable insights, recommendations, and analysis. Be concise but thorough. Use Indian Rupees (₹) for monetary values.

${context}`;

  const response = await llmChat([
    { role: "assistant", content: systemPrompt },
    { role: "user", content: question },
  ]);

  // Save as insight
  await db.aiInsight.create({
    data: {
      type: "advisor",
      title: question.slice(0, 100),
      content: response,
      dataSource: "platform_stats",
      dataSnapshot: JSON.stringify({ userCount, customerCount, subscriberCount, activeSessions, invoiceCount }),
      createdBy: userId,
    },
  });

  return response;
}

// ─── AI Network Diagnosis ────────────────────────────────────

export async function aiNetworkDiagnosis(userId: string): Promise<string> {
  // Gather network data
  const [authEvents, recentAuths, activeSessions, nasDevices, authFailures] = await Promise.all([
    db.radPostAuth.count(),
    db.radPostAuth.findMany({ orderBy: { authdate: "desc" }, take: 50 }),
    db.radAcct.count({ where: { acctstoptime: null } }),
    db.nas.count({ where: { isActive: true } }),
    db.radPostAuth.count({ where: { reply: { contains: "Reject" } } }),
  ]);

  const rejectRate = authEvents > 0 ? ((authFailures / authEvents) * 100).toFixed(1) : "0";

  const networkData = `
Network Diagnosis Data:
- Total auth events: ${authEvents}
- Auth failures (Reject): ${authFailures} (${rejectRate}% reject rate)
- Active sessions: ${activeSessions}
- NAS devices: ${nasDevices}

Recent 50 auth events (sample):
${JSON.stringify(recentAuths.slice(0, 20).map(e => ({
  username: e.username,
  reply: e.reply,
  nasip: e.nasipaddress,
  mac: e.callingstationid,
  time: e.authdate,
})), null, 2)}
`;

  const systemPrompt = `You are CRYPTSK Nexus AI Network Diagnosis engine. Analyze RADIUS authentication and accounting data to identify issues, patterns, and anomalies. Look for:
1. Authentication failure patterns (brute force, misconfigured NAS, wrong passwords)
2. Session anomalies (very long sessions, zero data transfer)
3. NAS device issues (high failure rate from specific NAS)
4. Bandwidth usage patterns
5. Recommendations for troubleshooting

Provide specific, actionable recommendations. This is advisory only — no automatic actions will be taken.

${networkData}`;

  const response = await llmChat([
    { role: "assistant", content: systemPrompt },
    { role: "user", content: "Diagnose the network and identify any issues, patterns, or anomalies. Provide recommendations." },
  ]);

  await db.aiInsight.create({
    data: {
      type: "diagnosis",
      title: "Network Diagnosis Report",
      content: response,
      confidence: 0.8,
      dataSource: "radpostauth,radacct,nas",
      dataSnapshot: JSON.stringify({ authEvents, authFailures, rejectRate, activeSessions, nasDevices }),
      createdBy: userId,
    },
  });

  return response;
}

// ─── Churn Prediction ────────────────────────────────────────

export async function aiChurnPrediction(userId: string): Promise<string> {
  // Gather subscriber + billing data for churn analysis
  const subscribers = await db.subscriber.findMany({
    take: 100,
    orderBy: { createdAt: "desc" },
    select: {
      id: true, radiusUsername: true, status: true, activatedAt: true,
      lastLoginAt: true, planId: true,
      plan: { select: { name: true, basePrice: true } } },
  });

  const customerCount = await db.customer.count();
  const activeSubs = subscribers.filter(s => s.status === "active").length;
  const suspendedSubs = subscribers.filter(s => s.status === "suspended").length;
  const terminatedSubs = subscribers.filter(s => s.status === "terminated").length;

  // Check for subscribers with no recent activity
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const inactiveSubs = subscribers.filter(s =>
    s.status === "active" && (!s.lastLoginAt || new Date(s.lastLoginAt) < thirtyDaysAgo)
  ).length;

  const churnData = `
Churn Analysis Data:
- Total customers: ${customerCount}
- Subscribers analyzed: ${subscribers.length}
- Active: ${activeSubs}
- Suspended: ${suspendedSubs}
- Terminated: ${terminatedSubs}
- Inactive >30 days (no login): ${inactiveSubs}

Sample subscriber data:
${JSON.stringify(subscribers.slice(0, 20).map(s => ({
  username: s.radiusUsername,
  status: s.status,
  plan: s.plan?.name || "none",
  price: s.plan?.basePrice || 0,
  lastLogin: s.lastLoginAt || "never",
  activated: s.activatedAt || "never",
})), null, 2)}
`;

  const systemPrompt = `You are CRYPTSK Nexus AI Churn Prediction engine. Analyze subscriber data to predict churn risk. Consider:
1. Inactive subscribers (no login in 30+ days)
2. Suspended accounts (payment issues?)
3. Plan pricing vs usage
4. Account age (new customers churn more)
5. Missing plan assignments

For each risk category, provide specific recommendations for retention.
This is advisory only — no automatic account changes will be made.

${churnData}`;

  const response = await llmChat([
    { role: "assistant", content: systemPrompt },
    { role: "user", content: "Analyze subscriber data and predict churn risk. Identify high-risk subscribers and recommend retention actions." },
  ]);

  await db.aiInsight.create({
    data: {
      type: "churn",
      title: "Churn Prediction Report",
      content: response,
      confidence: 0.7,
      dataSource: "subscribers,customers",
      dataSnapshot: JSON.stringify({ customerCount, analyzed: subscribers.length, activeSubs, suspendedSubs, inactiveSubs }),
      createdBy: userId,
    },
  });

  return response;
}

// ─── Revenue Forecast ────────────────────────────────────────

export async function aiRevenueForecast(userId: string): Promise<string> {
  // Gather billing data
  const [invoices, payments, totalRevenue, totalCollected, totalOutstanding] = await Promise.all([
    db.invoice.findMany({ take: 50, orderBy: { issueDate: "desc" }, select: { invoiceNumber: true, total: true, paidAmount: true, balanceDue: true, status: true, issueDate: true, dueDate: true } }),
    db.payment.findMany({ take: 30, orderBy: { receivedAt: "desc" }, select: { paymentNumber: true, amount: true, method: true, status: true, receivedAt: true } }),
    db.invoice.aggregate({ _sum: { total: true } }),
    db.invoice.aggregate({ _sum: { paidAmount: true } }),
    db.invoice.aggregate({ _sum: { balanceDue: true } }),
  ]);

  const collectionRate = totalRevenue._sum.total?.valueOf() > 0
    ? ((totalCollected._sum.paidAmount?.valueOf() || 0) / totalRevenue._sum.total!.valueOf() * 100).toFixed(1)
    : "0";

  const forecastData = `
Revenue Forecast Data:
- Total invoiced: ₹${totalRevenue._sum.total?.toFixed(2) || "0"}
- Total collected: ₹${totalCollected._sum.paidAmount?.toFixed(2) || "0"}
- Outstanding: ₹${totalOutstanding._sum.balanceDue?.toFixed(2) || "0"}
- Collection rate: ${collectionRate}%
- Total invoices: ${invoices.length}
- Total payments: ${payments.length}

Recent invoices (sample):
${JSON.stringify(invoices.slice(0, 10).map(i => ({
  number: i.invoiceNumber,
  total: i.total,
  paid: i.paidAmount,
  balance: i.balanceDue,
  status: i.status,
  issued: i.issueDate,
})), null, 2)}

Recent payments (sample):
${JSON.stringify(payments.slice(0, 10).map(p => ({
  number: p.paymentNumber,
  amount: p.amount,
  method: p.method,
  status: p.status,
  date: p.receivedAt,
})), null, 2)}
`;

  const systemPrompt = `You are CRYPTSK Nexus AI Revenue Forecasting engine. Analyze billing data to project revenue trends. Consider:
1. Collection rate and outstanding balance
2. Payment method distribution
3. Invoice aging (overdue analysis)
4. Monthly revenue projection based on current trends
5. Recommendations for improving collection

Provide specific revenue projections (next 30/60/90 days) and actionable recommendations.
This is advisory only.

${forecastData}`;

  const response = await llmChat([
    { role: "assistant", content: systemPrompt },
    { role: "user", content: "Forecast revenue for the next 30/60/90 days and provide recommendations for improving collection." },
  ]);

  await db.aiInsight.create({
    data: {
      type: "forecast",
      title: "Revenue Forecast Report",
      content: response,
      confidence: 0.75,
      dataSource: "invoices,payments",
      dataSnapshot: JSON.stringify({
        totalInvoiced: totalRevenue._sum.total,
        totalCollected: totalCollected._sum.paidAmount,
        totalOutstanding: totalOutstanding._sum.balanceDue,
        collectionRate,
        invoiceCount: invoices.length,
        paymentCount: payments.length,
      }),
      createdBy: userId,
    },
  });

  return response;
}

// ─── Get saved insights ────────────────────────────────────

export async function getInsights(type?: string) {
  const where: Record<string, unknown> = {};
  if (type) where.type = type;

  return db.aiInsight.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
