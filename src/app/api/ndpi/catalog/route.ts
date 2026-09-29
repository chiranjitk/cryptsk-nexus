import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { ndpiProxy } from "@/lib/ndpi-proxy";

// ─── GET: Full protocol catalog (all supported protocols by category) ─
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError)
        return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    const result = await ndpiProxy("/api/catalog", { timeoutMs: 15000 });

    if (result.daemonOffline) {
      return NextResponse.json({
        catalog: [],
        totalProtocols: 0,
        totalCategories: 0,
        daemonOnline: false,
        error: "nDPI daemon offline",
      });
    }

    if (!result.ok) {
      return NextResponse.json(result.data, { status: result.status });
    }

    const data = result.data as Record<string, unknown>;
    const catalog = Array.isArray(data?.catalog) ? data.catalog : [];

    return NextResponse.json({
      catalog,
      totalProtocols: (data?.totalProtocols as number) || 0,
      totalCategories: (data?.totalCategories as number) || 0,
      ndpiVersion: (data?.ndpiVersion as string) || "5.1",
      daemonOnline: true,
    });
  } catch (error) {
    console.error("[GET /api/ndpi/catalog] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch protocol catalog" },
      { status: 500 }
    );
  }
}
