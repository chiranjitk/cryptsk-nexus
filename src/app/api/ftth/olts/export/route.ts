import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/ftth/olts/export - Export OLTs and ports as CSV
export async function GET(request: Request) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const olts = await db.networkDevice.findMany({
      where: { type: "OLT" },
      orderBy: { createdAt: "desc" },
      include: {
        Area: { select: { name: true } },
        oltPorts: { orderBy: { portNumber: "asc" } },
        _count: { select: { assignedSubscribers: true } },
      },
    });

    const BOM = "\uFEFF";
    const header = "OLT Name,Vendor,Model,IP Address,Status,Location,Area,Port,Username,CPU %,MEM %,Temp °C,Total Ports,Used Ports,Subscribers\n";
    const rows = olts.map((olt) => {
      const esc = (v: string) => `"${String(v || "").replace(/"/g, '""')}"`;
      const usedPorts = olt.oltPorts.filter((p) => p.status === "active").length;
      return [
        esc(olt.name),
        esc(olt.vendor),
        esc(olt.model),
        esc(olt.ipAddress),
        esc(olt.status),
        esc(olt.location),
        esc(olt.Area?.name ?? ""),
        olt.port,
        esc(olt.username),
        olt.cpuUsage,
        olt.memoryUsage,
        olt.temperature ?? "",
        olt.oltPorts.length,
        usedPorts,
        olt._count.assignedSubscribers,
      ].join(",");
    }).join("\n");

    return new NextResponse(BOM + header + rows, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ftth-olts-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error("FTTH OLTs export error:", error);
    return NextResponse.json({ error: "Failed to export OLT data" }, { status: 500 });
  }
}
