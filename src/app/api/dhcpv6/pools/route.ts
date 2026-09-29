import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const pools = await db.dhcpV6Pool.findMany({
      include: {
        dhcpV6Subnet: {
          select: { name: true, prefix: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(pools);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error fetching DHCPv6 pools:", error);
    return NextResponse.json({ error: "Failed to fetch pools" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { dhcpV6SubnetId, name, rangeStart, rangeEnd } = body;

    if (!dhcpV6SubnetId) {
      return NextResponse.json({ error: "dhcpV6SubnetId is required" }, { status: 400 });
    }

    if (!rangeStart || !rangeEnd) {
      return NextResponse.json({ error: "rangeStart and rangeEnd are required" }, { status: 400 });
    }

    const pool = await db.dhcpV6Pool.create({
      data: {
        dhcpV6SubnetId,
        name: name ?? "",
        rangeStart,
        rangeEnd,
      },
    });

    return NextResponse.json(pool, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error creating DHCPv6 pool:", error);
    return NextResponse.json({ error: "Failed to create pool" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const pool = await db.dhcpV6Pool.update({
      where: { id },
      data,
    });

    return NextResponse.json(pool);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error updating DHCPv6 pool:", error);
    return NextResponse.json({ error: "Failed to update pool" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
    }

    await db.dhcpV6Pool.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error deleting DHCPv6 pool:", error);
    return NextResponse.json({ error: "Failed to delete pool" }, { status: 500 });
  }
}
