import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import {
  csvResponse,
  generateExportFilename,
  fmtDate,
} from "@/lib/export-utils";

// GET /api/export/subscribers — CSV/JSON export with filters
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") || "csv";
    const status = searchParams.get("status") || "";
    const connectionType = searchParams.get("connectionType") || "";
    const areaId = searchParams.get("areaId") || "";
    const planId = searchParams.get("planId") || "";
    const search = searchParams.get("search") || "";

    // Build where clause
    const where: Record<string, unknown> = {};

    if (status) where.status = status;
    if (connectionType) where.connectionType = connectionType;
    if (areaId) where.areaId = areaId;
    if (planId) where.planId = planId;

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const subscribers = await db.subscriber.findMany({
      where,
      include: {
        Plan: { select: { id: true, name: true, priceMonthly: true } },
        Area: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    // Build rows
    const headers = [
      "Code",
      "Name",
      "Email",
      "Phone",
      "Status",
      "Plan",
      "Area",
      "Connection Type",
      "Activation Date",
      "Monthly Price",
      "IP Address",
      "MAC Address",
      "Address",
    ];

    const rows = subscribers.map((s) => [
      s.code,
      s.name,
      s.email || "",
      s.phone,
      s.status,
      s.Plan?.name || "",
      s.Area?.name || "",
      s.connectionType || "",
      fmtDate(s.activationDate),
      s.Plan?.priceMonthly ? String(s.Plan.priceMonthly) : "",
      s.ipAddress || "",
      s.macAddress || "",
      s.address || "",
    ]);

    // JSON format
    if (format === "json") {
      return NextResponse.json({
        total: subscribers.length,
        data: subscribers.map((s) => ({
          code: s.code,
          name: s.name,
          email: s.email,
          phone: s.phone,
          status: s.status,
          plan: s.Plan?.name,
          area: s.Area?.name,
          connectionType: s.connectionType,
          activationDate: s.activationDate,
          monthlyPrice: s.Plan?.priceMonthly,
          ipAddress: s.ipAddress,
          macAddress: s.macAddress,
          address: s.address,
        })),
      });
    }

    // CSV format (default)
    const filename = generateExportFilename("subscribers");
    return csvResponse(headers, rows, filename);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Export subscribers error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to export subscribers" },
      { status: 500 }
    );
  }
}
