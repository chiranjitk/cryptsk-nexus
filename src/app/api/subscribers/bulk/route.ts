import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditBulk } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const body = await request.json();
    const { action, subscriberIds, ...payload } = body;

    if (!action || !subscriberIds || !Array.isArray(subscriberIds) || subscriberIds.length === 0) {
      return NextResponse.json({ error: "Action and subscriberIds are required" }, { status: 400 });
    }

    let result;

    switch (action) {
      case "change-status": {
        const newStatus = payload.status;
        if (!newStatus) {
          return NextResponse.json({ error: "Status is required for change-status action" }, { status: 400 });
        }
        result = await db.subscriber.updateMany({
          where: { id: { in: subscriberIds } },
          data: { status: newStatus },
        });
        break;
      }

      case "assign-plan": {
        const planId = payload.planId;
        if (!planId) {
          return NextResponse.json({ error: "planId is required for assign-plan action" }, { status: 400 });
        }
        result = await db.subscriber.updateMany({
          where: { id: { in: subscriberIds } },
          data: { planId },
        });
        break;
      }

      case "enable-radius": {
        // Bulk enable RADIUS: set radiusEnabled=true and create thin RadiusUser records
        const subscribers = await db.subscriber.findMany({
          where: { id: { in: subscriberIds } },
          select: { id: true },
        });
        await db.subscriber.updateMany({
          where: { id: { in: subscriberIds } },
          data: { radiusEnabled: true },
        });
        // Create RadiusUser records for subscribers that don't have one
        const existingRadiusUsers = await db.radiusUser.findMany({
          where: { subscriberId: { in: subscribers.map((s) => s.id) } },
          select: { subscriberId: true },
        });
        const existingIds = new Set(existingRadiusUsers.map((r) => r.subscriberId));
        const toCreate = subscribers.filter((s) => !existingIds.has(s.id));
        if (toCreate.length > 0) {
          await db.radiusUser.createMany({
            data: toCreate.map((s) => ({ subscriberId: s.id })),
          });
        }
        result = { count: subscriberIds.length };
        break;
      }

      case "disable-radius": {
        // Bulk disable RADIUS: set radiusEnabled=false and delete RadiusUser records
        await db.subscriber.updateMany({
          where: { id: { in: subscriberIds } },
          data: { radiusEnabled: false },
        });
        await db.radiusUser.deleteMany({
          where: { subscriberId: { in: subscriberIds } },
        });
        result = { count: subscriberIds.length };
        break;
      }

      case "export": {
        // Return subscriber data for CSV export
        const subscribers = await db.subscriber.findMany({
          where: { id: { in: subscriberIds } },
          include: {
            Area: { select: { name: true } },
            Plan: { select: { name: true } },
            RadiusGroup: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
        });

        // Format for CSV export
        const csvData = subscribers.map((s) => ({
          code: s.code,
          name: s.name,
          phone: s.phone,
          email: s.email,
          area: s.Area?.name || "",
          plan: s.Plan?.name || "",
          status: s.status,
          connectionType: s.connectionType,
          serviceUsername: s.serviceUsername,
          ipAddress: s.ipAddress,
          macAddress: s.macAddress,
          radiusEnabled: s.radiusEnabled,
          radiusGroup: s.RadiusGroup?.name || "",
          activationDate: s.activationDate?.toISOString().split("T")[0] || "",
          balance: s.balance,
          createdAt: s.createdAt.toISOString().split("T")[0],
        }));

        return NextResponse.json({ action: "export", data: csvData });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    await auditBulk(request, "BULK_UPDATE", "Subscriber", result.count, subscriberIds);
    return NextResponse.json({ success: true, updated: result.count });
  } catch (error) {
    console.error("Bulk subscribers API error:", error);
    return NextResponse.json({ error: "Bulk operation failed" }, { status: 500 });
  }
}
