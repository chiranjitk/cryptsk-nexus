import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditExport } from "@/lib/services/audit-service";
import * as os from "@/lib/os/network-utils";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Connected",
  STANDBY: "Standby",
  DOWN: "Disconnected",
  MAINTENANCE: "Maintenance",
};

// GET /api/multiwan/export — Export WAN links as CSV
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as NextRequest);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "";
    const search = searchParams.get("search") || "";
    const includeOsData = searchParams.get("os") === "true";

    const where: Record<string, unknown> = {};
    if (status && status !== "ALL") {
      where.status = status.toUpperCase();
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { isp: { contains: search } },
        { ipAddress: { contains: search } },
        { interfaceName: { contains: search } },
      ];
    }

    const wanLinks = await db.wanLink.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    // Optionally get real OS traffic data
    let osTraffic: Record<string, os.TrafficStats> = {};
    if (includeOsData) {
      try {
        osTraffic = await os.getAllTraffic();
      } catch {
        // ignore
      }
    }

    const escapeCsv = (val: string | null | undefined) => {
      if (!val) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      "Name",
      "Type",
      "ISP",
      "IP Address",
      "Gateway",
      "Interface",
      "Download (Mbps)",
      "Upload (Mbps)",
      "Monthly Cost",
      "Monthly Budget",
      "Status",
      "Primary",
      "Weight",
      "Auto Failback",
      "Max Download (Mbps)",
      "Max Upload (Mbps)",
      "Alert At (%)",
      ...(includeOsData ? ["OS RX Bytes", "OS TX Bytes", "OS RX Packets", "OS TX Packets"] : []),
      "Created At",
    ];

    const rows = wanLinks.map((w) => {
      const ifaceTraffic = w.interfaceName ? osTraffic[w.interfaceName] : null;
      const baseRow = [
        escapeCsv(w.name),
        escapeCsv(w.type),
        escapeCsv(w.isp),
        escapeCsv(w.ipAddress),
        escapeCsv(w.gateway),
        escapeCsv(w.interfaceName),
        String(w.downloadSpeed),
        String(w.uploadSpeed),
        String(w.monthlyCost),
        String(w.monthlyBudget),
        escapeCsv(STATUS_LABELS[w.status] || w.status),
        w.isPrimary ? "Yes" : "No",
        String(w.weight),
        w.autoFailback ? "Yes" : "No",
        String(w.maxDownloadMbps),
        String(w.maxUploadMbps),
        String(w.alertAtPercent),
      ];
      if (includeOsData) {
        baseRow.push(
          String(ifaceTraffic?.rxBytes || 0),
          String(ifaceTraffic?.txBytes || 0),
          String(ifaceTraffic?.rxPackets || 0),
          String(ifaceTraffic?.txPackets || 0),
        );
      }
      baseRow.push(w.createdAt ? new Date(w.createdAt).toISOString() : "");
      return baseRow.join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");

    await auditExport(request, "MultiWAN", "csv", wanLinks.length);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="multiwan-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("MultiWAN export error:", error);
    return NextResponse.json({ error: "Failed to export WAN links" }, { status: 500 });
  }
}
