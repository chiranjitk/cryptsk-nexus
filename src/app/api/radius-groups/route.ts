import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { isValidIPv6CIDR } from "@/lib/validators/ipv6";

// GET /api/radius-groups — list all groups with plan count, subscriber count, and linked plans
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    // Use raw query for counts (Turbopack compatibility — _count with include is broken)
    const countRows: any[] = await db.$queryRawUnsafe(`
      SELECT (SELECT COUNT(*) FROM "Plan" WHERE "groupId" = g."id") as "planCount",
             (SELECT COUNT(*) FROM "Subscriber" WHERE "radiusGroupId" = g."id") as "subscriberCount",
             g."id"
      FROM "RadiusGroup" g
      ORDER BY g."priority" ASC
    `);
    const countMap = new Map(countRows.map((r: any) => [r.id, { planCount: Number(r.planCount), subscriberCount: Number(r.subscriberCount) }]));

    const groups = await db.radiusGroup.findMany({
      orderBy: { priority: "asc" },
      include: {
        Plan: {
          select: {
            id: true,
            name: true,
            downloadSpeed: true,
            uploadSpeed: true,
          },
        },
      },
    });
    const enriched = groups.map((g: any) => {
      const counts = countMap.get(g.id) || { planCount: 0, subscriberCount: 0 };
      return { ...g, _count: counts };
    });
    return NextResponse.json({ groups: enriched });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const status = (error as any)?.statusCode || 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

// POST /api/radius-groups — create group
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { name, description, speedLimitDown, speedLimitUp, dataLimit, sessionTimeout, priority, framedIpv6Pool, delegatedIpv6PrefixPool } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    }

    // IPv6 validation
    if (framedIpv6Pool && framedIpv6Pool.trim() !== "" && !isValidIPv6CIDR(framedIpv6Pool)) {
      return NextResponse.json({ success: false, error: "Invalid framed IPv6 pool. Must be a valid IPv6 CIDR (e.g. 2001:db8::/64)" }, { status: 400 });
    }
    if (delegatedIpv6PrefixPool && delegatedIpv6PrefixPool.trim() !== "" && !isValidIPv6CIDR(delegatedIpv6PrefixPool)) {
      return NextResponse.json({ success: false, error: "Invalid delegated IPv6 prefix pool. Must be a valid IPv6 CIDR (e.g. 2001:db8::/48)" }, { status: 400 });
    }

    const existing = await db.radiusGroup.findUnique({ where: { name: name.trim() } });
    if (existing) {
      return NextResponse.json({ error: "Group with this name already exists" }, { status: 409 });
    }

    const group = await db.radiusGroup.create({
      data: {
        name: name.trim(),
        description: description || "",
        speedLimitDown: parseInt(speedLimitDown) || 0,
        speedLimitUp: parseInt(speedLimitUp) || 0,
        dataLimit: dataLimit ? parseInt(dataLimit) || null : null,
        sessionTimeout: sessionTimeout ? parseInt(sessionTimeout) || null : null,
        priority: parseInt(priority) || 0,
        framedIpv6Pool: framedIpv6Pool || "",
        delegatedIpv6PrefixPool: delegatedIpv6PrefixPool || "",
      },
      include: {
        Plan: {
          select: {
            id: true,
            name: true,
            downloadSpeed: true,
            uploadSpeed: true,
          },
        },
      },
    });

    // Fetch counts via raw query (Turbopack compatibility)
    const countRows: any[] = await db.$queryRawUnsafe(`
      SELECT (SELECT COUNT(*) FROM "Plan" WHERE "groupId" = $1) as "planCount",
             (SELECT COUNT(*) FROM "Subscriber" WHERE "radiusGroupId" = $1) as "subscriberCount"
    `, group.id);
    const counts = { planCount: Number(countRows[0]?.planCount || 0), subscriberCount: Number(countRows[0]?.subscriberCount || 0) };
    return NextResponse.json({ RadiusGroup: { ...group, _count: counts } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const status = (error as any)?.statusCode || 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

// PUT /api/radius-groups — update group
export async function PUT(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { id, name, description, speedLimitDown, speedLimitUp, dataLimit, sessionTimeout, priority, framedIpv6Pool, delegatedIpv6PrefixPool } = body;

    if (!id) {
      return NextResponse.json({ error: "Group ID is required" }, { status: 400 });
    }

    // IPv6 validation
    if (framedIpv6Pool && framedIpv6Pool.trim() !== "" && !isValidIPv6CIDR(framedIpv6Pool)) {
      return NextResponse.json({ success: false, error: "Invalid framed IPv6 pool. Must be a valid IPv6 CIDR (e.g. 2001:db8::/64)" }, { status: 400 });
    }
    if (delegatedIpv6PrefixPool && delegatedIpv6PrefixPool.trim() !== "" && !isValidIPv6CIDR(delegatedIpv6PrefixPool)) {
      return NextResponse.json({ success: false, error: "Invalid delegated IPv6 prefix pool. Must be a valid IPv6 CIDR (e.g. 2001:db8::/48)" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (speedLimitDown !== undefined) updateData.speedLimitDown = parseInt(speedLimitDown) || 0;
    if (speedLimitUp !== undefined) updateData.speedLimitUp = parseInt(speedLimitUp) || 0;
    if (dataLimit !== undefined) updateData.dataLimit = dataLimit ? parseInt(dataLimit) || null : null;
    if (sessionTimeout !== undefined) updateData.sessionTimeout = sessionTimeout ? parseInt(sessionTimeout) || null : null;
    if (priority !== undefined) updateData.priority = parseInt(priority) || 0;
    if (framedIpv6Pool !== undefined) updateData.framedIpv6Pool = framedIpv6Pool;
    if (delegatedIpv6PrefixPool !== undefined) updateData.delegatedIpv6PrefixPool = delegatedIpv6PrefixPool;

    // Check name uniqueness if changing name
    if (updateData.name) {
      const existing = await db.radiusGroup.findFirst({
        where: { name: updateData.name as string, NOT: { id } },
      });
      if (existing) {
        return NextResponse.json({ error: "Group with this name already exists" }, { status: 409 });
      }
    }

    const group = await db.radiusGroup.update({
      where: { id },
      data: updateData,
      include: {
        Plan: {
          select: {
            id: true,
            name: true,
            downloadSpeed: true,
            uploadSpeed: true,
          },
        },
      },
    });

    // Fetch counts via raw query (Turbopack compatibility)
    const countRows: any[] = await db.$queryRawUnsafe(`
      SELECT (SELECT COUNT(*) FROM "Plan" WHERE "groupId" = $1) as "planCount",
             (SELECT COUNT(*) FROM "Subscriber" WHERE "radiusGroupId" = $1) as "subscriberCount"
    `, id);
    const counts = { planCount: Number(countRows[0]?.planCount || 0), subscriberCount: Number(countRows[0]?.subscriberCount || 0) };
    return NextResponse.json({ RadiusGroup: { ...group, _count: counts } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const status = (error as any)?.statusCode || 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

// DELETE /api/radius-groups?id=xxx — delete group
export async function DELETE(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Group ID is required" }, { status: 400 });
    }

    // Unassign subscribers from this group first
    await db.subscriber.updateMany({
      where: { radiusGroupId: id },
      data: { radiusGroupId: null },
    });

    // Unassign plans from this group first
    await db.plan.updateMany({
      where: { groupId: id },
      data: { groupId: null },
    });

    await db.radiusGroup.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const status = (error as any)?.statusCode || 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
