import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";

// GET /api/sessions — proxy to Session Engine on port 3010
export async function GET(req: NextRequest) {
  try {
    await requirePermission("session", "read");

    const { searchParams } = new URL(req.url);
    const active = searchParams.get("active") || "";
    const search = searchParams.get("search") || "";
    const page = searchParams.get("page") || "1";
    const pageSize = searchParams.get("pageSize") || "50";

    const params = new URLSearchParams({ page, pageSize });
    if (active) params.set("active", active);
    if (search) params.set("search", search);

    // Call the Session Engine on localhost:3010
    const res = await fetch(`http://localhost:3010/sessions?${params}`, {
      signal: req.signal,
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Session Engine unavailable", status: res.status },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json(
      { error: "Failed to fetch sessions", detail: err.message },
      { status: 500 }
    );
  }
}
