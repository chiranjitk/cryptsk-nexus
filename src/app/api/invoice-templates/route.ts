import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DEFAULT_TEMPLATE_HTML } from "@/lib/invoice-merge";
import { requireAuth, AuthError } from "@/lib/api-auth";

const TEMPLATE_TYPES = ["USER", "PARTNER", "CUSTOM"];

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** GET /api/invoice-templates — list all templates (full body included). */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const templates = await db.invoiceTemplate.findMany({
      orderBy: [{ isSystem: "desc" }, { updatedAt: "desc" }],
    });
    return NextResponse.json({ ok: true, data: templates });
  } catch (e) {
    if (e instanceof AuthError) {
      return bad(e.message, e.statusCode);
    }
    return bad(e instanceof Error ? e.message : "Failed to load templates", 500);
  }
}

/** POST /api/invoice-templates — create a template. */
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json().catch(() => null);
    const name = String(body?.name ?? "").trim();
    const type = String(body?.type ?? "USER").toUpperCase();
    if (!name) return bad("Template name is required");
    if (name.length > 120) return bad("Template name is too long");
    if (!TEMPLATE_TYPES.includes(type)) return bad("Template type must be USER, PARTNER or CUSTOM");
    const clash = await db.invoiceTemplate.findUnique({ where: { name } });
    if (clash) return bad("A template with this name already exists");
    const created = await db.invoiceTemplate.create({
      data: {
        name,
        type,
        bodyHtml: String(body?.bodyHtml ?? "") || DEFAULT_TEMPLATE_HTML,
        isSystem: false,
      },
    });
    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthError) {
      return bad(e.message, e.statusCode);
    }
    return bad(e instanceof Error ? e.message : "Failed to create template", 500);
  }
}

/** PUT /api/invoice-templates — update an existing template. */
export async function PUT(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json().catch(() => null);
    const id = String(body?.id ?? "");
    if (!id) return bad("Template id is required");
    const existing = await db.invoiceTemplate.findUnique({ where: { id } });
    if (!existing) return bad("Template not found", 404);

    const data: { name?: string; type?: string; bodyHtml?: string } = {};
    if (body?.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return bad("Template name is required");
      const clash = await db.invoiceTemplate.findUnique({ where: { name } });
      if (clash && clash.id !== id) return bad("A template with this name already exists");
      data.name = name;
    }
    if (body?.type !== undefined) {
      const type = String(body.type).toUpperCase();
      if (!TEMPLATE_TYPES.includes(type)) return bad("Template type must be USER, PARTNER or CUSTOM");
      if (existing.isSystem && existing.type !== type) return bad("System templates cannot change type");
      data.type = type;
    }
    if (body?.bodyHtml !== undefined) data.bodyHtml = String(body.bodyHtml);

    const updated = await db.invoiceTemplate.update({ where: { id }, data });
    return NextResponse.json({ ok: true, data: updated });
  } catch (e) {
    if (e instanceof AuthError) {
      return bad(e.message, e.statusCode);
    }
    return bad(e instanceof Error ? e.message : "Failed to update template", 500);
  }
}

/** DELETE /api/invoice-templates?ids=a,b,c — delete one or many (system templates protected). */
export async function DELETE(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get("ids") ?? searchParams.get("id") ?? "";
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (!ids.length) return bad("Provide template id(s) to delete");
    const templates = await db.invoiceTemplate.findMany({ where: { id: { in: ids } } });
    const blocked = templates.filter((t) => t.isSystem).map((t) => t.name);
    const deletable = templates.filter((t) => !t.isSystem).map((t) => t.id);
    if (deletable.length) {
      await db.invoiceTemplate.deleteMany({ where: { id: { in: deletable } } });
    }
    return NextResponse.json({ ok: true, data: { deleted: deletable.length, blocked } });
  } catch (e) {
    if (e instanceof AuthError) {
      return bad(e.message, e.statusCode);
    }
    return bad(e instanceof Error ? e.message : "Failed to delete templates", 500);
  }
}
