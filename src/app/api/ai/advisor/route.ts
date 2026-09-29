import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { aiAdvisor } from "@/lib/ai-service";

// POST /api/ai/advisor — chat with AI Advisor (LLM with platform context)
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("ai_advisor", "execute");
    const body = await req.json();
    const { question } = body;

    if (!question) {
      return NextResponse.json({ error: "question required" }, { status: 400 });
    }

    const response = await aiAdvisor(question, user.id);

    return NextResponse.json({
      success: true,
      question,
      response,
      advisory: true,
      disclaimer: "AI output is advisory only. Any action requires human authorization.",
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed", detail: err.message }, { status: 500 });
  }
}
