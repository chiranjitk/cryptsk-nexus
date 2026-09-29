import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils";

// GET /api/reports/kpi-targets — Retrieve saved KPI targets
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
    const targets = safeJsonParse<{ metric: string; target: number; period: string }[]>(
      settings?.kpiTargets,
      []
    );
    return NextResponse.json({ targets });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("KPI targets fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch KPI targets" }, { status: 500 });
  }
}

// POST /api/reports/kpi-targets — Save KPI targets
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { targets } = body as { targets: { metric: string; target: number; period: string }[] };

    if (!Array.isArray(targets)) {
      return NextResponse.json({ error: "targets must be an array" }, { status: 400 });
    }

    // Validate each target
    for (const t of targets) {
      if (!t.metric || typeof t.target !== "number") {
        return NextResponse.json({ error: "Each target must have metric (string) and target (number)" }, { status: 400 });
      }
    }

    await db.ispSettings.upsert({
      where: { id: "default" },
      update: { kpiTargets: JSON.stringify(targets) },
      create: { kpiTargets: JSON.stringify(targets) },
    });

    return NextResponse.json({ success: true, targets });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("KPI targets save error:", error);
    return NextResponse.json({ error: "Failed to save KPI targets" }, { status: 500 });
  }
}
