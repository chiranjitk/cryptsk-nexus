import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/api-auth";
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
      return NextResponse.json({ error: "CSV file is empty" }, { status: 400 });
    }

    // Parse header
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));

    const requiredCols = ["name"];
    for (const col of requiredCols) {
      if (!headers.includes(col)) {
        return NextResponse.json({ error: `Missing required column: ${col}` }, { status: 400 });
      }
    }

    const getCol = (row: string[], colName: string) => {
      const idx = headers.indexOf(colName);
      return idx >= 0 ? (row[idx] || "").trim().replace(/"/g, "") : "";
    };

    const agents: { name: string; phone: string; email: string; area: string; commissionRate: number; dailyTarget: number }[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Simple CSV parse (handle quoted fields)
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

      const name = getCol(row, "name");
      if (!name) {
        errors.push(`Row ${i + 1}: Missing name`);
        continue;
      }

      const phone = getCol(row, "phone");
      const email = getCol(row, "email");
      const area = getCol(row, "area");
      const commissionRate = parseFloat(getCol(row, "commissionrate")) || 0;
      const dailyTarget = parseFloat(getCol(row, "dailytarget")) || 0;

      agents.push({ name, phone, email, area, commissionRate, dailyTarget });
    }

    let created = 0;
    let skipped = 0;

    for (const agent of agents) {
      try {
        const areaIds: string[] = [];
        if (agent.Area) {
          const areaRecord = await db.area.findFirst({
            where: { name: { contains: agent.Area } },
            select: { id: true },
          });
          if (areaRecord) areaIds.push(areaRecord.id);
        }

        const user = await db.user.create({
          data: {
            name: agent.name,
            email: agent.email || `${agent.name.toLowerCase().replace(/\s+/g, ".")}@cryptsk.agent`,
            phone: agent.phone || "",
            password: await bcrypt.hash("agent_default", 12),
            role: "AGENT",
            status: "ACTIVE",
          },
        });

        await db.collectionAgent.create({
          data: {
            userId: user.id,
            name: agent.name,
            phone: agent.phone || "",
            assignedAreaIds: JSON.stringify(areaIds),
            dailyTarget: agent.dailyTarget,
            monthlyTarget: agent.dailyTarget * 30,
            totalCollectedToday: 0,
            totalCollectedMonth: 0,
            commissionRate: agent.commissionRate,
            totalCommission: 0,
            areasAssigned: { connect: areaIds.map((id) => ({ id })) },
          },
        });

        created++;
      } catch {
        skipped++;
      }
    }

    await auditCreate(req, "CollectionAgent", "bulk-import", { total: agents.length, created, skipped, errors });

    return NextResponse.json({
      total: agents.length,
      created,
      skipped,
      errors,
    });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const e = error as { statusCode: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error("Agent import POST error:", error);
    return NextResponse.json({ error: "Failed to import agents" }, { status: 500 });
  }
}
