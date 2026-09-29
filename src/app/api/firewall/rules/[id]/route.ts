import { NextRequest, NextResponse } from "next/server";
import { FirewallAction, FirewallDirection } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditConfigChange, auditDelete } from "@/lib/audit";

const ALLOWED_PROTOCOLS = ["tcp", "udp", "icmp", "any", "gre", "esp"];

// PATCH /api/firewall/rules/[id] — update rule fields + enabled toggle
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("network.device", "update");
    const { id } = await params;
    const body = await req.json();
    const { ruleName, action, direction, srcIp, srcPort, dstIp, dstPort,
            protocol, inInterface, outInterface, priority, isActive, description } = body;

    const existing = await db.firewallRule.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Firewall rule not found" }, { status: 404 });

    if (action && !Object.values(FirewallAction).includes(action)) {
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
    if (ruleName && ruleName !== existing.ruleName) {
      const dup = await db.firewallRule.findUnique({ where: { ruleName } });
      if (dup) return NextResponse.json({ error: "Rule name already exists" }, { status: 409 });
    }

    const data: Record<string, unknown> = {};
    if (ruleName !== undefined) data.ruleName = ruleName;
    if (action !== undefined) data.action = action;
    if (direction !== undefined) data.direction = direction;
    if (srcIp !== undefined) data.srcIp = srcIp || null;
    if (srcPort !== undefined) data.srcPort = srcPort || null;
    if (dstIp !== undefined) data.dstIp = dstIp || null;
    if (dstPort !== undefined) data.dstPort = dstPort || null;
    if (protocol !== undefined) data.protocol = protocol;
    if (inInterface !== undefined) data.inInterface = inInterface || null;
    if (outInterface !== undefined) data.outInterface = outInterface || null;
    if (priority !== undefined) data.priority = Number(priority);
    if (isActive !== undefined) data.isActive = isActive;
    if (description !== undefined) data.description = description || null;

    const rule = await db.firewallRule.update({ where: { id }, data });

    await auditConfigChange({
      userId: user.id, action: "config_change", resource: "firewall_rule",
      resourceId: id, resourceName: rule.ruleName,
      before: { ruleName: existing.ruleName, action: existing.action, direction: existing.direction, protocol: existing.protocol, priority: existing.priority, isActive: existing.isActive },
      after: { ruleName: rule.ruleName, action: rule.action, direction: rule.direction, protocol: rule.protocol, priority: rule.priority, isActive: rule.isActive },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ rule });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to update firewall rule" }, { status: 500 });
  }
}

// DELETE /api/firewall/rules/[id] — delete a firewall rule
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("network.device", "delete");
    const { id } = await params;

    const existing = await db.firewallRule.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Firewall rule not found" }, { status: 404 });

    await db.firewallRule.delete({ where: { id } });

    await auditDelete({
      userId: user.id, action: "delete", resource: "firewall_rule",
      resourceId: id, resourceName: existing.ruleName,
      before: { ruleName: existing.ruleName, action: existing.action, direction: existing.direction, priority: existing.priority },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to delete firewall rule" }, { status: 500 });
  }
}
