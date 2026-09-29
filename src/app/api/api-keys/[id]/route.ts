import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { auditDelete, auditUpdate } from "@/lib/services/audit-service";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

const VALID_SCOPES = ["read", "write", "admin", "subscribers", "plans", "invoices", "payments"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;
    const apiKey = await db.apiKey.findUnique({
      where: { id },
    });

    if (!apiKey) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    // Parse scopes from JSON string to array
    const result = {
      ...apiKey,
      scopes: typeof apiKey.scopes === "string" ? JSON.parse(apiKey.scopes) : apiKey.scopes,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("API key fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch API key" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = await request.json();

    const existing = await db.apiKey.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.ipWhitelist !== undefined) updateData.ipWhitelist = body.ipWhitelist;
    if (body.status !== undefined) updateData.status = body.status;

    // Track lastUsedAt if explicitly provided
    if (body.lastUsedAt !== undefined) updateData.lastUsedAt = new Date(body.lastUsedAt);

    // Handle scopes update
    if (body.scopes !== undefined && Array.isArray(body.scopes)) {
      const normalizedScopes = body.scopes.map((s: string) => String(s).toLowerCase());
      const invalidScopes = normalizedScopes.filter((s: string) => !VALID_SCOPES.includes(s));
      if (invalidScopes.length > 0) {
        return NextResponse.json(
          { error: `Invalid scopes: ${invalidScopes.join(", ")}` },
          { status: 400 }
        );
      }
      updateData.scopes = JSON.stringify(normalizedScopes);
    }

    // Handle rate limiting updates
    if (body.requestsPerMinute !== undefined) {
      updateData.requestsPerMinute = Number(body.requestsPerMinute);
    }
    if (body.requestsPerDay !== undefined) {
      updateData.requestsPerDay = Number(body.requestsPerDay);
    }

    // Handle auto-expiry updates
    if (body.autoExpiryDays !== undefined) {
      updateData.autoExpiryDays = Number(body.autoExpiryDays);
    }

    const updated = await db.apiKey.update({
      where: { id },
      data: updateData,
    });

    auditUpdate(request, "ApiKey", id, body, existing).catch(() => {});

    const result = {
      ...updated,
      scopes: typeof updated.scopes === "string" ? JSON.parse(updated.scopes) : updated.scopes,
    };

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("API key update error:", error);
    return NextResponse.json({ error: "Failed to update API key" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    const existing = await db.apiKey.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    if (action === "regenerate") {
      const { randomUUID } = await import("crypto");
      const newKey = `csk_${randomUUID().replace(/-/g, "")}`;

      const updated = await db.apiKey.update({
        where: { id },
        data: { key: newKey },
      });

      auditUpdate(request, "ApiKey", id, { action: "regenerate" }, existing).catch(() => {});

      return NextResponse.json({
        ...updated,
        scopes: typeof updated.scopes === "string" ? JSON.parse(updated.scopes) : updated.scopes,
        key: newKey,
      });
    }

    if (action === "extend") {
      // Extend expiry by 90 days from now
      const newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + 90);

      const updated = await db.apiKey.update({
        where: { id },
        data: { expiresAt: newExpiry },
      });

      auditUpdate(request, "ApiKey", id, { action: "extend", newExpiry: newExpiry.toISOString() }, existing).catch(() => {});

      return NextResponse.json({
        ...updated,
        scopes: typeof updated.scopes === "string" ? JSON.parse(updated.scopes) : updated.scopes,
      });
    }

    if (action === "touch") {
      // Update lastUsedAt and increment requestCount
      const updated = await db.apiKey.update({
        where: { id },
        data: {
          lastUsedAt: new Date(),
          requestCount: { increment: 1 },
        },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("API key patch error:", error);
    return NextResponse.json({ error: "Failed to patch API key" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const existing = await db.apiKey.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    await auditDelete(request, "ApiKey", id, { name: existing.name });
    await db.apiKey.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API key delete error:", error);
    return NextResponse.json({ error: "Failed to delete API key" }, { status: 500 });
  }
}
