import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";

export async function GET(request: Request) {
  try {
    await requireAuth(request as unknown as import("next/server").NextRequest);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const target = searchParams.get("target");
    const priority = searchParams.get("priority");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const includeInactive = searchParams.get("all") === "true";

    const where: Record<string, unknown> = {};

    if (!includeInactive) {
      where.isActive = true;
    }
    if (type && type !== "ALL") {
      where.type = type;
    }
    if (target && target !== "ALL") {
      where.target = target;
    }
    if (priority !== null && priority !== "" && priority !== undefined) {
      where.priority = parseInt(priority, 10);
    }

    const announcements = await db.announcement.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: limit,
    });

    const total = await db.announcement.count({ where });

    return NextResponse.json({ announcements, total });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Announcements GET error:", error);
    return NextResponse.json({ error: "Failed to fetch announcements" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth(request as unknown as import("next/server").NextRequest);

    const body = await request.json();
    const { title, message, type = "INFO", priority = 0, target = "ALL", channels = "IN_APP", expiresAt } = body;

    if (!title?.trim() || !message?.trim()) {
      return NextResponse.json({ error: "Title and message are required" }, { status: 400 });
    }

    const validTypes = ["INFO", "WARNING", "UPGRADE", "MAINTENANCE", "PROMO"];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` }, { status: 400 });
    }

    const validTargets = ["ALL", "ACTIVE", "INACTIVE", "SUSPENDED", "TRIAL", "PAID", "OVERDUE"];
    if (!validTargets.includes(target)) {
      return NextResponse.json({ error: `Invalid target. Must be one of: ${validTargets.join(", ")}` }, { status: 400 });
    }

    if (typeof priority !== "number" || priority < 0 || priority > 2) {
      return NextResponse.json({ error: "Priority must be 0 (normal), 1 (high), or 2 (critical)" }, { status: 400 });
    }

    const announcement = await db.announcement.create({
      data: {
        title: title.trim(),
        message: message.trim(),
        type,
        priority,
        target,
        channels: Array.isArray(channels) ? channels.join(",") : channels,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdById: userId,
      },
    });

    await auditLog(
      request as unknown as import("next/server").NextRequest,
      "CREATE",
      "Announcement",
      announcement.id,
      { title, type, priority, target, channels, expiresAt },
      { userId }
    );

    return NextResponse.json({ announcement }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Announcements POST error:", error);
    return NextResponse.json({ error: "Failed to create announcement" }, { status: 500 });
  }
}
