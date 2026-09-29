import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/subscribers/export — CSV export with filters
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "";
    const connectionType = searchParams.get("connectionType") || "";
    const areaId = searchParams.get("areaId") || "";

    const where: Record<string, unknown> = {};

    if (status) where.status = status;
    if (connectionType) where.connectionType = connectionType;
    if (areaId) where.areaId = areaId;

    const subscribers = await db.subscriber.findMany({
      where,
      include: {
        Plan: { select: { id: true, name: true, priceMonthly: true } },
        Area: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    const fmt = (d: Date | null) => d ? new Date(d).toLocaleDateString("en-IN") : "";

    const headers = [
      "Code", "Name", "Email", "Phone", "Address", "Area", "Plan",
      "Connection Type", "Status", "IP Address", "MAC Address",
      "Activation Date", "Monthly Price",
    ];

    const rows = subscribers.map((s) => [
      s.code,
      s.name,
      s.email || "",
      s.phone,
      s.address || "",
      s.Area?.name || "",
      s.Plan?.name || "",
      s.connectionType || "",
      s.status,
      s.ipAddress || "",
      s.macAddress || "",
      fmt(s.activationDate),
      s.Plan?.priceMonthly ? String(s.Plan.priceMonthly) : "",
    ]);

    const commentLine = "# Cryptsk ISP Subscriber Export";
    const csvContent = [commentLine, headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");

    const bom = "\uFEFF";
    const csvBuffer = Buffer.from(bom + csvContent, "utf-8");

    return new NextResponse(csvBuffer, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="subscribers-export.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Subscribers export error:", error);
    return NextResponse.json({ error: "Failed to export subscribers" }, { status: 500 });
  }
}
