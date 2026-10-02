import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";

const INVOICE_FORMAT_FIELDS = [
  "invoicePrefix",
  "invoiceSeparator",
  "invoiceNumberPadding",
  "invoiceStartNumber",
  "invoiceAutoReset",
] as const;

/** Generate a preview invoice number based on current settings and count */
function generatePreviewNumber(prefix: string, separator: string, padding: number, startNumber: number, autoReset: string, lastResetAt: Date | null) {
  const now = new Date();
  let sequenceNumber = startNumber;

  if (autoReset === "YEARLY" && lastResetAt) {
    const lastYear = lastResetAt.getFullYear();
    if (now.getFullYear() > lastYear) {
      sequenceNumber = startNumber;
    } else {
      // We'd need the actual count, but for preview just use startNumber + 1
      sequenceNumber = startNumber + 1;
    }
  } else if (autoReset === "MONTHLY" && lastResetAt) {
    const lastMonth = lastResetAt.getFullYear() * 100 + lastResetAt.getMonth();
    const currentMonth = now.getFullYear() * 100 + now.getMonth();
    if (currentMonth > lastMonth) {
      sequenceNumber = startNumber;
    } else {
      sequenceNumber = startNumber + 1;
    }
  } else {
    sequenceNumber = startNumber + 1;
  }

  const padded = String(sequenceNumber).padStart(padding, "0");
  let suffix = "";
  if (autoReset === "YEARLY") {
    suffix = separator + String(now.getFullYear());
  } else if (autoReset === "MONTHLY") {
    suffix = separator + String(now.getFullYear()) + String(now.getMonth() + 1).padStart(2, "0");
  }

  return prefix + separator + padded + suffix;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    let settings = await db.ispSettings.findUnique({ where: { id: "default" } });
    if (!settings) {
      settings = await db.ispSettings.create({ data: { id: "default" } });
    }

    const formatSettings: Record<string, unknown> = {};
    for (const field of INVOICE_FORMAT_FIELDS) {
      formatSettings[field] = settings[field];
    }
    formatSettings.invoiceLastResetAt = settings.invoiceLastResetAt;

    // Get current invoice count for preview
    const invoiceCount = await db.invoice.count();

    const preview = generatePreviewNumber(
      settings.invoicePrefix,
      settings.invoiceSeparator,
      settings.invoiceNumberPadding,
      settings.invoiceStartNumber,
      settings.invoiceAutoReset,
      settings.invoiceLastResetAt,
    );

    return NextResponse.json({
      success: true,
      settings: formatSettings,
      preview,
      currentCount: invoiceCount,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("Invoice format GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch invoice format settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const body = await request.json();

    // Validate prefix
    if (body.invoicePrefix !== undefined) {
      if (typeof body.invoicePrefix !== "string" || body.invoicePrefix.length > 20) {
        return NextResponse.json({ success: false, error: "Invoice prefix must be 1-20 characters" }, { status: 400 });
      }
    }

    // Validate separator
    if (body.invoiceSeparator !== undefined) {
      if (typeof body.invoiceSeparator !== "string" || body.invoiceSeparator.length > 10) {
        return NextResponse.json({ success: false, error: "Separator must be 0-10 characters" }, { status: 400 });
      }
    }

    // Validate padding
    if (body.invoiceNumberPadding !== undefined) {
      const val = Number(body.invoiceNumberPadding);
      if (!Number.isInteger(val) || val < 1 || val > 10) {
        return NextResponse.json({ success: false, error: "Padding must be between 1 and 10" }, { status: 400 });
      }
    }

    // Validate start number
    if (body.invoiceStartNumber !== undefined) {
      const val = Number(body.invoiceStartNumber);
      if (!Number.isInteger(val) || val < 1 || val > 999999) {
        return NextResponse.json({ success: false, error: "Start number must be between 1 and 999999" }, { status: 400 });
      }
    }

    // Validate auto reset
    if (body.invoiceAutoReset !== undefined) {
      if (!["NEVER", "YEARLY", "MONTHLY"].includes(body.invoiceAutoReset)) {
        return NextResponse.json({ success: false, error: "Auto reset must be NEVER, YEARLY, or MONTHLY" }, { status: 400 });
      }
    }

    // If auto-reset is changing, we may need to update lastResetAt
    const updateData: Record<string, unknown> = {};
    for (const field of INVOICE_FORMAT_FIELDS) {
      if (body[field] !== undefined) {
        updateData[field] = field === "invoiceNumberPadding" || field === "invoiceStartNumber"
          ? Number(body[field])
          : body[field];
      }
    }

    // Capture old values
    const oldSettings = await db.ispSettings.findUnique({ where: { id: "default" } });
    const previousValues: Record<string, unknown> = {};
    for (const field of INVOICE_FORMAT_FIELDS) {
      if (oldSettings) {
        previousValues[field] = oldSettings[field];
      }
    }
    previousValues.invoiceLastResetAt = oldSettings?.invoiceLastResetAt;

    const settings = await db.ispSettings.upsert({
      where: { id: "default" },
      update: updateData,
      create: { id: "default", ...updateData },
    });

    // Audit log
    const changedFields: Record<string, { old: unknown; new: unknown }> = {};
    for (const field of INVOICE_FORMAT_FIELDS) {
      if (body[field] !== undefined) {
        const oldVal = previousValues[field];
        const newVal = settings[field as keyof typeof settings];
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changedFields[field] = { old: oldVal, new: newVal };
        }
      }
    }

    await auditLog(request, "CONFIG_CHANGE", "InvoiceFormatSettings", "default", {
      details: changedFields,
      previousValues,
      userId,
    });

    // Build response
    const formatSettings: Record<string, unknown> = {};
    for (const field of INVOICE_FORMAT_FIELDS) {
      formatSettings[field] = settings[field];
    }
    formatSettings.invoiceLastResetAt = settings.invoiceLastResetAt;

    const preview = generatePreviewNumber(
      settings.invoicePrefix,
      settings.invoiceSeparator,
      settings.invoiceNumberPadding,
      settings.invoiceStartNumber,
      settings.invoiceAutoReset,
      settings.invoiceLastResetAt,
    );

    return NextResponse.json({ success: true, settings: formatSettings, preview });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("Invoice format PUT error:", error);
    return NextResponse.json({ success: false, error: "Failed to save invoice format settings" }, { status: 500 });
  }
}
