import { db } from "@/lib/db";
import { requirePermission, requireAuth, AuthError } from "@/lib/api-auth";
import { auditExport } from "@/lib/services/audit-service";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {

  try {
    await requireAuth(request as unknown as import("next/server").NextRequest);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    throw e;
  }

  try {
    await requirePermission(request, "users.read");

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const filterRole = searchParams.get("role") || "all";
    const filterStatus = searchParams.get("status") || "all";

    const where: Record<string, unknown> = {};
    if (filterRole !== "all") where.role = filterRole;
    if (filterStatus !== "all") where.status = filterStatus;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const users = await db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    // Build CSV
    const headers = ["Name", "Email", "Phone", "Role", "Status", "Last Login", "Created"];
    const rows = users.map((u) => [
      escapeCsv(u.name),
      escapeCsv(u.email),
      escapeCsv(u.phone),
      escapeCsv(u.role),
      escapeCsv(u.status),
      escapeCsv(u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : ""),
      escapeCsv(new Date(u.createdAt).toISOString()),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    auditExport(request, "User", "csv", users.length).catch(() => {});

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=users_export.csv",
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.statusCode,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("Users export error:", error);
    return new Response(JSON.stringify({ error: "Failed to export users" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

function escapeCsv(value: string): string {
  if (!value) return '""';
  // Escape double quotes and wrap in quotes if value contains comma, quote, or newline
  const escaped = value.replace(/"/g, '""');
  if (escaped.includes(",") || escaped.includes('"') || escaped.includes("\n") || escaped.includes("\r")) {
    return `"${escaped}"`;
  }
  return escaped;
}
