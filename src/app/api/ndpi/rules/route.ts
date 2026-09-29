import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { ndpiProxy } from "@/lib/ndpi-proxy";

// ─── GET: Fetch all application rules ─────────────────────────
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError)
        return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    const result = await ndpiProxy("/api/rules", { timeoutMs: 10000 });

    if (result.daemonOffline) {
      return NextResponse.json({
        rules: [],
        total: 0,
        daemonOnline: false,
        error: "nDPI daemon offline",
      });
    }

    if (!result.ok) {
      return NextResponse.json(result.data, { status: result.status });
    }

    const data = result.data as Record<string, unknown>;
    const rules = Array.isArray(data?.rules) ? data.rules : [];

    return NextResponse.json({
      rules,
      total: rules.length,
      daemonOnline: true,
    });
  } catch (error) {
    console.error("[GET /api/ndpi/rules] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch application rules" },
      { status: 500 }
    );
  }
}

// ─── POST: Create a new application rule ──────────────────────
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError)
        return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    const body = await request.json();

    const result = await ndpiProxy("/api/rules", {
      method: "POST",
      body,
      timeoutMs: 10000,
    });

    if (result.daemonOffline) {
      return NextResponse.json(result.data, { status: 503 });
    }

    if (!result.ok) {
      return NextResponse.json(result.data, { status: result.status });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error("[POST /api/ndpi/rules] error:", error);
    return NextResponse.json(
      { error: "Failed to create application rule" },
      { status: 500 }
    );
  }
}
