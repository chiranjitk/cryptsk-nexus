import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auditCreate } from "@/lib/services/audit-service";
import type { NextRequest } from "next/server";
import { optionalAuth, requireAuth as _requireAuth, AuthError } from "@/lib/api-auth";

const VALID_SCOPES = ["read", "write", "admin", "subscribers", "plans", "invoices", "payments"];

export async function GET(request: Request) {
  try {
    try {
      await _requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const keys = await db.apiKey.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Parse scopes from JSON string to array for frontend
    const parsed = keys.map((k) => ({
      ...k,
      scopes: typeof k.scopes === "string" ? JSON.parse(k.scopes) : k.scopes,
    }));

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("API keys fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch API keys" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUserId = await optionalAuth(request);
    const body = await request.json();
    const { name, scopes, expiresAt, userId: bodyUserId, autoExpiryDays, requestsPerMinute, requestsPerDay } = body;

    if (!name || !scopes || !Array.isArray(scopes) || scopes.length === 0) {
      return NextResponse.json({ error: "Name and at least one scope are required" }, { status: 400 });
    }

    // Validate all scopes against allowed values
    const normalizedScopes = scopes.map((s: string) => String(s).toLowerCase());
    const invalidScopes = normalizedScopes.filter((s: string) => !VALID_SCOPES.includes(s));
    if (invalidScopes.length > 0) {
      return NextResponse.json(
        { error: `Invalid scopes: ${invalidScopes.join(", ")}. Valid scopes: ${VALID_SCOPES.join(", ")}` },
        { status: 400 }
      );
    }

    const key = `csk_${randomUUID().replace(/-/g, "")}`;
    const scopesJson = JSON.stringify(normalizedScopes);

    const apiKey = await db.apiKey.create({
      data: {
        name,
        key,
        scopes: scopesJson,
        userId: bodyUserId || authUserId || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        autoExpiryDays: typeof autoExpiryDays === "number" ? autoExpiryDays : 0,
        requestsPerMinute: typeof requestsPerMinute === "number" ? requestsPerMinute : 60,
        requestsPerDay: typeof requestsPerDay === "number" ? requestsPerDay : 1000,
      },
    });

    auditCreate(request, "ApiKey", apiKey.id, { name, scopes: normalizedScopes, requestsPerMinute, requestsPerDay }, { userId: bodyUserId || authUserId || undefined }).catch(() => {});

    // Return parsed scopes (as array, not string)
    return NextResponse.json({ ...apiKey, scopes: normalizedScopes }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("API key create error:", error);
    return NextResponse.json({ error: "Failed to create API key" }, { status: 500 });
  }
}
