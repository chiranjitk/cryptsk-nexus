import { NextRequest, NextResponse } from "next/server";
import { buildMergeMap, renderTemplate, sampleInvoiceData, sampleIspData } from "@/lib/invoice-merge";
import { requireAuth, AuthError } from "@/lib/api-auth";

/** POST /api/invoice-templates/preview — render a template body with sample data. */
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json().catch(() => null);
    const bodyHtml = typeof body?.bodyHtml === "string" ? body.bodyHtml : "";
    if (!bodyHtml.trim()) {
      return NextResponse.json({ ok: false, error: "bodyHtml is required" }, { status: 400 });
    }
    const html = renderTemplate(bodyHtml, buildMergeMap(sampleInvoiceData(), sampleIspData()));
    return NextResponse.json({ ok: true, data: { html } });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.statusCode });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Preview failed" },
      { status: 500 },
    );
  }
}
