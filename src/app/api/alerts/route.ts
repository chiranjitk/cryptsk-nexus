import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// Helper: map Prisma AlertSeverity to frontend severity string
function mapSeverity(severity: string): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase();
}

// Helper: map Prisma AlertStatus to frontend status string
function mapAlertStatus(status: string): string {
  switch (status) {
    case "ACTIVE": return "Active";
    case "ACKNOWLEDGED": return "Acknowledged";
    case "RESOLVED": return "Resolved";
    case "SUPPRESSED": return "Suppressed";
    default: return status;
  }
}

// Helper: map frontend severity string to Prisma AlertSeverity
function toSeverity(severity: string): string {
  return severity.toUpperCase();
}

// Severity escalation order
const SEVERITY_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function nextSeverity(current: string): string {
  const idx = SEVERITY_ORDER.indexOf(current.toUpperCase());
  if (idx < 0 || idx >= SEVERITY_ORDER.length - 1) return current.toUpperCase();
  return SEVERITY_ORDER[idx + 1];
}

// ─── GET: Fetch alerts, rules, suppressions, users ───────────────
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const severity = searchParams.get("severity") || "";
    const status = searchParams.get("status") || "";

    const alertsWhere: Record<string, unknown> = {};
    if (search) {
      alertsWhere.OR = [
        { title: { contains: search } },
        { message: { contains: search } },
        { source: { contains: search } },
      ];
    }
    if (severity && severity !== "ALL") {
      alertsWhere.severity = toSeverity(severity);
    }
    if (status && status !== "ALL") {
      alertsWhere.status = status.toUpperCase();
    }

    // Fetch rules with optional search
    const rulesSearch = searchParams.get("ruleSearch") || "";
    const rulesWhere: Record<string, unknown> = {};
    if (rulesSearch) {
      rulesWhere.OR = [
        { name: { contains: rulesSearch } },
        { condition: { contains: rulesSearch } },
        { severity: { contains: rulesSearch.toUpperCase() } },
        { notifyChannels: { contains: rulesSearch } },
      ];
    }

    const rules = await db.alertRule.findMany({
      where: Object.keys(rulesWhere).length > 0 ? rulesWhere : undefined,
      orderBy: { createdAt: "desc" },
    });

    // Fetch active suppressions
    const now = new Date();
    const suppressions = await db.alertSuppression.findMany({
      where: {
        AND: [
          { startsAt: { lte: now } },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
    });
    const suppressedRuleIds = new Set(suppressions.map((s) => s.alertRuleId).filter(Boolean));

    // Filter alerts: hide alerts from suppressed rules (unless they're already resolved)
    const finalAlertsWhere = { ...alertsWhere };
    if (!status || status === "ALL" || status.toUpperCase() === "ACTIVE" || status.toUpperCase() === "ACKNOWLEDGED") {
      const activeStatuses = ["ACTIVE", "ACKNOWLEDGED"];
      if (status && status !== "ALL") {
        activeStatuses.length = 0;
        activeStatuses.push(status.toUpperCase());
      }
      // Exclude alerts whose rules are suppressed (feature 2: suppressed alerts hidden from active list)
      const nonSuppressedRuleIds = rules.filter(r => !suppressedRuleIds.has(r.id)).map(r => r.id);
      finalAlertsWhere.status = status && status !== "ALL" ? status.toUpperCase() : { in: activeStatuses };
      if (nonSuppressedRuleIds.length < rules.length && nonSuppressedRuleIds.length > 0) {
        // Only filter when there are suppressed rules
        // Merge existing search OR conditions with suppression filter using AND
        const existingOr = alertsWhere.OR ? [...(alertsWhere.OR as Record<string, unknown>[])] : [];
        finalAlertsWhere.AND = [
          ...((finalAlertsWhere.AND as Record<string, unknown>[]) || []),
          {
            OR: [
              ...existingOr,
              { ruleId: { in: nonSuppressedRuleIds } },
              { ruleId: null }, // Keep alerts without rules
            ],
          },
        ];
        delete finalAlertsWhere.OR; // Remove flat OR since it's now nested inside AND
      }
    }

    const alerts = await db.networkAlert.findMany({
      where: Object.keys(finalAlertsWhere).length > 0 ? finalAlertsWhere : undefined,
      include: { rule: true, assignedTo: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });

    // Fetch users for assignment dropdown
    const users = await db.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });

    // Fetch maintenance windows
    const maintenanceWindows = await db.maintenanceWindow.findMany({
      where: {
        status: { in: ["scheduled", "IN PROGRESS"] },
        endTime: { gte: now },
      },
      orderBy: { scheduledAt: "asc" },
    });

    // Deduplication marking (feature 7): check for same device+type within 5 min
    // Mark alerts that are duplicates of earlier alerts
    const alertsByDeviceType = new Map<string, (typeof alerts)[number]>();
    const markedDuplicates = new Set<string>();
    const sortedAlerts = [...alerts].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    for (const alert of sortedAlerts) {
      const key = `${alert.deviceId || ""}|${alert.ruleId || ""}|${alert.severity}`;
      const existing = alertsByDeviceType.get(key);
      if (existing) {
        const timeDiff = (new Date(alert.createdAt).getTime() - new Date(existing.createdAt).getTime()) / 60000;
        if (timeDiff <= 5) {
          markedDuplicates.add(alert.id);
        }
      } else {
        alertsByDeviceType.set(key, alert);
      }
    }

    // Transform alerts
    const transformedAlerts = alerts.map((a) => ({
      id: a.id,
      severity: mapSeverity(a.severity),
      type: a.rule?.name || a.title || "Custom",
      title: a.title || "",
      message: a.message,
      device: a.deviceId || a.source || "",
      area: "",
      triggeredAt: a.createdAt.toISOString(),
      acknowledgedAt: a.acknowledgedAt?.toISOString() || null,
      resolvedAt: a.resolvedAt?.toISOString() || null,
      resolution: a.resolution || "",
      status: mapAlertStatus(a.status),
      assignedTo: a.assignedTo?.name || a.acknowledgedBy || "",
      assignedToId: a.assignedToId || null,
      assignedToEmail: a.assignedTo?.email || "",
      ruleId: a.ruleId || "",
      duplicateCount: a.duplicateCount || 1,
      isDuplicate: markedDuplicates.has(a.id),
      escalationLevel: a.escalationLevel || 0,
      isSuppressed: a.ruleId ? suppressedRuleIds.has(a.ruleId) : false,
      escalationEnabled: a.rule?.escalationEnabled || false,
      escalationLevels: a.rule?.escalationLevels ? JSON.parse(a.rule.escalationLevels) : [],
    }));

    // Transform rules
    const transformedRules = rules.map((r) => ({
      id: r.id,
      name: r.name,
      type: "",
      condition: r.condition,
      threshold: r.threshold > 0 ? `${r.threshold}` : "",
      severity: mapSeverity(r.severity),
      notifyVia: JSON.parse(r.notifyChannels || "[]") as string[],
      enabled: r.enabled,
      cooldownMinutes: r.cooldownMinutes,
      escalationEnabled: r.escalationEnabled,
      escalationLevels: JSON.parse(r.escalationLevels || "[]"),
      autoEscalate: r.autoEscalate,
      escalationIntervalMinutes: r.escalationIntervalMinutes,
      maxSeverity: r.maxSeverity,
      deduplicationWindowMinutes: r.deduplicationWindowMinutes,
      isSuppressed: suppressedRuleIds.has(r.id),
      activeSuppression: suppressions.find((s) => s.alertRuleId === r.id) || null,
    }));

    // Stats
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const activeCount = alerts.filter((a) => a.status === "ACTIVE").length;
    const todayCount = alerts.filter((a) => a.createdAt >= todayStart).length;
    const ackCount = alerts.filter((a) => a.status === "ACKNOWLEDGED").length;
    const resolvedCount = alerts.filter((a) => a.status === "RESOLVED").length;

    return NextResponse.json({
      alerts: transformedAlerts,
      rules: transformedRules,
      users,
      suppressions: suppressions.map((s) => ({
        id: s.id,
        alertRuleId: s.alertRuleId,
        reason: s.reason,
        suppressedBy: s.suppressedBy,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt?.toISOString() || null,
      })),
      maintenanceWindows: maintenanceWindows.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        scheduledAt: m.scheduledAt.toISOString(),
        endTime: m.endTime.toISOString(),
        affectedAreaIds: JSON.parse(m.affectedAreaIds || "[]"),
        status: m.status,
      })),
      stats: { active: activeCount, today: todayCount, acknowledged: ackCount, resolved: resolvedCount },
    });
  } catch (error) {
    console.error("Alerts GET error:", error);
    return NextResponse.json({ error: "Failed to fetch alerts" }, { status: 500 });
  }
}

// ─── POST: All alert/rule actions ────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    const userId = await requireAuth(request);

    switch (action) {
      case "create-rule": {
        const { name, condition, threshold, severity, notifyChannels, cooldownMinutes, enabled, escalationEnabled, escalationLevels, autoEscalate, escalationIntervalMinutes, maxSeverity, deduplicationWindowMinutes } = body;
        if (!name) {
          return NextResponse.json({ error: "Rule name is required" }, { status: 400 });
        }
        const rule = await db.alertRule.create({
          data: {
            name,
            condition: condition || "",
            threshold: threshold ? parseFloat(String(threshold)) : 0,
            severity: (severity || "MEDIUM").toUpperCase(),
            notifyChannels: notifyChannels ? JSON.stringify(notifyChannels) : "[]",
            cooldownMinutes: cooldownMinutes || 5,
            enabled: enabled ?? true,
            escalationEnabled: escalationEnabled ?? false,
            escalationLevels: escalationLevels ? JSON.stringify(escalationLevels) : "[]",
            autoEscalate: autoEscalate ?? false,
            escalationIntervalMinutes: escalationIntervalMinutes ?? 30,
            maxSeverity: maxSeverity ? String(maxSeverity).toUpperCase() : "CRITICAL",
            deduplicationWindowMinutes: deduplicationWindowMinutes ?? 10,
          },
        });
        return NextResponse.json({ success: true, data: rule });
      }

      case "update-rule": {
        const { id, name, condition, threshold, severity, notifyChannels, cooldownMinutes, enabled, escalationEnabled, escalationLevels, autoEscalate, escalationIntervalMinutes, maxSeverity, deduplicationWindowMinutes } = body;
        if (!id) {
          return NextResponse.json({ error: "Rule ID is required" }, { status: 400 });
        }
        const current = await db.alertRule.findUnique({ where: { id } });
        if (!current) {
          return NextResponse.json({ error: "Rule not found" }, { status: 404 });
        }
        const updated = await db.alertRule.update({
          where: { id },
          data: {
            name: name !== undefined ? name : current.name,
            condition: condition !== undefined ? condition : current.condition,
            threshold: threshold !== undefined ? parseFloat(String(threshold)) : current.threshold,
            severity: severity !== undefined ? String(severity).toUpperCase() : current.severity,
            notifyChannels: notifyChannels !== undefined ? JSON.stringify(notifyChannels) : current.notifyChannels,
            cooldownMinutes: cooldownMinutes !== undefined ? cooldownMinutes : current.cooldownMinutes,
            enabled: enabled !== undefined ? enabled : current.enabled,
            escalationEnabled: escalationEnabled !== undefined ? escalationEnabled : current.escalationEnabled,
            escalationLevels: escalationLevels !== undefined ? JSON.stringify(escalationLevels) : current.escalationLevels,
            autoEscalate: autoEscalate !== undefined ? autoEscalate : current.autoEscalate,
            escalationIntervalMinutes: escalationIntervalMinutes !== undefined ? escalationIntervalMinutes : current.escalationIntervalMinutes,
            maxSeverity: maxSeverity !== undefined ? String(maxSeverity).toUpperCase() : current.maxSeverity,
            deduplicationWindowMinutes: deduplicationWindowMinutes !== undefined ? deduplicationWindowMinutes : current.deduplicationWindowMinutes,
          },
        });
        return NextResponse.json({ success: true, data: updated });
      }

      case "acknowledge": {
        const { id, acknowledgedBy } = body;
        if (!id) {
          return NextResponse.json({ error: "Alert ID is required" }, { status: 400 });
        }
        const alert = await db.networkAlert.update({
          where: { id },
          data: {
            status: "ACKNOWLEDGED",
            acknowledgedAt: new Date(),
            acknowledgedBy: acknowledgedBy || userId,
          },
        });
        return NextResponse.json({ success: true, data: alert });
      }

      case "bulk-acknowledge": {
        const { ids } = body as { ids: string[] };
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
          return NextResponse.json({ error: "Alert IDs are required" }, { status: 400 });
        }
        const result = await db.networkAlert.updateMany({
          where: { id: { in: ids }, status: "ACTIVE" },
          data: {
            status: "ACKNOWLEDGED",
            acknowledgedAt: new Date(),
            acknowledgedBy: "Bulk Acknowledge",
          },
        });
        return NextResponse.json({ success: true, count: result.count });
      }

      case "delete-rule": {
        const { id } = body;
        if (!id) {
          return NextResponse.json({ error: "Rule ID is required" }, { status: 400 });
        }
        await db.alertRule.delete({ where: { id } });
        return NextResponse.json({ success: true, message: "Rule deleted" });
      }

      case "toggle-rule": {
        const { id } = body;
        if (!id) {
          return NextResponse.json({ error: "Rule ID is required" }, { status: 400 });
        }
        const current = await db.alertRule.findUnique({ where: { id } });
        if (!current) {
          return NextResponse.json({ error: "Rule not found" }, { status: 404 });
        }
        const updated = await db.alertRule.update({
          where: { id },
          data: { enabled: !current.enabled },
        });
        return NextResponse.json({ success: true, data: updated });
      }

      case "escalate-alert": {
        const { id } = body;
        if (!id) {
          return NextResponse.json({ error: "Alert ID is required" }, { status: 400 });
        }
        const current = await db.networkAlert.findUnique({ where: { id }, include: { rule: true } });
        if (!current) {
          return NextResponse.json({ error: "Alert not found" }, { status: 404 });
        }

        // Determine next escalation level
        const maxLevel = current.rule?.escalationEnabled
          ? (() => { try { return JSON.parse(current.rule.escalationLevels || "[]").length; } catch { return 0; } })()
          : 3;
        const nextLevel = Math.min((current.escalationLevel || 0) + 1, maxLevel);

        // Increment severity (feature 1: escalate to next severity level)
        const newSeverity = nextSeverity(current.severity);

        // Determine max severity cap from rule
        let cappedSeverity = newSeverity;
        if (current.rule?.autoEscalate && current.rule.maxSeverity) {
          const maxIdx = SEVERITY_ORDER.indexOf(current.rule.maxSeverity.toUpperCase());
          const newIdx = SEVERITY_ORDER.indexOf(newSeverity);
          if (maxIdx >= 0 && newIdx > maxIdx) {
            cappedSeverity = current.rule.maxSeverity.toUpperCase();
          }
        }

        const alert = await db.networkAlert.update({
          where: { id },
          data: { escalationLevel: nextLevel, severity: cappedSeverity },
        });

        // Log escalation in audit (feature 1: log escalation in audit)
        const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
        await db.auditLog.create({
          data: {
            userId,
            userName: user?.name || "Unknown",
            action: "ESCALATE_ALERT",
            entity: "NetworkAlert",
            entityId: id,
            details: JSON.stringify({
              previousSeverity: current.severity,
              newSeverity: cappedSeverity,
              escalationLevel: nextLevel,
              alertTitle: current.title,
            }),
            endpoint: "/api/alerts",
            method: "POST",
          },
        });

        return NextResponse.json({ success: true, data: alert, newSeverity: cappedSeverity });
      }

      case "suppress-alert": {
        const { id, reason, endsAt } = body;
        if (!id) {
          return NextResponse.json({ error: "Alert ID is required" }, { status: 400 });
        }
        const alert = await db.networkAlert.findUnique({ where: { id } });
        if (!alert) {
          return NextResponse.json({ error: "Alert not found" }, { status: 404 });
        }
        // Create suppression for the alert's rule
        if (alert.ruleId) {
          const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
          await db.alertSuppression.create({
            data: {
              alertRuleId: alert.ruleId,
              reason: reason || "Manual suppression from alert",
              suppressedBy: user?.name || "Unknown",
              startsAt: new Date(),
              endsAt: endsAt ? new Date(endsAt) : null,
            },
          });
        }
        // Also resolve the alert
        const updated = await db.networkAlert.update({
          where: { id },
          data: {
            status: "RESOLVED",
            resolvedAt: new Date(),
            resolution: reason ? `Suppressed: ${reason}` : "Alert suppressed",
          },
        });
        return NextResponse.json({ success: true, data: updated });
      }

      case "resolve": {
        const { id, resolution } = body;
        if (!id) {
          return NextResponse.json({ error: "Alert ID is required" }, { status: 400 });
        }
        const alert = await db.networkAlert.update({
          where: { id },
          data: {
            status: "RESOLVED",
            resolvedAt: new Date(),
            resolution: resolution || "",
          },
        });
        return NextResponse.json({ success: true, data: alert });
      }

      case "assign-alert": {
        const { id, assignedToId } = body;
        if (!id) {
          return NextResponse.json({ error: "Alert ID is required" }, { status: 400 });
        }
        if (!assignedToId) {
          return NextResponse.json({ error: "User ID is required for assignment" }, { status: 400 });
        }
        const targetUser = await db.user.findUnique({ where: { id: assignedToId }, select: { id: true, name: true } });
        if (!targetUser) {
          return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        const alert = await db.networkAlert.update({
          where: { id },
          data: { assignedToId },
          include: { assignedTo: { select: { id: true, name: true } } },
        });
        return NextResponse.json({ success: true, data: alert });
      }

      case "unassign-alert": {
        const { id } = body;
        if (!id) {
          return NextResponse.json({ error: "Alert ID is required" }, { status: 400 });
        }
        const alert = await db.networkAlert.update({
          where: { id },
          data: { assignedToId: null },
        });
        return NextResponse.json({ success: true, data: alert });
      }

      case "suppress-rule": {
        const { alertRuleId, reason, endsAt } = body;
        if (!alertRuleId) {
          return NextResponse.json({ error: "Rule ID is required" }, { status: 400 });
        }
        const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
        const suppression = await db.alertSuppression.create({
          data: {
            alertRuleId,
            reason: reason || "",
            suppressedBy: user?.name || "Unknown",
            startsAt: new Date(),
            endsAt: endsAt ? new Date(endsAt) : null,
          },
        });
        return NextResponse.json({ success: true, data: suppression });
      }

      case "unsuppress-rule": {
        const { alertRuleId } = body;
        if (!alertRuleId) {
          return NextResponse.json({ error: "Rule ID is required" }, { status: 400 });
        }
        await db.alertSuppression.deleteMany({
          where: {
            alertRuleId,
            AND: [
              { startsAt: { lte: new Date() } },
              { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
            ],
          },
        });
        return NextResponse.json({ success: true, message: "Suppression removed" });
      }

      case "add-comment": {
        const { alertId, message } = body;
        if (!alertId || !message) {
          return NextResponse.json({ error: "Alert ID and message are required" }, { status: 400 });
        }
        const alert = await db.networkAlert.findUnique({ where: { id: alertId } });
        if (!alert) {
          return NextResponse.json({ error: "Alert not found" }, { status: 404 });
        }
        const comment = await db.alertComment.create({
          data: {
            alertId,
            userId,
            message,
          },
          include: {
            User: { select: { id: true, name: true, email: true } },
          },
        });
        return NextResponse.json({ success: true, data: comment });
      }

      case "get-comments": {
        const { alertId } = body;
        if (!alertId) {
          return NextResponse.json({ error: "Alert ID is required" }, { status: 400 });
        }
        const comments = await db.alertComment.findMany({
          where: { alertId },
          include: {
            User: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        });
        return NextResponse.json({ success: true, data: comments });
      }

      case "create-maintenance": {
        const { title, description, scheduledAt, endTime, affectedAreaIds } = body;
        if (!title || !scheduledAt || !endTime) {
          return NextResponse.json({ error: "Title, scheduledAt, and endTime are required" }, { status: 400 });
        }
        const maintenance = await db.maintenanceWindow.create({
          data: {
            title,
            description: description || "",
            scheduledAt: new Date(scheduledAt),
            endTime: new Date(endTime),
            affectedAreaIds: JSON.stringify(affectedAreaIds || []),
            status: "scheduled",
          },
        });
        return NextResponse.json({ success: true, data: maintenance });
      }

      case "trigger-alert": {
        // Deduplication: check for existing alert with same rule+device within dedup window
        const { ruleId, deviceId: newDeviceId, severity: newSev, title: newTitle, message: newMessage, source: newSource } = body;
        if (!ruleId) {
          return NextResponse.json({ error: "Rule ID is required" }, { status: 400 });
        }
        const rule = await db.alertRule.findUnique({ where: { id: ruleId } });
        if (!rule) {
          return NextResponse.json({ error: "Rule not found" }, { status: 404 });
        }
        // Check if rule is suppressed
        const now = new Date();
        const activeSuppression = await db.alertSuppression.findFirst({
          where: {
            alertRuleId: ruleId,
            AND: [
              { startsAt: { lte: now } },
              { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
            ],
          },
        });
        if (activeSuppression) {
          return NextResponse.json({ success: true, suppressed: true, message: "Alert suppressed" });
        }
        // Check maintenance windows
        const activeMaintenances = await db.maintenanceWindow.findMany({
          where: {
            status: { in: ["scheduled", "IN PROGRESS"] },
            scheduledAt: { lte: now },
            endTime: { gte: now },
          },
        });
        if (activeMaintenances.length > 0) {
          return NextResponse.json({ success: true, suppressed: true, message: "Alert suppressed due to maintenance window" });
        }
        // Dedup check
        const dedupWindow = rule.deduplicationWindowMinutes || 10;
        const windowStart = new Date(now.getTime() - dedupWindow * 60000);
        const existingAlert = await db.networkAlert.findFirst({
          where: {
            ruleId,
            deviceId: newDeviceId || "",
            status: { in: ["ACTIVE", "ACKNOWLEDGED"] },
            createdAt: { gte: windowStart },
          },
        });
        if (existingAlert) {
          const updated = await db.networkAlert.update({
            where: { id: existingAlert.id },
            data: { duplicateCount: { increment: 1 }, updatedAt: new Date() },
          });
          return NextResponse.json({ success: true, deduplicated: true, data: updated });
        }
        // Create new alert
        const alert = await db.networkAlert.create({
          data: {
            ruleId,
            severity: newSev || rule.severity,
            title: newTitle || rule.name,
            message: newMessage || `Rule ${rule.name} triggered`,
            source: newSource || "",
            deviceId: newDeviceId || "",
            status: "ACTIVE",
            duplicateCount: 1,
          },
        });
        return NextResponse.json({ success: true, deduplicated: false, data: alert });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error: unknown) {
    console.error("Alerts POST error:", error);
    return NextResponse.json({ error: "Failed to process alert request" }, { status: 500 });
  }
}
