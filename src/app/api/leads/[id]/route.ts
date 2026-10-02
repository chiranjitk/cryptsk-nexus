import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { auditUpdate } from "@/lib/services/audit-service";

const SOURCE_LABELS: Record<string, string> = {
  WEBSITE: "Website",
  WHATSAPP: "WhatsApp",
  REFERRAL: "Referral",
  WALK_IN: "Walk-in",
  CALL: "Call",
  SOCIAL_MEDIA: "Social Media",
  OTHER: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  INTERESTED: "Interested",
  CONVERTED: "Converted",
  LOST: "Lost",
};

interface ScoreFactors {
  phonePresent?: boolean;
  emailPresent?: boolean;
  dealValueHigh?: boolean;
  sourceReferral?: boolean;
  followUpsCount?: number;
}

function calculateLeadScore(
  phone: string,
  email: string,
  dealValue: number,
  source: string,
  followUpCount: number
): { score: number; factors: ScoreFactors } {
  let score = 0;
  const factors: ScoreFactors = {};

  if (phone && phone.trim()) { score += 10; factors.phonePresent = true; }
  if (email && email.trim() && email.includes("@")) { score += 10; factors.emailPresent = true; }
  if (dealValue > 5000) { score += 20; factors.dealValueHigh = true; }
  if (source === "REFERRAL") { score += 15; factors.sourceReferral = true; }
  if (followUpCount > 2) { score += 10; factors.followUpsCount = followUpCount; }

  score = Math.min(score, 100);
  return { score, factors };
}

function formatLead(l: Record<string, unknown>) {
  return {
    id: l.id,
    name: l.name,
    phone: l.phone,
    email: l.email,
    address: l.address,
    areaId: l.areaId,
    source: SOURCE_LABELS[l.source as string] || (l.source as string),
    status: STATUS_LABELS[l.status as string] || (l.status as string),
    assignedToId: l.assignedToId,
    notes: l.notes,
    followUpDate: l.followUpDate
      ? new Date(l.followUpDate as string).toISOString().split("T")[0]
      : null,
    estimatedValue: l.estimatedValue,
    dealValue: l.dealValue,
    lostReason: l.lostReason || "",
    convertedSubscriberId: l.convertedSubscriberId,
    score: l.score || 0,
    scoreFactors: l.scoreFactors || "{}",
    duplicateOf: l.duplicateOf || null,
    createdAt: new Date(l.createdAt as string).toISOString().split("T")[0],
    updatedAt: new Date(l.updatedAt as string).toISOString().split("T")[0],
  };
}

// GET /api/leads/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Lead ID is required" }, { status: 400 });
    }

    const lead = await db.lead.findUnique({
      where: { id },
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      lead: formatLead(lead as unknown as Record<string, unknown>),
    });
  } catch (error) {
    console.error("[LEAD_GET_BY_ID]", error);
    return NextResponse.json({ error: "Failed to fetch lead" }, { status: 500 });
  }
}

// PUT /api/leads/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAuth(req);
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Lead ID is required" }, { status: 400 });
    }

    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.phone !== undefined) data.phone = String(body.phone);
    if (body.email !== undefined) data.email = String(body.email);
    if (body.address !== undefined) data.address = String(body.address);
    if (body.areaId !== undefined) data.areaId = body.areaId || null;
    if (body.status !== undefined) data.status = String(body.status);
    if (body.source !== undefined) data.source = String(body.source);
    if (body.assignedToId !== undefined) data.assignedToId = body.assignedToId || null;
    if (body.notes !== undefined) data.notes = String(body.notes);
    if (body.followUpDate !== undefined)
      data.followUpDate = body.followUpDate ? new Date(body.followUpDate) : null;
    if (body.estimatedValue !== undefined) data.estimatedValue = Number(body.estimatedValue) || 0;
    if (body.dealValue !== undefined) data.dealValue = Number(body.dealValue) || 0;
    if (body.lostReason !== undefined) data.lostReason = String(body.lostReason);

    const existing = await db.lead.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const lead = await db.lead.update({
      where: { id },
      data,
    });

    // Recalculate score
    const finalPhone = body.phone !== undefined ? String(body.phone) : existing.phone;
    const finalEmail = body.email !== undefined ? String(body.email) : existing.email;
    const finalDealValue = body.dealValue !== undefined ? Number(body.dealValue) || 0 : existing.dealValue;
    const finalSource = body.source !== undefined ? String(body.source) : existing.source;
    const followUpCount = (existing.notes || "").split("\n").filter((n: string) => n.trim().length > 0).length;

    const { score, factors } = calculateLeadScore(finalPhone, finalEmail, finalDealValue, finalSource, followUpCount);
    await db.lead.update({
      where: { id },
      data: { score, scoreFactors: JSON.stringify(factors) },
    });

    await auditUpdate(req, "Lead", id, { ...data, score }, existing as unknown as Record<string, unknown>, { userId });

    return NextResponse.json({
      success: true,
      message: "Lead updated",
      lead: formatLead({ ...lead, score, scoreFactors: JSON.stringify(factors) } as unknown as Record<string, unknown>),
    });
  } catch (error) {
    console.error("[LEAD_PUT]", error);
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }
}

// DELETE /api/leads/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAuth(req);
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Lead ID is required" }, { status: 400 });
    }

    const existing = await db.lead.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const { auditDelete: auditDel } = await import("@/lib/services/audit-service");
    await auditDel(req, "Lead", id, existing as unknown as Record<string, unknown>, { userId });
    await db.lead.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "Lead deleted" });
  } catch (error) {
    console.error("[LEAD_DELETE]", error);
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 });
  }
}
