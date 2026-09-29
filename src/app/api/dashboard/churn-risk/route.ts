import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── Types ──────────────────────────────────────────────────

interface RawSubscriberRow {
  id: string;
  name: string;
  code: string;
  planName: string | null;
}

interface ChurnRiskSubscriber {
  id: string;
  name: string;
  code: string;
  planName: string;
  riskLevel: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
}

interface ChurnRiskResponse {
  subscribers: ChurnRiskSubscriber[];
  summary: {
    total: number;
    high: number;
    medium: number;
    low: number;
  };
}

// ─── GET /api/dashboard/churn-risk ──────────────────────────

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);



    // Fetch all at-risk categories in parallel
    const [
      overdueSubs,
      complaintSubs,
      suspendedSubs,
      overdueMildSubs,
    ] = await Promise.all([
      // (a) Subscribers with OVERDUE invoices for 30+ days → HIGH
      db.$queryRaw<RawSubscriberRow[]>`
        SELECT DISTINCT s."id", s."name", s."code", p."name" AS "planName"
        FROM "Subscriber" s
        LEFT JOIN "Plan" p ON s."planId" = p."id"
        INNER JOIN "Invoice" i ON i."subscriberId" = s."id"
        WHERE i."status" = 'OVERDUE'
          AND i."dueDate" <= ${thirtyDaysAgo}
          AND s."status" != 'DISCONNECTED'
      `,

      // (b) Subscribers with 3+ open complaints → MEDIUM
      db.$queryRaw<RawSubscriberRow[]>`
        SELECT s."id", s."name", s."code", p."name" AS "planName"
        FROM "Subscriber" s
        LEFT JOIN "Plan" p ON s."planId" = p."id"
        WHERE s."id" IN (
          SELECT "subscriberId"
          FROM "Complaint"
          WHERE "status" IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'REOPENED')
            AND "subscriberId" IS NOT NULL
          GROUP BY "subscriberId"
          HAVING COUNT(*) >= 3
        )
        AND s."status" != 'DISCONNECTED'
      `,

      // (c) Recently SUSPENDED subscribers (last 30 days) → HIGH
      db.$queryRaw<RawSubscriberRow[]>`
        SELECT s."id", s."name", s."code", p."name" AS "planName"
        FROM "Subscriber" s
        LEFT JOIN "Plan" p ON s."planId" = p."id"
        WHERE s."status" = 'SUSPENDED'
          AND s."updatedAt" >= ${thirtyDaysAgo}
      `,

      // (d) Subscribers with OVERDUE invoices less than 30 days → LOW
      db.$queryRaw<RawSubscriberRow[]>`
        SELECT DISTINCT s."id", s."name", s."code", p."name" AS "planName"
        FROM "Subscriber" s
        LEFT JOIN "Plan" p ON s."planId" = p."id"
        INNER JOIN "Invoice" i ON i."subscriberId" = s."id"
        WHERE i."status" = 'OVERDUE'
          AND i."dueDate" > ${thirtyDaysAgo}
          AND s."status" != 'DISCONNECTED'
      `,
    ]);

    // Merge into a Map keyed by subscriber id, collecting reasons
    const riskMap = new Map<string, ChurnRiskSubscriber>();

    // (a) HIGH — overdue 30+ days
    for (const sub of overdueSubs) {
      const existing = riskMap.get(sub.id);
      if (existing) {
        if (!existing.reasons.includes("Overdue 30+ days")) {
          existing.reasons.push("Overdue 30+ days");
        }
        existing.riskLevel = "HIGH";
      } else {
        riskMap.set(sub.id, {
          id: sub.id,
          name: sub.name,
          code: sub.code,
          planName: sub.planName ?? "No Plan",
          riskLevel: "HIGH",
          reasons: ["Overdue 30+ days"],
        });
      }
    }

    // (c) HIGH — recently suspended
    for (const sub of suspendedSubs) {
      const existing = riskMap.get(sub.id);
      if (existing) {
        if (!existing.reasons.includes("Recently suspended")) {
          existing.reasons.push("Recently suspended");
        }
        existing.riskLevel = "HIGH";
      } else {
        riskMap.set(sub.id, {
          id: sub.id,
          name: sub.name,
          code: sub.code,
          planName: sub.planName ?? "No Plan",
          riskLevel: "HIGH",
          reasons: ["Recently suspended"],
        });
      }
    }

    // (b) MEDIUM — 3+ open complaints (only if not already HIGH)
    for (const sub of complaintSubs) {
      const existing = riskMap.get(sub.id);
      if (existing) {
        if (!existing.reasons.includes("3+ open complaints")) {
          existing.reasons.push("3+ open complaints");
        }
        // Don't downgrade from HIGH
      } else {
        riskMap.set(sub.id, {
          id: sub.id,
          name: sub.name,
          code: sub.code,
          planName: sub.planName ?? "No Plan",
          riskLevel: "MEDIUM",
          reasons: ["3+ open complaints"],
        });
      }
    }

    // (d) LOW — overdue less than 30 days (only if not already tracked)
    for (const sub of overdueMildSubs) {
      const existing = riskMap.get(sub.id);
      if (!existing) {
        riskMap.set(sub.id, {
          id: sub.id,
          name: sub.name,
          code: sub.code,
          planName: sub.planName ?? "No Plan",
          riskLevel: "LOW",
          reasons: ["Overdue payment"],
        });
      }
    }

    // Build final sorted list: HIGH → MEDIUM → LOW
    const priorityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const subscribers = Array.from(riskMap.values()).sort((a, b) => {
      const levelDiff = priorityOrder[a.riskLevel] - priorityOrder[b.riskLevel];
      if (levelDiff !== 0) return levelDiff;
      return b.reasons.length - a.reasons.length;
    });

    // Summary counts
    const summary = {
      total: subscribers.length,
      high: subscribers.filter((s) => s.riskLevel === "HIGH").length,
      medium: subscribers.filter((s) => s.riskLevel === "MEDIUM").length,
      low: subscribers.filter((s) => s.riskLevel === "LOW").length,
    };

    const response: ChurnRiskResponse = { subscribers, summary };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Churn risk API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch churn risk data" },
      { status: 500 }
    );
  }
}
