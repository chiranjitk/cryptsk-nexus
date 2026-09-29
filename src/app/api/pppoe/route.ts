import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

const GATEWAY_BASE = process.env.GATEWAY_URL || "http://localhost:3005";

// ─── Build gateway URL from section/action params ─────────────────
function buildGatewayUrl(
  method: string,
  section?: string,
  action?: string,
  url?: string
): string {
  // Config section
  if (section === "config") {
    return `${GATEWAY_BASE}/api/pppoe/config`;
  }

  // Bandwidth section
  if (section === "bandwidth") {
    return `${GATEWAY_BASE}/api/pppoe/realtime-bw`;
  }

  // Profiles section
  if (section === "profiles") {
    if (method === "POST") return `${GATEWAY_BASE}/api/pppoe/profiles`;
    return `${GATEWAY_BASE}/api/pppoe/profiles`;
  }

  // Sessions section
  if (section === "sessions") {
    return `${GATEWAY_BASE}/api/pppoe/sessions`;
  }

  // Action-based routes
  if (action === "apply") return `${GATEWAY_BASE}/api/pppoe/apply`;
  if (action === "bulk-disconnect") return `${GATEWAY_BASE}/api/pppoe/sessions/bulk-disconnect`;
  if (action === "save-config") return `${GATEWAY_BASE}/api/pppoe/config`;

  // Default to profiles
  return `${GATEWAY_BASE}/api/pppoe/profiles`;
}

// ─── Transform gateway response to frontend-expected format ────────
function transformProfilesResponse(data: any): any {
  if (data.success && Array.isArray(data.data)) {
    const profiles = data.data;
    const activeProfiles = profiles.filter((p: any) => p.enabled).length;
    const totalActiveSessions = profiles.reduce(
      (sum: number, p: any) => sum + (p._count?.RadiusSession || 0),
      0
    );
    const maxSessionCapacity = profiles.reduce(
      (sum: number, p: any) => sum + (p.maxSessions || 0),
      0
    );
    return {
      profiles: profiles.map((p: any) => ({
        ...p,
        activeSessions: p._count?.RadiusSession || 0,
      })),
      stats: {
        totalProfiles: profiles.length,
        activeProfiles,
        totalActiveSessions,
        maxSessionCapacity,
      },
    };
  }
  return data;
}

function transformSessionsResponse(data: any): any {
  if (data.success && Array.isArray(data.data)) {
    const sessions = data.data;
    const active = sessions.filter((s: any) => s.status === "ACTIVE").length;
    const terminating = sessions.filter((s: any) => s.status === "TERMINATING").length;
    const idle = sessions.filter((s: any) => s.status === "IDLE").length;
    const totalDownload = sessions.reduce((sum: number, s: any) => sum + (Number(s.downloadBytes) || 0), 0);
    const totalUpload = sessions.reduce((sum: number, s: any) => sum + (Number(s.uploadBytes) || 0), 0);
    return {
      sessions: sessions.map((s: any) => ({
        ...s,
        profileName: s.profile?.name || "",
      })),
      total: data.total || sessions.length,
      stats: {
        active,
        terminating,
        idle,
        totalDownload,
        totalUpload,
      },
    };
  }
  return data;
}

function transformBandwidthResponse(data: any): any {
  if (data.success && Array.isArray(data.data)) {
    const entries = data.data;
    const totalDownloadBps = entries.reduce((sum: number, e: any) => sum + (e.downloadBps || 0), 0);
    const totalUploadBps = entries.reduce((sum: number, e: any) => sum + (e.uploadBps || 0), 0);
    const totalDownloadBytes = entries.reduce((sum: number, e: any) => sum + (Number(e.totalDownload) || 0), 0);
    const totalUploadBytes = entries.reduce((sum: number, e: any) => sum + (Number(e.totalUpload) || 0), 0);
    return {
      entries,
      summary: {
        totalDownloadBps,
        totalUploadBps,
        totalDownloadBytes,
        totalUploadBytes,
      },
    };
  }
  return data;
}

function transformConfigResponse(data: any): any {
  if (data.success && data.data) {
    return { config: data.data };
  }
  return data;
}

// ─── GET: Fetch PPPoE data from gateway-service ───────────────────
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const { searchParams } = new URL(request.url);
    const section = searchParams.get("section") || "profiles";
    const action = searchParams.get("action") || undefined;

    const gatewayUrl = buildGatewayUrl("GET", section, action, request.url);

    // Forward remaining query params
    const forwardParams = new URLSearchParams();
    for (const [key, value] of searchParams.entries()) {
      if (!["section", "action"].includes(key)) {
        forwardParams.set(key, value);
      }
    }
    const url = forwardParams.toString()
      ? `${gatewayUrl}?${forwardParams.toString()}`
      : gatewayUrl;

    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    const cookie = request.headers.get("cookie");
    if (cookie) headers["cookie"] = cookie;
    const res = await fetch(url, { headers, cache: "no-store" });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[PPPoE API] Gateway GET ${res.status}: ${text}`);
      return NextResponse.json(
        { error: `Gateway service error: ${res.status}`, detail: text },
        { status: res.status }
      );
    }

    const data = await res.json();

    // Transform response based on section
    let transformed = data;
    if (section === "profiles") transformed = transformProfilesResponse(data);
    else if (section === "sessions") transformed = transformSessionsResponse(data);
    else if (section === "bandwidth") transformed = transformBandwidthResponse(data);
    else if (section === "config") transformed = transformConfigResponse(data);

    return NextResponse.json(transformed);
  } catch (error) {
    console.error("[PPPoE API] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch PPPoE data" }, { status: 500 });
  }
}

// ─── POST: Create profile or apply config ─────────────────────────
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const body = await request.json();
    const { action, section, ...payload } = body;

    const gatewayUrl = buildGatewayUrl("POST", section, action, request.url);

    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    const cookie = request.headers.get("cookie");
    if (cookie) headers["cookie"] = cookie;
    const res = await fetch(gatewayUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[PPPoE API] Gateway POST ${res.status}: ${text}`);
      return NextResponse.json(
        { error: `Gateway service error: ${res.status}`, detail: text },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[PPPoE API] POST error:", error);
    return NextResponse.json({ error: "Failed to process PPPoE request" }, { status: 500 });
  }
}

// ─── PUT: Update profile or config ────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const body = await request.json();
    const { id, action, ...payload } = body;

    if (!id && action !== "save-config") {
      return NextResponse.json({ error: "ID is required for update" }, { status: 400 });
    }

    let gatewayUrl: string;
    if (action === "save-config") {
      gatewayUrl = `${GATEWAY_BASE}/api/pppoe/config`;
    } else {
      gatewayUrl = `${GATEWAY_BASE}/api/pppoe/profiles/${id}`;
    }

    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    const cookie = request.headers.get("cookie");
    if (cookie) headers["cookie"] = cookie;
    const res = await fetch(gatewayUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[PPPoE API] Gateway PUT ${res.status}: ${text}`);
      return NextResponse.json(
        { error: `Gateway service error: ${res.status}`, detail: text },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[PPPoE API] PUT error:", error);
    return NextResponse.json({ error: "Failed to update PPPoE configuration" }, { status: 500 });
  }
}

// ─── DELETE: Delete profile or disconnect session ─────────────────
export async function DELETE(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    // Path: /api/pppoe/profiles/[id] or /api/pppoe/sessions/[id]
    const id = pathParts[pathParts.length - 1];
    const resource = pathParts[pathParts.length - 2]; // "profiles" or "sessions"

    if (!id || !["profiles", "sessions"].includes(resource)) {
      return NextResponse.json({ error: "Invalid delete path. Use /api/pppoe/profiles/:id or /api/pppoe/sessions/:id" }, { status: 400 });
    }

    const gatewayUrl = `${GATEWAY_BASE}/api/pppoe/${resource}/${id}`;

    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    const cookie = request.headers.get("cookie");
    if (cookie) headers["cookie"] = cookie;
    const res = await fetch(gatewayUrl, {
      method: "DELETE",
      headers,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[PPPoE API] Gateway DELETE ${res.status}: ${text}`);
      return NextResponse.json(
        { error: `Gateway service error: ${res.status}`, detail: text },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[PPPoE API] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete PPPoE resource" }, { status: 500 });
  }
}
