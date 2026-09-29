import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";

// ============================================================
// API Keys — service-to-service auth credentials
// Per spec 08_SEC §6. The plaintext key is generated once and
// returned exactly one time (oneTimeView). Only the SHA-256
// hash is persisted in `api_keys.key` (per schema design).
// ============================================================

// GET /api/api-keys — list keys (never returns the secret)
export async function GET(req: NextRequest) {
  try {
    await requirePermission("api_key", "list");

    // Auto-expire: any active key past its expiry becomes `expired`
    await db.apiKey.updateMany({
      where: { status: "active", expiresAt: { lt: new Date() } },
      data: { status: "expired" },
    });

    const apiKeys = await db.apiKey.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        status: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        revokedAt: true,
      },
    });

    return NextResponse.json({ apiKeys });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch API keys" }, { status: 500 });
  }
}

// POST /api/api-keys — generate a new key (plaintext shown once)
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("api_key", "create");
    const body = await req.json();
    const { name, expiresAt } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    if (expiresAt && isNaN(Date.parse(expiresAt))) {
      return NextResponse.json({ error: "expiresAt must be a valid date" }, { status: 400 });
    }

    // Generate the plaintext key: csk_live_<48 hex chars>
    const plaintext = `csk_live_${randomBytes(24).toString("hex")}`;

    const apiKey = await db.apiKey.create({
      data: {
        name: name.trim(),
        // Schema design: only the SHA-256 hash is stored for verification
        key: createHash("sha256").update(plaintext).digest("hex"),
        keyPrefix: plaintext.slice(0, 12),
        status: "active",
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    await auditCreateEntity({
      userId: user.id,
      resource: "api_key",
      resourceId: apiKey.id,
      resourceName: apiKey.name,
      after: { name: apiKey.name, keyPrefix: apiKey.keyPrefix, expiresAt: apiKey.expiresAt },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json(
      {
        apiKey: {
          id: apiKey.id,
          name: apiKey.name,
          keyPrefix: apiKey.keyPrefix,
          status: apiKey.status,
          lastUsedAt: apiKey.lastUsedAt,
          expiresAt: apiKey.expiresAt,
          createdAt: apiKey.createdAt,
        },
        key: plaintext, // full plaintext — shown exactly once
        oneTimeView: true,
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to create API key" }, { status: 500 });
  }
}
