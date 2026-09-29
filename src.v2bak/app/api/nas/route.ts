import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { syncNasToRadius, deleteNasFromRadius } from "@/lib/radius-sync";
import { auditCreateEntity, auditDelete } from "@/lib/audit";

// GET /api/nas — list all NAS devices
export async function GET(req: NextRequest) {
  try {
    await requirePermission("aaa.nas", "list");

    const devices = await db.nas.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, nasname: true, shortname: true, type: true,
        ports: true, description: true, isActive: true,
        lastSeenAt: true, createdAt: true, updatedAt: true,
        areaId: true,
      },
    });

    return NextResponse.json({ devices });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch NAS devices" }, { status: 500 });
  }
}

// POST /api/nas — create NAS device + sync to FreeRADIUS nas table
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("aaa.nas", "create");
    const body = await req.json();
    const { nasname, shortname, type, secret, ports, description } = body;

    if (!nasname || !secret) {
      return NextResponse.json({ error: "nasname and secret required" }, { status: 400 });
    }

    // Check duplicate
    const existing = await db.nas.findUnique({ where: { nasname } });
    if (existing) {
      return NextResponse.json({ error: "NAS with this name already exists" }, { status: 409 });
    }

    // Create in OSS/BSS nas table (which IS the FreeRADIUS nas table)
    const nas = await db.nas.create({
      data: {
        nasname,
        shortname: shortname || nasname,
        type: type || "other",
        secret,
        ports: ports ? Number(ports) : null,
        description: description || null,
        createdBy: user.id,
      },
    });

    // Sync to FreeRADIUS nas table (same table — but log the sync)
    await syncNasToRadius({
      nasname, shortname, type: type || "other", secret,
      ports: ports ? Number(ports) : null, description,
    });

    await auditCreateEntity({
      userId: user.id, action: "create", resource: "nas",
      resourceId: String(nas.id), resourceName: nas.nasname,
      after: { nasname, type, shortname },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ nas }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to create NAS" }, { status: 500 });
  }
}

// DELETE /api/nas — delete NAS device
export async function DELETE(req: NextRequest) {
  try {
    const user = await requirePermission("aaa.nas", "delete");
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const nas = await db.nas.findUnique({ where: { id: Number(id) } });
    if (!nas) return NextResponse.json({ error: "NAS not found" }, { status: 404 });

    await deleteNasFromRadius(nas.nasname);

    await auditDelete({
      userId: user.id, action: "delete", resource: "nas",
      resourceId: String(nas.id), resourceName: nas.nasname,
      before: { nasname: nas.nasname, type: nas.type },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to delete NAS" }, { status: 500 });
  }
}
