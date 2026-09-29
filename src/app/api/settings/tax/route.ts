import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";

const TAX_FIELDS = [
  "defaultCgstRate",
  "defaultSgstRate",
  "defaultIgstRate",
  "taxType",
  "taxInclusive",
  "compositeScheme",
  "compositeSchemeRate",
  "hsnCodes",
] as const;

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    let settings = await db.ispSettings.findUnique({ where: { id: "default" } });
    if (!settings) {
      settings = await db.ispSettings.create({ data: { id: "default" } });
    }

    const taxSettings: Record<string, unknown> = {};
    for (const field of TAX_FIELDS) {
      taxSettings[field] = settings[field];
    }

    return NextResponse.json({ success: true, settings: taxSettings });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("Tax settings GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch tax settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();

    // Validate tax type
    if (body.taxType !== undefined && body.taxType !== "INTRA_STATE" && body.taxType !== "INTER_STATE") {
      return NextResponse.json({ success: false, error: "taxType must be INTRA_STATE or INTER_STATE" }, { status: 400 });
    }

    // Validate tax rates
    for (const field of ["defaultCgstRate", "defaultSgstRate", "defaultIgstRate", "compositeSchemeRate"] as const) {
      if (body[field] !== undefined) {
        const val = Number(body[field]);
        if (isNaN(val) || val < 0 || val > 100) {
          return NextResponse.json({ success: false, error: `${field} must be between 0 and 100` }, { status: 400 });
        }
      }
    }

    // Validate boolean fields
    for (const field of ["taxInclusive", "compositeScheme"] as const) {
      if (body[field] !== undefined && typeof body[field] !== "boolean") {
        return NextResponse.json({ success: false, error: `${field} must be a boolean` }, { status: 400 });
      }
    }

    // Capture old values
    const oldSettings = await db.ispSettings.findUnique({ where: { id: "default" } });
    const previousValues: Record<string, unknown> = {};
    for (const field of TAX_FIELDS) {
      if (oldSettings) {
        previousValues[field] = oldSettings[field];
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    for (const field of TAX_FIELDS) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const settings = await db.ispSettings.upsert({
      where: { id: "default" },
      update: updateData,
      create: { id: "default", ...updateData },
    });

    // Audit log
    const changedFields: Record<string, { old: unknown; new: unknown }> = {};
    for (const field of TAX_FIELDS) {
      if (body[field] !== undefined) {
        const oldVal = previousValues[field];
        const newVal = settings[field as keyof typeof settings];
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changedFields[field] = { old: oldVal, new: newVal };
        }
      }
    }

    await auditLog(request, "CONFIG_CHANGE", "TaxSettings", "default", {
      details: changedFields,
      previousValues,
      userId,
    });

    const taxSettings: Record<string, unknown> = {};
    for (const field of TAX_FIELDS) {
      taxSettings[field] = settings[field];
    }

    return NextResponse.json({ success: true, settings: taxSettings });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("Tax settings PUT error:", error);
    return NextResponse.json({ success: false, error: "Failed to save tax settings" }, { status: 500 });
  }
}
