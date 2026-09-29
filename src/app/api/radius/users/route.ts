import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { Subscriber: { name: { contains: search } } },
        { Subscriber: { code: { contains: search } } },
        { Subscriber: { serviceUsername: { contains: search } } },
      ];
    }

    // Use raw SQL to avoid Turbopack issues with deeply nested includes + _count
    const users = await db.$queryRawUnsafe(`
      SELECT
        ru."id", ru."subscriberId", ru."createdAt", ru."updatedAt",
        s."id" as "sub_id", s."name" as "sub_name", s."code" as "sub_code", s."phone" as "sub_phone",
        s."serviceUsername" as "sub_serviceUsername", s."servicePassword" as "sub_servicePassword",
        s."status" as "sub_status", s."radiusGroupId" as "sub_radiusGroupId",
        s."sessionTimeout" as "sub_sessionTimeout", s."idleTimeout" as "sub_idleTimeout",
        s."lastAuthAt" as "sub_lastAuthAt", s."lastAuthResult" as "sub_lastAuthResult",
        s."radiusEnabled" as "sub_radiusEnabled",
        p."id" as "plan_id", p."name" as "plan_name", p."downloadSpeed" as "plan_downloadSpeed",
        p."uploadSpeed" as "plan_uploadSpeed", p."dataLimitGb" as "plan_dataLimitGb",
        rg."id" as "rg_id", rg."name" as "rg_name", rg."speedLimitDown" as "rg_speedLimitDown",
        rg."speedLimitUp" as "rg_speedLimitUp", rg."dataLimit" as "rg_dataLimit",
        pg."id" as "pg_id", pg."name" as "pg_name", pg."speedLimitDown" as "pg_speedLimitDown",
        pg."speedLimitUp" as "pg_speedLimitUp", pg."dataLimit" as "pg_dataLimit",
        (SELECT COUNT(*) FROM "RadiusSession" WHERE "radiusUserId" = ru."id") as session_count
      FROM "RadiusUser" ru
      LEFT JOIN "Subscriber" s ON s."id" = ru."subscriberId"
      LEFT JOIN "Plan" p ON p."id" = s."planId"
      LEFT JOIN "RadiusGroup" rg ON rg."id" = s."radiusGroupId"
      LEFT JOIN "RadiusGroup" pg ON pg."id" = p."groupId"
      ORDER BY ru."createdAt" DESC
    `) as any[];

    // Map raw rows to the frontend-expected shape
    const mappedUsers = users.map((u) => {
      const hasSubscriber = !!u.sub_id;
      return {
        id: u.id,
        subscriberId: u.subscriberId,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        _count: { sessions: Number(u.session_count) || 0 },
        subscriber: hasSubscriber
          ? {
              id: u.sub_id,
              name: u.sub_name,
              code: u.sub_code,
              phone: u.sub_phone,
              serviceUsername: u.sub_serviceUsername,
              servicePassword: u.sub_servicePassword,
              status: u.sub_status,
              radiusGroupId: u.sub_radiusGroupId,
              sessionTimeout: u.sub_sessionTimeout,
              idleTimeout: u.sub_idleTimeout,
              lastAuthAt: u.sub_lastAuthAt,
              lastAuthResult: u.sub_lastAuthResult || "",
              radiusEnabled: !!u.sub_radiusEnabled,
              plan: u.plan_id
                ? {
                    id: u.plan_id,
                    name: u.plan_name,
                    downloadSpeed: u.plan_downloadSpeed,
                    uploadSpeed: u.plan_uploadSpeed,
                    dataLimitGb: u.plan_dataLimitGb,
                    group: u.pg_id
                      ? {
                          id: u.pg_id,
                          name: u.pg_name,
                          speedLimitDown: u.pg_speedLimitDown,
                          speedLimitUp: u.pg_speedLimitUp,
                          dataLimit: u.pg_dataLimit,
                        }
                      : null,
                  }
                : null,
              radiusGroup: u.rg_id
                ? {
                    id: u.rg_id,
                    name: u.rg_name,
                    speedLimitDown: u.rg_speedLimitDown,
                    speedLimitUp: u.rg_speedLimitUp,
                    dataLimit: u.rg_dataLimit,
                  }
                : null,
            }
          : null,
      };
    });

    const activeSessions = await db.radiusSession.count({
      where: { stopTime: null },
    });

    return NextResponse.json({ users: mappedUsers, activeSessions });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("RADIUS users API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch RADIUS users" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const {
      subscriberId,
      servicePassword,
      radiusGroupId,
      sessionTimeout,
      idleTimeout,
    } = body;

    if (!subscriberId) {
      return NextResponse.json(
        { error: "Subscriber is required" },
        { status: 400 }
      );
    }

    // Check if RadiusUser already exists for this subscriber
    const existing = await db.radiusUser.findUnique({
      where: { subscriberId },
    });

    if (existing) {
      return NextResponse.json(
        { error: "RADIUS user already provisioned for this subscriber" },
        { status: 409 }
      );
    }

    // Create the RadiusUser record
    const user = await db.radiusUser.create({
      data: {
        subscriberId,
      },
    });

    // Update subscriber fields if provided
    const updateData: any = { radiusEnabled: true };
    if (servicePassword) updateData.servicePassword = servicePassword;
    if (radiusGroupId) updateData.radiusGroupId = radiusGroupId;
    if (sessionTimeout) updateData.sessionTimeout = sessionTimeout;
    if (idleTimeout) updateData.idleTimeout = idleTimeout;

    await db.subscriber.update({
      where: { id: subscriberId },
      data: updateData,
    });

    await auditLog(request, "CREATE", "RadiusUser", user.id, {
      subscriberId,
      radiusGroupId,
      sessionTimeout,
      idleTimeout,
    });

    return NextResponse.json({ user, success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Create RADIUS user error:", error);
    return NextResponse.json(
      { error: "Failed to create RADIUS user" },
      { status: 500 }
    );
  }
}
