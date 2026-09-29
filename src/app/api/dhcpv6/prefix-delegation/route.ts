import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const delegations = await db.dhcpV6PrefixDelegation.findMany({
      include: {
        dhcpV6Subnet: {
          select: { name: true, prefix: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(delegations);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error fetching DHCPv6 prefix delegations:", error);
    return NextResponse.json({ error: "Failed to fetch prefix delegations" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { dhcpV6SubnetId, name, delegatedPrefix, prefixLength, clientDuid, leaseTime, subscriberId, description, enabled } = body;

    if (!dhcpV6SubnetId) {
      return NextResponse.json({ error: "dhcpV6SubnetId is required" }, { status: 400 });
    }

    if (!delegatedPrefix) {
      return NextResponse.json({ error: "delegatedPrefix is required" }, { status: 400 });
    }

    const pd = await db.dhcpV6PrefixDelegation.create({
      data: {
        dhcpV6SubnetId,
        name: name ?? "",
        delegatedPrefix,
        prefixLength: prefixLength ?? 48,
        clientDuid: clientDuid ?? "",
        leaseTime: leaseTime ?? 86400,
        subscriberId: subscriberId || null,
        description: description ?? "",
        enabled: enabled ?? true,
      },
    });

    return NextResponse.json(pd, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error creating DHCPv6 prefix delegation:", error);
    return NextResponse.json({ error: "Failed to create prefix delegation" }, { status: 500 });
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

    const pd = await db.dhcpV6PrefixDelegation.update({
      where: { id },
      data,
    });

    return NextResponse.json(pd);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error updating DHCPv6 prefix delegation:", error);
    return NextResponse.json({ error: "Failed to update prefix delegation" }, { status: 500 });
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

    await db.dhcpV6PrefixDelegation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error deleting DHCPv6 prefix delegation:", error);
    return NextResponse.json({ error: "Failed to delete prefix delegation" }, { status: 500 });
  }
}
