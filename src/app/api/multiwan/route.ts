import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import * as os from "@/lib/os/network-utils";

// ─── Helpers ──────────────────────────────────────────────────────

function mapWanStatus(status: string): string {
  switch (status) {
    case "ACTIVE": return "Connected";
    case "STANDBY": return "Standby";
    case "DOWN": return "Disconnected";
    case "MAINTENANCE": return "Maintenance";
    default: return status;
  }
}

function formatSpeed(downloadSpeed: number): string {
  if (downloadSpeed >= 1000) return `${(downloadSpeed / 1000).toFixed(0)} Gbps`;
  return `${downloadSpeed} Mbps`;
}

function calculateUptime(createdAt: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - createdAt.getTime();
  const days = Math.floor(diffMs / 86400000);
  const hours = Math.floor((diffMs % 86400000) / 3600000);
  return `${days}d ${hours}h`;
}

function safeJsonParse<T = any>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

/**
 * Log a structured WAN event to both AuditLog and WanEvent table.
 */
async function logWanEvent(
  request: NextRequest,
  action: string,
  wanName: string,
  details: Record<string, unknown>,
  userId?: string,
) {
  // Log to audit log (existing pattern)
  await auditLog(request, action as any, "MultiWAN", wanName, { details, ...(userId ? { userId } : {}) });

  // Log to WanEvent table (new structured events)
  try {
    await db.wanEvent.create({
      data: {
        action,
        wanName,
        details: JSON.stringify(details),
        userId: userId || null,
      },
    });
  } catch {
    // Ignore - table may not exist yet during migration
  }
}

// ─── GET: WAN links, failover rules, traffic, events, load balancing ─────────
export async function GET(request: NextRequest) {
  try {
    let userId: string | undefined;
    try {
      userId = await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const tab = searchParams.get("tab") || "";

    // ── Fetch WAN links from DB ──
    const wanLinks = await db.wanLink.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search } },
              { isp: { contains: search } },
              { ipAddress: { contains: search } },
              { interfaceName: { contains: search } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
    });

    const failoverRules = await db.failoverRule.findMany({
      orderBy: { priority: "asc" },
    });

    const wanLinkMap = new Map(wanLinks.map((l) => [l.id, l]));

    // ── Real OS traffic data from /proc/net/dev ──
    let osTrafficAll: Record<string, os.TrafficStats> = {};
    try {
      osTrafficAll = await os.getAllTraffic();
    } catch {
      // OS commands may fail in dev environments
    }

    // ── Build hourly traffic from BandwidthLog (existing pattern for frontend compat) ──
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const bandwidthLogs = await db.bandwidthLog.findMany({
      where: { timestamp: { gte: twentyFourHoursAgo } },
      orderBy: { timestamp: "asc" },
    });

    const deviceLogsMap = new Map<string, typeof bandwidthLogs>();
    for (const log of bandwidthLogs) {
      if (!deviceLogsMap.has(log.deviceId)) deviceLogsMap.set(log.deviceId, []);
      deviceLogsMap.get(log.deviceId)!.push(log);
    }

    const deviceIds = [...new Set(bandwidthLogs.map((l) => l.deviceId))];
    const devices = deviceIds.length > 0
      ? await db.networkDevice.findMany({
          where: { id: { in: deviceIds } },
          select: { id: true, name: true },
        })
      : [];
    const deviceNameMap = new Map(devices.map((d) => [d.id, d.name]));

    const trafficByDevice: { deviceName: string; hourlyDownload: number[]; hourlyUpload: number[] }[] = [];
    for (const [deviceId, logs] of deviceLogsMap) {
      const hourlyDownload = new Array(24).fill(0);
      const hourlyUpload = new Array(24).fill(0);
      const hourlyCount = new Array(24).fill(0);

      for (const log of logs) {
        const hour = log.timestamp.getHours();
        hourlyDownload[hour] += log.downloadBps;
        hourlyUpload[hour] += log.uploadBps;
        hourlyCount[hour]++;
      }

      for (let i = 0; i < 24; i++) {
        if (hourlyCount[i] > 0) {
          hourlyDownload[i] = Math.round(hourlyDownload[i] / hourlyCount[i]);
          hourlyUpload[i] = Math.round(hourlyUpload[i] / hourlyCount[i]);
        }
      }

      trafficByDevice.push({
        deviceName: deviceNameMap.get(deviceId) || `Device-${deviceId.slice(0, 6)}`,
        hourlyDownload,
        hourlyUpload,
      });
    }

    // Calculate real usage percent for each WAN link
    const deviceThroughput = new Map<string, number>();
    for (const log of bandwidthLogs) {
      const current = deviceThroughput.get(log.deviceId) || 0;
      deviceThroughput.set(log.deviceId, Math.max(current, log.downloadBps));
    }

    const transformedLinks = wanLinks.map((l) => {
      let usagePercent = 0;
      if (l.deviceId) {
        const maxThroughput = deviceThroughput.get(l.deviceId);
        if (maxThroughput !== undefined && maxThroughput > 0 && l.downloadSpeed > 0) {
          const capacityBps = l.downloadSpeed * 1_000_000;
          usagePercent = Math.min(Math.round((maxThroughput / capacityBps) * 100), 100);
        }
      }
      // Budget usage (simulate: use cost as a proxy for % if budget is set)
      const budgetPercent = l.monthlyBudget > 0 ? Math.min(Math.round((l.monthlyCost / l.monthlyBudget) * 100), 100) : 0;
      return {
        id: l.id,
        name: l.name,
        isp: l.isp,
        type: l.type,
        ip: l.ipAddress,
        gateway: l.gateway,
        speed: formatSpeed(l.downloadSpeed),
        uploadSpeed: formatSpeed(l.uploadSpeed),
        status: mapWanStatus(l.status),
        uptime: calculateUptime(l.createdAt),
        monthlyCost: l.monthlyCost,
        monthlyBudget: l.monthlyBudget,
        alertAtPercent: l.alertAtPercent || 80,
        usagePercent,
        budgetPercent,
        weight: l.weight,
        autoFailback: l.autoFailback,
        failbackDelaySec: l.failbackDelaySec,
        preferPrimary: l.preferPrimary,
        isPrimary: l.isPrimary,
        maxDownloadMbps: l.maxDownloadMbps || 0,
        maxUploadMbps: l.maxUploadMbps || 0,
        burstSizeMbps: l.burstSizeMbps || 0,
        linkPriority: l.linkPriority || 5,
        stabilityCheckEnabled: l.stabilityCheckEnabled || false,
        minUptimeSeconds: l.minUptimeSeconds || 300,
        ipv6Address: l.ipv6Address,
        ipv6Gateway: l.ipv6Gateway,
        ipv6HealthTarget: l.ipv6HealthTarget,
      };
    });

    const transformedRules = failoverRules.map((r) => ({
      id: r.id,
      priority: r.priority,
      fromLink: wanLinkMap.get(r.primaryWanId || "")?.name || "Unknown",
      toLink: wanLinkMap.get(r.backupWanId || "")?.name || "Unknown",
      trigger: r.triggerCondition,
      autoFailback: r.autoFailback,
      preferPrimary: r.preferPrimary,
      failbackDelaySec: r.failbackDelaySec,
      lastTriggered: r.lastTriggeredAt
        ? r.lastTriggeredAt.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
        : "Never",
      status: r.enabled ? "Active" : "Disabled",
    }));

    const activeLinks = wanLinks.filter((l) => l.status === "ACTIVE");
    const totalBandwidth = activeLinks.reduce((s, l) => s + l.downloadSpeed, 0);
    const monthlyCost = wanLinks.reduce((s, l) => s + l.monthlyCost, 0);

    // Load balancing config from ISP Settings
    const ispSettings = await db.ispSettings.findUnique({ where: { id: "default" } });
    const loadBalancingConfig = safeJsonParse<{
      algorithm: string;
      weights: Record<string, number>;
    }>(ispSettings?.loadBalancingConfig, { algorithm: "round-robin", weights: {} });

    // WAN events from AuditLog (for backward compat) + WanEvent (new structured)
    const wanEvents = tab === "events"
      ? await db.auditLog.findMany({
          where: { entity: "MultiWAN" },
          orderBy: { timestamp: "desc" },
          take: 50,
          include: { User: { select: { name: true } } },
        })
      : [];

    const transformedEvents = wanEvents.map((e) => ({
      id: e.id,
      action: e.action,
      details: safeJsonParse(e.details, {}),
      userName: e.userName,
      timestamp: e.timestamp.toISOString(),
    }));

    return NextResponse.json({
      wanLinks: transformedLinks,
      failoverRules: transformedRules,
      traffic: trafficByDevice,
      hasRealTrafficData: Object.keys(osTrafficAll).length > 0,
      loadBalancing: loadBalancingConfig,
      events: transformedEvents,
      stats: {
        totalLinks: wanLinks.length,
        active: activeLinks.length,
        failoverEventsToday: failoverRules.filter(
          (r) => r.lastTriggeredAt && r.lastTriggeredAt > new Date(new Date().setHours(0, 0, 0, 0))
        ).length,
        totalBandwidth: formatSpeed(totalBandwidth),
        monthlyCost,
      },
    });
  } catch (error) {
    console.error("Multi-WAN GET error:", error);
    return NextResponse.json({ error: "Failed to fetch Multi-WAN data" }, { status: 500 });
  }
}

// ─── POST: CRUD + OS actions ────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    let userId: string | undefined;
    try {
      userId = await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const body = await request.json();
    const { action } = body;

    switch (action) {
      // ═══ WAN LINK CRUD (DB only) ═════════════════════════════

      case "create-wan": {
        const { name, type, isp, ipAddress, gateway, downloadSpeed, uploadSpeed, monthlyCost, isPrimary, interfaceName, deviceId, monthlyBudget, weight, autoFailback, failbackDelaySec, preferPrimary, ipv6Address, ipv6Gateway, ipv6HealthTarget } = body;
        if (!name) {
          return NextResponse.json({ error: "WAN link name is required" }, { status: 400 });
        }
        const wanLink = await db.wanLink.create({
          data: {
            name,
            type: type || "FIBER",
            isp: isp || "",
            ipAddress: ipAddress || "",
            gateway: gateway || "",
            downloadSpeed: downloadSpeed || 0,
            uploadSpeed: uploadSpeed || 0,
            monthlyCost: monthlyCost || 0,
            monthlyBudget: monthlyBudget || 0,
            isPrimary: isPrimary || false,
            interfaceName: interfaceName || "",
            deviceId: deviceId || null,
            weight: weight || 1,
            autoFailback: autoFailback ?? true,
            failbackDelaySec: failbackDelaySec || 60,
            preferPrimary: preferPrimary ?? true,
            ipv6Address: ipv6Address || "",
            ipv6Gateway: ipv6Gateway || "",
            ipv6HealthTarget: ipv6HealthTarget || "",
          },
        });
        await auditLog(request, "CONFIG_CHANGE", "MultiWAN", wanLink.id, { name, type, isp, action: "create-wan" });
        return NextResponse.json({ success: true, data: wanLink });
      }

      case "update-wan": {
        const { id, name, type, isp, ipAddress, gateway, downloadSpeed, uploadSpeed, monthlyCost, isPrimary, monthlyBudget, weight, autoFailback, failbackDelaySec, preferPrimary, ipv6Address, ipv6Gateway, ipv6HealthTarget } = body;
        if (!id) {
          return NextResponse.json({ error: "WAN link ID is required" }, { status: 400 });
        }
        const existing = await db.wanLink.findUnique({ where: { id } });
        if (!existing) {
          return NextResponse.json({ error: "WAN link not found" }, { status: 404 });
        }
        const updated = await db.wanLink.update({
          where: { id },
          data: {
            ...(name !== undefined ? { name } : {}),
            ...(type !== undefined ? { type } : {}),
            ...(isp !== undefined ? { isp } : {}),
            ...(ipAddress !== undefined ? { ipAddress } : {}),
            ...(gateway !== undefined ? { gateway } : {}),
            ...(downloadSpeed !== undefined ? { downloadSpeed } : {}),
            ...(uploadSpeed !== undefined ? { uploadSpeed } : {}),
            ...(monthlyCost !== undefined ? { monthlyCost } : {}),
            ...(isPrimary !== undefined ? { isPrimary } : {}),
            ...(monthlyBudget !== undefined ? { monthlyBudget } : {}),
            ...(weight !== undefined ? { weight } : {}),
            ...(autoFailback !== undefined ? { autoFailback } : {}),
            ...(failbackDelaySec !== undefined ? { failbackDelaySec } : {}),
            ...(preferPrimary !== undefined ? { preferPrimary } : {}),
            ...(ipv6Address !== undefined ? { ipv6Address } : {}),
            ...(ipv6Gateway !== undefined ? { ipv6Gateway } : {}),
            ...(ipv6HealthTarget !== undefined ? { ipv6HealthTarget } : {}),
          },
        });
        await auditLog(request, "CONFIG_CHANGE", "MultiWAN", id, { action: "update-wan", previousValues: { monthlyBudget: existing.monthlyBudget, weight: existing.weight, autoFailback: existing.autoFailback, failbackDelaySec: existing.failbackDelaySec, preferPrimary: existing.preferPrimary } });
        return NextResponse.json({ success: true, data: updated });
      }

      case "delete-wan": {
        const { id } = body;
        if (!id) {
          return NextResponse.json({ error: "WAN link ID is required" }, { status: 400 });
        }
        const existing = await db.wanLink.findUnique({ where: { id } });
        await auditLog(request, "DELETE", "MultiWAN", id, { action: "delete-wan", name: existing?.name });
        await logWanEvent(request, "DELETE", existing?.name || "unknown", { action: "delete-wan", linkId: id }, userId);
        await db.wanLink.delete({ where: { id } });
        return NextResponse.json({ success: true, message: "WAN link deleted" });
      }

      // ═══ INTERFACE TOGGLE (DB + OS) ══════════════════════════

      case "toggle-wan": {
        const { id } = body;
        if (!id) {
          return NextResponse.json({ error: "WAN link ID is required" }, { status: 400 });
        }
        const current = await db.wanLink.findUnique({ where: { id } });
        if (!current) {
          return NextResponse.json({ error: "WAN link not found" }, { status: 404 });
        }
        const newStatus = current.status === "ACTIVE" ? "STANDBY" : "ACTIVE";

        // Try OS-level toggle if interface name is set
        let osResult: string | null = null;
        if (current.interfaceName) {
          try {
            if (newStatus === "STANDBY") {
              await os.setInterfaceDown(current.interfaceName);
            } else {
              await os.setInterfaceUp(current.interfaceName);
            }
            osResult = "OS command executed";
          } catch (err: any) {
            osResult = "OS command failed";
          }
        }

        const updated = await db.wanLink.update({
          where: { id },
          data: { status: newStatus },
        });
        await auditLog(request, "STATUS_CHANGE", "MultiWAN", id, { action: "toggle-wan", previousStatus: current.status, newStatus, linkName: current.name, osResult });
        await logWanEvent(request, "STATUS_CHANGE", current.name, { previousStatus: current.status, newStatus, interfaceName: current.interfaceName, osResult }, userId);
        return NextResponse.json({ success: true, data: updated, osResult });
      }

      // ═══ FORCE FAILOVER (DB + OS gateway switch) ══════════════

      case "force-failover": {
        const { id, targetGateway, targetInterface } = body;
        if (!id) {
          return NextResponse.json({ error: "WAN link ID is required" }, { status: 400 });
        }
        const wanLink = await db.wanLink.findUnique({ where: { id } });
        if (!wanLink) {
          return NextResponse.json({ error: "WAN link not found" }, { status: 404 });
        }

        // Try OS-level gateway switch if interface and gateway provided
        let osResult: string | null = null;
        if (targetInterface && targetGateway) {
          try {
            await os.addDefaultGateway(targetGateway, targetInterface);
            osResult = `Default gateway switched to ${targetGateway} via ${targetInterface}`;
          } catch (err: any) {
            osResult = "Gateway switch failed";
          }
        }

        const updated = await db.wanLink.update({
          where: { id },
          data: { status: "STANDBY" },
        });
        const relatedRules = await db.failoverRule.findMany({
          where: { primaryWanId: id, enabled: true },
        });
        for (const rule of relatedRules) {
          await db.failoverRule.update({
            where: { id: rule.id },
            data: { lastTriggeredAt: new Date() },
          });
        }
        await auditLog(request, "CONFIG_CHANGE", "MultiWAN", id, { action: "force-failover", previousStatus: wanLink.status, newStatus: "STANDBY", linkName: wanLink.name, osResult });
        await logWanEvent(request, "FAILOVER", wanLink.name, { previousStatus: wanLink.status, targetGateway, targetInterface, osResult }, userId);
        return NextResponse.json({ success: true, message: `Manual failover triggered for ${wanLink.name}. Status set to STANDBY.`, data: updated, osResult });
      }

      // ═══ FAILOVER RULES CRUD (DB only) ═════════════════════════

      case "create-rule": {
        const { name, primaryWanId, backupWanId, triggerCondition, autoFailback, failbackDelaySec, preferPrimary, priority, enabled } = body;
        if (!name) {
          return NextResponse.json({ error: "Rule name is required" }, { status: 400 });
        }
        const rule = await db.failoverRule.create({
          data: {
            name,
            primaryWanId: primaryWanId || null,
            backupWanId: backupWanId || null,
            triggerCondition: triggerCondition || "",
            autoFailback: autoFailback ?? true,
            failbackDelaySec: failbackDelaySec || 60,
            preferPrimary: preferPrimary ?? true,
            priority: priority || 1,
            enabled: enabled ?? true,
          },
        });
        await auditLog(request, "CONFIG_CHANGE", "MultiWAN", rule.id, { name, triggerCondition, action: "create-rule" });
        return NextResponse.json({ success: true, data: rule });
      }

      case "update-rule": {
        const { id, name, primaryWanId, backupWanId, triggerCondition, autoFailback, failbackDelaySec, preferPrimary, priority, enabled } = body;
        if (!id) {
          return NextResponse.json({ error: "Rule ID is required" }, { status: 400 });
        }
        const existing = await db.failoverRule.findUnique({ where: { id } });
        if (!existing) {
          return NextResponse.json({ error: "Failover rule not found" }, { status: 404 });
        }
        const updated = await db.failoverRule.update({
          where: { id },
          data: {
            ...(name !== undefined ? { name } : {}),
            ...(primaryWanId !== undefined ? { primaryWanId } : {}),
            ...(backupWanId !== undefined ? { backupWanId } : {}),
            ...(triggerCondition !== undefined ? { triggerCondition } : {}),
            ...(autoFailback !== undefined ? { autoFailback } : {}),
            ...(failbackDelaySec !== undefined ? { failbackDelaySec } : {}),
            ...(preferPrimary !== undefined ? { preferPrimary } : {}),
            ...(priority !== undefined ? { priority } : {}),
            ...(enabled !== undefined ? { enabled } : {}),
          },
        });
        await auditLog(request, "CONFIG_CHANGE", "MultiWAN", id, { action: "update-rule", name });
        return NextResponse.json({ success: true, data: updated });
      }

      case "delete-rule": {
        const { id } = body;
        if (!id) {
          return NextResponse.json({ error: "Rule ID is required" }, { status: 400 });
        }
        await auditLog(request, "DELETE", "MultiWAN", id, { action: "delete-rule" });
        await db.failoverRule.delete({ where: { id } });
        return NextResponse.json({ success: true, message: "Rule deleted" });
      }

      // ═══ LOAD BALANCING (DB) ═════════════════════════════════

      case "save-load-balancing": {
        const { algorithm, weights } = body;
        await db.ispSettings.upsert({
          where: { id: "default" },
          update: {
            loadBalancingConfig: JSON.stringify({ algorithm: algorithm || "round-robin", weights: weights || {} }),
          },
          create: {
            id: "default",
            loadBalancingConfig: JSON.stringify({ algorithm: algorithm || "round-robin", weights: weights || {} }),
          },
        });
        await auditLog(request, "CONFIG_CHANGE", "MultiWAN", "load-balancing", { action: "save-load-balancing", algorithm, weights });
        return NextResponse.json({ success: true, message: "Load balancing configuration saved" });
      }

      // ═══ BANDWIDTH SHAPING (DB) ════════════════════════════════

      case "save-shaping": {
        const { id, maxDownloadMbps, maxUploadMbps, burstSizeMbps, linkPriority } = body;
        if (!id) return NextResponse.json({ error: "WAN link ID is required" }, { status: 400 });
        const existing = await db.wanLink.findUnique({ where: { id } });
        if (!existing) return NextResponse.json({ error: "WAN link not found" }, { status: 404 });
        const updated = await db.wanLink.update({
          where: { id },
          data: {
            ...(maxDownloadMbps !== undefined ? { maxDownloadMbps } : {}),
            ...(maxUploadMbps !== undefined ? { maxUploadMbps } : {}),
            ...(burstSizeMbps !== undefined ? { burstSizeMbps } : {}),
            ...(linkPriority !== undefined ? { linkPriority } : {}),
          },
        });
        await auditLog(request, "CONFIG_CHANGE", "MultiWAN", id, { action: "save-shaping", linkName: existing.name });
        return NextResponse.json({ success: true, data: updated });
      }

      // ═══ BUDGET (DB) ═════════════════════════════════════════

      case "set-budget": {
        const { id, monthlyBudget } = body;
        if (!id) {
          return NextResponse.json({ error: "WAN link ID is required" }, { status: 400 });
        }
        const existing = await db.wanLink.findUnique({ where: { id } });
        if (!existing) {
          return NextResponse.json({ error: "WAN link not found" }, { status: 404 });
        }
        const updated = await db.wanLink.update({
          where: { id },
          data: { monthlyBudget: monthlyBudget || 0 },
        });
        await auditLog(request, "CONFIG_CHANGE", "MultiWAN", id, { action: "set-budget", previousBudget: existing.monthlyBudget, newBudget: monthlyBudget || 0, linkName: existing.name });
        return NextResponse.json({ success: true, data: updated });
      }

      // ═══ FAILBACK CONFIG (DB) ═════════════════════════════════

      case "save-failback-config": {
        const { id, autoFailback, failbackDelaySec, stabilityCheckEnabled, minUptimeSeconds } = body;
        if (!id) return NextResponse.json({ error: "WAN link ID is required" }, { status: 400 });
        const existing = await db.wanLink.findUnique({ where: { id } });
        if (!existing) return NextResponse.json({ error: "WAN link not found" }, { status: 404 });
        const updated = await db.wanLink.update({
          where: { id },
          data: {
            ...(autoFailback !== undefined ? { autoFailback } : {}),
            ...(failbackDelaySec !== undefined ? { failbackDelaySec } : {}),
            ...(stabilityCheckEnabled !== undefined ? { stabilityCheckEnabled } : {}),
            ...(minUptimeSeconds !== undefined ? { minUptimeSeconds } : {}),
          },
        });
        await auditLog(request, "CONFIG_CHANGE", "MultiWAN", id, { action: "save-failback-config", linkName: existing.name });
        return NextResponse.json({ success: true, data: updated });
      }

      // ═══ OS-LEVEL: CONFIGURE IP ═══════════════════════════════

      case "configure-ip": {
        const { iface, cidr } = body;
        if (!iface || !cidr) {
          return NextResponse.json({ error: "Interface name and CIDR are required" }, { status: 400 });
        }
        try {
          await os.flushInterfaceIps(iface);
          await os.addIpToInterface(iface, cidr);
          await logWanEvent(request, "CONFIG_CHANGE", iface, { action: "configure-ip", cidr }, userId);
          return NextResponse.json({ success: true, message: `IP ${cidr} configured on ${iface}` });
        } catch (err: any) {
          console.error("[MultiWAN] configure-ip error:", err);
          return NextResponse.json({ error: "Failed to configure IP" }, { status: 500 });
        }
      }

      // ═══ OS-LEVEL: FLUSH IPs ══════════════════════════════════

      case "flush-ip": {
        const { iface } = body;
        if (!iface) {
          return NextResponse.json({ error: "Interface name is required" }, { status: 400 });
        }
        try {
          await os.flushInterfaceIps(iface);
          await logWanEvent(request, "CONFIG_CHANGE", iface, { action: "flush-ip" }, userId);
          return NextResponse.json({ success: true, message: `All IPs flushed on ${iface}` });
        } catch (err: any) {
          console.error("[MultiWAN] flush-ip error:", err);
          return NextResponse.json({ error: "Failed to flush IPs" }, { status: 500 });
        }
      }

      // ═══ OS-LEVEL: ADD ROUTE ══════════════════════════════════

      case "add-route": {
        const { dest, via, dev, metric } = body;
        if (!dest) {
          return NextResponse.json({ error: "Destination is required" }, { status: 400 });
        }
        try {
          await os.addRoute(dest, via, dev, metric);
          await logWanEvent(request, "CONFIG_CHANGE", dev || "unknown", { action: "add-route", dest, via, metric }, userId);
          return NextResponse.json({ success: true, message: `Route ${dest} added` });
        } catch (err: any) {
          console.error("[MultiWAN] add-route error:", err);
          return NextResponse.json({ error: "Failed to add route" }, { status: 500 });
        }
      }

      // ═══ OS-LEVEL: DELETE ROUTE ═══════════════════════════════

      case "delete-route": {
        const { dest, via, dev } = body;
        if (!dest) {
          return NextResponse.json({ error: "Destination is required" }, { status: 400 });
        }
        try {
          await os.deleteRoute(dest, via, dev);
          await logWanEvent(request, "CONFIG_CHANGE", dev || "unknown", { action: "delete-route", dest, via }, userId);
          return NextResponse.json({ success: true, message: `Route ${dest} deleted` });
        } catch (err: any) {
          console.error("[MultiWAN] delete-route error:", err);
          return NextResponse.json({ error: "Failed to delete route" }, { status: 500 });
        }
      }

      // ═══ OS-LEVEL: SET DEFAULT GATEWAY ════════════════════════

      case "set-gateway": {
        const { gateway, dev, metric } = body;
        if (!gateway || !dev) {
          return NextResponse.json({ error: "Gateway and device are required" }, { status: 400 });
        }
        try {
          await os.addDefaultGateway(gateway, dev, metric);
          await logWanEvent(request, "CONFIG_CHANGE", dev, { action: "set-gateway", gateway, metric }, userId);
          return NextResponse.json({ success: true, message: `Default gateway set to ${gateway} via ${dev}` });
        } catch (err: any) {
          console.error("[MultiWAN] set-gateway error:", err);
          return NextResponse.json({ error: "Failed to set gateway" }, { status: 500 });
        }
      }

      // ═══ OS-LEVEL: PING TEST ══════════════════════════════════

      case "ping-test": {
        const { host, count } = body;
        if (!host) {
          return NextResponse.json({ error: "Host is required" }, { status: 400 });
        }
        try {
          const result = await os.pingCheck(host, count || 3);
          await logWanEvent(request, "PING_CHECK", host, { action: "ping-test", result }, userId);
          return NextResponse.json({ success: true, data: result });
        } catch (err: any) {
          console.error("[MultiWAN] ping-test error:", err);
          return NextResponse.json({ error: "Ping test failed" }, { status: 500 });
        }
      }

      // ═══ OS-LEVEL: ENABLE NAT MASQUERADE (nftables) ═════════════════════

      case "enable-nat": {
        const { iface } = body;
        if (!iface) {
          return NextResponse.json({ error: "Interface name is required" }, { status: 400 });
        }
        try {
          await os.nftEnableMasquerade(iface);
          await logWanEvent(request, "CONFIG_CHANGE", iface, { action: "enable-nat", method: "nftables" }, userId);
          return NextResponse.json({ success: true, message: `NAT masquerade enabled on ${iface} (nftables)` });
        } catch (err: any) {
          console.error("[MultiWAN] enable-nat error:", err);
          return NextResponse.json({ error: "Failed to enable NAT" }, { status: 500 });
        }
      }

      // ═══ OS-LEVEL: DISABLE NAT MASQUERADE (nftables) ════════════════════

      case "disable-nat": {
        const { iface } = body;
        if (!iface) {
          return NextResponse.json({ error: "Interface name is required" }, { status: 400 });
        }
        try {
          await os.nftDisableMasquerade(iface);
          await logWanEvent(request, "CONFIG_CHANGE", iface, { action: "disable-nat", method: "nftables" }, userId);
          return NextResponse.json({ success: true, message: `NAT masquerade disabled on ${iface} (nftables)` });
        } catch (err: any) {
          console.error("[MultiWAN] disable-nat error:", err);
          return NextResponse.json({ error: "Failed to disable NAT" }, { status: 500 });
        }
      }

      // ═══ OS-LEVEL: APPLY LOAD BALANCING (nftables + ip rule) ═════════════════

      case "apply-load-balancing": {
        const { links, algorithm, weights } = body;
        if (!links || links.length < 2) {
          return NextResponse.json({ error: "Need at least 2 active WAN links with interface and gateway" }, { status: 400 });
        }
        const activeLinks = links.filter((l: any) => l.interfaceName && l.gateway);
        if (activeLinks.length < 2) {
          return NextResponse.json({ error: "Need at least 2 active WAN links with interface and gateway configured" }, { status: 400 });
        }
        try {
          const result = await os.applyLoadBalancing({
            links: activeLinks.map((l: any) => ({
              name: l.name,
              interfaceName: l.interfaceName,
              gateway: l.gateway,
              ipAddress: l.ip || l.ipAddress,
              weight: l.weight || 1,
            })),
            algorithm: algorithm || "round-robin",
            weights: weights || {},
          });
          if (!result.success) {
            return NextResponse.json({ error: result.error, commands: result.commands }, { status: 500 });
          }
          await auditLog(request, "CONFIG_CHANGE", "MultiWAN", "load-balancing", { action: "apply-load-balancing", algorithm, linkCount: activeLinks.length, commands: result.commands });
          await logWanEvent(request, "CONFIG_CHANGE", "load-balancing", { action: "apply", algorithm, linkCount: activeLinks.length, commands: result.commands }, userId);
          return NextResponse.json({ success: true, message: `Load balancing applied (${algorithm}) for ${activeLinks.length} WAN links`, commands: result.commands });
        } catch (err: any) {
          console.error("[MultiWAN] apply-load-balancing error:", err);
          return NextResponse.json({ error: "Failed to apply load balancing" }, { status: 500 });
        }
      }

      // ═══ OS-LEVEL: TEARDOWN LOAD BALANCING ═══════════════════════════════

      case "teardown-load-balancing": {
        try {
          const result = await os.teardownLoadBalancing();
          await auditLog(request, "CONFIG_CHANGE", "MultiWAN", "load-balancing", { action: "teardown-load-balancing", commands: result.commands });
          await logWanEvent(request, "CONFIG_CHANGE", "load-balancing", { action: "teardown", commands: result.commands }, userId);
          return NextResponse.json({ success: true, message: "Load balancing torn down", commands: result.commands });
        } catch (err: any) {
          console.error("[MultiWAN] teardown-load-balancing error:", err);
          return NextResponse.json({ error: "Failed to teardown" }, { status: 500 });
        }
      }

      // ═══ OS-LEVEL: CHECK LOAD BALANCING STATUS ════════════════════════════

      case "load-balancing-status": {
        try {
          const status = await os.getLoadBalancingStatus();
          return NextResponse.json({ success: true, data: status });
        } catch (err: any) {
          console.error("[MultiWAN] load-balancing-status error:", err);
          return NextResponse.json({ success: true, data: { active: false, details: "Error occurred" } });
        }
      }

      // ═══ OS-LEVEL: GATEWAY HEALTH CHECK ══════════════════════════════════

      case "health-check": {
        const { gateway, iface, count } = body;
        if (!gateway || !iface) {
          return NextResponse.json({ error: "Gateway and interface are required" }, { status: 400 });
        }
        try {
          const result = await os.checkGatewayHealth(gateway, iface, count || 3);
          await logWanEvent(request, "PING_CHECK", gateway, { action: "health-check", iface, result }, userId);
          return NextResponse.json({ success: true, data: result });
        } catch (err: any) {
          console.error("[MultiWAN] health-check error:", err);
          return NextResponse.json({ error: "Health check failed" }, { status: 500 });
        }
      }

      // ═══ HEALTH MONITOR SERVICE (mini-service proxy) ════════════════════════

      case "health-monitor-status": {
        try {
          const res = await fetch("http://127.0.0.1:3006/api/status", { signal: AbortSignal.timeout(5000) });
          if (!res.ok) throw new Error("Monitor service not running");
          const data = await res.json();
          return NextResponse.json({ success: true, data });
        } catch (err: any) {
          return NextResponse.json({ success: false, error: "Health monitor service not running. Start it from System → Services." });
        }
      }

      case "health-monitor-start": {
        try {
          const res = await fetch("http://127.0.0.1:3006/api/control", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "start" }),
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) throw new Error("Failed to start monitor");
          const data = await res.json();
          await auditLog(request, "CONFIG_CHANGE", "MultiWAN", "health-monitor", { action: "start" });
          return NextResponse.json({ success: true, data });
        } catch (err: any) {
          return NextResponse.json({ error: "Failed to start health monitor service" }, { status: 500 });
        }
      }

      case "health-monitor-stop": {
        try {
          const res = await fetch("http://127.0.0.1:3006/api/control", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "stop" }),
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) throw new Error("Failed to stop monitor");
          const data = await res.json();
          await auditLog(request, "CONFIG_CHANGE", "MultiWAN", "health-monitor", { action: "stop" });
          return NextResponse.json({ success: true, data });
        } catch (err: any) {
          return NextResponse.json({ error: "Failed to stop health monitor service" }, { status: 500 });
        }
      }

      case "health-monitor-force-check": {
        try {
          const res = await fetch("http://127.0.0.1:3006/api/control", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "force-check" }),
            signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) throw new Error("Force check failed");
          const data = await res.json();
          return NextResponse.json({ success: true, data });
        } catch (err: any) {
          return NextResponse.json({ error: "Force check failed" }, { status: 500 });
        }
      }

      // ═══ OS-LEVEL: ENABLE HTB SHAPING ═════════════════════════════════════

      case "enable-shaping": {
        const { iface, rate, ceil } = body;
        if (!iface || !rate || !ceil) {
          return NextResponse.json({ error: "Interface, rate, and ceil are required" }, { status: 400 });
        }
        try {
          await os.setHtbQdisc(iface, rate, ceil);
          await logWanEvent(request, "CONFIG_CHANGE", iface, { action: "enable-shaping", rate, ceil }, userId);
          return NextResponse.json({ success: true, message: `HTB shaping enabled on ${iface} (rate: ${rate}, ceil: ${ceil})` });
        } catch (err: any) {
          console.error("[MultiWAN] enable-shaping error:", err);
          return NextResponse.json({ error: "Failed to enable shaping" }, { status: 500 });
        }
      }

      // ═══ OS-LEVEL: DISABLE HTB SHAPING ════════════════════════

      case "disable-shaping": {
        const { iface } = body;
        if (!iface) {
          return NextResponse.json({ error: "Interface name is required" }, { status: 400 });
        }
        try {
          await os.deleteTcQdisc(iface);
          await logWanEvent(request, "CONFIG_CHANGE", iface, { action: "disable-shaping" }, userId);
          return NextResponse.json({ success: true, message: `HTB shaping disabled on ${iface}` });
        } catch (err: any) {
          console.error("[MultiWAN] disable-shaping error:", err);
          return NextResponse.json({ error: "Failed to disable shaping" }, { status: 500 });
        }
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Multi-WAN POST error:", error);
    return NextResponse.json({ error: "Failed to process Multi-WAN request" }, { status: 500 });
  }
}
