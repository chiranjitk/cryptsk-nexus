import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { gatewayProxy } from "@/lib/gateway-proxy";

// ─── GET: Fetch DDoS policies, counters, or nftables status ─────────
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode }
        );
    }

    const { searchParams } = new URL(request.url);
    const section = searchParams.get("section") || "policies";

    let gwPath: string;
    switch (section) {
      case "policies": gwPath = "/api/ddos/policies"; break;
      case "counters": gwPath = "/api/ddos/counters"; break;
      case "monitor": gwPath = "/api/ddos/monitor"; break;
      case "nftables": gwPath = "/api/ddos/nftables"; break;
      default: gwPath = "/api/ddos/policies";
    }

    const result = await gatewayProxy(gwPath);
    if (result.gatewayOffline) {
      return NextResponse.json(result.data, { status: 503 });
    }
    if (!result.ok) {
      return NextResponse.json(result.data, { status: result.status });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("[DDoS API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch DDoS data" },
      { status: 500 }
    );
  }
}

// ─── POST: Create policy, apply all rules, reset counters ───────────
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode }
        );
    }

    const body = await request.json();
    const { action, ...payload } = body;

    let gwPath: string;
    switch (action) {
      case "create": gwPath = "/api/ddos/policies"; break;
      case "apply":
      case "apply-all": gwPath = "/api/ddos/apply"; break;
      case "reset-counters": gwPath = "/api/ddos/reset-counters"; break;
      case "quick-rule": gwPath = "/api/ddos/quick-rule"; break;
      default:
        return NextResponse.json(
          { error: "Unknown DDoS action" },
          { status: 400 }
        );
    }

    const result = await gatewayProxy(gwPath, { method: "POST", body: payload });
    if (result.gatewayOffline) {
      return NextResponse.json(result.data, { status: 503 });
    }
    if (!result.ok) {
      return NextResponse.json(result.data, { status: result.status });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("[DDoS API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to process DDoS request" },
      { status: 500 }
    );
  }
}

// ─── PUT: Update policy ─────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode }
        );
    }

    const body = await request.json();
    const { id, ...payload } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Policy ID is required" },
        { status: 400 }
      );
    }

    const result = await gatewayProxy(`/api/ddos/policies/${id}`, { method: "PUT", body: payload });
    if (result.gatewayOffline) {
      return NextResponse.json(result.data, { status: 503 });
    }
    if (!result.ok) {
      return NextResponse.json(result.data, { status: result.status });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("[DDoS API] PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update DDoS policy" },
      { status: 500 }
    );
  }
}

// ─── DELETE: Delete policy ──────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode }
        );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Policy ID is required" },
        { status: 400 }
      );
    }

    const result = await gatewayProxy(`/api/ddos/policies/${id}`, { method: "DELETE" });
    if (result.gatewayOffline) {
      return NextResponse.json(result.data, { status: 503 });
    }
    if (!result.ok) {
      return NextResponse.json(result.data, { status: result.status });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("[DDoS API] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete DDoS policy" },
      { status: 500 }
    );
  }
}
