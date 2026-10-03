import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  buildMergeMap,
  renderTemplate,
  sampleInvoiceData,
  sampleIspData,
  DEFAULT_TEMPLATE_HTML,
  type MergeInvoiceData,
  type MergeLineItem,
} from "@/lib/invoice-merge";
import { requireAuth, AuthError } from "@/lib/api-auth";

/* Schema-tolerant helpers: real invoices vary in field naming across the
   app's history, so values are picked from the first matching candidate. */

function rec(v: unknown): Record<string, unknown> {
  return (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
}

function pickStr(o: Record<string, unknown>, keys: string[], fb = ""): string {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && typeof v !== "object" && String(v) !== "") return String(v);
  }
  return fb;
}

function pickNum(o: Record<string, unknown>, keys: string[], fb = 0): number {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(parseFloat(v))) return parseFloat(v);
    if (v && typeof v === "object" && typeof (v as { toNumber?: unknown }).toNumber === "function") {
      try {
        return (v as { toNumber: () => number }).toNumber();
      } catch {
        /* ignore */
      }
    }
  }
  return fb;
}

function pickDate(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "string" && v && !Number.isNaN(new Date(v).getTime())) return v;
  }
  return "";
}

async function tryFind(model: string, where: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const dyn = db as unknown as Record<string, { findUnique?: (a: unknown) => Promise<unknown> }>;
  const m = dyn[model];
  if (!m?.findUnique) return null;
  try {
    const r = await m.findUnique({ where });
    return r ? rec(r) : null;
  } catch {
    return null;
  }
}

async function tryMany(model: string, where: Record<string, unknown>): Promise<Record<string, unknown>[] | null> {
  const dyn = db as unknown as Record<string, { findMany?: (a: unknown) => Promise<unknown[]> }>;
  const m = dyn[model];
  if (!m?.findMany) return null;
  try {
    const r = await m.findMany({ where, take: 100 });
    return r.map(rec);
  } catch {
    return null;
  }
}

/**
 * GET /api/invoice-templates/render?invoiceId=...[&templateId=...]
 * Renders a real invoice through a template. Template resolution order:
 *   1. explicit ?templateId
 *   2. settings default bound to the invoice type (USER/PARTNER/CUSTOM)
 *   3. first system template
 *   4. built-in default template
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const url = new URL(req.url);
    const invoiceId = url.searchParams.get("invoiceId");
    if (!invoiceId) {
      return NextResponse.json({ ok: false, error: "invoiceId is required" }, { status: 400 });
    }

    const invoiceRow = await db.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoiceRow) {
      return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
    }
    const inv = rec(invoiceRow);
    const sample = sampleInvoiceData();
    const invType = pickStr(inv, ["type", "invoiceType"], "USER").toUpperCase();

    // Customer (relation name varies across schema history — try known models)
    const custId = pickStr(inv, ["subscriberId", "customerId"]);
    const customer =
      (custId ? await tryFind("subscriber", { id: custId }) : null) ??
      (custId ? await tryFind("customer", { id: custId }) : null) ??
      rec(sample.customer);

    // Line items (model/FK naming tolerant)
    const itemsRaw =
      (await tryMany("invoiceLineItem", { invoiceId })) ??
      (await tryMany("invoiceItem", { invoiceId })) ??
      [];
    const lineItems: MergeLineItem[] = itemsRaw.map((li) => {
      const unitPrice = pickNum(li, ["unitPrice", "unit_amount", "price", "rate", "amount"]);
      return {
        description: pickStr(li, ["description", "name", "label"], "Charge"),
        quantity: pickNum(li, ["quantity", "qty"], 1),
        unitPrice,
        amount: pickNum(li, ["amount", "total", "lineTotal"], unitPrice),
      };
    });

    const data: MergeInvoiceData = {
      invoiceNo: pickStr(inv, ["invoiceNo", "invoiceNumber", "number", "no"], sample.invoiceNo),
      invoiceDate: pickDate(inv, ["invoiceDate", "date", "createdAt"]) || sample.invoiceDate,
      dueDate: pickDate(inv, ["dueDate", "due_date"]) || sample.dueDate,
      billingPeriod: pickStr(inv, ["billingPeriod", "period"], sample.billingPeriod),
      status: pickStr(inv, ["status"], "UNKNOWN"),
      invoiceType: invType,
      customer: {
        name: pickStr(customer, ["name", "fullName", "firstName", "username"], sample.customer.name),
        username: pickStr(customer, ["username", "login", "accountId"], sample.customer.username),
        address: pickStr(customer, ["address", "addressLine1", "street"], sample.customer.address),
        city: pickStr(customer, ["city"], sample.customer.city),
        state: pickStr(customer, ["state"], sample.customer.state),
        zip: pickStr(customer, ["zip", "pincode", "postalCode"], sample.customer.zip),
        phone: pickStr(customer, ["phone", "mobile", "contact"], sample.customer.phone),
        email: pickStr(customer, ["email"], sample.customer.email),
      },
      plan: { ...sample.plan },
      amounts: {
        subTotal: pickNum(inv, ["subTotal", "subtotal", "baseAmount", "amountBeforeTax"], sample.amounts.subTotal),
        discount: pickNum(inv, ["discount", "discountAmount"], 0),
        taxPercent: pickNum(inv, ["taxPercent", "gstPercent", "taxRate"], sample.amounts.taxPercent),
        taxAmount: pickNum(inv, ["taxAmount", "tax", "gstAmount"], 0),
        grandTotal: pickNum(inv, ["grandTotal", "total", "totalAmount", "finalAmount", "amount"], sample.amounts.grandTotal),
        amountPaid: pickNum(inv, ["amountPaid", "paidAmount"], 0),
        balanceDue: pickNum(inv, ["balanceDue", "dueAmount"], 0),
        symbol: "\u20B9",
      },
      lineItems: lineItems.length ? lineItems : sample.lineItems,
      payments: [],
      notes: pickStr(inv, ["notes", "note", "remarks"], ""),
    };

    const settingsRow = rec(await db.ispSettings.findFirst());
    const sampleIsp = sampleIspData();
    const isp = {
      name: pickStr(settingsRow, ["ispName", "companyName", "brandName"], sampleIsp.name),
      address: pickStr(settingsRow, ["ispAddress", "companyAddress", "address"], sampleIsp.address),
      phone: pickStr(settingsRow, ["ispPhone", "supportPhone", "phone"], sampleIsp.phone),
      email: pickStr(settingsRow, ["ispEmail", "billingEmail", "email"], sampleIsp.email),
      website: pickStr(settingsRow, ["ispWebsite", "website"], sampleIsp.website),
      gstin: pickStr(settingsRow, ["gstin", "gstIn", "ispGstin", "taxId"], sampleIsp.gstin),
      logoUrl: pickStr(settingsRow, ["logoUrl", "logo", "ispLogo"], ""),
      signatureName: pickStr(settingsRow, ["signatureName", "authorizedSignatory"], sampleIsp.signatureName),
    };

    // Resolve template
    let bodyHtml = "";
    let templateUsed = "default";
    const requestedTemplateId = url.searchParams.get("templateId");
    if (requestedTemplateId) {
      const t = await db.invoiceTemplate.findUnique({ where: { id: requestedTemplateId } });
      if (t) {
        bodyHtml = t.bodyHtml;
        templateUsed = t.name;
      }
    }
    if (!bodyHtml) {
      const typeKey =
        invType === "PARTNER"
          ? "defaultPartnerInvoiceTemplateId"
          : invType === "CUSTOM"
            ? "defaultCustomInvoiceTemplateId"
            : "defaultUserInvoiceTemplateId";
      const defaultId = pickStr(settingsRow, [typeKey]);
      if (defaultId) {
        const t = await db.invoiceTemplate.findUnique({ where: { id: defaultId } });
        if (t) {
          bodyHtml = t.bodyHtml;
          templateUsed = t.name;
        }
      }
    }
    if (!bodyHtml) {
      const anySystem = await db.invoiceTemplate.findFirst({ where: { isSystem: true } });
      if (anySystem) {
        bodyHtml = anySystem.bodyHtml;
        templateUsed = anySystem.name;
      }
    }
    if (!bodyHtml) bodyHtml = DEFAULT_TEMPLATE_HTML;

    const html = renderTemplate(bodyHtml, buildMergeMap(data, isp));
    return NextResponse.json({ ok: true, data: { html, templateUsed } });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.statusCode });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Render failed" },
      { status: 500 },
    );
  }
}
