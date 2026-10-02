import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditExport } from "@/lib/services/audit-service";

// GET /api/technicians/export - Export technicians as CSV
export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "";
    const search = searchParams.get("search") || "";

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const technicians = await db.technician.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        areasManaged: { select: { name: true } },
        _count: {
          select: { Complaint: true, installations: true },
        },
      },
    });

    const header = "Name,Phone,Email,Status,Skills,Areas,Rating,Resolved,Avg Resolution (min),Total Complaints,Total Installations,Created At";
    const rows = technicians.map((t) => {
      const skills = (t.skills || "[]").replace(/"/g, '""');
      const areas = t.areasManaged.map((a) => a.name).join("; ").replace(/"/g, '""');
      return [
        `"${(t.name || "").replace(/"/g, '""')}"`,
        `"${(t.phone || "").replace(/"/g, '""')}"`,
        `"${(t.email || "").replace(/"/g, '""')}"`,
        t.status,
        `"${skills}"`,
        `"${areas}"`,
        t.rating.toFixed(1),
        t.totalResolved,
        t.avgResolutionTime,
        t._count.Complaint,
        t._count.installations,
        t.createdAt.toISOString().slice(0, 10),
      ].join(",");
    });

    const csv = [header, ...rows].join("\n");

    await auditExport(request, "Technician", "csv", technicians.length).catch(() => {});

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="technicians-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Technician export error:", error);
    return NextResponse.json(
      { error: "Failed to export technicians" },
      { status: 500 }
    );
  }
}
