import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── Helper: escape CSV field ─────────────────────────────────────
function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // If the field contains a comma, quote, or newline, wrap in quotes
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ─── Helper: build CSV string from headers + rows ─────────────────
function buildCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\n");
}

// ─── Helper: calculate total IPs from CIDR ────────────────────────
function calculateTotalIps(cidr: string): number {
  const match = cidr.match(/\/(\d+)/);
  if (!match) return 0;
  const prefix = parseInt(match[1], 10);
  if (prefix >= 32) return 1;
  const hostBits = 32 - prefix;
  return Math.max(0, Math.pow(2, hostBits) - 2);
}

// ─── GET: Export IPAM data as CSV ─────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "all";
    const format = searchParams.get("format") || "csv";
    const subnetId = searchParams.get("subnetId") || "";

    if (format !== "csv") {
      return NextResponse.json({ error: "Only CSV format is supported" }, { status: 400 });
    }

    let csvContent = "";
    let filename = "ipam-export";

    if (type === "subnets" || type === "all") {
      const subnets = await db.subnet.findMany({
        include: {
          Vlan: { select: { vlanId: true, name: true } },
          Area: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      const headers = [
        "ID", "Name", "Network/CIDR", "Gateway", "DNS",
        "VLAN ID", "VLAN Name", "Area", "Description",
        "Total IPs", "IPv6 Network", "IPv6 Prefix",
        "TC Enabled", "Created At",
      ];

      const rows = subnets.map((sn) => [
        sn.id,
        sn.name,
        sn.cidr || sn.network,
        sn.gateway,
        sn.dns,
        sn.vlan ? String(sn.vlan.vlanId) : "",
        sn.vlan?.name || "",
        sn.Area?.name || "",
        sn.description,
        calculateTotalIps(sn.cidr || sn.network),
        sn.networkv6,
        sn.prefixv6,
        sn.tcEnabled ? "Yes" : "No",
        sn.createdAt.toISOString(),
      ]);

      csvContent += buildCsv(headers, rows);
      if (type === "all") csvContent += "\n\n";
    }

    if (type === "ips" || type === "all") {
      const ipWhere: Record<string, unknown> = {};
      if (subnetId) {
        ipWhere.subnetId = subnetId;
      }

      const ips = await db.ipAddress.findMany({
        where: Object.keys(ipWhere).length > 0 ? ipWhere : undefined,
        include: {
          Subnet: { select: { id: true, name: true, cidr: true } },
        },
        orderBy: { address: "asc" },
      });

      const headers = [
        "ID", "IP Address", "Subnet", "Subnet CIDR", "Status",
        "Hostname", "MAC Address", "Description", "Subscriber ID",
        "Custom Fields", "Created At", "Updated At",
      ];

      const rows = ips.map((ip) => [
        ip.id,
        ip.address,
        ip.subnet?.name || "",
        ip.subnet?.cidr || "",
        ip.status,
        ip.hostname,
        ip.macAddress,
        ip.description,
        ip.subscriberId || "",
        ip.customFields,
        ip.createdAt.toISOString(),
        ip.updatedAt.toISOString(),
      ]);

      if (type === "all") csvContent += "# IP Addresses\n";
      csvContent += buildCsv(headers, rows);
      if (type === "all") csvContent += "\n\n";
    }

    if (type === "vlans" || type === "all") {
      const vlans = await db.vlan.findMany({
        orderBy: { vlanId: "asc" },
      });

      const vlanIds = vlans.map((v) => v.id);
      const subnetCountsByVlan = vlanIds.length > 0
        ? await db.subnet.groupBy({
            by: ["vlanId"],
            where: { vlanId: { in: vlanIds } },
            _count: true,
          })
        : [];
      const vlanPortCountMap: Record<string, number> = {};
      subnetCountsByVlan.forEach((item) => {
        if (item.vlanId) vlanPortCountMap[item.vlanId] = item._count;
      });

      const headers = ["ID", "VLAN ID", "Name", "Subnet", "Description", "Subnet Count", "Created At"];

      const rows = vlans.map((v) => [
        v.id,
        String(v.vlanId),
        v.name,
        v.subnet,
        v.description,
        String(vlanPortCountMap[v.id] || 0),
        v.createdAt.toISOString(),
      ]);

      if (type === "all") csvContent += "# VLANs\n";
      csvContent += buildCsv(headers, rows);
    }

    // Set filename
    const timestamp = new Date().toISOString().split("T")[0];
    if (type === "all") filename = `ipam-full-export-${timestamp}.csv`;
    else if (type === "subnets") filename = `ipam-subnets-${timestamp}.csv`;
    else if (type === "ips") filename = `ipam-ips-${timestamp}.csv`;
    else if (type === "vlans") filename = `ipam-vlans-${timestamp}.csv`;

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("IPAM export error:", error);
    return NextResponse.json({ error: "Failed to export IPAM data" }, { status: 500 });
  }
}
