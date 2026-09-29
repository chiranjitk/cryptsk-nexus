import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auditCreate } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import crypto from "crypto";

function generateAgentPassword(): string {
  return crypto.randomBytes(8).toString("hex").slice(0, 12);
}

export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const [agents, total] = await Promise.all([
      db.collectionAgent.findMany({
        where,
        include: {
          User: { select: { id: true, email: true, status: true, lastLoginAt: true } },
          Area: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.collectionAgent.count({ where }),
    ]);

    return NextResponse.json({
      items: agents,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Agents GET error:", error);
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const body = await req.json();
    const { name, phone, assignedAreaIds, dailyTarget, monthlyTarget, commissionRate } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const areaIds: string[] = Array.isArray(assignedAreaIds) ? assignedAreaIds : [];

    // Create a User first for the agent
    const agentPassword = generateAgentPassword();
    const user = await db.user.create({
      data: {
        name,
        email: phone ? `${phone}@cryptsk.agent` : `${name.toLowerCase().replace(/\s+/g, ".")}@cryptsk.agent`,
        phone: phone || "",
        password: await bcrypt.hash(agentPassword, 12),
        role: "AGENT",
        status: "ACTIVE",
      },
    });

    const agent = await db.collectionAgent.create({
      data: {
        userId: user.id,
        name,
        phone: phone || "",
        assignedAreaIds: JSON.stringify(areaIds),
        dailyTarget: dailyTarget || 0,
        monthlyTarget: monthlyTarget || 0,
        commissionRate: commissionRate || 0,
        totalCollectedToday: 0,
        totalCollectedMonth: 0,
        totalCommission: 0,
        Area: {
          connect: areaIds.map((id: string) => ({ id })),
        },
      },
      include: {
        User: { select: { id: true, email: true, status: true } },
        Area: { select: { id: true, name: true, code: true } },
      },
    });

    await auditCreate(req, "CollectionAgent", agent.id, { name, phone });
    return NextResponse.json({ agent, generatedPassword: agentPassword }, { status: 201 });
  } catch (error) {
    console.error("Agents POST error:", error);
    return NextResponse.json({ error: "Failed to create agent" }, { status: 500 });
  }
}
