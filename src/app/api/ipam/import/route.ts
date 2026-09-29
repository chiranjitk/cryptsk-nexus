import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// POST /api/ipam/import - Bulk import IPs/subnets from CSV
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string || "ip"; // "ip" or "subnet"
    const subnetId = formData.get("subnetId") as string || "";

    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const text = await file.text();
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return NextResponse.json({ error: "CSV must have a header row and at least one data row" }, { status: 400 });

    const headers = lines[0].toLowerCase().split(",").map((h) => h.trim());
    let created = 0;
    let errors = 0;

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim());
      if (values.length < 1) continue;

      try {
        if (type === "subnet") {
          const name = values[headers.indexOf("name")] || values[0] || `Subnet ${i}`;
          const network = values[headers.indexOf("network")] || values[headers.indexOf("cidr")] || "";
          const gateway = values[headers.indexOf("gateway")] || "";
          const dns = values[headers.indexOf("dns")] || "";

          if (!network) { errors++; continue; }
          await db.subnet.create({
            data: { name, network, cidr: network, gateway, dns, description: `Imported from CSV` },
          });
          created++;
        } else {
          // IP import
          const address = values[headers.indexOf("address")] || values[headers.indexOf("ip")] || values[0] || "";
          const hostname = values[headers.indexOf("hostname")] || "";
          const macAddress = values[headers.indexOf("mac")] || values[headers.indexOf("macaddress")] || "";
          const status = values[headers.indexOf("status")] || "free";
          const description = values[headers.indexOf("description")] || "";
          const targetSubnetId = values[headers.indexOf("subnetid")] || subnetId;

          if (!address) { errors++; continue; }
          await db.ipAddress.create({
            data: {
              address,
              subnetId: targetSubnetId || "",
              hostname,
              macAddress,
              status: ["free", "used", "reserved"].includes(status) ? status : "free",
              description,
            },
          });
          created++;
        }
      } catch {
        errors++;
      }
    }

    return NextResponse.json({ success: true, created, errors, total: lines.length - 1 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("IPAM import error:", error);
    return NextResponse.json({ error: "Failed to import CSV" }, { status: 500 });
  }
}
