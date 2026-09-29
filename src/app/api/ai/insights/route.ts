import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { getInsights } from "@/lib/ai-service";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("ai_advisor", "read");
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || undefined;
    const insights = await getInsights(type);
    return NextResponse.json({ insights });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
