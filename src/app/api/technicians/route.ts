import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auditCreate } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuth(req);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    // Server-side search
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const [technicians, total] = await Promise.all([
      db.technician.findMany({
        where,
        include: {
          User: { select: { id: true, email: true, status: true } },
          Area: { select: { id: true, name: true, code: true } },
          _count: {
            select: {
              Complaint: true,
              Installation: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.technician.count({ where }),
    ]);

    const statusCounts = await db.technician.groupBy({
      by: ["status"],
      _count: { id: true },
    });

    const counts: Record<string, number> = {};
    for (const s of statusCounts) {
      counts[s.status] = s._count.id;
    }

    return NextResponse.json({
      technicians,
      statusCounts: counts,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Technicians GET error:", error);
    return NextResponse.json({ error: "Failed to fetch technicians" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    try {
      await requireAuth(req);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const body = await req.json();
    const { name, phone, email, skills, areas, status } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Create a User first for the technician
    const user = await db.user.create({
      data: {
        name,
        email: email || `${name.toLowerCase().replace(/\s+/g, ".")}@cryptsk.local`,
        phone: phone || "",
        password: await bcrypt.hash("technician_default", 12),
        role: "TECHNICIAN",
        status: "ACTIVE",
      },
    });

    const technician = await db.technician.create({
      data: {
        userId: user.id,
        name,
        phone: phone || "",
        email: email || "",
        skills: skills ? JSON.stringify(skills) : "[]",
        areas: areas ? JSON.stringify(areas) : "[]",
        status: status || "available",
      },
      include: {
        User: { select: { id: true, email: true, status: true } },
        _count: { select: { Complaint: true, Installation: true } },
      },
    });

    await auditCreate(req, "Technician", technician.id, { name, phone, status: technician.status });
    return NextResponse.json({ technician }, { status: 201 });
  } catch (error) {
    console.error("Technicians POST error:", error);
    return NextResponse.json({ error: "Failed to create technician" }, { status: 500 });
  }
}
