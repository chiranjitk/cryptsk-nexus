import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

// Severity escalation order
const SEVERITY_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function nextSeverity(current: string): string {
  const idx = SEVERITY_ORDER.indexOf(current.toUpperCase());
  if (idx < 0 || idx >= SEVERITY_ORDER.length - 1) return current.toUpperCase();
  return SEVERITY_ORDER[idx + 1];
}

// POST /api/alerts/auto-escalate — Process auto-escalation for unacknowledged alerts
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    // Find all rules that have auto-escalation enabled
    const autoEscalateRules = await db.alertRule.findMany({
      where: {
        enabled: true,
        autoEscalate: true,
      },
    });

    if (autoEscalateRules.length === 0) {
      return NextResponse.json({ success: true, escalated: 0, message: "No auto-escalation rules configured" });
    }

    const ruleIds = autoEscalateRules.map((r) => r.id);
    const now = new Date();

    // Find all active/acknowledged alerts from these rules that haven't been escalated to max
    const pendingAlerts = await db.networkAlert.findMany({
      where: {
        ruleId: { in: ruleIds },
        status: { in: ["ACTIVE", "ACKNOWLEDGED"] },
      },
      include: { AlertRule: true },
    });

    let escalatedCount = 0;

    for (const alert of pendingAlerts) {
      if (!alert.AlertRule) continue;

      const intervalMinutes = alert.AlertRule.escalationIntervalMinutes || 30;
      const maxSeverity = (alert.AlertRule.maxSeverity || "CRITICAL").toUpperCase();

      // Calculate time since alert was created
      const minutesSinceCreation = (now.getTime() - alert.createdAt.getTime()) / 60000;

      // Determine how many escalation steps should have occurred
      const expectedSteps = Math.floor(minutesSinceCreation / intervalMinutes);
      const currentStep = alert.escalationLevel || 0;

      if (expectedSteps <= currentStep) continue;

      // Check if we can escalate further
      const currentMaxIdx = SEVERITY_ORDER.indexOf(alert.severity.toUpperCase());
      const targetMaxIdx = SEVERITY_ORDER.indexOf(maxSeverity);

      // Calculate target severity based on steps
      const baseIdx = SEVERITY_ORDER.indexOf(alert.AlertRule.severity.toUpperCase());
      const targetIdx = Math.min(baseIdx + expectedSteps, targetMaxIdx, SEVERITY_ORDER.length - 1);

      if (targetIdx <= currentMaxIdx) continue;

      const newSeverity = SEVERITY_ORDER[targetIdx];
      const newLevel = expectedSteps;

      // Update the alert
      await db.networkAlert.update({
        where: { id: alert.id },
        data: {
          severity: newSeverity,
          escalationLevel: newLevel,
          updatedAt: now,
        },
      });

      // Log in audit
      const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
      await db.auditLog.create({
        data: {
          userId,
          userName: user?.name || "Auto-Escalation",
          action: "AUTO_ESCALATE_ALERT",
          entity: "NetworkAlert",
          entityId: alert.id,
          details: JSON.stringify({
            previousSeverity: alert.severity,
            newSeverity,
            escalationLevel: newLevel,
            ruleName: alert.AlertRule.name,
            minutesSinceCreation: Math.round(minutesSinceCreation),
            intervalMinutes,
          }),
          endpoint: "/api/alerts/auto-escalate",
          method: "POST",
        },
      });

      escalatedCount++;
    }

    return NextResponse.json({
      success: true,
      escalated: escalatedCount,
      message: escalatedCount > 0
        ? `Auto-escalated ${escalatedCount} alert(s)`
        : "No alerts required escalation",
    });
  } catch (error: unknown) {
    console.error("Auto-escalation error:", error);
    return NextResponse.json({ error: "Failed to process auto-escalation" }, { status: 500 });
  }
}
