import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { count, denomination, planId, validityDays, prefix, templateId } = body;

    if (!count || !denomination) {
      return NextResponse.json({ error: "Missing required fields: count, denomination" }, { status: 400 });
    }

    if (count < 1 || count > 500) {
      return NextResponse.json({ error: "Count must be between 1 and 500" }, { status: 400 });
    }

    if (denomination <= 0) {
      return NextResponse.json({ error: "Denomination must be greater than 0" }, { status: 400 });
    }

    // If templateId is provided, use template settings
    let finalDenomination = parseFloat(denomination);
    let finalValidityDays = validityDays || 30;
    let finalPlanId = planId || null;

    if (templateId) {
      const template = await db.voucherTemplate.findUnique({ where: { id: templateId } });
      if (template) {
        finalDenomination = parseFloat(String(denomination)) || template.denomination;
        finalValidityDays = validityDays || template.validityDays;
      }
    }

    const existingCodes = new Set(
      (await db.voucher.findMany({ select: { code: true } })).map((v) => v.code)
    );

    const generatedVouchers: { code: string; denomination: number; planId: string | null; validityDays: number; status: string }[] = [];
    const batchSize = 50;
    const batchCount = Math.ceil(count / batchSize);

    for (let b = 0; b < batchCount; b++) {
      const batch: { code: string; planId: string | null; denomination: number; validityDays: number; status: string }[] = [];
      const remaining = Math.min(batchSize, count - b * batchSize);

      for (let i = 0; i < remaining; i++) {
        let code: string;
        let attempts = 0;
        do {
          const raw = crypto.randomBytes(6).toString("hex").toUpperCase();
          code = prefix ? `${prefix}-${raw}` : raw;
          attempts++;
          if (attempts > 100) {
            return NextResponse.json({ error: "Failed to generate unique codes" }, { status: 500 });
          }
        } while (existingCodes.has(code));

        existingCodes.add(code);
        batch.push({
          code,
          planId: finalPlanId,
          denomination: finalDenomination,
          validityDays: finalValidityDays,
          status: "ACTIVE",
        });
        generatedVouchers.push(batch[batch.length - 1]);
      }

      await db.voucher.createMany({ data: batch as any });
    }

    return NextResponse.json({
      vouchers: generatedVouchers,
      count: generatedVouchers.length,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Vouchers generate error:", error);
    return NextResponse.json({ error: "Failed to generate vouchers" }, { status: 500 });
  }
}
