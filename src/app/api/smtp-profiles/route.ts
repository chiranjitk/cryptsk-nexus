import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate, auditUpdate, auditDelete } from "@/lib/services/audit-service";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const profiles = await db.smtpProfile.findMany({
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(profiles);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("SMTP profiles fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch SMTP profiles" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { name, host, port, username, password, fromEmail, fromName, encryption, isDefault } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Profile name is required" }, { status: 400 });
    }
    if (!host || !host.trim()) {
      return NextResponse.json({ error: "SMTP host is required" }, { status: 400 });
    }
    const validEncryptions = ["none", "tls", "ssl"];
    if (encryption && !validEncryptions.includes(encryption)) {
      return NextResponse.json({ error: "Encryption must be none, tls, or ssl" }, { status: 400 });
    }

    // If setting as default, unset other defaults first
    if (isDefault) {
      await db.smtpProfile.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }

    const profile = await db.smtpProfile.create({
      data: {
        name: name.trim(),
        host: host.trim(),
        port: port || 587,
        username: username || "",
        password: password || "",
        fromEmail: fromEmail || "",
        fromName: fromName || "",
        encryption: encryption || "tls",
        isDefault: !!isDefault,
      },
    });

    auditCreate(request, "SmtpProfile", profile.id, { name: profile.name, host: profile.host }, { userId }).catch(() => {});
    return NextResponse.json(profile, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("SMTP profile create error:", error);
    return NextResponse.json({ error: "Failed to create SMTP profile" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: "Profile ID is required" }, { status: 400 });
    }

    const existing = await db.smtpProfile.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "SMTP profile not found" }, { status: 404 });
    }

    const validEncryptions = ["none", "tls", "ssl"];
    if (data.encryption && !validEncryptions.includes(data.encryption)) {
      return NextResponse.json({ error: "Encryption must be none, tls, or ssl" }, { status: 400 });
    }

    // If setting as default, unset other defaults first
    if (data.isDefault) {
      await db.smtpProfile.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
    }

    const updated = await db.smtpProfile.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.host !== undefined ? { host: data.host.trim() } : {}),
        ...(data.port !== undefined ? { port: data.port } : {}),
        ...(data.username !== undefined ? { username: data.username } : {}),
        ...(data.password !== undefined ? { password: data.password } : {}),
        ...(data.fromEmail !== undefined ? { fromEmail: data.fromEmail } : {}),
        ...(data.fromName !== undefined ? { fromName: data.fromName } : {}),
        ...(data.encryption !== undefined ? { encryption: data.encryption } : {}),
        ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      },
    });

    auditUpdate(request, "SmtpProfile", id, { name: updated.name, host: updated.host }, { name: existing.name, host: existing.host }, { userId }).catch(() => {});
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("SMTP profile update error:", error);
    return NextResponse.json({ error: "Failed to update SMTP profile" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Profile ID is required" }, { status: 400 });
    }

    const existing = await db.smtpProfile.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "SMTP profile not found" }, { status: 404 });
    }

    auditDelete(request, "SmtpProfile", id, { name: existing.name, host: existing.host }, { userId }).catch(() => {});
    await db.smtpProfile.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("SMTP profile delete error:", error);
    return NextResponse.json({ error: "Failed to delete SMTP profile" }, { status: 500 });
  }
}
