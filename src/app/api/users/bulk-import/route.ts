import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requirePermission, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";
import type { NextRequest } from "next/server";

const VALID_ROLES = ["SUPER_ADMIN", "ADMIN", "OPERATOR", "AGENT", "TECHNICIAN", "VIEWER", "CUSTOMER"];

function parseCSV(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) {
    return { headers: [], rows: [] };
  }

  // Parse header row
  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || "";
    }
    rows.push(row);
  }

  return { headers, rows };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const adminUserId = await requirePermission(request, "users.create");
    const body = await request.json();
    const { csv } = body;

    if (!csv || typeof csv !== "string") {
      return NextResponse.json(
        { error: "CSV content is required. Send { csv: \"...\" }" },
        { status: 400 }
      );
    }

    const { headers, rows } = parseCSV(csv);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "CSV is empty or has no data rows" },
        { status: 400 }
      );
    }

    if (rows.length > 500) {
      return NextResponse.json(
        { error: "Maximum 500 users per import" },
        { status: 400 }
      );
    }

    // Normalize header keys
    const normalizedHeaders = headers.map((h) =>
      h.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
    );

    // Required columns: name, email
    const requiredCols = ["name", "email"];
    for (const col of requiredCols) {
      if (!normalizedHeaders.includes(col)) {
        return NextResponse.json(
          { error: `Missing required CSV column: ${col}` },
          { status: 400 }
        );
      }
    }

    const nameIdx = normalizedHeaders.indexOf("name");
    const emailIdx = normalizedHeaders.indexOf("email");
    const roleIdx = normalizedHeaders.indexOf("role");
    const phoneIdx = normalizedHeaders.indexOf("phone");
    const areaidIdx = normalizedHeaders.indexOf("areaid");

    const results: {
      success: number;
      failed: number;
      errors: { row: number; email: string; error: string }[];
    } = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (let i = 0; i < rows.length; i++) {
      const row = Object.values(rows[i]);
      const name = (row[nameIdx] || "").trim();
      const email = (row[emailIdx] || "").trim().toLowerCase();
      const rawRole = (row[roleIdx] || "").trim().toUpperCase();
      const phone = (row[phoneIdx] || "").trim();
      const rawAreaId = (row[areaidIdx] || "").trim();

      // Validation
      if (!name) {
        results.failed++;
        results.errors.push({ row: i + 2, email: email || "unknown", error: "Name is empty" });
        continue;
      }

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        results.failed++;
        results.errors.push({ row: i + 2, email: email || "unknown", error: "Invalid email" });
        continue;
      }

      const role = VALID_ROLES.includes(rawRole) ? rawRole : "OPERATOR";

      // Check for existing user
      const existing = await db.user.findUnique({ where: { email } });
      if (existing) {
        results.failed++;
        results.errors.push({ row: i + 2, email, error: "User with this email already exists" });
        continue;
      }

      // Build assignedAreaIds
      let assignedAreaIds = "[]";
      if (rawAreaId) {
        const areaIds = rawAreaId
          .split(";")
          .map((a) => a.trim())
          .filter(Boolean);
        if (areaIds.length > 0) {
          assignedAreaIds = JSON.stringify(areaIds);
        }
      }

      // Create user with default password
      const defaultPassword = "Changeme@" + Date.now().toString(36).slice(-4);
      const hashedPassword = await bcrypt.hash(defaultPassword, 12);

      try {
        await db.user.create({
          data: {
            name,
            email,
            phone,
            role: role as "SUPER_ADMIN" | "ADMIN" | "OPERATOR" | "AGENT" | "TECHNICIAN" | "VIEWER" | "CUSTOMER",
            password: hashedPassword,
            assignedAreaIds,
          },
        });
        results.success++;
      } catch {
        results.failed++;
        results.errors.push({ row: i + 2, email, error: "Database error creating user" });
      }
    }

    // Audit log
    await auditCreate(
      request,
      "User",
      "bulk_import",
      {
        totalRows: rows.length,
        success: results.success,
        failed: results.failed,
      },
      { userId: adminUserId }
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      imported: results.success,
      failed: results.failed,
      total: rows.length,
      errors: results.errors.length > 0 ? results.errors.slice(0, 20) : [],
      message: results.failed === 0
        ? `Successfully imported ${results.success} user(s)`
        : `Imported ${results.success} user(s), ${results.failed} failed`,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Bulk import error:", error);
    return NextResponse.json(
      { error: "Failed to import users" },
      { status: 500 }
    );
  }
}
