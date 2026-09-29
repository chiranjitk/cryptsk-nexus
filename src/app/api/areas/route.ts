import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { auditCreate } from "@/lib/services/audit-service";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const filterStatus = searchParams.get("status") || "all";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));

    const where: Record<string, unknown> = {};
    if (filterStatus !== "all") where.status = filterStatus;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
        { description: { contains: search } },
      ];
    }
    const parentFilter = searchParams.get("parentId");
    if (parentFilter && parentFilter !== "all") {
      where.parentId = parentFilter;
    }

    const [areas, total] = await Promise.all([
      db.area.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          Technician: { select: { id: true, name: true } },
          CollectionAgent: { select: { id: true, name: true } },
          _count: { select: { Subscriber: true } },
          Area: { select: { id: true, name: true } },
        },
      }),
      db.area.count({ where }),
    ]);

    return NextResponse.json({
      items: areas.map((a) => ({
        id: a.id,
        name: a.name,
        code: a.code,
        description: a.description,
        status: a.status,
        latitude: a.latitude,
        longitude: a.longitude,
        assignedTechnicianId: a.assignedTechnicianId,
        assignedTechnicianName: a.Technician?.name || null,
        assignedAgentId: a.assignedAgentId,
        assignedAgentName: a.CollectionAgent?.name || null,
        subscriberCount: a._count.Subscriber,
        parentId: a.parentId,
        parentName: a.Area?.name || null,
        sortOrder: a.sortOrder,
        createdAt: a.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Areas fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch areas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { name, code, description, assignedTechnicianId, assignedAgentId, latitude, longitude, status, parentId } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Area name is required" }, { status: 400 });
    }
    if (!code || !code.trim()) {
      return NextResponse.json({ error: "Area code is required" }, { status: 400 });
    }

    // Validate status if provided
    const validStatuses = ["ACTIVE", "INACTIVE", "EXPANDING"];
    if (status !== undefined && !validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
    }

    const upperCode = code.trim().toUpperCase();
    const existing = await db.area.findUnique({ where: { code: upperCode } });
    if (existing) {
      return NextResponse.json({ error: "Area with this code already exists" }, { status: 409 });
    }

    // Validate lat/long if provided
    if (latitude !== undefined && latitude !== null && (latitude < -90 || latitude > 90)) {
      return NextResponse.json({ error: "Latitude must be between -90 and 90" }, { status: 400 });
    }
    if (longitude !== undefined && longitude !== null && (longitude < -180 || longitude > 180)) {
      return NextResponse.json({ error: "Longitude must be between -180 and 180" }, { status: 400 });
    }

    const area = await db.area.create({
      data: {
        name: name.trim(),
        code: upperCode,
        description: description || "",
        assignedTechnicianId: assignedTechnicianId && assignedTechnicianId !== "none" ? assignedTechnicianId : null,
        assignedAgentId: assignedAgentId && assignedAgentId !== "none" ? assignedAgentId : null,
        latitude: latitude !== undefined && latitude !== null ? Number(latitude) : null,
        longitude: longitude !== undefined && longitude !== null ? Number(longitude) : null,
        status: status || undefined,
        parentId: parentId && parentId !== "none" ? parentId : null,
      },
    });

    auditCreate(request, "Area", area.id, { name: area.name, code: area.code }, { userId }).catch(() => {});
    return NextResponse.json(area, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Area create error:", error);
    return NextResponse.json({ error: "Failed to create area" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { action } = body;

    if (action === "clone") {
      const { id } = body;
      const source = await db.area.findUnique({ where: { id } });
      if (!source) return NextResponse.json({ error: "Area not found" }, { status: 404 });

      // Generate unique code
      let newCode = source.code + "_COPY";
      let suffix = 1;
      while (await db.area.findUnique({ where: { code: newCode } })) {
        newCode = `${source.code}_COPY${suffix}`;
        suffix++;
      }

      const cloned = await db.area.create({
        data: {
          name: `${source.name} (Copy)`,
          code: newCode,
          description: source.description,
          assignedTechnicianId: source.assignedTechnicianId,
          assignedAgentId: source.assignedAgentId,
          latitude: source.latitude,
          longitude: source.longitude,
          status: source.status,
        },
      });

      auditCreate(request, "Area", cloned.id, { name: cloned.name, code: cloned.code, clonedFrom: source.id }, { userId }).catch(() => {});
      return NextResponse.json(cloned, { status: 201 });
    }

    if (action === "toggle-status") {
      const { id, status } = body;
      const area = await db.area.findUnique({ where: { id } });
      if (!area) return NextResponse.json({ error: "Area not found" }, { status: 404 });
      const updated = await db.area.update({ where: { id }, data: { status } });
      auditCreate(request, "Area", id, { status: "TOGGLE", previousStatus: area.status, newStatus: status }, { userId }).catch(() => {});
      return NextResponse.json(updated);
    }

    if (action === "reorder") {
      const { ids } = body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: "ids array is required" }, { status: 400 });
      }
      await Promise.all(
        ids.map((id: string, index: number) =>
          db.area.update({ where: { id }, data: { sortOrder: index + 1 } })
        )
      );
      auditCreate(request, "Area", "bulk", { action: "reorder", count: ids.length }, { userId }).catch(() => {});
      return NextResponse.json({ success: true, reordered: ids.length });
    }

    return NextResponse.json({ error: "Unknown action. Use 'clone', 'toggle-status', or 'reorder'." }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Area action error:", error);
    return NextResponse.json({ error: "Failed to process action" }, { status: 500 });
  }
}
