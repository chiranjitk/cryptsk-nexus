import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import type { LeadSource, LeadStatus } from "@prisma/client";
import { auditCreate, auditUpdate, auditDelete, auditExport } from "@/lib/services/audit-service";

const PAGE_SIZE = 15;

const SOURCE_LABELS: Record<string, string> = {
  WEBSITE: "Website", WHATSAPP: "WhatsApp", REFERRAL: "Referral",
  WALK_IN: "Walk-in", CALL: "Call", SOCIAL_MEDIA: "Social Media", OTHER: "Other",
};
const STATUS_LABELS: Record<string, string> = {
  NEW: "New", CONTACTED: "Contacted", INTERESTED: "Interested", QUALIFIED: "Qualified",
  CONVERTED: "Converted", LOST: "Lost",
};

function mapToEnum(label: string | undefined, map: Record<string, string>): string {
  if (!label) return "";
  const entry = (Object.entries(map) as [string, string][]).find(([, v]) => v === label);
  return entry ? entry[0] : label;
}

// ─── Lead Scoring ──────────────────────────────────────────────
interface ScoreFactors {
  phonePresent?: boolean; emailPresent?: boolean; dealValueHigh?: boolean;
  dealValueMedium?: boolean; dealValueLow?: boolean; sourceReferral?: boolean;
  sourceWebsite?: boolean; sourceWalkIn?: boolean; commCount?: number;
  utmPresent?: boolean; statusAdvanced?: boolean;
}

function calculateLeadScore(data: {
  phone: string; email: string; dealValue: number; source: string;
  commCount: number; utmSource?: string; status?: string;
}): { score: number; factors: ScoreFactors } {
  let score = 0;
  const factors: ScoreFactors = {};
  const { phone, email, dealValue, source, commCount, utmSource, status } = data;
  // Contact info completeness
  if (phone && phone.trim()) { score += 5; factors.phonePresent = true; }
  if (email && email.trim() && email.includes("@")) { score += 5; factors.emailPresent = true; }
  // Deal value tiers
  if (dealValue > 10000) { score += 20; factors.dealValueHigh = true; }
  else if (dealValue > 5000) { score += 10; factors.dealValueMedium = true; }
  else if (dealValue > 0) { score += 3; factors.dealValueLow = true; }
  // Source quality
  if (source === "REFERRAL") { score += 15; factors.sourceReferral = true; }
  else if (source === "WEBSITE") { score += 10; factors.sourceWebsite = true; }
  else if (source === "WALK_IN") { score += 8; factors.sourceWalkIn = true; }
  // Engagement: communication count
  if (commCount >= 5) { score += 15; factors.commCount = commCount; }
  else if (commCount >= 3) { score += 10; factors.commCount = commCount; }
  else if (commCount >= 1) { score += 5; factors.commCount = commCount; }
  // UTM presence (marketing-attributed)
  if (utmSource) { score += 5; factors.utmPresent = true; }
  // Status advancement
  if (status === "QUALIFIED") { score += 10; factors.statusAdvanced = true; }
  else if (status === "INTERESTED") { score += 5; factors.statusAdvanced = true; }
  score = Math.min(score, 100);
  return { score, factors };
}

// ─── Round-Robin Assignment ────────────────────────────────────
async function getNextRoundRobinUser(): Promise<string | null> {
  try {
    const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
    if (!settings) return null;
    const users = await db.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN", "OPERATOR"] }, status: "ACTIVE" },
      select: { id: true }, orderBy: { createdAt: "asc" },
    });
    if (users.length === 0) return null;
    const nextIndex = (settings.lastAssignedUserIndex || 0) % users.length;
    const assignedUser = users[nextIndex];
    await db.ispSettings.update({ where: { id: "default" }, data: { lastAssignedUserIndex: nextIndex + 1 } });
    return assignedUser.id;
  } catch (error) { console.error("[ROUND_ROBIN]", error); return null; }
}

// ─── Duplicate Detection ───────────────────────────────────────
async function findDuplicates(phone: string, email: string) {
  const where: Array<Record<string, unknown>> = [];
  if (phone && phone.trim()) where.push({ phone: phone.trim() });
  if (email && email.trim()) where.push({ email: email.trim() });
  if (where.length === 0) return [];
  return db.lead.findMany({ where: { OR: where }, select: { id: true, name: true, phone: true, email: true }, take: 5 });
}

// GET
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const source = searchParams.get("source") || "";
    const status = searchParams.get("status") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const sortField = searchParams.get("sortField") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const perPage = searchParams.get("perPage");
    const exportCsv = searchParams.get("export") === "csv";
    const type = searchParams.get("type") || "";

    // Lead communications
    if (type === "communications") {
      const leadId = searchParams.get("leadId");
      if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });
      const comms = await db.leadCommunication.findMany({
        where: { leadId }, orderBy: { date: "desc" }, take: 100,
      });
      return NextResponse.json({ communications: comms });
    }

    // Sales team members for round-robin dropdown
    if (type === "team-members") {
      const members = await db.user.findMany({
        where: { role: { in: ["ADMIN", "SUPER_ADMIN", "OPERATOR", "AGENT"] }, status: "ACTIVE" },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ members });
    }

    const pageSize = perPage ? parseInt(perPage, 10) : (exportCsv ? 99999 : PAGE_SIZE);
    const where: Record<string, unknown> = {};

    if (status && status !== "All") where.status = mapToEnum(status, STATUS_LABELS);
    if (source && source !== "All") where.source = mapToEnum(source, SOURCE_LABELS);
    if (search) where.OR = [{ name: { contains: search } }, { phone: { contains: search } }, { email: { contains: search } }, { address: { contains: search } }];

    const allowedSortFields = ["createdAt", "name", "status", "source", "estimatedValue", "dealValue", "followUpDate", "score"];
    const field = allowedSortFields.includes(sortField) ? sortField : "createdAt";
    const order = sortOrder === "asc" ? "asc" : "desc";

    const [total, leads] = await Promise.all([
      db.lead.count({ where }),
      db.lead.findMany({ where, orderBy: { [field]: order }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);

    const [newCount, converted, lost, thisMonth] = await Promise.all([
      db.lead.count({ where: { status: "NEW" } }),
      db.lead.count({ where: { status: "CONVERTED" } }),
      db.lead.count({ where: { status: "LOST" } }),
      db.lead.count({ where: { createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }),
    ]);

    // Batch fetch assigned user names
    const assignedIds = [...new Set(leads.map((l) => l.assignedToId).filter(Boolean))] as string[];
    const assignedUsers = assignedIds.length > 0
      ? await db.user.findMany({ where: { id: { in: assignedIds } }, select: { id: true, name: true } })
      : [];
    const userMap = new Map(assignedUsers.map((u) => [u.id, u.name]));

    const formattedLeads = leads.map((l) => ({
      id: l.id, name: l.name, phone: l.phone, email: l.email, address: l.address,
      source: SOURCE_LABELS[l.source] || l.source, status: STATUS_LABELS[l.status] || l.status,
      assignedToId: l.assignedToId, assignedName: l.assignedToId ? (userMap.get(l.assignedToId) || null) : null, notes: l.notes,
      followUpDate: l.followUpDate?.toISOString().split("T")[0] || null,
      estimatedValue: l.estimatedValue, dealValue: l.dealValue, lostReason: l.lostReason || "",
      convertedSubscriberId: l.convertedSubscriberId, score: l.score, scoreFactors: l.scoreFactors,
      duplicateOf: l.duplicateOf,
      utmSource: l.utmSource, utmMedium: l.utmMedium, utmCampaign: l.utmCampaign, utmContent: l.utmContent,
      createdAt: l.createdAt.toISOString().split("T")[0],
    }));

    if (exportCsv) {
      await auditExport(request, "Lead", "csv", total);
      const headers = ["Name", "Phone", "Email", "Address", "Source", "Status", "Follow-up", "Deal Value", "Score", "UTM Source", "UTM Campaign", "Created"];
      const rows = formattedLeads.map((l) => [l.name, l.phone, l.email, l.address, l.source, l.status, l.followUpDate || "", String(l.dealValue), String(l.score), l.utmSource, l.utmCampaign, l.createdAt]);
      const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
      return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().split("T")[0]}.csv"` } });
    }

    return NextResponse.json({
      leads: formattedLeads, stats: { total, new: newCount, converted, lost, thisMonth }, total, page, totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("[LEADS_GET]", error);
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
  }
}

// POST
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { action } = body;

    if (action === "create") {
      const { name, phone, email, address, areaId, source, status, assignedToId, notes, followUpDate, estimatedValue, dealValue, lostReason, skipDuplicate, forceAssignTo, utmSource, utmMedium, utmCampaign, utmContent } = body;
      if (!name || !name.trim()) return NextResponse.json({ error: "Lead name is required" }, { status: 400 });

      if (!skipDuplicate) {
        const duplicates = await findDuplicates(phone || "", email || "");
        if (duplicates.length > 0) {
          return NextResponse.json({ success: false, duplicates, message: `Possible duplicate: ${duplicates.map((d: { name: string }) => d.name).join(", ")}` }, { status: 409 });
        }
      }

      const sourceEnum = (mapToEnum(source, SOURCE_LABELS) || "WALK_IN") as LeadSource;
      const statusEnum = (mapToEnum(status, STATUS_LABELS) || "NEW") as LeadStatus;
      const finalAssignedTo = assignedToId || forceAssignTo || await getNextRoundRobinUser();

      const lead = await db.lead.create({
        data: {
          name: name.trim(), phone: phone || "", email: email || "", address: address || "",
          areaId: areaId || null, source: sourceEnum, status: statusEnum,
          assignedToId: finalAssignedTo || null, notes: notes || "",
          followUpDate: followUpDate ? new Date(followUpDate) : null,
          estimatedValue: estimatedValue || 0, dealValue: dealValue || 0,
          lostReason: lostReason || "",
          utmSource: utmSource || "", utmMedium: utmMedium || "",
          utmCampaign: utmCampaign || "", utmContent: utmContent || "",
        },
      });

      const { score, factors } = calculateLeadScore({ phone: phone || "", email: email || "", dealValue: dealValue || 0, source: sourceEnum, commCount: 0, utmSource });
      await db.lead.update({ where: { id: lead.id }, data: { score, scoreFactors: JSON.stringify(factors) } });
      // Fetch assigned user name for response
      let assignedName: string | null = null;
      if (finalAssignedTo) {
        const assignedUser = await db.user.findUnique({ where: { id: finalAssignedTo }, select: { name: true } });
        assignedName = assignedUser?.name || null;
      }
      await auditCreate(request, "Lead", lead.id, { name: lead.name, phone: lead.phone, source: lead.source, status: lead.status, score, assignedToId: finalAssignedTo }, { userId });
      return NextResponse.json({ success: true, lead: { id: lead.id, name: lead.name, phone: lead.phone, email: lead.email, source: SOURCE_LABELS[lead.source] || lead.source, status: STATUS_LABELS[lead.status] || lead.status, dealValue: lead.dealValue, score, scoreFactors: JSON.stringify(factors), assignedToId: finalAssignedTo, assignedName, createdAt: lead.createdAt.toISOString().split("T")[0] } });
    }

    if (action === "update") {
      const { leadId, name, phone, email, address, areaId, source, status, assignedToId, notes, followUpDate, estimatedValue, dealValue, lostReason, utmSource, utmMedium, utmCampaign, utmContent } = body;
      if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });
      const existing = await db.lead.findUnique({ where: { id: leadId } });
      if (!existing) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

      const data: Record<string, unknown> = {};
      if (name !== undefined) data.name = name.trim();
      if (phone !== undefined) data.phone = phone;
      if (email !== undefined) data.email = email;
      if (address !== undefined) data.address = address;
      if (areaId !== undefined) data.areaId = areaId || null;
      if (source !== undefined) data.source = mapToEnum(source, SOURCE_LABELS) || "WALK_IN";
      if (status !== undefined) data.status = mapToEnum(status, STATUS_LABELS) || status;
      if (assignedToId !== undefined) data.assignedToId = assignedToId || null;
      if (notes !== undefined) data.notes = notes;
      if (followUpDate !== undefined) data.followUpDate = followUpDate ? new Date(followUpDate) : null;
      if (estimatedValue !== undefined) data.estimatedValue = estimatedValue;
      if (dealValue !== undefined) data.dealValue = dealValue;
      if (lostReason !== undefined) data.lostReason = lostReason;
      if (utmSource !== undefined) data.utmSource = utmSource;
      if (utmMedium !== undefined) data.utmMedium = utmMedium;
      if (utmCampaign !== undefined) data.utmCampaign = utmCampaign;
      if (utmContent !== undefined) data.utmContent = utmContent;

      const lead = await db.lead.update({ where: { id: leadId }, data });
      const finalPhone = phone !== undefined ? phone : existing.phone;
      const finalEmail = email !== undefined ? email : existing.email;
      const finalDealValue = dealValue !== undefined ? dealValue : existing.dealValue;
      const finalSource = source !== undefined ? (mapToEnum(source, SOURCE_LABELS) || "WALK_IN") : existing.source;
      const finalStatus = status !== undefined ? (mapToEnum(status, STATUS_LABELS) || existing.status) : existing.status;
      // Count actual communications for scoring
      const commCount = await db.leadCommunication.count({ where: { leadId } });
      const { score, factors } = calculateLeadScore({ phone: finalPhone, email: finalEmail, dealValue: finalDealValue, source: finalSource, commCount, utmSource: existing.utmSource, status: finalStatus });
      await db.lead.update({ where: { id: leadId }, data: { score, scoreFactors: JSON.stringify(factors) } });
      await auditUpdate(request, "Lead", leadId, { ...data, score }, existing as unknown as Record<string, unknown>, { userId });
      return NextResponse.json({ success: true, message: "Lead updated" });
    }

    if (action === "update-status") {
      const { leadId, status } = body;
      if (!leadId || !status) return NextResponse.json({ error: "leadId and status required" }, { status: 400 });
      const statusEnum = (mapToEnum(status, STATUS_LABELS) || status) as LeadStatus;
      const existing = await db.lead.findUnique({ where: { id: leadId } });
      if (!existing) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      const lead = await db.lead.update({ where: { id: leadId }, data: { status: statusEnum } });
      await auditUpdate(request, "Lead", leadId, { status: statusEnum }, existing as unknown as Record<string, unknown>, { userId });
      return NextResponse.json({ success: true, message: `Status updated to ${STATUS_LABELS[lead.status] || lead.status}` });
    }

    if (action === "delete") {
      const { leadId } = body;
      if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });
      const existing = await db.lead.findUnique({ where: { id: leadId } });
      if (!existing) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      await auditDelete(request, "Lead", leadId, existing as unknown as Record<string, unknown>, { userId });
      await db.lead.delete({ where: { id: leadId } });
      return NextResponse.json({ success: true, message: "Lead deleted" });
    }

    // ── Communication Log CRUD ──
    if (action === "add-communication") {
      const { leadId, type, date, notes, outcome } = body;
      if (!leadId || !type) return NextResponse.json({ error: "leadId and type required" }, { status: 400 });
      const comm = await db.leadCommunication.create({
        data: { leadId, type: type || "Call", date: date ? new Date(date) : new Date(), notes: notes || "", outcome: outcome || "" },
      });
      // Recalculate lead score after adding communication
      const leadForScore = await db.lead.findUnique({ where: { id: leadId }, select: { id: true, phone: true, email: true, dealValue: true, source: true, utmSource: true, status: true } });
      if (leadForScore) {
        const newCommCount = await db.leadCommunication.count({ where: { leadId } });
        const { score, factors } = calculateLeadScore({ phone: leadForScore.phone, email: leadForScore.email, dealValue: leadForScore.dealValue, source: leadForScore.source, commCount: newCommCount, utmSource: leadForScore.utmSource, status: leadForScore.status });
        await db.lead.update({ where: { id: leadId }, data: { score, scoreFactors: JSON.stringify(factors) } });
      }
      await auditCreate(request, "LeadCommunication", comm.id, { leadId, type, action: "add" }, { userId });
      return NextResponse.json({ success: true, communication: comm });
    }

    if (action === "update-communication") {
      const { commId, type, date, notes, outcome } = body;
      if (!commId) return NextResponse.json({ error: "commId required" }, { status: 400 });
      const comm = await db.leadCommunication.update({
        where: { id: commId },
        data: { type: type || undefined, date: date ? new Date(date) : undefined, notes: notes !== undefined ? notes : undefined, outcome: outcome !== undefined ? outcome : undefined },
      });
      return NextResponse.json({ success: true, communication: comm });
    }

    if (action === "delete-communication") {
      const { commId } = body;
      if (!commId) return NextResponse.json({ error: "commId required" }, { status: 400 });
      const existingComm = await db.leadCommunication.findUnique({ where: { id: commId }, select: { leadId: true } });
      if (existingComm) {
        await db.leadCommunication.delete({ where: { id: commId } });
        // Recalculate score after deleting a communication
        const leadForScore = await db.lead.findUnique({ where: { id: existingComm.leadId } });
        if (leadForScore) {
          const newCommCount = await db.leadCommunication.count({ where: { leadId: existingComm.leadId } });
          const { score, factors } = calculateLeadScore({ phone: leadForScore.phone, email: leadForScore.email, dealValue: leadForScore.dealValue, source: leadForScore.source, commCount: newCommCount, utmSource: leadForScore.utmSource, status: leadForScore.status });
          await db.lead.update({ where: { id: existingComm.leadId }, data: { score, scoreFactors: JSON.stringify(factors) } });
        }
      }
      return NextResponse.json({ success: true, message: "Communication deleted" });
    }

    // ── Rescore All Leads ──
    if (action === "rescore-all") {
      const allLeads = await db.lead.findMany({ select: { id: true, phone: true, email: true, dealValue: true, source: true, utmSource: true, status: true } });
      let updated = 0;
      for (const l of allLeads) {
        const commCount = await db.leadCommunication.count({ where: { leadId: l.id } });
        const { score, factors } = calculateLeadScore({ phone: l.phone, email: l.email, dealValue: l.dealValue, source: l.source, commCount, utmSource: l.utmSource, status: l.status });
        await db.lead.update({ where: { id: l.id }, data: { score, scoreFactors: JSON.stringify(factors) } });
        updated++;
      }
      return NextResponse.json({ success: true, message: `Rescored ${updated} leads` });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[LEADS_POST]", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
