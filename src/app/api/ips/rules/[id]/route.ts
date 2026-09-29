import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { ipsProxy } from "@/lib/ips-proxy";

// ─── PUT: Update detection rule ────────────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try { await requireAuth(request); } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    const { id } = await params;
    const body = await request.json();
    const result = await ipsProxy(`/rules/${id}`, { method: "PUT", body });
    if (result.daemonOffline) return NextResponse.json(result.data, { status: 503 });
    if (!result.ok) return NextResponse.json(result.data, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("[IPS Rules API] PUT error:", error);
    return NextResponse.json({ error: "Failed to update detection rule" }, { status: 500 });
  }
}

// ─── DELETE: Delete detection rule ─────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try { await requireAuth(request); } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    const { id } = await params;
    const result = await ipsProxy(`/rules/${id}`, { method: "DELETE" });
    if (result.daemonOffline) return NextResponse.json(result.data, { status: 503 });
    if (!result.ok) return NextResponse.json(result.data, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("[IPS Rules API] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete detection rule" }, { status: 500 });
  }
}
