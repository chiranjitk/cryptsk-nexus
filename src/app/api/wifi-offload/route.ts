import { db } from "@/lib/db";

// ─── GET: List offload data (dashboard, peers, policies, sessions, events) ────
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "dashboard";

    switch (type) {
      // ── Dashboard stats ──
      case "dashboard": {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const [totalPeers, totalPolicies, totalSessions, activeSessions, totalEvents, totalSessionsToday, peers, recentSessions] =
          await Promise.all([
            db.wifiOffloadPeer.count(),
            db.wifiOffloadPolicy.count({ where: { isActive: true } }),
            db.wifiOffloadSession.count(),
            db.wifiOffloadSession.count({ where: { status: "ACTIVE" } }),
            db.wifiOffloadEvent.count(),
            db.wifiOffloadSession.count({ where: { startTime: { gte: todayStart } } }),
            db.wifiOffloadPeer.findMany({ select: { id: true, peerName: true, status: true, peerType: true, isConnected: true }, orderBy: { createdAt: "desc" } }),
            db.wifiOffloadSession.findMany({ where: { status: "ACTIVE" }, orderBy: { startTime: "desc" }, take: 10 }),
          ]);

        // Aggregate bandwidth usage (all-time)
        const bandwidthAgg = await db.wifiOffloadSession.aggregate({
          _sum: { usedDownMb: true, usedUpMb: true, chargedAmount: true },
        });

        const totalUsedDown = Number(bandwidthAgg._sum.usedDownMb || 0);
        const totalUsedUp = Number(bandwidthAgg._sum.usedUpMb || 0);
        const totalRevenue = Number(bandwidthAgg._sum.chargedAmount || 0);

        // Average speed from today's sessions
        const speedAgg = await db.wifiOffloadSession.aggregate({
          _avg: { speedDownKbps: true, speedUpKbps: true },
          where: { startTime: { gte: todayStart } },
        });

        const avgSpeedKbps = ((speedAgg._avg.speedDownKbps || 0) + (speedAgg._avg.speedUpKbps || 0)) / 2;

        // Connected peers count
        const connectedPeers = peers.filter((p) => p.isConnected).length;

        return Response.json({
          totalPeers,
          connectedPeers,
          disconnectedPeers: totalPeers - connectedPeers,
          totalPolicies,
          totalSessions,
          activeSessions,
          completedSessions: totalSessions - activeSessions,
          totalEvents,
          totalBandwidthUsedMb: Math.round((totalUsedDown + totalUsedUp) * 100) / 100,
          downloadUsedMb: Math.round(totalUsedDown * 100) / 100,
          uploadUsedMb: Math.round(totalUsedUp * 100) / 100,
          // Fields expected by frontend DashboardStats
          totalSessionsToday,
          peakConcurrent: activeSessions, // simplified: use current active as peak proxy
          totalDataGB: Math.round((totalUsedDown + totalUsedUp) / 1024 * 100) / 100,
          avgSpeedMbps: Math.round((avgSpeedKbps / 1000) * 100) / 100,
          revenue: Math.round(totalRevenue * 100) / 100,
          peers,
          recentSessions,
        });
      }

      // ── List peers ──
      case "peers": {
        const peers = await db.wifiOffloadPeer.findMany({
          orderBy: { createdAt: "desc" },
        });
        // Map DB fields to frontend-expected fields
        const mapped = peers.map((p) => ({
          id: p.id,
          name: p.peerName,
          type: p.peerType,
          host: p.host,
          port: p.port,
          realm: p.realm || undefined,
          priority: p.priority,
          status: p.status,
          isSimulator: p.isSimulator,
          messagesIn: p.messagesIn,
          messagesOut: p.messagesOut,
          lastPing: p.lastPingAt?.toISOString(),
          createdAt: p.createdAt.toISOString(),
        }));
        return Response.json({ peers: mapped, total: mapped.length });
      }

      // ── List policies ──
      case "policies": {
        const policies = await db.wifiOffloadPolicy.findMany({
          orderBy: { createdAt: "desc" },
        });
        // Map DB fields to frontend-expected fields
        const mapped = policies.map((p) => ({
          id: p.id,
          name: p.name,
          imsiPrefix: p.imsiPrefix || "",
          speedDown: p.defaultSpeedDownKbps,
          speedUp: p.defaultSpeedUpKbps,
          dataLimitGB: p.dataLimitMb ? Math.round(p.dataLimitMb / 1024 * 100) / 100 : 0,
          sessionTimeout: p.sessionTimeoutSec,
          fupSpeedDown: p.fupSpeedDownKbps,
          fupSpeedUp: p.fupSpeedUpKbps,
          active: p.isActive,
          description: p.description || undefined,
        }));
        return Response.json({ policies: mapped, total: mapped.length });
      }

      // ── List sessions (with filtering, search, pagination) ──
      case "sessions": {
        const status = searchParams.get("status");
        const search = searchParams.get("search") || "";
        const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
        const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
        const skip = (page - 1) * limit;

        const where: Record<string, unknown> = {};
        if (status && status !== "ALL") where.status = status;
        if (search) {
          where.OR = [
            { imsi: { contains: search } },
            { msisdn: { contains: search } },
            { macAddress: { contains: search } },
            { sessionId: { contains: search } },
          ];
        }

        const [sessions, total] = await Promise.all([
          db.wifiOffloadSession.findMany({
            where,
            orderBy: { startTime: "desc" },
            skip,
            take: limit,
          }),
          db.wifiOffloadSession.count({ where }),
        ]);

        // Map DB fields to frontend-expected fields
        const mapped = sessions.map((s) => ({
          id: s.id,
          sessionId: s.sessionId,
          imsi: s.imsi,
          msisdn: s.msisdn,
          mac: s.macAddress,
          apName: s.apName,
          method: s.loginMethod,
          downloadBytes: s.usedDownMb * 1024 * 1024, // MB → bytes
          uploadBytes: s.usedUpMb * 1024 * 1024,
          duration: s.usedTimeSec * 1000, // seconds → ms
          speedDown: s.speedDownKbps,
          speedUp: s.speedUpKbps,
          status: s.status,
          startTime: s.startTime.toISOString(),
          policyId: s.planId,
          ipAddress: s.ipAddress,
          qosDown: s.speedDownKbps,
          qosUp: s.speedUpKbps,
        }));

        return Response.json({
          sessions: mapped,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        });
      }

      // ── List events (with filtering, pagination) ──
      case "events": {
        const interfaceType = searchParams.get("interface");
        const direction = searchParams.get("direction");
        const statusCodeStr = searchParams.get("statusCode");
        const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
        const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
        const skip = (page - 1) * limit;

        const where: Record<string, unknown> = {};
        if (interfaceType) where.interfaceType = interfaceType;
        if (direction && direction !== "ALL") where.direction = direction;
        if (statusCodeStr) where.statusCode = parseInt(statusCodeStr, 10);

        const [events, total] = await Promise.all([
          db.wifiOffloadEvent.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
          }),
          db.wifiOffloadEvent.count({ where }),
        ]);

        // Map DB fields to frontend-expected fields
        const mapped = events.map((e) => {
          let parsed: Record<string, unknown> = {};
          try { parsed = typeof e.details === "string" ? JSON.parse(e.details) : e.details; } catch {}
          return {
            id: e.id,
            timestamp: e.createdAt.toISOString(),
            interface: e.interfaceType,
            direction: e.direction,
            sessionId: e.sessionId || undefined,
            statusCode: e.statusCode,
            details: typeof e.details === "string" ? e.details : JSON.stringify(e.details),
            ccRequestType: parsed.ccRequestType,
            ccResultCode: parsed.ccResultCode,
            grantedUnits: parsed.grantedUnits,
            usedUnits: parsed.usedUnits,
            qosChange: parsed.qosChange,
          };
        });

        return Response.json({
          events: mapped,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        });
      }

      // ── Event statistics ──
      case "event-stats": {
        const eventCounts = await db.wifiOffloadEvent.groupBy({
          by: ["eventType"],
          _count: { id: true },
          orderBy: { _count: { id: "desc" } },
        });

        const interfaceCounts = await db.wifiOffloadEvent.groupBy({
          by: ["interfaceType"],
          _count: { id: true },
        });

        const directionCounts = await db.wifiOffloadEvent.groupBy({
          by: ["direction"],
          _count: { id: true },
        });

        const statusCounts = await db.wifiOffloadEvent.groupBy({
          by: ["statusCode"],
          _count: { id: true },
          orderBy: { _count: { id: "desc" } },
          take: 10,
        });

        const totalEvents = await db.wifiOffloadEvent.count();

        // Compute success/failure counts (Diameter success = 2001, 3001, etc.)
        const successStatuses = await db.wifiOffloadEvent.count({
          where: { statusCode: { in: [2001, 3001, 2002, 3002, 0] } },
        });
        const failureStatuses = await db.wifiOffloadEvent.count({
          where: { statusCode: { notIn: [2001, 3001, 2002, 3002, 0] } },
        });

        // Convert to Record<string, number> for frontend
        const byInterface: Record<string, number> = {};
        for (const e of interfaceCounts) byInterface[e.interfaceType] = e._count.id;

        const byDirection: Record<string, number> = {};
        for (const e of directionCounts) byDirection[e.direction] = e._count.id;

        return Response.json({
          totalEvents,
          successCount: successStatuses,
          failureCount: failureStatuses,
          byInterface,
          byDirection,
          byEventType: eventCounts.map((e) => ({ eventType: e.eventType, count: e._count.id })),
          topStatusCodes: statusCounts.map((e) => ({ statusCode: e.statusCode, count: e._count.id })),
        });
      }

      default:
        return Response.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }
  } catch (error) {
    console.error("WiFi Offload GET error:", error);
    return Response.json({ error: "Failed to fetch wifi offload data" }, { status: 500 });
  }
}

// ─── POST: Create peer, policy, or event ────
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type } = body;

    switch (type) {
      // ── Create peer ──
      case "peer": {
        const { peerName, peerType, host, port, realm, protocol, isSimulator, priority } = body;
        if (!peerName) {
          return Response.json({ error: "Peer name is required" }, { status: 400 });
        }
        const peer = await db.wifiOffloadPeer.create({
          data: {
            peerName,
            peerType: peerType || "PCRF",
            host: host || "127.0.0.1",
            port: port || 3868,
            realm: realm || "",
            protocol: protocol || "diameter",
            status: "DISCONNECTED",
            isConnected: false,
            isSimulator: isSimulator ?? true,
            priority: priority ?? 1,
          },
        });
        return Response.json({ success: true, peer });
      }

      // ── Create policy ──
      case "policy": {
        const {
          name,
          description,
          imsiPrefix,
          locationId,
          defaultSpeedDownKbps,
          defaultSpeedUpKbps,
          dataLimitMb,
          sessionTimeoutSec,
          fupSpeedDownKbps,
          fupSpeedUpKbps,
          fupThresholdMb,
          priorityLevel,
          isActive,
        } = body;
        if (!name) {
          return Response.json({ error: "Policy name is required" }, { status: 400 });
        }
        const policy = await db.wifiOffloadPolicy.create({
          data: {
            name,
            description: description || "",
            imsiPrefix: imsiPrefix || "",
            locationId: locationId || "",
            defaultSpeedDownKbps: defaultSpeedDownKbps || 5120,
            defaultSpeedUpKbps: defaultSpeedUpKbps || 2560,
            dataLimitMb: dataLimitMb ?? null,
            sessionTimeoutSec: sessionTimeoutSec || 86400,
            fupSpeedDownKbps: fupSpeedDownKbps || 1024,
            fupSpeedUpKbps: fupSpeedUpKbps || 512,
            fupThresholdMb: fupThresholdMb ?? null,
            priorityLevel: priorityLevel ?? 5,
            isActive: isActive ?? true,
          },
        });
        return Response.json({ success: true, policy });
      }

      // ── Create event ──
      case "event": {
        const { sessionId, eventType, interfaceType, direction, statusCode, details, peerName } = body;
        if (!eventType) {
          return Response.json({ error: "Event type is required" }, { status: 400 });
        }
        const event = await db.wifiOffloadEvent.create({
          data: {
            sessionId: sessionId || "",
            eventType,
            interfaceType: interfaceType || "Gy",
            direction: direction || "IN",
            statusCode: statusCode || 0,
            details: typeof details === "string" ? details : JSON.stringify(details || {}),
            peerName: peerName || "",
          },
        });
        return Response.json({ success: true, event });
      }

      default:
        return Response.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }
  } catch (error) {
    console.error("WiFi Offload POST error:", error);
    return Response.json({ error: "Failed to process wifi offload request" }, { status: 500 });
  }
}
