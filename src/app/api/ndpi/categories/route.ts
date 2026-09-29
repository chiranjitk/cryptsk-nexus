import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { ndpiProxy } from "@/lib/ndpi-proxy";

// ─── GET: List all application categories ─────────────────────
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError)
        return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    const result = await ndpiProxy("/api/categories", { timeoutMs: 10000 });

    if (result.daemonOffline) {
      return NextResponse.json({
        categories: [],
        total: 0,
        daemonOnline: false,
        error: "nDPI daemon offline",
      });
    }

    if (!result.ok) {
      return NextResponse.json(result.data, { status: result.status });
    }

    const data = result.data as Record<string, unknown>;
    const categories = Array.isArray(data?.categories) ? data.categories : [];

    return NextResponse.json({
      categories,
      total: categories.length,
      daemonOnline: true,
    });
  } catch (error) {
    console.error("[GET /api/ndpi/categories] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}
