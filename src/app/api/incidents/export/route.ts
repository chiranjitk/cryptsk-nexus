import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── GET: Export all incidents as CSV ──────────────────────────
export async function GET(request: Request) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const allIncidents = await db.incident.findMany({
      include: { updates: { orderBy: { createdAt: "asc" } } },
      orderBy: { startedAt: "desc" },
    });

    const rows = allIncidents.map((inc) => {
      const areas = (() => {
        try { return JSON.parse(inc.affectedAreaIds || "[]"); } catch { return []; }
      })();
      const duration = (() => {
        if (inc.resolvedAt && inc.startedAt) {
          const mins = Math.floor(
            (new Date(inc.resolvedAt).getTime() - new Date(inc.startedAt).getTime()) / 60000
          );
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          return h > 0 ? `${h}h ${m}m` : `${m}m`;
        }
        return "—";
      })();

      return {
        id: inc.id,
        title: inc.title,
        severity: inc.severity,
        status: inc.status,
        affectedAreas: areas.join("; "),
        affectedSubscribers: String(inc.affectedSubscriberCount),
        startedAt: inc.startedAt ? new Date(inc.startedAt).toLocaleString("en-IN") : "",
        resolvedAt: inc.resolvedAt ? new Date(inc.resolvedAt).toLocaleString("en-IN") : "",
        duration,
        resolution: inc.resolution || "—",
        estimatedCost: String(inc.estimatedCost || 0),
        tags: (() => {
          try { return JSON.parse(inc.tags || "[]").join(", "); } catch { return ""; }
        })(),
      };
    });

    const headers = [
      "ID", "Title", "Severity", "Status", "Affected Areas",
      "Affected Subscribers", "Started At", "Resolved At",
      "Duration", "Resolution", "Estimated Revenue Loss (INR)", "Tags",
    ];

    function escapeCSV(value: string): string {
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }

    const csv = [
      headers.map(escapeCSV).join(","),
      ...rows.map((r) =>
        headers
          .map((h) => escapeCSV(r[h as keyof typeof r] || ""))
          .join(",")
      ),
    ].join("\n");

    const dateStr = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="incidents-export-${dateStr}.csv"`,
      },
    });
  } catch (error) {
    console.error("Incidents export error:", error);
    return NextResponse.json(
      { error: "Failed to export incidents" },
      { status: 500 }
    );
  }
}
