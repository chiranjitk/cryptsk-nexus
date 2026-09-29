import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const reservations = await db.dhcpV6Reservation.findMany({
      include: {
        dhcpV6Subnet: {
          select: { name: true, prefix: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(reservations);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error fetching DHCPv6 reservations:", error);
    return NextResponse.json({ error: "Failed to fetch reservations" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { dhcpV6SubnetId, duid, ipAddress, iaid, hostname, clientType, subscriberId, deviceId, description, enabled } = body;

    if (!dhcpV6SubnetId) {
      return NextResponse.json({ error: "dhcpV6SubnetId is required" }, { status: 400 });
    }

    if (!duid) {
      return NextResponse.json({ error: "duid is required" }, { status: 400 });
    }

    if (!ipAddress) {
      return NextResponse.json({ error: "ipAddress is required" }, { status: 400 });
    }

    const reservation = await db.dhcpV6Reservation.create({
      data: {
        dhcpV6SubnetId,
        duid,
        ipAddress,
        iaid: iaid ?? "",
        hostname: hostname ?? "",
        clientType: clientType ?? "SUBSCRIBER",
        subscriberId: subscriberId || null,
        deviceId: deviceId || null,
        description: description ?? "",
        enabled: enabled ?? true,
      },
    });

    return NextResponse.json(reservation, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error creating DHCPv6 reservation:", error);
    return NextResponse.json({ error: "Failed to create reservation" }, { status: 500 });
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

    const reservation = await db.dhcpV6Reservation.update({
      where: { id },
      data,
    });

    return NextResponse.json(reservation);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error updating DHCPv6 reservation:", error);
    return NextResponse.json({ error: "Failed to update reservation" }, { status: 500 });
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

    await db.dhcpV6Reservation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error deleting DHCPv6 reservation:", error);
    return NextResponse.json({ error: "Failed to delete reservation" }, { status: 500 });
  }
}
