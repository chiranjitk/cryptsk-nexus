import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// ─── GET: Fetch IP-MAC history records ──────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "list";
    const ipAddress = searchParams.get("ipAddress") || "";
    const subscriberId = searchParams.get("subscriberId") || "";
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    switch (action) {
      // ── list: Fetch IP-MAC change history with optional filters ───────────
      case "list": {
        const where: Record<string, unknown> = {};

        if (ipAddress) {
          where.ipAddress = ipAddress;
        }
        if (subscriberId) {
          where.subscriberId = subscriberId;
        }

        const [records, total] = await Promise.all([
          db.ipMacHistory.findMany({
            where: Object.keys(where).length > 0 ? where : undefined,
            orderBy: { changedAt: "desc" },
            take: Math.min(limit, 500),
            skip: offset,
          }),
          db.ipMacHistory.count({
            where: Object.keys(where).length > 0 ? where : undefined,
          }),
        ]);

        const transformed = records.map((r) => ({
          id: r.id,
          ipAddress: r.ipAddress,
          oldMacAddress: r.oldMacAddress,
          newMacAddress: r.newMacAddress,
          subscriberId: r.subscriberId,
          source: r.source,
          changedAt: r.changedAt.toISOString(),
        }));

        return NextResponse.json({
          success: true,
          data: transformed,
          total,
          limit,
          offset,
        });
      }

      // ── ip: Get full history for a specific IP address ────────────────────
      case "ip": {
        if (!ipAddress) {
          return NextResponse.json({ error: "ipAddress is required" }, { status: 400 });
        }

        const records = await db.ipMacHistory.findMany({
          where: { ipAddress },
          orderBy: { changedAt: "desc" },
          take: Math.min(limit, 500),
          skip: offset,
          include: {
            Subscriber: {
              select: { id: true, code: true, name: true, phone: true, status: true },
            },
          },
        });

        const transformed = records.map((r) => ({
          id: r.id,
          ipAddress: r.ipAddress,
          oldMacAddress: r.oldMacAddress,
          newMacAddress: r.newMacAddress,
          subscriberId: r.subscriberId,
          subscriberCode: r.Subscriber?.code || null,
          subscriberName: r.Subscriber?.name || null,
          subscriberStatus: r.Subscriber?.status || null,
          source: r.source,
          changedAt: r.changedAt.toISOString(),
        }));

        // Determine the latest MAC for this IP
        const latestRecord = records[0];

        return NextResponse.json({
          success: true,
          data: transformed,
          ipAddress,
          currentMac: latestRecord?.newMacAddress || "",
          subscriberId: latestRecord?.subscriberId || null,
          totalChanges: records.length,
        });
      }

      // ── latest-changes: Get most recent IP-MAC changes across all IPs ─────
      case "latest-changes": {
        const hours = parseInt(searchParams.get("hours") || "24", 10);
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);

        const records = await db.ipMacHistory.findMany({
          where: {
            changedAt: { gte: since },
          },
          orderBy: { changedAt: "desc" },
          take: Math.min(limit, 500),
          include: {
            Subscriber: {
              select: { id: true, code: true, name: true, status: true },
            },
          },
        });

        const transformed = records.map((r) => ({
          id: r.id,
          ipAddress: r.ipAddress,
          oldMacAddress: r.oldMacAddress,
          newMacAddress: r.newMacAddress,
          subscriberId: r.subscriberId,
          subscriberCode: r.Subscriber?.code || null,
          subscriberName: r.Subscriber?.name || null,
          source: r.source,
          changedAt: r.changedAt.toISOString(),
        }));

        return NextResponse.json({
          success: true,
          data: transformed,
          period: `Last ${hours}h`,
          totalChanges: records.length,
        });
      }

      // ── detect-spoofing: Detect potential MAC spoofing for an IP/subscriber
      case "detect-spoofing": {
        if (!ipAddress && !subscriberId) {
          return NextResponse.json({ error: "ipAddress or subscriberId is required" }, { status: 400 });
        }

        const where: Record<string, unknown> = {};
        if (ipAddress) where.ipAddress = ipAddress;
        if (subscriberId) where.subscriberId = subscriberId;

        const records = await db.ipMacHistory.findMany({
          where,
          orderBy: { changedAt: "desc" },
          take: 100,
          include: {
            Subscriber: {
              select: { id: true, code: true, name: true, macAddress: true },
            },
          },
        });

        if (records.length < 2) {
          return NextResponse.json({
            success: true,
            data: {
              spoofingDetected: false,
              reason: "Not enough history records to detect spoofing",
              records: records.map((r) => ({
                id: r.id,
                ipAddress: r.ipAddress,
                oldMacAddress: r.oldMacAddress,
                newMacAddress: r.newMacAddress,
                source: r.source,
                changedAt: r.changedAt.toISOString(),
              })),
            },
          });
        }

        // Spoofing detection logic:
        // 1. Multiple different MAC addresses used for the same IP
        // 2. MAC changes from a non-DHCP source
        // 3. MAC doesn't match subscriber's registered MAC
        const allMacs = new Set<string>();
        let rapidChanges = 0;
        let nonDhcpChanges = 0;
        const suspiciousMacs: string[] = [];
        const registeredMac = records[0]?.Subscriber?.macAddress || "";

        for (let i = 0; i < records.length; i++) {
          const record = records[i];
          if (record.newMacAddress) allMacs.add(record.newMacAddress.toUpperCase());

          // Check for rapid changes (within 1 hour)
          if (i < records.length - 1) {
            const timeDiff = new Date(records[i].changedAt).getTime() - new Date(records[i + 1].changedAt).getTime();
            if (timeDiff < 60 * 60 * 1000) {
              rapidChanges++;
            }
          }

          // Check for non-DHCP sources
          if (record.source !== "dhcp") {
            nonDhcpChanges++;
          }

          // Check if new MAC doesn't match subscriber's registered MAC
          if (registeredMac && record.newMacAddress && record.newMacAddress.toUpperCase() !== registeredMac.toUpperCase()) {
            suspiciousMacs.push(record.newMacAddress);
          }
        }

        const uniqueMacCount = allMacs.size;
        const spoofingDetected =
          uniqueMacCount > 3 ||
          rapidChanges > 5 ||
          nonDhcpChanges > 0 ||
          suspiciousMacs.length > 0;

        const reasons: string[] = [];
        if (uniqueMacCount > 3) reasons.push(`High MAC diversity: ${uniqueMacCount} unique MACs detected for this IP`);
        if (rapidChanges > 5) reasons.push(`Rapid MAC changes: ${rapidChanges} changes within 1-hour windows`);
        if (nonDhcpChanges > 0) reasons.push(`Non-DHCP source changes: ${nonDhcpChanges} changes from non-DHCP sources`);
        if (suspiciousMacs.length > 0) reasons.push(`MAC mismatch: ${[...new Set(suspiciousMacs)].length} changes to unregistered MACs`);

        return NextResponse.json({
          success: true,
          data: {
            spoofingDetected,
            severity: spoofingDetected ? (uniqueMacCount > 5 || rapidChanges > 10 ? "HIGH" : "MEDIUM") : "LOW",
            reasons,
            uniqueMacCount,
            totalChanges: records.length,
            rapidChanges,
            nonDhcpChanges,
            suspiciousMacCount: new Set(suspiciousMacs).size,
            registeredMac,
            latestRecords: records.slice(0, 20).map((r) => ({
              id: r.id,
              ipAddress: r.ipAddress,
              oldMacAddress: r.oldMacAddress,
              newMacAddress: r.newMacAddress,
              source: r.source,
              subscriberCode: r.Subscriber?.code || null,
              changedAt: r.changedAt.toISOString(),
            })),
          },
        });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("IP-MAC history GET error:", error);
    return NextResponse.json({ error: "Failed to fetch IP-MAC history" }, { status: 500 });
  }
}

// ─── POST: Record IP-MAC changes ────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      // ── record: Record a new IP-MAC change event ──────────────────────────
      case "record": {
        const { ipAddress, oldMacAddress, newMacAddress, subscriberId, source } = body;

        if (!ipAddress || !newMacAddress) {
          return NextResponse.json({ error: "ipAddress and newMacAddress are required" }, { status: 400 });
        }

        // Skip recording if old and new MAC are the same (no actual change)
        if (oldMacAddress && oldMacAddress.toUpperCase() === newMacAddress.toUpperCase()) {
          return NextResponse.json({
            success: true,
            message: "No change detected — old and new MAC addresses are the same",
            skipped: true,
          });
        }

        // Validate subscriber if provided
        if (subscriberId) {
          const subscriber = await db.subscriber.findUnique({ where: { id: subscriberId } });
          if (!subscriber) {
            return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
          }
        }

        const record = await db.ipMacHistory.create({
          data: {
            ipAddress,
            oldMacAddress: oldMacAddress || "",
            newMacAddress,
            subscriberId: subscriberId || null,
            source: source || "dhcp",
          },
        });

        // If subscriber is known, update their current MAC if the new MAC differs
        if (subscriberId && newMacAddress) {
          try {
            await db.subscriber.update({
              where: { id: subscriberId },
              data: { macAddress: newMacAddress },
            });
          } catch {
            // Non-critical — don't fail the record creation
          }
        }

        return NextResponse.json({ success: true, data: record });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("IP-MAC history POST error:", error);
    return NextResponse.json({ error: "Failed to process IP-MAC history request" }, { status: 500 });
  }
}
