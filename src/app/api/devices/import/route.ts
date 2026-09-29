import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

export async function POST(req: NextRequest) {
  try {
    try {
      await requireAuth(req);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
    const formData = await req.formData();
    const csvFile = formData.get("file") as File | null;

    if (!csvFile) {
      return NextResponse.json({ error: "No CSV file provided" }, { status: 400 });
    }

    // File validation: extension, type, and size
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (csvFile.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 5MB." }, { status: 400 });
    }
    const fileName = (csvFile.name || "").toLowerCase();
    if (!fileName.endsWith(".csv")) {
      return NextResponse.json({ error: "Invalid file type. Only .csv files are allowed." }, { status: 400 });
    }
    if (csvFile.type && !csvFile.type.includes("csv") && !csvFile.type.includes("text")) {
      return NextResponse.json({ error: "Invalid file type. Only .csv files are allowed." }, { status: 400 });
    }

    const text = await csvFile.text();
    const lines = text.trim().split("\n");

    if (lines.length < 2) {
      return NextResponse.json({ error: "CSV file is empty or has no data rows" }, { status: 400 });
    }

    // Parse header
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));

    const requiredCols = ["name", "ipaddress"];
    for (const col of requiredCols) {
      if (!headers.includes(col)) {
        return NextResponse.json({ error: `Missing required column: ${col}` }, { status: 400 });
      }
    }

    // Valid enums
    const validTypes = ["ROUTER", "SWITCH", "AP", "OLT", "ONU", "SERVER", "FIREWALL", "GATEWAY", "BRIDGE", "WIRELESS_BRIDGE", "OTHER"];
    const validVendors = ["MIKROTIK", "CISCO", "JUNIPER", "HUAWEI", "ZTE", "VSOL", "BDCOM", "UBIQUITI", "TP_LINK", "ARUBA", "FORTINET", "OTHER"];
    const validProtocols = ["SNMP", "SNMP_V3", "API", "SSH", "TELNET", "HTTP"];

    const getCol = (row: string[], colName: string) => {
      const idx = headers.indexOf(colName);
      return idx >= 0 ? (row[idx] || "").trim().replace(/"/g, "") : "";
    };

    // Helper: simple CSV row parser (handles quoted fields)
    function parseCsvRow(line: string): string[] {
      const row: string[] = [];
      let current = "";
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          row.push(current);
          current = "";
        } else {
          current += char;
        }
      }
      row.push(current);
      return row;
    }

    const NetworkDevice: {
      name: string;
      ipAddress: string;
      type: string;
      vendor: string;
      model: string;
      port: number;
      apiPort: number;
      username: string;
      password: string;
      monitorProtocol: string;
      snmpCommunity: string;
      snmpVersion: string;
      snmpPort: number;
      location: string;
      area: string;
      tags: string;
      autoBackup: string;
    }[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const row = parseCsvRow(line);

      const name = getCol(row, "name");
      const ipAddress = getCol(row, "ipaddress");

      if (!name) {
        errors.push(`Row ${i + 1}: Missing device name`);
        continue;
      }
      if (!ipAddress) {
        errors.push(`Row ${i + 1}: Missing IP address`);
        continue;
      }
      if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ipAddress)) {
        errors.push(`Row ${i + 1}: Invalid IP address "${ipAddress}"`);
        continue;
      }

      const type = getCol(row, "type").toUpperCase();
      if (type && !validTypes.includes(type)) {
        errors.push(`Row ${i + 1}: Invalid device type "${type}". Valid: ${validTypes.join(", ")}`);
        continue;
      }

      const vendor = getCol(row, "vendor").toUpperCase();
      if (vendor && !validVendors.includes(vendor)) {
        errors.push(`Row ${i + 1}: Invalid vendor "${vendor}". Valid: ${validVendors.join(", ")}`);
        continue;
      }

      const protocol = getCol(row, "monitorprotocol").toUpperCase();
      if (protocol && !validProtocols.includes(protocol)) {
        errors.push(`Row ${i + 1}: Invalid monitor protocol "${protocol}". Valid: ${validProtocols.join(", ")}`);
        continue;
      }

      const port = parseInt(getCol(row, "port")) || 22;
      const apiPort = parseInt(getCol(row, "apiport")) || 8728;
      const snmpPort = parseInt(getCol(row, "snmpport")) || 161;

      if (port < 1 || port > 65535) {
        errors.push(`Row ${i + 1}: SSH port must be between 1 and 65535`);
        continue;
      }
      if (apiPort < 1 || apiPort > 65535) {
        errors.push(`Row ${i + 1}: API port must be between 1 and 65535`);
        continue;
      }
      if (snmpPort < 1 || snmpPort > 65535) {
        errors.push(`Row ${i + 1}: SNMP port must be between 1 and 65535`);
        continue;
      }

      devices.push({
        name,
        ipAddress,
        type: type || "ROUTER",
        vendor: vendor || "OTHER",
        model: getCol(row, "model"),
        port,
        apiPort,
        username: getCol(row, "username") || "admin",
        password: getCol(row, "password"),
        monitorProtocol: protocol || "SNMP",
        snmpCommunity: getCol(row, "snmpcommunity") || "public",
        snmpVersion: getCol(row, "snmpversion") || "2c",
        snmpPort,
        location: getCol(row, "location"),
        area: getCol(row, "area"),
        tags: getCol(row, "tags"),
        autoBackup: getCol(row, "autobackup"),
      });
    }

    if (errors.length > 0 && devices.length === 0) {
      return NextResponse.json({ error: "All rows had errors", details: errors }, { status: 400 });
    }

    let created = 0;
    let skipped = 0;
    const skippedDetails: string[] = [];

    for (const device of devices) {
      try {
        // Resolve area by name if provided
        let areaId: string | null = null;
        if (device.Area) {
          const areaRecord = await db.area.findFirst({
            where: { name: { contains: device.Area } },
            select: { id: true },
          });
          if (areaRecord) areaId = areaRecord.id;
        }

        // Parse tags: support both JSON array and semicolon-separated
        let tagsJson = "[]";
        if (device.tags) {
          if (device.tags.startsWith("[") || device.tags.startsWith("{")) {
            tagsJson = device.tags;
          } else {
            tagsJson = JSON.stringify(device.tags.split(";").map((t) => t.trim()).filter(Boolean));
          }
        }

        await db.networkDevice.create({
          data: {
            name: device.name,
            type: device.type as "ROUTER" | "SWITCH" | "AP" | "OLT" | "ONU" | "SERVER" | "FIREWALL" | "GATEWAY" | "BRIDGE" | "WIRELESS_BRIDGE" | "OTHER",
            vendor: device.vendor as "MIKROTIK" | "CISCO" | "JUNIPER" | "HUAWEI" | "ZTE" | "VSOL" | "BDCOM" | "UBIQUITI" | "TP_LINK" | "ARUBA" | "FORTINET" | "OTHER",
            model: device.model,
            ipAddress: device.ipAddress,
            port: device.port,
            apiPort: device.apiPort,
            username: device.username,
            password: device.password,
            monitorProtocol: device.monitorProtocol as "SNMP" | "SNMP_V3" | "SSH" | "API" | "TELNET" | "HTTP",
            snmpCommunity: device.snmpCommunity,
            snmpVersion: device.snmpVersion,
            snmpPort: device.snmpPort,
            location: device.location,
            areaId,
            tags: tagsJson,
            autoBackup: device.autoBackup === "true" || device.autoBackup === "1" || device.autoBackup === "yes",
            status: "UNKNOWN",
          },
        });

        created++;
      } catch (err: unknown) {
        skipped++;
        const errMsg = err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002"
          ? `IP ${device.ipAddress} already exists`
          : `Failed to create "${device.name}"`;
        skippedDetails.push(errMsg);
      }
    }

    await auditCreate(req, "NetworkDevice", "bulk-import", { total: devices.length, created, skipped, errors });

    return NextResponse.json({
      total: devices.length,
      created,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      skippedDetails: skippedDetails.length > 0 ? skippedDetails : undefined,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Device import error:", error);
    return NextResponse.json({ error: "Failed to import devices" }, { status: 500 });
  }
}
