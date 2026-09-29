import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ── CORS ──
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ── GET /api/compliance/regulatory ──────────────────────────────
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    // ── 1. Tax compliance (optimized with aggregate) ──
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const startOfNextMonth = new Date(currentYear, currentMonth + 1, 1);

    // Aggregate totals across ALL invoices (no unbounded findMany)
    const [totalAgg, currentMonthAgg, totalCount, invoicesWithTaxCount] = await Promise.all([
      db.invoice.aggregate({
        _sum: { cgstAmount: true, sgstAmount: true, igstAmount: true, totalAmount: true },
      }),
      db.invoice.aggregate({
        _sum: { cgstAmount: true, sgstAmount: true, igstAmount: true, totalAmount: true },
        where: { createdAt: { gte: startOfMonth, lt: startOfNextMonth } },
      }),
      db.invoice.count(),
      db.invoice.count({
        where: {
          OR: [
            { cgstAmount: { gt: 0 } },
            { sgstAmount: { gt: 0 } },
            { igstAmount: { gt: 0 } },
          ],
        },
      }),
    ]);

    const totalCgst = totalAgg._sum.cgstAmount || 0;
    const totalSgst = totalAgg._sum.sgstAmount || 0;
    const totalIgst = totalAgg._sum.igstAmount || 0;
    const totalTaxCollected = totalCgst + totalSgst + totalIgst;
    const totalRevenue = totalAgg._sum.totalAmount || 0;

    const currentMonthTax = (currentMonthAgg._sum.cgstAmount || 0) + (currentMonthAgg._sum.sgstAmount || 0) + (currentMonthAgg._sum.igstAmount || 0);
    const currentMonthRevenue = currentMonthAgg._sum.totalAmount || 0;

    const taxComplianceRate = totalCount > 0
      ? Math.round((invoicesWithTaxCount / totalCount) * 10000) / 100
      : 100;

    // ── 2. KYC verification ──
    const totalSubscribers = await db.subscriber.count();
    const kycVerified = await db.subscriber.count({
      where: { kycVerified: true },
    });
    const kycPending = totalSubscribers - kycVerified;
    const kycRate = totalSubscribers > 0
      ? Math.round((kycVerified / totalSubscribers) * 10000) / 100
      : 100;

    // KYC details for pending subscribers
    const kycPendingSubscribers = await db.subscriber.findMany({
      where: { kycVerified: false },
      select: { id: true, name: true, phone: true, createdAt: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // ── 3. ISP Settings / License completeness ──
    const ispSettings = await db.ispSettings.findUnique({
      where: { id: "default" },
    });

    const checklist: Array<{
      item: string;
      status: "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT";
      details: string;
      recommendation?: string;
    }> = [];

    // Company registration
    if (ispSettings?.companyName && ispSettings.companyName !== "My ISP") {
      checklist.push({
        item: "Company Registration",
        status: "COMPLIANT",
        details: `Company: ${ispSettings.companyName}`,
      });
    } else {
      checklist.push({
        item: "Company Registration",
        status: "PARTIAL",
        details: "Company name not configured or using default",
        recommendation: "Update ISP Profile with registered company name",
      });
    }

    // GST
    if (ispSettings?.gstin && ispSettings.gstin.length >= 15) {
      checklist.push({
        item: "GST Registration",
        status: "COMPLIANT",
        details: `GSTIN: ${ispSettings.gstin}`,
      });
    } else {
      checklist.push({
        item: "GST Registration",
        status: "NON_COMPLIANT",
        details: ispSettings?.gstin
          ? `GSTIN appears incomplete: ${ispSettings.gstin}`
          : "No GSTIN configured",
        recommendation: "Configure valid 15-digit GST Identification Number in ISP Profile",
      });
    }

    // PAN
    if (ispSettings?.panNumber && ispSettings.panNumber.length === 10) {
      checklist.push({
        item: "PAN Registration",
        status: "COMPLIANT",
        details: `PAN: ${ispSettings.panNumber}`,
      });
    } else {
      checklist.push({
        item: "PAN Registration",
        status: ispSettings?.panNumber ? "PARTIAL" : "NON_COMPLIANT",
        details: ispSettings?.panNumber
          ? `PAN appears invalid: ${ispSettings.panNumber}`
          : "No PAN configured",
        recommendation: "Configure valid 10-digit PAN in ISP Profile",
      });
    }

    // Address
    if (ispSettings?.address && ispSettings.city && ispSettings.state && ispSettings.pincode) {
      checklist.push({
        item: "Business Address",
        status: "COMPLIANT",
        details: `${ispSettings.address}, ${ispSettings.city}, ${ispSettings.state} - ${ispSettings.pincode}`,
      });
    } else {
      const missing = [];
      if (!ispSettings?.address) missing.push("address");
      if (!ispSettings?.city) missing.push("city");
      if (!ispSettings?.state) missing.push("state");
      if (!ispSettings?.pincode) missing.push("pincode");
      checklist.push({
        item: "Business Address",
        status: "PARTIAL",
        details: `Missing: ${missing.join(", ")}`,
        recommendation: "Complete business address in ISP Profile",
      });
    }

    // Contact
    if (ispSettings?.phone && ispSettings?.email) {
      checklist.push({
        item: "Contact Information",
        status: "COMPLIANT",
        details: `Phone: ${ispSettings.phone}, Email: ${ispSettings.email}`,
      });
    } else {
      checklist.push({
        item: "Contact Information",
        status: "PARTIAL",
        details: !ispSettings?.phone && !ispSettings?.email
          ? "No contact information configured"
          : !ispSettings?.phone
            ? "Phone number missing"
            : "Email address missing",
        recommendation: "Configure phone and email in ISP Profile",
      });
    }

    // Tax rates
    if (
      (ispSettings?.taxType === "INTRA_STATE" && ispSettings?.defaultCgstRate > 0 && ispSettings?.defaultSgstRate > 0) ||
      (ispSettings?.taxType === "INTER_STATE" && ispSettings?.defaultIgstRate > 0)
    ) {
      checklist.push({
        item: "Tax Configuration",
        status: "COMPLIANT",
        details: `Type: ${ispSettings.taxType}, CGST: ${ispSettings.defaultCgstRate}%, SGST: ${ispSettings.defaultSgstRate}%, IGST: ${ispSettings.defaultIgstRate}%`,
      });
    } else {
      checklist.push({
        item: "Tax Configuration",
        status: "PARTIAL",
        details: "Tax rates may not be properly configured",
        recommendation: "Verify GST tax rates in ISP Profile match current regulations",
      });
    }

    // ── 4. Data retention ──
    const earliestAuditLog = await db.auditLog.findFirst({
      orderBy: { timestamp: "asc" },
      select: { timestamp: true },
    });
    const latestAuditLog = await db.auditLog.findFirst({
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    });

    const totalAuditLogs = await db.auditLog.count();
    const retentionDays = ispSettings?.auditRetentionDays || 90;
    const auditAutoDelete = ispSettings?.auditAutoDelete || false;

    const auditCoverageDays = earliestAuditLog && latestAuditLog
      ? Math.round(
          (latestAuditLog.timestamp.getTime() - earliestAuditLog.timestamp.getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

    if (auditCoverageDays >= retentionDays * 0.9) {
      checklist.push({
        item: "Audit Log Retention",
        status: "COMPLIANT",
        details: `Coverage: ${auditCoverageDays} days, Logs: ${totalAuditLogs}, Retention: ${retentionDays} days`,
      });
    } else if (totalAuditLogs > 0) {
      checklist.push({
        item: "Audit Log Retention",
        status: "PARTIAL",
        details: `Coverage: ${auditCoverageDays} days (target: ${retentionDays} days), Logs: ${totalAuditLogs}`,
        recommendation: "Ensure audit logs are retained for the configured retention period",
      });
    } else {
      checklist.push({
        item: "Audit Log Retention",
        status: "NON_COMPLIANT",
        details: "No audit logs found in the system",
        recommendation: "Enable audit logging to maintain regulatory compliance",
      });
    }

    // KYC compliance in checklist
    if (kycRate >= 95) {
      checklist.push({
        item: "KYC Verification",
        status: "COMPLIANT",
        details: `${kycVerified}/${totalSubscribers} verified (${kycRate}%)`,
      });
    } else if (kycRate >= 70) {
      checklist.push({
        item: "KYC Verification",
        status: "PARTIAL",
        details: `${kycVerified}/${totalSubscribers} verified (${kycRate}%), ${kycPending} pending`,
        recommendation: "Verify remaining subscriber KYC documents to meet regulatory requirements",
      });
    } else {
      checklist.push({
        item: "KYC Verification",
        status: "NON_COMPLIANT",
        details: `${kycVerified}/${totalSubscribers} verified (${kycRate}%), ${kycPending} pending`,
        recommendation: "URGENT: Majority of subscribers lack KYC verification. Conduct verification drive.",
      });
    }

    // Tax compliance in checklist
    if (taxComplianceRate >= 95) {
      checklist.push({
        item: "Tax Invoice Compliance",
        status: "COMPLIANT",
        details: `${invoicesWithTaxCount}/${totalCount} invoices have proper tax (${taxComplianceRate}%)`,
      });
    } else if (taxComplianceRate >= 70) {
      checklist.push({
        item: "Tax Invoice Compliance",
        status: "PARTIAL",
        details: `${invoicesWithTaxCount}/${totalCount} invoices have proper tax (${taxComplianceRate}%)`,
        recommendation: "Review invoices without tax components for compliance",
      });
    } else {
      checklist.push({
        item: "Tax Invoice Compliance",
        status: "NON_COMPLIANT",
        details: `${invoicesWithTaxCount}/${totalCount} invoices have proper tax (${taxComplianceRate}%)`,
        recommendation: "URGENT: Many invoices missing tax. Configure default tax rates immediately.",
      });
    }

    // CIN Number
    if (ispSettings?.cinNumber) {
      checklist.push({
        item: "CIN (Corporate Identification Number)",
        status: "COMPLIANT",
        details: `CIN: ${ispSettings.cinNumber}`,
      });
    } else {
      checklist.push({
        item: "CIN (Corporate Identification Number)",
        status: ispSettings?.panNumber ? "PARTIAL" : "NON_COMPLIANT",
        details: "CIN not configured",
        recommendation: "Add Corporate Identification Number for complete business registration",
      });
    }

    // Auto-delete audit logs
    if (auditAutoDelete && retentionDays > 0) {
      checklist.push({
        item: "Audit Log Auto-Deletion",
        status: "COMPLIANT",
        details: `Auto-delete enabled with ${retentionDays}-day retention`,
      });
    } else {
      checklist.push({
        item: "Audit Log Auto-Deletion",
        status: "PARTIAL",
        details: "Auto-delete not enabled or retention period not set",
        recommendation: "Enable auto-delete with appropriate retention period for GDPR/data protection",
      });
    }

    // ── Summary ──
    const compliantCount = checklist.filter((c) => c.status === "COMPLIANT").length;
    const partialCount = checklist.filter((c) => c.status === "PARTIAL").length;
    const nonCompliantCount = checklist.filter((c) => c.status === "NON_COMPLIANT").length;
    const overallScore = checklist.length > 0
      ? Math.round(((compliantCount + partialCount * 0.5) / checklist.length) * 10000) / 100
      : 100;

    return NextResponse.json(
      {
        overallScore,
        checklist,
        tax: {
          totalCgst: Math.round(totalCgst * 100) / 100,
          totalSgst: Math.round(totalSgst * 100) / 100,
          totalIgst: Math.round(totalIgst * 100) / 100,
          totalTaxCollected: Math.round(totalTaxCollected * 100) / 100,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          currentMonthTax: Math.round(currentMonthTax * 100) / 100,
          currentMonthRevenue: Math.round(currentMonthRevenue * 100) / 100,
          invoicesWithTax: invoicesWithTaxCount,
          taxComplianceRate,
          currentMonth: now.toLocaleString("en-US", { month: "long", year: "numeric" }),
        },
        kyc: {
          totalSubscribers,
          kycVerified,
          kycPending,
          kycRate,
          pendingSubscribers: kycPendingSubscribers,
        },
        license: {
          companyName: ispSettings?.companyName || "",
          gstin: ispSettings?.gstin || "",
          panNumber: ispSettings?.panNumber || "",
          cinNumber: ispSettings?.cinNumber || "",
          address: ispSettings?.address || "",
          city: ispSettings?.city || "",
          state: ispSettings?.state || "",
          pincode: ispSettings?.pincode || "",
        },
        dataRetention: {
          earliestEntry: earliestAuditLog?.timestamp?.toISOString() || null,
          latestEntry: latestAuditLog?.timestamp?.toISOString() || null,
          totalLogs: totalAuditLogs,
          coverageDays: auditCoverageDays,
          retentionDays,
          autoDeleteEnabled: auditAutoDelete,
        },
        summary: {
          total: checklist.length,
          compliant: compliantCount,
          partial: partialCount,
          nonCompliant: nonCompliantCount,
        },
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode, headers: corsHeaders }
      );
    }
    console.error("Regulatory compliance API failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch regulatory compliance data" },
      { status: 500, headers: corsHeaders }
    );
  }
}
