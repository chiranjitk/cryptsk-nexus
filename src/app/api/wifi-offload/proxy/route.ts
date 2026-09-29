import { NextRequest, NextResponse } from "next/server";

// Diameter service base URL
const DIAMETER_SERVICE_URL = process.env.DIAMETER_SERVICE_URL || "http://localhost:3870";

// ─── Action → target path mapping ───
const ACTION_MAP: Record<string, { method: string; path: (id?: string) => string }> = {
  "gy-initialize": { method: "POST", path: () => "/gy/initialize" },
  "gy-update": { method: "POST", path: () => "/gy/update" },
  "gy-terminate": { method: "POST", path: () => "/gy/terminate" },
  "gx-push": { method: "POST", path: () => "/gx/push-policy" },
  "swa-auth": { method: "POST", path: () => "/swa/authenticate" },
  simulate: { method: "POST", path: () => "/sessions/simulate" },
  "load-test": { method: "POST", path: () => "/simulator/load-test" },
  scenario: { method: "POST", path: () => "/simulator/scenario" },
  dashboard: { method: "GET", path: () => "/dashboard" },
  "peer-ping": { method: "POST", path: (id) => `/peers/${id}/ping` },
  "peer-connect": { method: "POST", path: (id) => `/peers/${id}/connect` },
  "peer-disconnect": { method: "POST", path: (id) => `/peers/${id}/disconnect` },
};

// ─── GET: Proxy GET requests to diameter service ────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (!action) {
      return NextResponse.json({ error: "Missing 'action' query parameter" }, { status: 400 });
    }

    const mapping = ACTION_MAP[action];
    if (!mapping) {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    if (mapping.method !== "GET") {
      return NextResponse.json({ error: `Action '${action}' requires ${mapping.method} method` }, { status: 405 });
    }

    const id = searchParams.get("id") || undefined;
    const targetPath = mapping.path(id);
    const targetUrl = `${DIAMETER_SERVICE_URL}${targetPath}`;

    // Forward query params (excluding action and id which we already used)
    const forwardParams = new URLSearchParams(searchParams);
    forwardParams.delete("action");
    forwardParams.delete("id");
    const queryString = forwardParams.toString();
    const fullUrl = queryString ? `${targetUrl}?${queryString}` : targetUrl;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(fullUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json({ error: "Diameter service request timed out" }, { status: 504 });
    }
    console.error("WiFi Offload Proxy GET error:", error);
    return NextResponse.json(
      { error: "Failed to proxy request to diameter service", details: String(error) },
      { status: 502 }
    );
  }
}

// ─── POST: Proxy POST requests to diameter service ────
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (!action) {
      return NextResponse.json({ error: "Missing 'action' query parameter" }, { status: 400 });
    }

    const mapping = ACTION_MAP[action];
    if (!mapping) {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    if (mapping.method !== "POST") {
      return NextResponse.json({ error: `Action '${action}' requires ${mapping.method} method` }, { status: 405 });
    }

    const id = searchParams.get("id") || undefined;
    const targetPath = mapping.path(id);
    const targetUrl = `${DIAMETER_SERVICE_URL}${targetPath}`;

    const body = await request.json();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json({ error: "Diameter service request timed out" }, { status: 504 });
    }
    console.error("WiFi Offload Proxy POST error:", error);
    return NextResponse.json(
      { error: "Failed to proxy request to diameter service", details: String(error) },
      { status: 502 }
    );
  }
}
