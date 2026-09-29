import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// IPv6 prefix validation regex
const IPV6_PREFIX_REGEX = /^[0-9a-fA-F:]+$/;

// Safe JSON serializer that handles BigInt
function safeSerialize(data: unknown): unknown {
  return JSON.parse(JSON.stringify(data, (_, value) =>
    typeof value === "bigint" ? Number(value) : value
  ));
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const subnets = await db.dhcpV6Subnet.findMany({
      include: {
        pools: true,
        reservations: true,
        prefixDelegations: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Attach counts manually (Turbopack strips _count from Prisma client)
    const subnetsWithCounts = await Promise.all(
      subnets.map(async (s) => {
        const countsRow = await db.$queryRawUnsafe<Array<{ pools: number; reservations: number; prefixDelegations: number }>>(
          `SELECT
            (SELECT COUNT(*) FROM "DhcpV6Pool" WHERE "dhcpV6SubnetId" = $1) as pools,
            (SELECT COUNT(*) FROM "DhcpV6Reservation" WHERE "dhcpV6SubnetId" = $2) as reservations,
            (SELECT COUNT(*) FROM "DhcpV6PrefixDelegation" WHERE "dhcpV6SubnetId" = $3) as prefixDelegations`,
          s.id, s.id, s.id
        );
        const c = countsRow[0];
        return { ...s, _count: { pools: c.pools, reservations: c.reservations, prefixDelegations: c.prefixDelegations } };
      })
    );

    return NextResponse.json(safeSerialize(subnetsWithCounts));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error fetching DHCPv6 subnets:", error);
    return NextResponse.json({ error: "Failed to fetch subnets" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { name, interfaceName, prefix, prefixLength, preferredLifetime, validLifetime, raEnabled, raIntervalSec, raManagedFlag, raOtherFlag, dnsServers, domainSearch, ntpServers, rapidCommit, enabled } = body;

    if (!name || !interfaceName || !prefix) {
      return NextResponse.json({ error: "name, interfaceName, and prefix are required" }, { status: 400 });
    }

    if (!IPV6_PREFIX_REGEX.test(prefix)) {
      return NextResponse.json({ error: "Invalid IPv6 prefix format" }, { status: 400 });
    }

    if (prefixLength < 32 || prefixLength > 128) {
      return NextResponse.json({ error: "prefixLength must be between 32 and 128" }, { status: 400 });
    }

    const subnet = await db.dhcpV6Subnet.create({
      data: {
        name,
        interfaceName,
        prefix,
        prefixLength: prefixLength ?? 64,
        preferredLifetime: preferredLifetime ?? 14400,
        validLifetime: validLifetime ?? 86400,
        raEnabled: raEnabled ?? true,
        raIntervalSec: raIntervalSec ?? 600,
        raManagedFlag: raManagedFlag ?? true,
        raOtherFlag: raOtherFlag ?? false,
        dnsServers: dnsServers ?? "",
        domainSearch: domainSearch ?? "",
        ntpServers: ntpServers ?? "",
        rapidCommit: rapidCommit ?? false,
        enabled: enabled ?? true,
      },
    });

    return NextResponse.json(subnet, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error creating DHCPv6 subnet:", error);
    return NextResponse.json({ error: "Failed to create subnet" }, { status: 500 });
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

    if (data.prefix && !IPV6_PREFIX_REGEX.test(data.prefix)) {
      return NextResponse.json({ error: "Invalid IPv6 prefix format" }, { status: 400 });
    }

    if (data.prefixLength !== undefined && (data.prefixLength < 32 || data.prefixLength > 128)) {
      return NextResponse.json({ error: "prefixLength must be between 32 and 128" }, { status: 400 });
    }

    const subnet = await db.dhcpV6Subnet.update({
      where: { id },
      data,
    });

    return NextResponse.json(subnet);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error updating DHCPv6 subnet:", error);
    return NextResponse.json({ error: "Failed to update subnet" }, { status: 500 });
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

    await db.dhcpV6Subnet.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error deleting DHCPv6 subnet:", error);
    return NextResponse.json({ error: "Failed to delete subnet" }, { status: 500 });
  }
}
