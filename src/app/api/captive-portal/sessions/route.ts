import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { Prisma } from "@prisma/client";

// GET /api/captive-portal/sessions — List sessions with filters
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const portalId = searchParams.get("portalId") || "";
    const status = searchParams.get("status") || "";
    const search = searchParams.get("search") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const skip = (page - 1) * limit;

    const where: Prisma.PortalSessionWhereInput = {};
    if (portalId) where.portalId = portalId;
    if (status) where.status = status as any;
    if (search) {
      where.OR = [
        { macAddress: { contains: search } },
        { ipAddress: { contains: search } },
        { authUsername: { contains: search } },
        { nasIp: { contains: search } },
      ];
    }

    const [sessions, total] = await Promise.all([
      db.portalSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          portal: { select: { id: true, name: true } },
          Subscriber: { select: { id: true, name: true, code: true } },
        },
      }),
      db.portalSession.count({ where }),
    ]);

    const data = sessions.map((s) => ({
      id: s.id,
      portalId: s.portalId,
      portalName: s.portal?.name || "",
      subscriberId: s.subscriberId,
      subscriberName: s.Subscriber?.name || null,
      subscriberCode: s.Subscriber?.code || null,
      macAddress: s.macAddress,
      ipAddress: s.ipAddress,
      assignedIp: s.assignedIp,
      loginMethod: s.loginMethod,
      authUsername: s.authUsername,
      voucherCode: s.voucherCode,
      startTime: s.startTime,
      expiryTime: s.expiryTime,
      lastActivity: s.lastActivity,
      downloadBytes: Number(s.downloadBytes),
      uploadBytes: Number(s.uploadBytes),
      status: s.status,
      disconnectReason: s.disconnectReason,
      nasIp: s.nasIp,
      terminateCause: s.terminateCause,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    return NextResponse.json({
      sessions: data,
      pagination: { total, page, limit },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal Sessions] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}

// POST /api/captive-portal/sessions — Create manual session (for testing)
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { portalId, macAddress, ipAddress } = body;

    if (!portalId) {
      return NextResponse.json({ error: "portalId is required" }, { status: 400 });
    }
    if (!macAddress) {
      return NextResponse.json({ error: "macAddress is required" }, { status: 400 });
    }

    const portal = await db.captivePortal.findUnique({ where: { id: portalId } });
    if (!portal) {
      return NextResponse.json({ error: "Portal not found" }, { status: 404 });
    }

    const session = await db.portalSession.create({
      data: {
        portalId,
        macAddress: macAddress.trim(),
        ipAddress: ipAddress || "",
        assignedIp: body.assignedIp || "",
        loginMethod: body.loginMethod || "RADIUS",
        authUsername: body.authUsername || "",
        voucherCode: body.voucherCode || null,
        startTime: body.startTime ? new Date(body.startTime) : new Date(),
        expiryTime: body.expiryTime ? new Date(body.expiryTime) : null,
        status: body.status || "ACTIVE",
        subscriberId: body.subscriberId || null,
      },
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal Sessions] POST error:", error);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
