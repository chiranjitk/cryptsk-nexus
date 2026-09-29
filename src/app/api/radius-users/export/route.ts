import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/radius-users/export - Export RADIUS users as CSV
export async function GET(request: Request) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const users = await db.radiusUser.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        Subscriber: {
          select: { name: true, code: true, phone: true },
        },
        _count: { select: { RadiusSession: true } },
      },
    });

    const BOM = "\uFEFF";
    const header = "ID,Subscriber,Code,Phone,Status,Sessions,Created\n";
    const rows = users.map((u) => {
      const esc = (v: string) => `"${String(v || "").replace(/"/g, '""')}"`;
      return [
        esc(u.id),
        esc(u.Subscriber?.name),
        esc(u.Subscriber?.code),
        esc(u.Subscriber?.phone),
        esc(u.Subscriber ? "Active" : "Unknown"),
        u._count.RadiusSession,
        esc(u.createdAt.toISOString()),
      ].join(",");
    }).join("\n");

    return new NextResponse(BOM + header + rows, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="radius-users-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error("RADIUS users export error:", error);
    return NextResponse.json({ error: "Failed to export RADIUS users" }, { status: 500 });
  }
}
