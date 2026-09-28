import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

// GET /api/radius/postauth — list RADIUS auth log (radpostauth table)
export async function GET(req: NextRequest) {
  try {
    await requirePermission("aaa.radius", "read");

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "25");
    const username = searchParams.get("username") || undefined;
    const reply = searchParams.get("reply") || undefined;

    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (username) where.username = { contains: username };
    if (reply) where.reply = { contains: reply };

    const [events, total] = await Promise.all([
      db.radPostAuth.findMany({
        where,
        orderBy: { authdate: "desc" },
        skip,
        take: pageSize,
      }),
      db.radPostAuth.count({ where }),
    ]);

    return NextResponse.json({
      events,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch auth log" }, { status: 500 });
  }
}
