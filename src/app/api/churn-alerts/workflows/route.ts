import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

interface WorkflowRule {
  riskLevel: string;
  action: string;
  enabled: boolean;
}

export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
    const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
    let workflows: WorkflowRule[] = [];
    if (settings?.churnWorkflowConfig) {
      try { workflows = JSON.parse(settings.churnWorkflowConfig); } catch { /* ignore */ }
    }
    return NextResponse.json({ workflows });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Churn workflows fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch workflows" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuth(request);
    const { workflows } = await request.json();

    if (!Array.isArray(workflows)) {
      return NextResponse.json({ error: "workflows must be an array" }, { status: 400 });
    }

    await db.ispSettings.upsert({
      where: { id: "default" },
      update: { churnWorkflowConfig: JSON.stringify(workflows) },
      create: { id: "default", churnWorkflowConfig: JSON.stringify(workflows) },
    });

    return NextResponse.json({ success: true, workflows });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Churn workflows save error:", error);
    return NextResponse.json({ error: "Failed to save workflows" }, { status: 500 });
  }
}
