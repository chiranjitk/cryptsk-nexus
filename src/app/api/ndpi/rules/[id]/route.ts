import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { ndpiProxy } from "@/lib/ndpi-proxy";

// ─── PUT: Update an application rule by ID ────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError)
        return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    const { id } = await params;
    const body = await request.json();

    const result = await ndpiProxy(`/api/rules/${id}`, {
      method: "PUT",
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
    console.error("[PUT /api/ndpi/rules/:id] error:", error);
    return NextResponse.json(
      { error: "Failed to update application rule" },
      { status: 500 }
    );
  }
}

// ─── DELETE: Delete an application rule by ID ─────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError)
        return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    const { id } = await params;

    const result = await ndpiProxy(`/api/rules/${id}`, {
      method: "DELETE",
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
    console.error("[DELETE /api/ndpi/rules/:id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete application rule" },
      { status: 500 }
    );
  }
}
