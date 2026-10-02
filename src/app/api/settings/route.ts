import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireAuth, AuthError } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";

// ─── Constants ───────────────────────────────────────────────────

const MASKED = "••••••••";

/** Fields whose values must be masked in GET responses */
const SENSITIVE_FIELDS: readonly string[] = [
  "radiusSecret",
  "smtpPass",
  "smsAuthKey",
  "whatsappApiToken",
  "razorpayKeySecret",
  "encryptionKey",
] as const;

/** Complete whitelist of IspSettings fields allowed for updates */
const ALLOWED_FIELDS: readonly string[] = [
  "companyName",
  "tagline",
  "logo",
  "address",
  "city",
  "state",
  "pincode",
  "phone",
  "email",
  "website",
  "gstin",
  "panNumber",
  "cinNumber",
  "primaryColor",
  "currency",
  "timezone",
  "language",
  "dateFormat",
  "gracePeriodDays",
  "lateFeeType",
  "lateFeeValue",
  "invoicePrefix",
  "customerCodePrefix",
  "receiptFooterText",
  "radiusServerIp",
  "radiusServerPort",
  "radiusSecret",
  "smtpHost",
  "smtpPort",
  "smtpUser",
  "smtpPass",
  "smtpFromEmail",
  "smsGateway",
  "smsAuthKey",
  "smsSenderId",
  "whatsappApiToken",
  "whatsappPhoneNumberId",
  "whatsappEnabled",
  "whatsappAutoReply",
  "whatsappGreetingMessage",
  "whatsappAwayMessage",
  "razorpayKeyId",
  "razorpayKeySecret",
  "paymentGatewayMode",
  "hsnCodes",
  "backupSettings",
  "cloudBackupConfig",
  "bandwidthThresholds",
  "encryptionKey",
  "auditRetentionDays",
  "auditAutoDelete",
  "complaintEscalationEnabled",
  "complaintEscalationLevel1Percent",
  "complaintEscalationLevel2Percent",
  "complaintEscalationRole1",
  "complaintEscalationRole2",
  "escalationPathConfig",
] as const;

// ─── Helpers ─────────────────────────────────────────────────────

function maskSensitive(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return MASKED;
  return "";
}

function sanitizeForResponse(settings: Record<string, unknown>, reveal: boolean) {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(settings)) {
    if (key === "id") continue;

    if (reveal || !SENSITIVE_FIELDS.includes(key)) {
      out[key] = val;
    } else {
      out[key] = maskSensitive(val);
    }
  }
  return out;
}

// ─── Validation ──────────────────────────────────────────────────

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ValidationError {
  field: string;
  message: string;
}

function validatePutBody(body: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (body.companyName !== undefined) {
    if (typeof body.companyName !== "string" || body.companyName.trim().length === 0) {
      errors.push({ field: "companyName", message: "Company name is required and cannot be empty." });
    }
  }

  if (body.email !== undefined && body.email !== "") {
    if (typeof body.email !== "string" || !EMAIL_RE.test(body.email)) {
      errors.push({ field: "email", message: "Invalid email format." });
    }
  }

  if (body.pincode !== undefined && body.pincode !== "") {
    if (typeof body.pincode !== "string" || !/^\d{6}$/.test(body.pincode)) {
      errors.push({ field: "pincode", message: "Pincode must be exactly 6 digits." });
    }
  }

  if (body.gstin !== undefined && body.gstin !== "") {
    if (typeof body.gstin !== "string" || !GSTIN_RE.test(body.gstin)) {
      errors.push({ field: "gstin", message: "Invalid GSTIN format (e.g. 22AAAAA0000A1Z5)." });
    }
  }

  if (body.panNumber !== undefined && body.panNumber !== "") {
    if (typeof body.panNumber !== "string" || !PAN_RE.test(body.panNumber)) {
      errors.push({ field: "panNumber", message: "Invalid PAN format (e.g. ABCDE1234F)." });
    }
  }

  if (body.gracePeriodDays !== undefined) {
    const v = Number(body.gracePeriodDays);
    if (!Number.isInteger(v) || v < 0 || v > 90) {
      errors.push({ field: "gracePeriodDays", message: "Grace period must be an integer between 0 and 90." });
    }
  }

  if (body.lateFeeType !== undefined) {
    if (body.lateFeeType !== "PERCENTAGE" && body.lateFeeType !== "FLAT") {
      errors.push({ field: "lateFeeType", message: "Late fee type must be 'PERCENTAGE' or 'FLAT'." });
    }
  }

  if (body.lateFeeValue !== undefined) {
    const v = Number(body.lateFeeValue);
    if (isNaN(v) || v < 0) {
      errors.push({ field: "lateFeeValue", message: "Late fee value must be non-negative." });
    } else if (body.lateFeeType === "PERCENTAGE" && v > 100) {
      errors.push({ field: "lateFeeValue", message: "Late fee percentage cannot exceed 100." });
    }
  }

  if (body.radiusServerPort !== undefined) {
    const v = Number(body.radiusServerPort);
    if (!Number.isInteger(v) || v < 1 || v > 65535) {
      errors.push({ field: "radiusServerPort", message: "RADIUS server port must be between 1 and 65535." });
    }
  }

  if (body.smtpPort !== undefined) {
    const v = Number(body.smtpPort);
    if (!Number.isInteger(v) || v < 1 || v > 65535) {
      errors.push({ field: "smtpPort", message: "SMTP port must be between 1 and 65535." });
    }
  }

  if (body.primaryColor !== undefined && body.primaryColor !== "") {
    if (typeof body.primaryColor !== "string" || !HEX_COLOR_RE.test(body.primaryColor)) {
      errors.push({ field: "primaryColor", message: "Primary color must be a valid hex color (e.g. #DC2626)." });
    }
  }

  if (body.auditRetentionDays !== undefined) {
    const v = Number(body.auditRetentionDays);
    if (!Number.isInteger(v) || v < 1 || v > 3650) {
      errors.push({ field: "auditRetentionDays", message: "Audit retention days must be an integer between 1 and 3650." });
    }
  }

  if (body.auditAutoDelete !== undefined) {
    if (typeof body.auditAutoDelete !== "boolean") {
      errors.push({ field: "auditAutoDelete", message: "auditAutoDelete must be a boolean." });
    }
  }

  return errors;
}

// ─── GET ─────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // requireAuth only — no specific permission needed since internal services may read this
    await requireAuth(request);

    const reveal = request.nextUrl.searchParams.get("reveal") === "true";

    let settings = await db.ispSettings.findUnique({ where: { id: "default" } });
    if (!settings) {
      settings = await db.ispSettings.create({ data: { id: "default" } });
    }

    const sanitized = sanitizeForResponse(
      { ...settings, updatedAt: settings.updatedAt },
      reveal,
    );

    return NextResponse.json({ success: true, settings: sanitized });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("Settings GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch settings" }, { status: 500 });
  }
}

// ─── PUT ─────────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const { userId } = await requirePermission(request, "settings.update");

    const body = await request.json();

    // --- Field whitelist check ---
    const unknownFields = Object.keys(body).filter((k) => !ALLOWED_FIELDS.includes(k));
    if (unknownFields.length > 0) {
      return NextResponse.json(
        { success: false, error: `Unknown fields: ${unknownFields.join(", ")}` },
        { status: 400 },
      );
    }

    // --- Server-side validation ---
    const validationErrors = validatePutBody(body);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: validationErrors },
        { status: 400 },
      );
    }

    // --- Credential preservation ---
    for (const field of SENSITIVE_FIELDS) {
      if (body[field] === MASKED) {
        delete body[field];
      }
    }

    // --- Capture old values before update ---
    const oldSettings = await db.ispSettings.findUnique({ where: { id: "default" } });
    const previousValues = oldSettings ? JSON.parse(JSON.stringify(oldSettings)) : {};

    // --- Upsert ---
    const updateData: Record<string, unknown> = {};
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const settings = await db.ispSettings.upsert({
      where: { id: "default" },
      update: updateData,
      create: { id: "default", ...updateData },
    });

    // --- Full audit log: capture ALL actually changed fields ---
    const changedFields: Record<string, { old: unknown; new: unknown }> = {};
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        const oldVal = previousValues[field];
        const newVal = settings[field as keyof typeof settings];
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changedFields[field] = { old: oldVal, new: newVal };
        }
      }
    }

    await auditLog(request, "CONFIG_CHANGE", "Settings", "isp", {
      details: changedFields,
      previousValues,
      userId,
    });

    return NextResponse.json({ success: true, settings });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("Settings PUT error:", error);
    return NextResponse.json({ success: false, error: "Failed to update settings" }, { status: 500 });
  }
}
