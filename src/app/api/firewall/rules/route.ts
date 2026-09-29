import { NextRequest, NextResponse } from "next/server";
import { FirewallAction, FirewallDirection } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";

const ALLOWED_PROTOCOLS = ["tcp", "udp", "icmp", "any", "gre", "esp"];

// GET /api/firewall/rules — list firewall rules ordered by priority (filters: ?action ?enabled ?search)
export async function GET(req: NextRequest) {
  try {
    await requirePermission("network.device", "list");

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "";
    const enabled = searchParams.get("enabled") || "";
    const search = searchParams.get("search") || "";

    const where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (enabled === "true") where.isActive = true;
    if (enabled === "false") where.isActive = false;
    if (search) {
      where.OR = [
        { ruleName: { contains: search } },
        { srcIp: { contains: search } },
        { dstIp: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const rules = await db.firewallRule.findMany({
      where,
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ rules });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch firewall rules" }, { status: 500 });
  }
}

// POST /api/firewall/rules — create a firewall rule
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("network.device", "create");
    const body = await req.json();
    const { ruleName, action, direction, srcIp, srcPort, dstIp, dstPort,
            protocol, inInterface, outInterface, priority, description } = body;

    if (!ruleName || !action) {
      return NextResponse.json({ error: "ruleName and action required" }, { status: 400 });
    }
    if (!Object.values(FirewallAction).includes(action)) {
      return NextResponse.json({ error: "Invalid action — must be accept, drop, reject, masquerade, redirect or log" }, { status: 400 });
    }
    if (direction && !Object.values(FirewallDirection).includes(direction)) {
      return NextResponse.json({ error: "Invalid direction — must be ingress, egress or forward" }, { status: 400 });
    }
    if (protocol && !ALLOWED_PROTOCOLS.includes(protocol)) {
      return NextResponse.json({ error: "Invalid protocol — must be tcp, udp, icmp, any, gre or esp" }, { status: 400 });
    }
    if (priority !== undefined && (!Number.isInteger(Number(priority)) || Number(priority) < 0)) {
      return NextResponse.json({ error: "priority must be a non-negative integer" }, { status: 400 });
    }

    const existing = await db.firewallRule.findUnique({ where: { ruleName } });
    if (existing) return NextResponse.json({ error: "Rule name already exists" }, { status: 409 });

    const rule = await db.firewallRule.create({
      data: {
        ruleName, action,
        direction: direction || "ingress",
        srcIp: srcIp || null, srcPort: srcPort || null,
        dstIp: dstIp || null, dstPort: dstPort || null,
        protocol: protocol || "tcp",
        inInterface: inInterface || null, outInterface: outInterface || null,
        priority: priority !== undefined && priority !== "" ? Number(priority) : 100,
        description: description || null,
        createdBy: user.id,
      },
    });

    await auditCreateEntity({
      userId: user.id, action: "create", resource: "firewall_rule",
      resourceId: rule.id, resourceName: rule.ruleName,
      after: { ruleName, action, direction: rule.direction, protocol: rule.protocol, priority: rule.priority },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to create firewall rule" }, { status: 500 });
  }
}
