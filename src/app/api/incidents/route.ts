import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditCreate } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";

function safeJsonParse<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

// Helper: calculate SLA minutes based on severity
function getSlaMinutes(severity: string): number {
  switch (severity) {
    case "CRITICAL": return 30;
    case "HIGH": return 60;
    case "MEDIUM": return 240;
    case "LOW": return 480;
    default: return 60;
  }
}

// Helper: auto-escalation check (L1→L2→L3)
function calculateEscalationLevel(incident: { severity: string; startedAt: Date; escalationLevel: number }): number {
  const now = new Date();
  const minutesSinceStart = (now.getTime() - incident.startedAt.getTime()) / 60000;
  const severity = incident.severity;
  if (severity === "CRITICAL") {
    if (minutesSinceStart > 60) return 3;
    if (minutesSinceStart > 30) return 2;
  } else if (severity === "MAJOR") {
    if (minutesSinceStart > 240) return 3;
    if (minutesSinceStart > 120) return 2;
    if (minutesSinceStart > 60) return 1;
  } else if (severity === "MINOR") {
    if (minutesSinceStart > 480) return 2;
    if (minutesSinceStart > 240) return 1;
  }
  return incident.escalationLevel;
}

// GET: Return incidents, maintenance, and stats
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const assignedToId = searchParams.get("assignedToId");

    if (type === "incidents") {
      const where: Record<string, unknown> = {};
      if (assignedToId) where.assignedToId = assignedToId;
      const incidents = await db.incident.findMany({
        where,
        include: { IncidentUpdate: { orderBy: { createdAt: "asc" } }, User_Incident_assignedToIdToUser: { select: { id: true, name: true, email: true } } },
        orderBy: { startedAt: "desc" },
      });
      return NextResponse.json({ incidents });
    }

    if (type === "maintenance") {
      const maintenance = await db.maintenanceWindow.findMany({ orderBy: { scheduledAt: "asc" } });
      return NextResponse.json({ maintenance });
    }

    // Affected subscribers for an incident
    if (type === "affected-subscribers") {
      const incidentId = searchParams.get("incidentId");
      if (!incidentId) return NextResponse.json({ error: "incidentId required" }, { status: 400 });
      const incident = await db.incident.findUnique({ where: { id: incidentId } });
      if (!incident) return NextResponse.json({ error: "Incident not found" }, { status: 404 });
      const areaIds = safeJsonParse<string[]>(incident.affectedAreaIds, []);
      const subscribers = areaIds.length > 0
        ? await db.subscriber.findMany({
            where: { areaId: { in: areaIds } },
            select: { id: true, name: true, phone: true, email: true, status: true, Plan: { select: { name: true } } },
            take: 200,
          })
        : [];
      return NextResponse.json({ subscribers });
    }

    // Auto-detect endpoint: scan for active device-down alerts
    if (type === "auto-detect") {
      const activeAlerts = await db.networkAlert.findMany({
        where: { status: "ACTIVE", severity: { in: ["CRITICAL", "HIGH"] } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, title: true, message: true, source: true, deviceId: true, severity: true, createdAt: true },
      });
      return NextResponse.json({ alerts: activeAlerts, count: activeAlerts.length });
    }

    // Fetch users for assignment dropdown
    const users = await db.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });

    // Fetch active critical alerts for auto-detection UI
    const activeAlerts = await db.networkAlert.findMany({
      where: { status: "ACTIVE", severity: { in: ["CRITICAL", "HIGH"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, title: true, message: true, source: true, deviceId: true, severity: true, createdAt: true },
    });

    const ispSettings = await db.ispSettings.findUnique({ where: { id: "default" } });

    // Default: return everything with stats
    const whereAll: Record<string, unknown> = {};
    if (assignedToId) whereAll.assignedToId = assignedToId;

    const allIncidents = await db.incident.findMany({
      where: whereAll,
      include: { IncidentUpdate: { orderBy: { createdAt: "asc" } }, User_Incident_assignedToIdToUser: { select: { id: true, name: true, email: true } } },
      orderBy: { startedAt: "desc" },
    });
    const maintenance = await db.maintenanceWindow.findMany({ orderBy: { scheduledAt: "asc" } });

    // Check auto-escalation and update DB if needed
    for (const inc of allIncidents) {
      if (inc.status === "RESOLVED") continue;
      const newLevel = calculateEscalationLevel(inc);
      if (newLevel > inc.escalationLevel) {
        const history = safeJsonParse<Array<{ level: number; timestamp: string; reason: string }>>(inc.escalationHistory, []);
        history.push({ level: newLevel, timestamp: new Date().toISOString(), reason: `Auto-escalated based on severity + time (${Math.round((Date.now() - inc.startedAt.getTime()) / 60000)}m)` });
        await db.incident.update({
          where: { id: inc.id },
          data: { escalationLevel: newLevel, escalationHistory: JSON.stringify(history) },
        });
        await db.incidentUpdate.create({
          data: { incidentId: inc.id, message: `⚠️ Escalated to Level ${newLevel} (auto-escalation based on severity + time)` },
        });
        await auditCreate(req, "Incident", inc.id, { action: "auto-escalation", level: newLevel, incidentId: inc.id });
      }
    }

    // Re-fetch after escalation updates
    const updatedIncidents = await db.incident.findMany({
      where: whereAll,
      include: { IncidentUpdate: { orderBy: { createdAt: "asc" } }, User_Incident_assignedToIdToUser: { select: { id: true, name: true, email: true } } },
      orderBy: { startedAt: "desc" },
    });

    const activeIncidents = updatedIncidents.filter((i) => i.status !== "RESOLVED" && i.status !== "MERGED");
    const openIncidents = updatedIncidents.filter((i) => ["INVESTIGATING", "IDENTIFIED", "MONITORING"].includes(i.status));
    const resolvedIncidents = updatedIncidents.filter((i) => i.status === "RESOLVED");

    // Calculate MTTR
    let totalResolutionMinutes = 0;
    for (const inc of resolvedIncidents) {
      if (inc.resolvedAt && inc.startedAt) {
        totalResolutionMinutes += (new Date(inc.resolvedAt).getTime() - new Date(inc.startedAt).getTime()) / 60000;
      }
    }
    const mttr = resolvedIncidents.length > 0 ? Math.round(totalResolutionMinutes / resolvedIncidents.length) : 0;
    const totalAffected = activeIncidents.reduce((s, i) => s + i.affectedSubscriberCount, 0);

    return NextResponse.json({
      incidents: activeIncidents,
      maintenance,
      history: resolvedIncidents,
      stats: { activeIncidents: activeIncidents.length, openIncidents: openIncidents.length, mttr, affectedSubscribers: totalAffected },
      users,
      activeAlerts,
      slaSettings: { incidentSlaMinutes: ispSettings?.incidentSlaMinutes || 60, CRITICAL: 30, HIGH: 60, MEDIUM: 240, LOW: 480 },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Incidents API error:", error);
    return NextResponse.json({ error: "Failed to fetch incident data" }, { status: 500 });
  }
}

// POST: Create/update incidents and maintenance
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "create-incident") {
      const { title, severity, description, affectedAreaIds, affectedDeviceIds, affectedSubscriberCount, createdById, tags, estimatedCost, assignedToId, targetResolutionHours } = body.data || body;
      const incident = await db.incident.create({
        data: {
          title: title || "Untitled Incident",
          severity: severity || "MAJOR",
          description: description || "",
          affectedAreaIds: affectedAreaIds || "[]",
          affectedDeviceIds: affectedDeviceIds || "[]",
          affectedSubscriberCount: affectedSubscriberCount || 0,
          createdById: createdById || null,
          assignedToId: assignedToId || null,
          tags: tags || "[]",
          estimatedCost: estimatedCost || 0,
          targetResolutionHours: targetResolutionHours || 2,
          startedAt: new Date(),
          IncidentUpdate: { create: { message: "Incident created", createdById: createdById || null } },
        },
        include: { IncidentUpdate: { orderBy: { createdAt: "asc" } } },
      });
      await auditCreate(request, "Incident", incident.id, { action: "create-incident", title, severity });
      return NextResponse.json({ success: true, incident });
    }

    if (action === "add-update") {
      const { incidentId, message, createdById } = body;
      if (!incidentId || !message) return NextResponse.json({ error: "incidentId and message are required" }, { status: 400 });
      const update = await db.incidentUpdate.create({ data: { incidentId, message, createdById: createdById || null } });
      if (body.status) await db.incident.update({ where: { id: incidentId }, data: { status: body.status } });
      return NextResponse.json({ success: true, update });
    }

    if (action === "resolve") {
      const { incidentId, resolution, rcaData } = body;
      if (!incidentId) return NextResponse.json({ error: "incidentId is required" }, { status: 400 });
      const incident = await db.incident.update({
        where: { id: incidentId },
        data: { status: "RESOLVED", resolvedAt: new Date(), resolution: resolution || "", rcaData: rcaData ? JSON.stringify(rcaData) : undefined },
      });
      await db.incidentUpdate.create({ data: { incidentId, message: `✅ Incident resolved: ${resolution || "No details"}` } });
      await auditCreate(request, "Incident", incident.id, { action: "resolve", incidentId, resolution, rcaData });
      return NextResponse.json({ success: true, incident });
    }

    if (action === "create-maintenance") {
      const { title, description, scheduledAt, endTime, affectedAreaIds } = body.data || body;
      const maintenance = await db.maintenanceWindow.create({
        data: { title: title || "Untitled", description: description || "", scheduledAt: new Date(scheduledAt || Date.now()), endTime: new Date(endTime || Date.now() + 4 * 3600000), affectedAreaIds: affectedAreaIds || "[]" },
      });
      await auditCreate(request, "MaintenanceWindow", maintenance.id, { action: "create-maintenance", title });
      return NextResponse.json({ success: true, maintenance });
    }

    if (action === "update-maintenance-status") {
      const { maintenanceId, status } = body;
      if (!maintenanceId || !status) return NextResponse.json({ error: "maintenanceId and status are required" }, { status: 400 });
      const maintenance = await db.maintenanceWindow.update({ where: { id: maintenanceId }, data: { status } });
      await auditCreate(request, "MaintenanceWindow", maintenance.id, { action: "update-maintenance-status", status });
      return NextResponse.json({ success: true, maintenance });
    }

    // Save RCA Report (structured)
    if (action === "save-rca") {
      const { incidentId, rcaReport, rcaData } = body;
      if (!incidentId) return NextResponse.json({ error: "incidentId is required" }, { status: 400 });
      const incident = await db.incident.update({
        where: { id: incidentId },
        data: {
          rcaReport: rcaReport || "",
          rcaData: rcaData ? JSON.stringify(rcaData) : undefined,
        },
      });
      await db.incidentUpdate.create({ data: { incidentId, message: `📋 RCA Report ${rcaReport ? "completed" : "cleared"}` } });
      await auditCreate(request, "Incident", incidentId, { action: "save-rca", incidentId });
      return NextResponse.json({ success: true, incident });
    }

    // Assign Incident to User
    if (action === "assign") {
      const { incidentId, assignedToId } = body;
      if (!incidentId) return NextResponse.json({ error: "incidentId is required" }, { status: 400 });
      let assignedUser: { name: string } | null = null;
      if (assignedToId) assignedUser = await db.user.findUnique({ where: { id: assignedToId }, select: { name: true } });
      const incident = await db.incident.update({
        where: { id: incidentId },
        data: { assignedToId: assignedToId || null },
        include: { User_Incident_assignedToIdToUser: { select: { id: true, name: true, email: true } } },
      });
      await db.incidentUpdate.create({ data: { incidentId, message: assignedUser ? `👤 Assigned to ${assignedUser.name}` : "👤 Unassigned" } });
      await auditCreate(request, "Incident", incidentId, { action: "assign", incidentId, assignedToId });
      return NextResponse.json({ success: true, incident });
    }

    // Escalate incident manually
    if (action === "escalate") {
      const { incidentId, level } = body;
      if (!incidentId || !level) return NextResponse.json({ error: "incidentId and level required" }, { status: 400 });
      const incident = await db.incident.findUnique({ where: { id: incidentId } });
      if (!incident) return NextResponse.json({ error: "Incident not found" }, { status: 404 });
      const history = safeJsonParse<Array<{ level: number; timestamp: string; reason: string }>>(incident.escalationHistory, []);
      history.push({ level, timestamp: new Date().toISOString(), reason: `Manual escalation by user` });
      const updated = await db.incident.update({
        where: { id: incidentId },
        data: { escalationLevel: level, escalationHistory: JSON.stringify(history) },
      });
      await db.incidentUpdate.create({ data: { incidentId, message: `⬆️ Manually escalated to Level ${level}` } });
      await auditCreate(request, "Incident", incidentId, { action: "escalate", incidentId, level });
      return NextResponse.json({ success: true, incident: updated });
    }

    // Merge Duplicate Incidents
    if (action === "merge") {
      const { sourceId, targetId } = body;
      if (!sourceId || !targetId || sourceId === targetId) return NextResponse.json({ error: "sourceId and targetId must differ" }, { status: 400 });
      const source = await db.incident.findUnique({ where: { id: sourceId } });
      const target = await db.incident.findUnique({ where: { id: targetId } });
      if (!source || !target) return NextResponse.json({ error: "Incidents not found" }, { status: 404 });
      const sourceAreas = safeJsonParse<string[]>(source.affectedAreaIds, []);
      const targetAreas = safeJsonParse<string[]>(target.affectedAreaIds, []);
      const mergedAreas = [...new Set([...targetAreas, ...sourceAreas])];
      const sourceDevices = safeJsonParse<string[]>(source.affectedDeviceIds, []);
      const targetDevices = safeJsonParse<string[]>(target.affectedDeviceIds, []);
      const mergedDevices = [...new Set([...targetDevices, ...sourceDevices])];
      await db.incident.update({
        where: { id: targetId },
        data: { affectedAreaIds: JSON.stringify(mergedAreas), affectedDeviceIds: JSON.stringify(mergedDevices), affectedSubscriberCount: target.affectedSubscriberCount + source.affectedSubscriberCount },
      });
      await db.incidentUpdate.create({ data: { incidentId: targetId, message: `🔗 Merged with "${source.title}" (${sourceId.slice(0, 8)}). Combined ${source.affectedSubscriberCount} subscribers.` } });
      await db.incident.update({ where: { id: sourceId }, data: { status: "MERGED", resolution: `Merged into ${targetId.slice(0, 8)}` } });
      await auditCreate(request, "Incident", sourceId, { action: "merge", sourceId, targetId });
      return NextResponse.json({ success: true, message: "Incidents merged" });
    }

    // Auto-detect: Create incidents from active device-down alerts
    if (action === "auto-detect") {
      const alerts = await db.networkAlert.findMany({
        where: { status: "ACTIVE", severity: { in: ["CRITICAL", "HIGH"] } },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      const created: Array<{ id: string; title: string; alertId: string }> = [];
      for (const alert of alerts) {
        const existing = await db.incident.findFirst({
          where: { status: { notIn: ["RESOLVED", "MERGED"] }, rcaReport: alert.id },
        });
        if (existing) continue;
        const incident = await db.incident.create({
          data: {
            title: `[Auto] ${alert.title}`,
            severity: alert.severity === "CRITICAL" ? "CRITICAL" : "MAJOR",
            description: `Auto-detected from alert: ${alert.message}\n\nSource: ${alert.source}${alert.deviceId ? ` | Device: ${alert.deviceId}` : ""}\nAlert ID: ${alert.id}`,
            affectedDeviceIds: alert.deviceId ? JSON.stringify([alert.deviceId]) : "[]",
            affectedAreaIds: "[]",
            affectedSubscriberCount: 0,
            tags: JSON.stringify(["auto-detected"]),
            startedAt: new Date(),
            IncidentUpdate: { create: { message: `🤖 Auto-created from network alert ${alert.id.slice(0, 8)}` } },
          },
        });
        created.push({ id: incident.id, title: incident.title, alertId: alert.id });
      }
      await auditCreate(request, "Incident", "auto-detect", { count: created.length });
      return NextResponse.json({ success: true, created, total: created.length });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Incidents POST error:", error);
    return NextResponse.json({ error: "Failed to process action" }, { status: 500 });
  }
}
