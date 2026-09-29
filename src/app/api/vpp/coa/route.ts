import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { syncProductToRadius } from "@/lib/radius-sync";
import { auditConfigChange } from "@/lib/audit";

// POST /api/vpp/coa — Change of Authorization (dynamic bandwidth change mid-session)
// Body: { subscriberId: string, downloadKbps: number, uploadKbps: number }
//
// This is the CoA flow:
// 1. Update the subscriber's plan with new bandwidth
// 2. Re-sync the RADIUS group attributes (radgroupcheck)
// 3. Tell the VPP adapter to change the policer (dataplane CoA)
// 4. Tell the Session Engine to update the session
// 5. Optionally send RADIUS CoA to the NAS (Phase 6+ — needs NAS CoA support)
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("network.gateway", "execute");
    const body = await req.json();
    const { subscriberId, downloadKbps, uploadKbps } = body;

    if (!subscriberId || !downloadKbps || !uploadKbps) {
      return NextResponse.json({ error: "subscriberId, downloadKbps, uploadKbps required" }, { status: 400 });
    }

    // 1. Get subscriber
    const subscriber = await db.subscriber.findUnique({
      where: { id: subscriberId },
      include: { plan: { include: { product: true } } },
    });

    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    const groupname = subscriber.plan?.radiusGroupName || subscriber.plan?.product?.radiusGroupName;
    if (!groupname) {
      return NextResponse.json({ error: "Subscriber has no RADIUS group" }, { status: 400 });
    }

    // 2. Update the RADIUS group check attributes (radgroupcheck)
    // Delete existing Mikrotik-Rate-Limit and re-add with new rates
    await db.radGroupCheck.deleteMany({
      where: { groupname, attribute: "Mikrotik-Rate-Limit" },
    });

    const downMbps = downloadKbps / 1000;
    const upMbps = uploadKbps / 1000;
    await db.radGroupCheck.create({
      data: {
        groupname,
        attribute: "Mikrotik-Rate-Limit",
        op: ":=",
        value: `${fmtSpeed(downMbps)}/${fmtSpeed(upMbps)}`,
        productId: subscriber.plan?.productId || null,
      },
    });

    // 3. Tell VPP adapter to change the policer (dataplane CoA)
    let vppResult = { success: false, message: "VPP adapter not available" };
    try {
      const radAcct = await db.radAcct.findFirst({
        where: { username: subscriber.radiusUsername, acctstoptime: null },
      });
      if (radAcct?.framedipaddress) {
        const res = await fetch("http://localhost:3015/coa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscriberIP: radAcct.framedipaddress,
            downloadKbps,
            uploadKbps,
          }),
        });
        vppResult = await res.json().catch(() => vppResult);
      }
    } catch (err: any) {
      vppResult = { success: false, message: err.message };
    }

    // 4. Tell Session Engine to update the session (via REST API on port 3010)
    let sessionResult = { success: false, message: "Session Engine not available" };
    try {
      const res = await fetch("http://localhost:3010/sessions/sync", { method: "POST" });
      sessionResult = await res.json().catch(() => sessionResult);
    } catch (err: any) {
      sessionResult = { success: false, message: err.message };
    }

    await auditConfigChange({
      userId: user.id,
      action: "config_change",
      resource: "vpp",
      resourceId: subscriber.id,
      resourceName: subscriber.radiusUsername,
      before: { oldRateLimit: "previous" },
      after: { downloadKbps, uploadKbps, newRateLimit: `${fmtSpeed(downMbps)}/${fmtSpeed(upMbps)}` },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({
      success: true,
      subscriberId,
      subscriber: subscriber.radiusUsername,
      groupname,
      newBandwidth: {
        downloadKbps,
        uploadKbps,
        formatted: `${fmtSpeed(downMbps)}/${fmtSpeed(upMbps)}`,
      },
      radiusUpdated: true,
      vppCoA: vppResult,
      sessionSync: sessionResult,
      message: `CoA applied: bandwidth changed to ${fmtSpeed(downMbps)}/${fmtSpeed(upMbps)}. RADIUS groupcheck updated. VPP CoA: ${vppResult.success ? "applied" : "pending"}.`,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

function fmtSpeed(mbps: number): string {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)}G`;
  if (mbps >= 1) return `${mbps % 1 === 0 ? mbps.toFixed(0) : mbps.toFixed(2)}M`;
  return `${Math.round(mbps * 1024)}K`;
}
