import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditBulk } from "@/lib/services/audit-service";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    let userId: string | undefined;
    try {
      userId = await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
    if (!userId) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    const body = await request.json();
    const { rows } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 });
    }
    if (rows.length > 500) {
      return NextResponse.json({ error: "Maximum 500 rows per import" }, { status: 400 });
    }

    const created: { name: string; code: string }[] = [];
    const errors: { row: number; error: string }[] = [];
    const validStatuses = ["ACTIVE", "INACTIVE", "EXPANDING"];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = (row.name || "").trim();
      const code = (row.code || "").trim();

      if (!name) {
        errors.push({ row: i + 1, error: "Name is required" });
        continue;
      }
      if (!code) {
        errors.push({ row: i + 1, error: "Code is required" });
        continue;
      }

      // Check for duplicate code
      const upperCode = code.toUpperCase();
      const existing = await db.area.findUnique({ where: { code: upperCode } });
      if (existing) {
        errors.push({ row: i + 1, error: `Code "${upperCode}" already exists` });
        continue;
      }

      // Resolve parent area by name
      let parentId: string | null = null;
      if (row.parentName) {
        const parentArea = await db.area.findFirst({ where: { name: row.parentName.trim() } });
        if (parentArea) {
          parentId = parentArea.id;
        }
        // If parent not found, just skip (don't fail the whole import)
      }

      const status = validStatuses.includes(row.status) ? row.status : "ACTIVE";
      const latitude = row.latitude !== undefined && row.latitude !== null && row.latitude !== "" ? Number(row.latitude) : null;
      const longitude = row.longitude !== undefined && row.longitude !== null && row.longitude !== "" ? Number(row.longitude) : null;

      try {
        await db.area.create({
          data: {
            name,
            code: upperCode,
            description: (row.description || "").trim(),
            status,
            parentId,
            latitude: latitude !== null && !isNaN(latitude) ? latitude : null,
            longitude: longitude !== null && !isNaN(longitude) ? longitude : null,
          },
        });
        created.push({ name, code: upperCode });
      } catch (err) {
        errors.push({ row: i + 1, error: `Failed to create area "${name}"` });
      }
    }

    auditBulk(request, "BULK_CREATE", "Area", created.length, undefined, { successCount: created.length, errorCount: errors.length }).catch(() => {});

    return NextResponse.json({
      success: true,
      created: created.length,
      errors: errors.length,
      details: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Areas bulk import error:", error);
    return NextResponse.json({ error: "Failed to import areas" }, { status: 500 });
  }
}
