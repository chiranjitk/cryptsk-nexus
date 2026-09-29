import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const body = await req.json();
    const { agentId, email, password, name } = body;

    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    const agent = await db.collectionAgent.findUnique({
      where: { id: agentId },
      include: { User: { select: { id: true, email: true } } },
    });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (agent.User) {
      return NextResponse.json({ error: "Agent already has a login account" }, { status: 409 });
    }

    const loginEmail = email || `${agent.name.toLowerCase().replace(/\s+/g, ".")}@cryptsk.agent`;
    const loginPassword = password || "Agent@" + crypto.randomBytes(4).toString("hex");

    // Check email uniqueness
    const existingUser = await db.user.findUnique({ where: { email: loginEmail } });
    if (existingUser) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const user = await db.user.create({
      data: {
        name: name || agent.name,
        email: loginEmail,
        phone: agent.phone,
        password: await bcrypt.hash(loginPassword, 12),
        role: "AGENT",
        status: "ACTIVE",
      },
    });

    await db.collectionAgent.update({
      where: { id: agentId },
      data: { userId: user.id },
    });

    await auditCreate(req, "CollectionAgent", agentId, { action: "create-login", email: loginEmail });
    return NextResponse.json({ User: { id: user.id, email: user.email }, message: "Login created successfully" });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Create login error:", error);
    return NextResponse.json({ error: "Failed to create login" }, { status: 500 });
  }
}
