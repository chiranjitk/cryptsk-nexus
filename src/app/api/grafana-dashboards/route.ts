import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

async function getGrafanaConfig(): Promise<{ url: string; apiKey: string }> {
  try {
    const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
    return {
      url: settings?.grafanaUrl || "",
      apiKey: settings?.grafanaApiKey || "",
    };
  } catch {
    return { url: "", apiKey: "" };
  }
}

async function grafanaFetch(path: string, config: { url: string; apiKey: string }): Promise<Response> {
  const baseUrl = config.url.replace(/\/+$/, "");
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  return res;
}

export async function GET(request: NextRequest) {
  try {
    try {
      try {
        await requireAuth(request);
      } catch (e) {
        if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
        throw e;
      }
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "stats";

  if (action === "config") {
    const config = await getGrafanaConfig();
    return NextResponse.json({
      configured: !!config.url,
      url: config.url || "",
    });
  }

  const config = await getGrafanaConfig();
  if (!config.url) {
    return NextResponse.json({
      connected: false,
      configured: false,
      health: {},
      dashboardCount: 0,
      datasourceCount: 0,
      datasources: [],
      error: "Grafana URL not configured. Go to Settings to configure.",
    });
  }

  if (action === "status") {
    try {
      const res = await grafanaFetch("/api/health", config);
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({ connected: true, configured: true, ...data });
      }
      return NextResponse.json({ connected: false, configured: true, error: "Grafana returned non-OK status" });
    } catch {
      return NextResponse.json({ connected: false, configured: true, error: `Cannot reach Grafana at ${config.url}` });
    }
  }

  if (action === "dashboards") {
    try {
      const res = await grafanaFetch("/api/search?type=dash-db", config);
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({ dashboards: data });
      }
      return NextResponse.json({ error: "Failed to fetch dashboards" }, { status: res.status });
    } catch (err: unknown) {
      console.error("[Grafana] dashboards error:", err);
      return NextResponse.json({ error: "Failed to fetch dashboards" }, { status: 500 });
    }
  }

  if (action === "dashboard") {
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    try {
      const res = await grafanaFetch(`/api/dashboards/uid/${id}`, config);
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({ dashboard: data });
      }
      return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });
    } catch (err: unknown) {
      console.error("[Grafana] dashboard error:", err);
      return NextResponse.json({ error: "Failed to fetch dashboard" }, { status: 500 });
    }
  }

  if (action === "datasources") {
    try {
      const res = await grafanaFetch("/api/datasources", config);
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({ datasources: data });
      }
      return NextResponse.json({ error: "Failed to fetch datasources" }, { status: res.status });
    } catch (err: unknown) {
      console.error("[Grafana] datasources error:", err);
      return NextResponse.json({ error: "Failed to fetch datasources" }, { status: 500 });
    }
  }

  if (action === "stats") {
    try {
      const [healthRes, dashRes, dsRes] = await Promise.all([
        grafanaFetch("/api/health", config),
        grafanaFetch("/api/search?type=dash-db", config),
        grafanaFetch("/api/datasources", config),
      ]);
      const health = healthRes.ok ? await healthRes.json() : {};
      const dashboards = dashRes.ok ? await dashRes.json() : [];
      const datasources = dsRes.ok ? await dsRes.json() : [];
      return NextResponse.json({
        connected: healthRes.ok,
        configured: true,
        health,
        dashboardCount: dashboards.length,
        datasourceCount: datasources.length,
        datasources: datasources.map((d: Record<string, unknown>) => ({
          name: d.name,
          type: d.type,
          url: d.url,
          isDefault: d.isDefault,
        })),
      });
    } catch (err: unknown) {
      console.error("[Grafana] stats error:", err);
      return NextResponse.json({
        connected: false,
        configured: true,
        health: {},
        dashboardCount: 0,
        datasourceCount: 0,
        datasources: [],
        error: "Failed to fetch Grafana stats",
      });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[GET /api/grafana-dashboards] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    try {
      try {
        await requireAuth(request);
      } catch (e) {
        if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
        throw e;
      }
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const body = await request.json();
  const { action } = body;

  if (action === "save-config") {
    const { grafanaUrl, grafanaApiKey } = body;
    try {
      await db.ispSettings.upsert({
        where: { id: "default" },
        update: {
          grafanaUrl: grafanaUrl || "",
          grafanaApiKey: grafanaApiKey || "",
        },
        create: {
          grafanaUrl: grafanaUrl || "",
          grafanaApiKey: grafanaApiKey || "",
        },
      });
      return NextResponse.json({ success: true, message: "Grafana configuration saved" });
    } catch (err: unknown) {
      console.error("[Grafana] save-config error:", err);
      return NextResponse.json({ error: "Failed to save Grafana configuration" }, { status: 500 });
    }
  }

  if (action === "test-connection") {
    const { grafanaUrl, grafanaApiKey } = body;
    const url = (grafanaUrl || "").replace(/\/+$/, "");
    if (!url) {
      return NextResponse.json({ success: false, error: "URL is required" });
    }
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (grafanaApiKey) {
        headers["Authorization"] = `Bearer ${grafanaApiKey}`;
      }
      const res = await fetch(`${url}/api/health`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({ success: true, data });
      }
      const text = await res.text().catch(() => "");
      return NextResponse.json({ success: false, error: `HTTP ${res.status}: ${text}` });
    } catch (err: unknown) {
      console.error("[Grafana] test-connection error:", err);
      return NextResponse.json({ success: false, error: "Failed to test Grafana connection" });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[POST /api/grafana-dashboards] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
