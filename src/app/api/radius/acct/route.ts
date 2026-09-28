import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

// GET /api/radius/acct — list RADIUS accounting records (radacct table)
export async function GET(req: NextRequest) {
  try {
    await requirePermission("aaa.radius", "read");

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "25");
    const username = searchParams.get("username") || undefined;
    const nasIp = searchParams.get("nasip") || undefined;
    const groupname = searchParams.get("groupname") || undefined;
    const framedIp = searchParams.get("framedip") || undefined;
    const activeOnly = searchParams.get("active") === "true";

    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (username) where.username = { contains: username };
    if (nasIp) where.nasipaddress = { contains: nasIp };
    if (groupname) where.groupname = { contains: groupname };
    if (framedIp) where.framedipaddress = { contains: framedIp };
    if (activeOnly) {
      where.acctstoptime = null; // active sessions have null stop time
    }

    const [sessions, total] = await Promise.all([
      db.radAcct.findMany({
        where,
        orderBy: { acctstarttime: "desc" },
        skip,
        take: pageSize,
      }),
      db.radAcct.count({ where }),
    ]);

    return NextResponse.json({
      sessions,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch accounting records" }, { status: 500 });
  }
}
