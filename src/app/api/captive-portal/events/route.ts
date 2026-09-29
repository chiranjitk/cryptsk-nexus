import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { Prisma } from "@prisma/client";

// GET /api/captive-portal/events — List event log
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const portalId = searchParams.get("portalId") || "";
    const eventType = searchParams.get("eventType") || "";
    const mac = searchParams.get("mac") || "";
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const skip = (page - 1) * limit;

    const where: Prisma.PortalEventLogWhereInput = {};
    if (portalId) where.portalId = portalId;
    if (eventType) where.eventType = eventType;
    if (mac) where.macAddress = { contains: mac };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [events, total] = await Promise.all([
      db.portalEventLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          portal: { select: { id: true, name: true } },
        },
      }),
      db.portalEventLog.count({ where }),
    ]);

    const data = events.map((e) => ({
      id: e.id,
      portalId: e.portalId,
      portalName: e.portal?.name || "",
      sessionId: e.sessionId,
      eventType: e.eventType,
      macAddress: e.macAddress,
      ipAddress: e.ipAddress,
      authMethod: e.authMethod,
      authUsername: e.authUsername,
      voucherCode: e.voucherCode,
      details: e.details,
      createdAt: e.createdAt,
    }));

    return NextResponse.json({
      events: data,
      pagination: { total, page, limit },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal Events] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}
