import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { aiNetworkDiagnosis } from "@/lib/ai-service";

// POST /api/ai/diagnosis — AI network diagnosis
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("ai_diagnosis", "execute");
    const response = await aiNetworkDiagnosis(user.id);

    return NextResponse.json({
      success: true,
      response,
      advisory: true,
      disclaimer: "AI diagnosis is advisory only. No automatic actions taken.",
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed", detail: err.message }, { status: 500 });
  }
}
