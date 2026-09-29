import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/api-auth"

const GW = process.env.GATEWAY_SERVICE_URL || "http://localhost:3005"

// DELETE /api/diag/tcpdump/captures/[id] — Delete single capture
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      try {
        await requireAuth(req);
      } catch (e) {
        if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
        throw e;
      }
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const { id } = await params
  const cookieHeader = { Cookie: req.headers.get("Cookie") || "" }

  try {
    const res = await fetch(`${GW}/api/diag/tcpdump/captures/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...cookieHeader },
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Delete failed" }))
      return NextResponse.json(data, { status: res.status })
    }

    return NextResponse.json(await res.json())
  } catch (err: unknown) {
    console.error("[TCPDump Captures DELETE] error:", err);
    return NextResponse.json(
      { error: "Failed to delete capture" },
      { status: 500 }
    )
  }
  } catch (error) {
    console.error("[DELETE /api/diag/tcpdump/captures] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
