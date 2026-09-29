import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";
import type { NextRequest } from "next/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(_request);
    const { id } = await params;
    const template = await db.whatsAppTemplate.findUnique({ where: { id } });
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("WhatsApp template get error:", error);
    return NextResponse.json({ error: "Failed to fetch template" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const userId = await requireAuth(request);

    const existing = await db.whatsAppTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Auto-detect variables if content changed
    let variables = existing.variables;
    if (body.content) {
      const variableRegex = /\{\{(\w+)\}\}/g;
      const vars: string[] = [];
      let match;
      while ((match = variableRegex.exec(body.content)) !== null) {
        if (!vars.includes(match[1])) vars.push(match[1]);
      }
      variables = JSON.stringify(vars);
    }

    // Handle approval actions
    if (body.action === "submit_for_approval") {
      const updated = await db.whatsAppTemplate.update({
        where: { id },
        data: { approvalStatus: "PENDING" },
      });
      await auditLog(request, "STATUS_CHANGE", "WhatsAppTemplate", id, {
        details: { from: existing.approvalStatus, to: "PENDING" },
        userId,
      });
      return NextResponse.json(updated);
    }

    if (body.action === "approve") {
      const updated = await db.whatsAppTemplate.update({
        where: { id },
        data: { approvalStatus: "APPROVED", reviewedBy: userId, reviewedAt: new Date(), rejectionReason: "" },
      });
      await auditLog(request, "APPROVAL", "WhatsAppTemplate", id, {
        details: { templateName: existing.name },
        userId,
      });
      return NextResponse.json(updated);
    }

    if (body.action === "reject") {
      const updated = await db.whatsAppTemplate.update({
        where: { id },
        data: { approvalStatus: "REJECTED", reviewedBy: userId, reviewedAt: new Date(), rejectionReason: body.reason || "" },
      });
      await auditLog(request, "REJECTION", "WhatsAppTemplate", id, {
        details: { templateName: existing.name, reason: body.reason || "" },
        userId,
      });
      return NextResponse.json(updated);
    }

    const updated = await db.whatsAppTemplate.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        category: body.category ?? existing.category,
        content: body.content ?? existing.content,
        variables,
        status: body.status ?? existing.status,
        mediaType: body.mediaType ?? existing.mediaType,
        mediaUrl: body.mediaUrl ?? existing.mediaUrl,
      },
    });

    await auditLog(request, "UPDATE", "WhatsAppTemplate", id, {
      details: { name: updated.name, category: updated.category },
      userId,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("WhatsApp template update error:", error);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const existing = await db.whatsAppTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    await db.whatsAppTemplate.delete({ where: { id } });
    await auditLog(request, "DELETE", "WhatsAppTemplate", id, {
      details: { deleted: { name: existing.name, category: existing.category } },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("WhatsApp template delete error:", error);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
