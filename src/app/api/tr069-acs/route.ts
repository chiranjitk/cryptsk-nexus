import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── Constants ──────────────────────────────────────────────────────────────

const NBI_BASE = process.env.GENIEACS_NBI_URL || "http://127.0.0.1:7548";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function proxyToNbi(
  resource: string,
  method: string,
  id?: string,
  body?: unknown,
  query?: Record<string, string>,
) {
  let url = `${NBI_BASE}/${encodeURIComponent(resource)}`;
  if (id) {
    url += `/${encodeURIComponent(id)}`;
  }
  if (query && Object.keys(query).length > 0) {
    const params = new URLSearchParams(query);
    url += `?${params.toString()}`;
  }

  const fetchOptions: RequestInit = {
    method,
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  };

  if (body !== undefined && (method === "POST" || method === "PUT" || method === "DELETE")) {
    fetchOptions.headers = {
      ...fetchOptions.headers,
      "Content-Type": "application/json",
    };
    fetchOptions.body = JSON.stringify(body);
  }

  const res = await fetch(url, fetchOptions);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GenieACS NBI ${res.status}: ${text || res.statusText}`);
  }

  // Some NBI endpoints return 204 with no body (e.g., DELETE)
  if (res.status === 204) {
    return null;
  }

  return res.json();
}

// ─── GET Handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const resource = searchParams.get("resource") || "devices";
    const id = searchParams.get("id") || undefined;
    const deviceId = searchParams.get("deviceId") || undefined;

    // Build query params (skip internal params)
    const query: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      if (["resource", "id", "deviceId"].includes(key)) continue;
      if (value) query[key] = value;
    }

    let result;
    let enrichedData: Record<string, unknown> = {};

    if (resource === "devices") {
      if (deviceId) {
        // Get specific device details
        result = await proxyToNbi("devices", "GET", deviceId);
        enrichedData = {
          device: result,
        };
      } else if (id) {
        // Get specific device
        result = await proxyToNbi("devices", "GET", id);
        enrichedData = {
          device: result,
        };
      } else {
        // List all devices
        const devices = await proxyToNbi("devices", "GET", undefined, undefined, query);
        const deviceList = Array.isArray(devices) ? devices : [];

        // Calculate online/offline status
        const now = Date.now();
        let onlineCount = 0;
        const enrichedDevices = deviceList.map((d: Record<string, unknown>) => {
          const lastInform = d["_lastInform"] as number | undefined;
          const isOnline = lastInform && (now - lastInform) < 300000; // 5 min threshold
          if (isOnline) onlineCount++;

          // Extract device info from _id
          const deviceId = (d["_id"] as string) || "";
          const parts = deviceId.split("-");
          const oui = parts.length > 0 ? parts[0] : "";
          const sn = parts.length > 1 ? parts.slice(1).join("-") : "";

          // Extract common parameters from _deviceId
          const deviceIdObj = (d["_deviceId"] as Record<string, unknown>) || {};
          const manufacturer = (deviceIdObj["Manufacturer"] as string) || "";
          const model = (deviceIdObj["ProductClass"] as string) || "";
          const serialNumber = (deviceIdObj["SerialNumber"] as string) || sn;
          const softwareVersion = (deviceIdObj["SoftwareVersion"] as string) || "";

          return {
            _id: deviceId,
            _lastInform: lastInform,
            _lastBoot: d["_lastBoot"],
            _lastBootstrap: d["_lastBootstrap"],
            _registered: d["_registered"],
            _tags: d["_tags"] || [],
            oui,
            serialNumber,
            manufacturer,
            model,
            softwareVersion,
            isOnline,
            lastInformDate: lastInform ? new Date(lastInform).toISOString() : null,
          };
        });

        enrichedData = {
          devices: enrichedDevices,
          total: enrichedDevices.length,
          online: onlineCount,
          offline: enrichedDevices.length - onlineCount,
        };
      }
    } else if (resource === "tasks") {
      result = await proxyToNbi("tasks", "GET", undefined, undefined, query);
      enrichedData = {
        tasks: Array.isArray(result) ? result : [],
      };
    } else if (resource === "provisions") {
      result = await proxyToNbi("provisions", "GET", undefined, undefined, query);
      enrichedData = {
        provisions: Array.isArray(result) ? result : [],
      };
    } else if (resource === "files") {
      result = await proxyToNbi("files", "GET", undefined, undefined, query);
      enrichedData = {
        files: Array.isArray(result) ? result : [],
      };
    } else if (resource === "faults") {
      result = await proxyToNbi("faults", "GET", undefined, undefined, query);
      enrichedData = {
        faults: Array.isArray(result) ? result : [],
      };
    } else if (resource === "presets") {
      result = await proxyToNbi("presets", "GET", undefined, undefined, query);
      enrichedData = {
        presets: Array.isArray(result) ? result : [],
      };
    } else {
      return NextResponse.json(
        { success: false, error: `Unknown resource: ${resource}` },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      ...enrichedData,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    // If GenieACS is not reachable
    if (message.includes("ECONNREFUSED") || message.includes("fetch failed") || message.includes("connect")) {
      return NextResponse.json({
        success: false,
        error: "GenieACS NBI is not reachable. Please ensure the service is running.",
        serviceUnavailable: true,
      });
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ─── POST Handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);

    const body = await req.json();
    const { resource, data, id } = body as {
      resource: string;
      data: unknown;
      id?: string;
    };

    if (!resource) {
      return NextResponse.json(
        { success: false, error: "Missing required field: resource" },
        { status: 400 },
      );
    }

    const result = await proxyToNbi(resource, "POST", id, data);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("ECONNREFUSED") || message.includes("fetch failed") || message.includes("connect")) {
      return NextResponse.json({
        success: false,
        error: "GenieACS NBI is not reachable. Please ensure the service is running.",
        serviceUnavailable: true,
      });
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ─── DELETE Handler ─────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const resource = searchParams.get("resource") || "";
    const id = searchParams.get("id") || "";

    if (!resource || !id) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: resource and id" },
        { status: 400 },
      );
    }

    await proxyToNbi(resource, "DELETE", id);

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("ECONNREFUSED") || message.includes("fetch failed") || message.includes("connect")) {
      return NextResponse.json({
        success: false,
        error: "GenieACS NBI is not reachable. Please ensure the service is running.",
        serviceUnavailable: true,
      });
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
