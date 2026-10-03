import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

async function getSettings() {
  const existing = await db.ispSettings.findFirst();
  if (existing) return existing;
  return db.ispSettings.create({ data: {} });
}

/** GET /api/settings/invoice-template-config — default template bindings + template list. */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const s = await getSettings();
    const templates = await db.invoiceTemplate.findMany({
      select: { id: true, name: true, type: true, isSystem: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({
      ok: true,
      data: {
        defaultUserInvoiceTemplateId: s.defaultUserInvoiceTemplateId ?? "",
        defaultPartnerInvoiceTemplateId: s.defaultPartnerInvoiceTemplateId ?? "",
        defaultCustomInvoiceTemplateId: s.defaultCustomInvoiceTemplateId ?? "",
        templates,
      },
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.statusCode });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to load config" },
      { status: 500 },
    );
  }
}

/** PUT /api/settings/invoice-template-config — bind default templates per invoice type. */
export async function PUT(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json().catch(() => null);
    const s = await getSettings();
    const data: {
      defaultUserInvoiceTemplateId?: string | null;
      defaultPartnerInvoiceTemplateId?: string | null;
      defaultCustomInvoiceTemplateId?: string | null;
    } = {};
    const keys = [
      "defaultUserInvoiceTemplateId",
      "defaultPartnerInvoiceTemplateId",
      "defaultCustomInvoiceTemplateId",
    ] as const;
    for (const key of keys) {
      if (body?.[key] !== undefined) {
        const v = body[key];
        if (v === null || v === "") {
          data[key] = null;
          continue;
        }
        const t = await db.invoiceTemplate.findUnique({ where: { id: String(v) } });
        if (!t) {
          return NextResponse.json({ ok: false, error: `Template not found for ${key}` }, { status: 400 });
        }
        data[key] = t.id;
      }
    }
    const updated = await db.ispSettings.update({ where: { id: s.id }, data });
    return NextResponse.json({ ok: true, data: updated });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.statusCode });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to save config" },
      { status: 500 },
    );
  }
}
