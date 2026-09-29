import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    try {
      await requireAuth(req);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No CSV file uploaded" }, { status: 400 });
    }

    if (!file.name.endsWith(".csv")) {
      return NextResponse.json({ error: "Only CSV files are accepted" }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Maximum 5MB" }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

    if (lines.length < 2) {
      return NextResponse.json({ error: "CSV must have at least a header row and one data row" }, { status: 400 });
    }

    // Parse header
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));

    const hasDenomination = header.includes("denomination") || header.includes("amount") || header.includes("price") || header.includes("value");
    if (!hasDenomination) {
      return NextResponse.json({
        error: "CSV must contain a 'denomination' (or 'amount'/'price'/'value') column",
      }, { status: 400 });
    }

    const denomIdx = header.findIndex((h) => ["denomination", "amount", "price", "value"].includes(h));
    const planIdx = header.findIndex((h) => ["plan", "plan_name", "planname", "plan name"].includes(h.replace(/\s/g, "")));
    const validityIdx = header.findIndex((h) => ["validity_days", "validitydays", "validity", "days"].includes(h.replace(/\s/g, "")));
    const prefixIdx = header.findIndex((h) => ["prefix", "code_prefix", "codeprefix"].includes(h.replace(/\s/g, "")));
    const countIdx = header.findIndex((h) => ["count", "quantity", "qty"].includes(h));

    const plans = await db.plan.findMany({
      select: { id: true, name: true },
      where: { status: "ACTIVE" },
    });
    const planNameMap = new Map(plans.map((p) => [p.name.toLowerCase(), p.id]));

    const existingCodes = new Set(
      (await db.voucher.findMany({ select: { code: true } })).map((v) => v.code)
    );

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    const maxVouchers = 500;

    for (let i = 1; i < lines.length && created < maxVouchers; i++) {
      const cols = parseCSVLine(lines[i]);

      try {
        const denomination = parseFloat((cols[denomIdx] || "").replace(/['"]/g, ""));
        if (!denomination || denomination <= 0) {
          skipped++;
          errors.push(`Row ${i + 1}: Invalid denomination`);
          continue;
        }

        const count = countIdx >= 0 ? parseInt(cols[countIdx]) || 1 : 1;
        const validityDays = validityIdx >= 0 ? parseInt(cols[validityIdx]) || 30 : 30;
        const prefix = prefixIdx >= 0 ? (cols[prefixIdx] || "").replace(/['"]/g, "").trim() : "CRYPTSK";
        const planName = planIdx >= 0 ? (cols[planIdx] || "").replace(/['"]/g, "").trim() : "";
        const planId = planName ? planNameMap.get(planName.toLowerCase()) || null : null;

        for (let j = 0; j < count && created < maxVouchers; j++) {
          let code: string;
          let attempts = 0;
          do {
            const raw = crypto.randomBytes(6).toString("hex").toUpperCase();
            code = prefix ? `${prefix}-${raw}` : raw;
            attempts++;
            if (attempts > 100) break;
          } while (existingCodes.has(code));

          if (attempts > 100) {
            skipped++;
            errors.push(`Row ${i + 1}: Could not generate unique code`);
            continue;
          }

          existingCodes.add(code);
          await db.voucher.create({
            data: {
              code,
              denomination,
              planId,
              validityDays,
              status: "ACTIVE",
            },
          });
          created++;
        }
      } catch {
        skipped++;
        errors.push(`Row ${i + 1}: Parse error`);
      }
    }

    await auditCreate(req, "Voucher", "import", {
      created,
      skipped,
      totalRows: lines.length - 1,
      errors: errors.slice(0, 10),
    });

    return NextResponse.json({
      success: true,
      created,
      skipped,
      errors: errors.length > 10 ? errors.slice(0, 10).concat([`...and ${errors.length - 10} more errors`]) : errors,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Vouchers import error:", error);
    return NextResponse.json({ error: "Failed to import vouchers" }, { status: 500 });
  }
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
