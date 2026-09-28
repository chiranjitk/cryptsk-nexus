import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditConfigChange } from "@/lib/audit";

// POST /api/vpp/provision — provision a subscriber in the VPP dataplane
// Body: { subscriberId: string }
// This generates + applies VPP dataplane objects (NAT, ACL, QoS) for a subscriber
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("network.gateway", "execute");
    const body = await req.json();
    const { subscriberId } = body;

    if (!subscriberId) {
      return NextResponse.json({ error: "subscriberId required" }, { status: 400 });
    }

    // Get subscriber data
    const subscriber = await db.subscriber.findUnique({
      where: { id: subscriberId },
      include: {
        plan: {
          include: {
            product: { select: { radiusGroupName: true, downloadSpeed: true, uploadSpeed: true } },
          },
        },
      },
    });

    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    // Get active RADIUS session for this subscriber
    const radAcct = await db.radAcct.findFirst({
      where: {
        username: subscriber.radiusUsername,
        acctstoptime: null,
      },
      orderBy: { acctstarttime: "desc" },
    });

    // Get policy attributes for the subscriber's RADIUS group
    const groupname = subscriber.plan?.radiusGroupName || subscriber.plan?.product?.radiusGroupName;
    const groupChecks = groupname
      ? await db.radGroupCheck.findMany({ where: { groupname } })
      : [];

    // Build the VPP dataplane objects to provision
    const dataplaneObjects: DataplaneObject[] = [];

    // 1. NAT entry (subscriber IP → public IP)
    if (radAcct?.framedipaddress) {
      const publicIP = `203.0.113.${(parseInt(radAcct.framedipaddress.split(".")[3]) % 200) + 10}`;
      dataplaneObjects.push({
        type: "nat",
        subscriber: subscriber.radiusUsername,
        ip: radAcct.framedipaddress,
        config: { internalIP: radAcct.framedipaddress, externalIP: publicIP },
      });
    }

    // 2. QoS policer (from Mikrotik-Rate-Limit attribute)
    const rateLimit = groupChecks.find((c) => c.attribute === "Mikrotik-Rate-Limit");
    if (rateLimit) {
      const [downM] = rateLimit.value.split("/");
      dataplaneObjects.push({
        type: "qos",
        subscriber: subscriber.radiusUsername,
        ip: radAcct?.framedipaddress || "",
        config: { rateLimit: rateLimit.value, downloadMbps: downM },
      });
    }

    // 3. ACL (from Filter-Id attribute)
    const filterId = groupChecks.find((c) => c.attribute === "Filter-Id");
    if (filterId) {
      dataplaneObjects.push({
        type: "acl",
        subscriber: subscriber.radiusUsername,
        ip: radAcct?.framedipaddress || "",
        config: { filterId: filterId.value },
      });
    }

    // Call the VPP adapter to apply the objects
    let applied = 0;
    let failed = 0;
    const results: { type: string; success: boolean; error?: string }[] = [];

    for (const obj of dataplaneObjects) {
      try {
        const res = await fetch("http://localhost:3015/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(obj),
        });

        if (res.ok) {
          applied++;
          results.push({ type: obj.type, success: true });
        } else {
          failed++;
          const err = await res.json().catch(() => ({}));
          results.push({ type: obj.type, success: false, error: err.message || "Failed" });
        }
      } catch (err: any) {
        failed++;
        results.push({ type: obj.type, success: false, error: err.message });
      }
    }

    await auditConfigChange({
      userId: user.id,
      action: "config_change",
      resource: "vpp",
      resourceId: subscriber.id,
      resourceName: subscriber.radiusUsername,
      after: { objects: dataplaneObjects.length, applied, failed, results },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({
      success: applied > 0,
      subscriberId,
      subscriber: subscriber.radiusUsername,
      framedIP: radAcct?.framedipaddress || null,
      groupname,
      dataplaneObjects,
      applied,
      failed,
      results,
      message: failed === 0
        ? `All ${applied} dataplane objects applied successfully`
        : `${applied} applied, ${failed} failed (VPP adapter may not be running)`,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

type DataplaneObject = {
  type: string;
  subscriber: string;
  ip: string;
  config: Record<string, unknown>;
};
