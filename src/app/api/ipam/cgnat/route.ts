import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── Helper: Convert IP to 32-bit integer ─────────────────────────────────

function ipToLong(ip: string): number {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return 0;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function longToIp(num: number): string {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255,
  ].join(".");
}

function isValidIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    const n = parseInt(p, 10);
    return !isNaN(n) && n >= 0 && n <= 255 && String(n) === p;
  });
}

// ─── Helper: Calculate pool IP count and port capacity ────────────────────

function calculatePoolCapacity(pool: {
  startIp: string;
  endIp: string;
  portBlockSize: number;
  portRangeStart: number;
  portRangeEnd: number;
}): { totalIps: number; portsPerIp: number; totalBlocks: number } {
  const start = ipToLong(pool.startIp);
  const end = ipToLong(pool.endIp);
  const totalIps = Math.max(0, end - start + 1);
  const portsPerIp = Math.max(0, pool.portRangeEnd - pool.portRangeStart + 1);
  const blocksPerIp = Math.max(0, Math.floor(portsPerIp / pool.portBlockSize));
  const totalBlocks = totalIps * blocksPerIp;
  return { totalIps, portsPerIp, totalBlocks };
}

// ─── GET: Fetch CGNAT data ───────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode }
        );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "";

    // ── Action: pools ─────────────────────────────────────────────────
    if (action === "pools") {
      const pools = await db.cgnatPool.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { CgnatMapping: true, Subnet: true } },
        },
      });

      const enriched = pools.map((pool) => {
        const { totalIps, portsPerIp, totalBlocks } =
          calculatePoolCapacity(pool);
        const activeMappings =
          pool._count.mappings; // We also track via activeMappings field
        const portUtilization =
          totalBlocks > 0
            ? Math.round((activeMappings / totalBlocks) * 10000) / 100
            : 0;

        return {
          id: pool.id,
          name: pool.name,
          description: pool.description,
          poolType: pool.poolType,
          startIp: pool.startIp,
          endIp: pool.endIp,
          portBlockSize: pool.portBlockSize,
          portRangeStart: pool.portRangeStart,
          portRangeEnd: pool.portRangeEnd,
          activeMappings: pool.activeMappings,
          maxMappings: pool.maxMappings,
          healthCheckIp: pool.healthCheckIp,
          enabled: pool.enabled,
          createdAt: pool.createdAt,
          updatedAt: pool.updatedAt,
          // Computed
          totalIps,
          portsPerIp,
          totalCapacity: totalBlocks,
          portUtilization,
          linkedSubnets: pool._count.subnets,
          linkedMappings: pool._count.mappings,
        };
      });

      return NextResponse.json({ pools: enriched });
    }

    // ── Action: mappings ──────────────────────────────────────────────
    if (action === "mappings") {
      const poolId = searchParams.get("poolId") || undefined;
      const subnetId = searchParams.get("subnetId") || undefined;
      const isActiveParam = searchParams.get("isActive");
      const subscriberId = searchParams.get("subscriberId") || undefined;
      const page = parseInt(searchParams.get("page") || "1", 10);
      const limit = parseInt(searchParams.get("limit") || "50", 10);

      const where: Record<string, unknown> = {};
      if (poolId) where.cgnatPoolId = poolId;
      if (subnetId) where.subnetId = subnetId;
      if (subscriberId) where.subscriberId = subscriberId;
      if (isActiveParam !== null && isActiveParam !== "") {
        where.isActive = isActiveParam === "true";
      }

      const [mappings, total] = await Promise.all([
        db.cgnatMapping.findMany({
          where: Object.keys(where).length > 0 ? where : undefined,
          include: {
            cgnatPool: {
              select: {
                id: true,
                name: true,
                poolType: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.cgnatMapping.count({
          where: Object.keys(where).length > 0 ? where : undefined,
        }),
      ]);

      const enriched = mappings.map((m) => ({
        id: m.id,
        cgnatPoolId: m.cgnatPoolId,
        poolName: m.cgnatPool?.name || null,
        poolType: m.cgnatPool?.poolType || null,
        mappingType: m.mappingType,
        internalIp: m.internalIp,
        internalPort: m.internalPort,
        externalIp: m.externalIp,
        externalPort: m.externalPort,
        portBlockCount: m.portBlockCount,
        subscriberId: m.subscriberId,
        subnetId: m.subnetId,
        protocol: m.protocol,
        sessionId: m.sessionId,
        isActive: m.isActive,
        lastUsedAt: m.lastUsedAt?.toISOString() || null,
        expiresAt: m.expiresAt?.toISOString() || null,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      }));

      return NextResponse.json({
        mappings: enriched,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    }

    // ── Action: stats ─────────────────────────────────────────────────
    if (action === "stats") {
      const [pools, activeMappingCount, totalMappingCount] = await Promise.all(
        [
          db.cgnatPool.findMany(),
          db.cgnatMapping.count({ where: { isActive: true } }),
          db.cgnatMapping.count(),
        ]
      );

      // Aggregate pool-level stats
      let totalCapacity = 0;
      let totalActiveMappings = 0;
      const poolStats = pools.map((pool) => {
        const { totalIps, portsPerIp, totalBlocks } =
          calculatePoolCapacity(pool);
        totalCapacity += totalBlocks;
        totalActiveMappings += pool.activeMappings;

        return {
          id: pool.id,
          name: pool.name,
          poolType: pool.poolType,
          enabled: pool.enabled,
          totalIps,
          portsPerIp,
          totalCapacity: totalBlocks,
          activeMappings: pool.activeMappings,
          maxMappings: pool.maxMappings,
          utilization:
            totalBlocks > 0
              ? Math.round(
                  (pool.activeMappings / totalBlocks) * 10000
                ) / 100
              : 0,
        };
      });

      const overallUtilization =
        totalCapacity > 0
          ? Math.round((totalActiveMappings / totalCapacity) * 10000) / 100
          : 0;

      return NextResponse.json({
        totalPools: pools.length,
        enabledPools: pools.filter((p) => p.enabled).length,
        activeMappings: activeMappingCount,
        totalMappings: totalMappingCount,
        totalCapacity,
        overallUtilization,
        poolStats,
      });
    }

    // ── Action: wan-interfaces ────────────────────────────────────────
    if (action === "wan-interfaces") {
      const deviceInterfaces = await db.deviceInterface.findMany({
        include: {
          device: {
            select: {
              id: true,
              name: true,
              ipAddress: true,
              type: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      // Transform: return all device interfaces with parent device info
      // Frontend can filter by name patterns (eth0, wan, pppoe, etc.)
      const wanInterfaces = deviceInterfaces.map((iface) => ({
        id: iface.id,
        name: iface.name,
        description: iface.description,
        type: iface.type,
        status: iface.status,
        speed: iface.speed,
        macAddress: iface.macAddress,
        deviceId: iface.deviceId,
        deviceName: iface.device?.name || "Unknown",
        deviceIp: iface.device?.ipAddress || "",
        deviceType: iface.device?.type || "",
        deviceStatus: iface.device?.status || "",
      }));

      return NextResponse.json({ wanInterfaces });
    }

    return NextResponse.json({ error: "Unknown action. Use: pools, mappings, stats, wan-interfaces" }, { status: 400 });
  } catch (error) {
    console.error("[CGNAT API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch CGNAT data: " + String(error) },
      { status: 500 }
    );
  }
}

// ─── POST: Mutate CGNAT data ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode }
        );
    }

    const body = await request.json();
    const { action } = body;

    // ── Action: create-pool ───────────────────────────────────────────
    if (action === "create-pool") {
      const {
        name,
        description,
        poolType,
        startIp,
        endIp,
        portBlockSize,
        portRangeStart,
        portRangeEnd,
        maxMappings,
        healthCheckIp,
        enabled,
      } = body;

      if (!name || !startIp || !endIp) {
        return NextResponse.json(
          { error: "name, startIp, and endIp are required" },
          { status: 400 }
        );
      }

      if (!isValidIPv4(startIp)) {
        return NextResponse.json(
          { error: "Invalid startIp: must be a valid IPv4 address" },
          { status: 400 }
        );
      }
      if (!isValidIPv4(endIp)) {
        return NextResponse.json(
          { error: "Invalid endIp: must be a valid IPv4 address" },
          { status: 400 }
        );
      }
      if (ipToLong(endIp) < ipToLong(startIp)) {
        return NextResponse.json(
          { error: "endIp must be >= startIp" },
          { status: 400 }
        );
      }

      const validPoolTypes = ["SNAT_POOL", "ROUND_ROBIN"];
      const resolvedPoolType = poolType || "SNAT_POOL";
      if (!validPoolTypes.includes(resolvedPoolType)) {
        return NextResponse.json(
          { error: `poolType must be one of: ${validPoolTypes.join(", ")}` },
          { status: 400 }
        );
      }

      const resolvedPortBlockSize = portBlockSize || 512;
      const resolvedPortRangeStart = portRangeStart || 1024;
      const resolvedPortRangeEnd = portRangeEnd || 65535;

      if (resolvedPortBlockSize < 1 || resolvedPortBlockSize > 65535) {
        return NextResponse.json(
          { error: "portBlockSize must be between 1 and 65535" },
          { status: 400 }
        );
      }
      if (
        resolvedPortRangeStart < 1 ||
        resolvedPortRangeEnd > 65535 ||
        resolvedPortRangeEnd <= resolvedPortRangeStart
      ) {
        return NextResponse.json(
          { error: "portRange must be valid (start < end, 1-65535)" },
          { status: 400 }
        );
      }

      const pool = await db.cgnatPool.create({
        data: {
          name,
          description: description || "",
          poolType: resolvedPoolType,
          startIp,
          endIp,
          portBlockSize: resolvedPortBlockSize,
          portRangeStart: resolvedPortRangeStart,
          portRangeEnd: resolvedPortRangeEnd,
          maxMappings: maxMappings != null ? Number(maxMappings) : 0,
          healthCheckIp: healthCheckIp || "",
          enabled: enabled !== false,
        },
      });

      return NextResponse.json({ success: true, data: pool });
    }

    // ── Action: update-pool ───────────────────────────────────────────
    if (action === "update-pool") {
      const { id, ...updateData } = body;
      if (!id) {
        return NextResponse.json(
          { error: "Pool ID is required" },
          { status: 400 }
        );
      }

      const existing = await db.cgnatPool.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json(
          { error: "CGNAT pool not found" },
          { status: 404 }
        );
      }

      // Validate IP changes
      if (updateData.startIp && !isValidIPv4(updateData.startIp)) {
        return NextResponse.json(
          { error: "Invalid startIp" },
          { status: 400 }
        );
      }
      if (updateData.endIp && !isValidIPv4(updateData.endIp)) {
        return NextResponse.json(
          { error: "Invalid endIp" },
          { status: 400 }
        );
      }
      if (
        updateData.startIp &&
        updateData.endIp &&
        ipToLong(updateData.endIp) < ipToLong(updateData.startIp)
      ) {
        return NextResponse.json(
          { error: "endIp must be >= startIp" },
          { status: 400 }
        );
      }

      if (updateData.poolType) {
        const validPoolTypes = ["SNAT_POOL", "ROUND_ROBIN"];
        if (!validPoolTypes.includes(updateData.poolType)) {
          return NextResponse.json(
            { error: `poolType must be one of: ${validPoolTypes.join(", ")}` },
            { status: 400 }
          );
        }
      }

      // Build update object
      const data: Record<string, unknown> = {};
      if (updateData.name !== undefined) data.name = updateData.name;
      if (updateData.description !== undefined)
        data.description = updateData.description;
      if (updateData.poolType !== undefined) data.poolType = updateData.poolType;
      if (updateData.startIp !== undefined) data.startIp = updateData.startIp;
      if (updateData.endIp !== undefined) data.endIp = updateData.endIp;
      if (updateData.portBlockSize !== undefined)
        data.portBlockSize = Number(updateData.portBlockSize);
      if (updateData.portRangeStart !== undefined)
        data.portRangeStart = Number(updateData.portRangeStart);
      if (updateData.portRangeEnd !== undefined)
        data.portRangeEnd = Number(updateData.portRangeEnd);
      if (updateData.maxMappings !== undefined)
        data.maxMappings = Number(updateData.maxMappings);
      if (updateData.healthCheckIp !== undefined)
        data.healthCheckIp = updateData.healthCheckIp;
      if (updateData.enabled !== undefined) data.enabled = !!updateData.enabled;

      const updated = await db.cgnatPool.update({
        where: { id },
        data,
      });

      return NextResponse.json({ success: true, data: updated });
    }

    // ── Action: delete-pool ───────────────────────────────────────────
    if (action === "delete-pool") {
      const { id } = body;
      if (!id) {
        return NextResponse.json(
          { error: "Pool ID is required" },
          { status: 400 }
        );
      }

      const existing = await db.cgnatPool.findUnique({
        where: { id },
        include: {
          _count: { select: { CgnatMapping: true, Subnet: true } },
        },
      });
      if (!existing) {
        return NextResponse.json(
          { error: "CGNAT pool not found" },
          { status: 404 }
        );
      }

      // Cascade: delete all mappings, then null out subnet references
      await db.$transaction([
        // Delete all mappings belonging to this pool
        db.cgnatMapping.deleteMany({ where: { cgnatPoolId: id } }),
        // Null out cgnatPoolId on linked subnets
        db.subnet.updateMany({
          where: { cgnatPoolId: id },
          data: { cgnatPoolId: null },
        }),
        // Delete the pool
        db.cgnatPool.delete({ where: { id } }),
      ]);

      return NextResponse.json({
        success: true,
        message: "Pool deleted with cascaded mappings and subnet references cleared",
        deletedMappings: existing._count.mappings,
        unlinkedSubnets: existing._count.subnets,
      });
    }

    // ── Action: create-mapping ────────────────────────────────────────
    if (action === "create-mapping") {
      const {
        cgnatPoolId,
        mappingType,
        internalIp,
        internalPort,
        externalIp,
        externalPort,
        portBlockCount,
        subscriberId,
        subnetId,
        protocol,
        sessionId,
      } = body;

      if (!internalIp) {
        return NextResponse.json(
          { error: "internalIp is required" },
          { status: 400 }
        );
      }
      if (!externalIp) {
        return NextResponse.json(
          { error: "externalIp is required" },
          { status: 400 }
        );
      }

      const validMappingTypes = ["SNAT", "DNAT", "ONE_TO_ONE"];
      const resolvedMappingType = mappingType || "SNAT";
      if (!validMappingTypes.includes(resolvedMappingType)) {
        return NextResponse.json(
          { error: `mappingType must be one of: ${validMappingTypes.join(", ")}` },
          { status: 400 }
        );
      }

      const validProtocols = ["ALL", "TCP", "UDP"];
      const resolvedProtocol = protocol || "ALL";
      if (!validProtocols.includes(resolvedProtocol)) {
        return NextResponse.json(
          { error: `protocol must be one of: ${validProtocols.join(", ")}` },
          { status: 400 }
        );
      }

      // Validate pool exists if cgnatPoolId is provided
      if (cgnatPoolId) {
        const pool = await db.cgnatPool.findUnique({
          where: { id: cgnatPoolId },
        });
        if (!pool) {
          return NextResponse.json(
            { error: "CGNAT pool not found" },
            { status: 404 }
          );
        }

        // Check pool capacity
        if (pool.maxMappings > 0 && pool.activeMappings >= pool.maxMappings) {
          return NextResponse.json(
            {
              error: `Pool "${pool.name}" has reached its maximum capacity of ${pool.maxMappings} mappings`,
            },
            { status: 400 }
          );
        }
      }

      const mapping = await db.cgnatMapping.create({
        data: {
          cgnatPoolId: cgnatPoolId || null,
          mappingType: resolvedMappingType,
          internalIp,
          internalPort: Number(internalPort) || 0,
          externalIp,
          externalPort: Number(externalPort) || 0,
          portBlockCount: Number(portBlockCount) || 0,
          subscriberId: subscriberId || null,
          subnetId: subnetId || null,
          protocol: resolvedProtocol,
          sessionId: sessionId || "",
          isActive: true,
        },
      });

      // Increment pool active mappings if linked
      if (cgnatPoolId) {
        await db.cgnatPool.update({
          where: { id: cgnatPoolId },
          data: { activeMappings: { increment: 1 } },
        });
      }

      return NextResponse.json({ success: true, data: mapping });
    }

    // ── Action: delete-mapping ────────────────────────────────────────
    if (action === "delete-mapping") {
      const { id } = body;
      if (!id) {
        return NextResponse.json(
          { error: "Mapping ID is required" },
          { status: 400 }
        );
      }

      const mapping = await db.cgnatMapping.findUnique({ where: { id } });
      if (!mapping) {
        return NextResponse.json(
          { error: "CGNAT mapping not found" },
          { status: 404 }
        );
      }

      await db.cgnatMapping.delete({ where: { id } });

      // Decrement pool active mappings if was active and linked
      if (mapping.cgnatPoolId && mapping.isActive) {
        await db.cgnatPool.update({
          where: { id: mapping.cgnatPoolId },
          data: { activeMappings: { decrement: 1 } },
        });
      }

      return NextResponse.json({ success: true, message: "Mapping deleted" });
    }

    // ── Action: allocate-ports ────────────────────────────────────────
    if (action === "allocate-ports") {
      const {
        poolId,
        internalIp,
        subscriberId,
        subnetId,
        protocol,
        portBlockCount,
      } = body;

      if (!poolId) {
        return NextResponse.json(
          { error: "poolId is required" },
          { status: 400 }
        );
      }
      if (!internalIp) {
        return NextResponse.json(
          { error: "internalIp is required" },
          { status: 400 }
        );
      }

      const pool = await db.cgnatPool.findUnique({ where: { id: poolId } });
      if (!pool) {
        return NextResponse.json(
          { error: "CGNAT pool not found" },
          { status: 404 }
        );
      }

      if (!pool.enabled) {
        return NextResponse.json(
          { error: `Pool "${pool.name}" is disabled` },
          { status: 400 }
        );
      }

      // Check capacity
      if (pool.maxMappings > 0 && pool.activeMappings >= pool.maxMappings) {
        return NextResponse.json(
          {
            error: `Pool "${pool.name}" has reached its maximum capacity of ${pool.maxMappings} mappings`,
          },
          { status: 400 }
        );
      }

      const resolvedPortBlockSize = portBlockCount || pool.portBlockSize;
      const { totalIps, portsPerIp, totalBlocks } = calculatePoolCapacity(pool);

      if (totalBlocks === 0) {
        return NextResponse.json(
          { error: "Pool has no available port blocks (invalid IP range or port configuration)" },
          { status: 400 }
        );
      }

      // Find existing active mappings for this pool to determine used blocks
      const existingMappings = await db.cgnatMapping.findMany({
        where: { cgnatPoolId: poolId, isActive: true },
        select: {
          externalIp: true,
          externalPort: true,
          portBlockCount: true,
        },
      });

      // Build set of used (externalIp, startPort) pairs
      const usedBlocks = new Set<string>();
      for (const m of existingMappings) {
        usedBlocks.add(`${m.externalIp}:${m.externalPort}`);
      }

      // Find the next available port block (round-robin across IPs)
      let allocatedIp = "";
      let allocatedPort = 0;

      const startLong = ipToLong(pool.startIp);
      const endLong = ipToLong(pool.endIp);

      for (let ipOffset = 0; ipOffset < totalIps; ipOffset++) {
        // Round-robin: start from a different IP each time based on activeMappings
        const currentIndex = (pool.activeMappings + ipOffset) % totalIps;
        const candidateIp = longToIp(startLong + currentIndex);

        for (
          let port = pool.portRangeStart;
          port + resolvedPortBlockSize - 1 <= pool.portRangeEnd;
          port += resolvedPortBlockSize
        ) {
          const blockKey = `${candidateIp}:${port}`;
          if (!usedBlocks.has(blockKey)) {
            allocatedIp = candidateIp;
            allocatedPort = port;
            break;
          }
        }
        if (allocatedIp) break;
      }

      if (!allocatedIp) {
        return NextResponse.json(
          {
            error: `No available port blocks in pool "${pool.name}". All ${totalBlocks} blocks are in use.`,
          },
          { status: 400 }
        );
      }

      // Create the mapping
      const mapping = await db.cgnatMapping.create({
        data: {
          cgnatPoolId: poolId,
          mappingType: pool.poolType === "ROUND_ROBIN" ? "SNAT" : "SNAT",
          internalIp,
          internalPort: 0,
          externalIp: allocatedIp,
          externalPort: allocatedPort,
          portBlockCount: resolvedPortBlockSize,
          subscriberId: subscriberId || null,
          subnetId: subnetId || null,
          protocol: protocol || "ALL",
          sessionId: "",
          isActive: true,
          lastUsedAt: new Date(),
        },
      });

      // Increment pool active mappings
      await db.cgnatPool.update({
        where: { id: poolId },
        data: { activeMappings: { increment: 1 } },
      });

      return NextResponse.json({
        success: true,
        data: mapping,
        allocated: {
          externalIp: allocatedIp,
          portRangeStart: allocatedPort,
          portRangeEnd: allocatedPort + resolvedPortBlockSize - 1,
          portBlockSize: resolvedPortBlockSize,
          protocol: protocol || "ALL",
        },
      });
    }

    // ── Action: release-ports ─────────────────────────────────────────
    if (action === "release-ports") {
      const { mappingId, subscriberId: subId } = body;

      // Find by mapping ID or by subscriber ID
      let mappings;

      if (mappingId) {
        const mapping = await db.cgnatMapping.findUnique({
          where: { id: mappingId },
        });
        if (!mapping) {
          return NextResponse.json(
            { error: "CGNAT mapping not found" },
            { status: 404 }
          );
        }
        mappings = [mapping];
      } else if (subId) {
        mappings = await db.cgnatMapping.findMany({
          where: { subscriberId: subId, isActive: true },
        });
        if (mappings.length === 0) {
          return NextResponse.json(
            { error: "No active mappings found for this subscriber" },
            { status: 404 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "mappingId or subscriberId is required" },
          { status: 400 }
        );
      }

      let releasedCount = 0;
      const poolUpdateMap = new Map<string, number>(); // poolId -> decrement count

      for (const mapping of mappings) {
        if (!mapping.isActive) continue;

        await db.cgnatMapping.update({
          where: { id: mapping.id },
          data: {
            isActive: false,
            lastUsedAt: new Date(),
          },
        });

        if (mapping.cgnatPoolId) {
          const current = poolUpdateMap.get(mapping.cgnatPoolId) || 0;
          poolUpdateMap.set(mapping.cgnatPoolId, current + 1);
        }
        releasedCount++;
      }

      // Batch update pool active mappings
      for (const [poolId, decrement] of poolUpdateMap) {
        await db.cgnatPool.update({
          where: { id: poolId },
          data: { activeMappings: { decrement } },
        });
      }

      return NextResponse.json({
        success: true,
        releasedCount,
        message: `${releasedCount} port block(s) released`,
      });
    }

    // ── Action: bulk-allocate ─────────────────────────────────────────
    if (action === "bulk-allocate") {
      const { poolId, allocations } = body;

      if (!poolId) {
        return NextResponse.json(
          { error: "poolId is required" },
          { status: 400 }
        );
      }
      if (!Array.isArray(allocations) || allocations.length === 0) {
        return NextResponse.json(
          { error: "allocations must be a non-empty array of { internalIp, subscriberId?, subnetId?, protocol? }" },
          { status: 400 }
        );
      }

      const pool = await db.cgnatPool.findUnique({ where: { id: poolId } });
      if (!pool) {
        return NextResponse.json(
          { error: "CGNAT pool not found" },
          { status: 404 }
        );
      }

      if (!pool.enabled) {
        return NextResponse.json(
          { error: `Pool "${pool.name}" is disabled` },
          { status: 400 }
        );
      }

      // Check capacity for bulk
      const effectiveMax =
        pool.maxMappings > 0
          ? pool.maxMappings - pool.activeMappings
          : Infinity;
      if (allocations.length > effectiveMax) {
        return NextResponse.json(
          {
            error: `Pool can only accept ${effectiveMax} more mappings. Requested ${allocations.length}.`,
          },
          { status: 400 }
        );
      }

      const { totalIps, portsPerIp, totalBlocks } = calculatePoolCapacity(pool);

      if (totalBlocks === 0) {
        return NextResponse.json(
          { error: "Pool has no available port blocks" },
          { status: 400 }
        );
      }

      // Get all existing active mappings to avoid conflicts
      const existingMappings = await db.cgnatMapping.findMany({
        where: { cgnatPoolId: poolId, isActive: true },
        select: {
          externalIp: true,
          externalPort: true,
        },
      });

      const usedBlocks = new Set<string>();
      for (const m of existingMappings) {
        usedBlocks.add(`${m.externalIp}:${m.externalPort}`);
      }

      const startLong = ipToLong(pool.startIp);
      const results: Array<{
        internalIp: string;
        externalIp: string;
        portRangeStart: number;
        portRangeEnd: number;
        success: boolean;
        error?: string;
      }> = [];

      const mappingsToCreate: Array<{
        cgnatPoolId: string;
        mappingType: string;
        internalIp: string;
        internalPort: number;
        externalIp: string;
        externalPort: number;
        portBlockCount: number;
        subscriberId: string | null;
        subnetId: string | null;
        protocol: string;
        sessionId: string;
        isActive: boolean;
        lastUsedAt: Date;
      }> = [];

      for (const alloc of allocations) {
        const { internalIp, subscriberId, subnetId, protocol } = alloc;

        if (!internalIp) {
          results.push({
            internalIp: "(missing)",
            externalIp: "",
            portRangeStart: 0,
            portRangeEnd: 0,
            success: false,
            error: "internalIp is required",
          });
          continue;
        }

        // Find next available block
        let allocatedIp = "";
        let allocatedPort = 0;

        for (let ipOffset = 0; ipOffset < totalIps; ipOffset++) {
          // Use a hash of internalIp for round-robin distribution
          const ipHash =
            Array.from(internalIp).reduce((a, c) => a + c.charCodeAt(0), 0);
          const currentIndex =
            (pool.activeMappings + ipOffset + ipHash + results.length) %
            totalIps;
          const candidateIp = longToIp(startLong + currentIndex);

          for (
            let port = pool.portRangeStart;
            port + pool.portBlockSize - 1 <= pool.portRangeEnd;
            port += pool.portBlockSize
          ) {
            const blockKey = `${candidateIp}:${port}`;
            if (!usedBlocks.has(blockKey)) {
              allocatedIp = candidateIp;
              allocatedPort = port;
              break;
            }
          }
          if (allocatedIp) break;
        }

        if (!allocatedIp) {
          results.push({
            internalIp,
            externalIp: "",
            portRangeStart: 0,
            portRangeEnd: 0,
            success: false,
            error: "No available port blocks",
          });
          continue;
        }

        usedBlocks.add(`${allocatedIp}:${allocatedPort}`);

        mappingsToCreate.push({
          cgnatPoolId: poolId,
          mappingType: "SNAT",
          internalIp,
          internalPort: 0,
          externalIp: allocatedIp,
          externalPort: allocatedPort,
          portBlockCount: pool.portBlockSize,
          subscriberId: subscriberId || null,
          subnetId: subnetId || null,
          protocol: protocol || "ALL",
          sessionId: "",
          isActive: true,
          lastUsedAt: new Date(),
        });

        results.push({
          internalIp,
          externalIp: allocatedIp,
          portRangeStart: allocatedPort,
          portRangeEnd: allocatedPort + pool.portBlockSize - 1,
          success: true,
        });
      }

      // Batch create all mappings
      if (mappingsToCreate.length > 0) {
        await db.cgnatMapping.createMany({ data: mappingsToCreate });

        // Update pool active mappings count
        await db.cgnatPool.update({
          where: { id: poolId },
          data: { activeMappings: { increment: mappingsToCreate.length } },
        });
      }

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;

      return NextResponse.json({
        success: true,
        totalRequested: allocations.length,
        allocated: successCount,
        failed: failCount,
        results,
        message: `Bulk allocation complete: ${successCount} allocated, ${failCount} failed`,
      });
    }

    return NextResponse.json(
      {
        error:
          "Unknown action. Use: create-pool, update-pool, delete-pool, create-mapping, delete-mapping, allocate-ports, release-ports, bulk-allocate",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("[CGNAT API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to process CGNAT request: " + String(error) },
      { status: 500 }
    );
  }
}
