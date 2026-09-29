import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const agents = await db.collectionAgent.findMany({
      where,
      include: {
        User: { select: { id: true, email: true, status: true, lastLoginAt: true } },
        areasAssigned: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Calculate real monthly collection for each agent
    const rows = await Promise.all(
      agents.map(async (agent) => {
        const monthPayments = await db.payment.findMany({
          where: {
            collectedById: agent.userId,
            status: "VERIFIED",
            createdAt: { gte: startOfMonth },
          },
          select: { amount: true },
        });
        const monthCollected = monthPayments.reduce((sum, p) => sum + p.amount, 0);

        return [
          agent.name,
          agent.phone,
          agent.User?.email || "",
          agent.User?.status || "",
          agent.areasAssigned.map((a) => a.name).join("; "),
          String(agent.dailyTarget),
          String(agent.monthlyTarget),
          String(monthCollected),
          agent.monthlyTarget > 0 ? String(Math.round((monthCollected / agent.monthlyTarget) * 100)) : "0",
          String(agent.commissionRate),
          String(monthCollected * (agent.commissionRate / 100)),
          new Date(agent.createdAt).toLocaleDateString("en-IN"),
        ];
      })
    );

    const headers = [
      "Name", "Phone", "Email", "User Status", "Assigned Areas",
      "Daily Target", "Monthly Target", "Monthly Collected", "Target %",
      "Commission Rate %", "Commission Earned", "Created Date",
    ];

    function escapeCsv(value: string): string {
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }

    const csvLines = [
      headers.map(escapeCsv).join(","),
      ...rows.map((row) => row.map(escapeCsv).join(",")),
    ];
    const csvString = csvLines.join("\n");

    const dateStr = new Date().toISOString().split("T")[0];
    return new Response(csvString, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="agents-export-${dateStr}.csv"`,
      },
    });
  } catch (error) {
    console.error("Agents export error:", error);
    return NextResponse.json({ error: "Failed to export agents" }, { status: 500 });
  }
}
