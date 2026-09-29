import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { aiChurnPrediction } from "@/lib/ai-service";

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("ai_churn", "execute");
    const response = await aiChurnPrediction(user.id);
    return NextResponse.json({ success: true, response, advisory: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed", detail: err.message }, { status: 500 });
  }
}
