import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const [totalSubnets, activeSubnets, totalPools, totalReservations, totalPdDelegations] =
      await Promise.all([
        db.dhcpV6Subnet.count(),
        db.dhcpV6Subnet.count({ where: { enabled: true } }),
        db.dhcpV6Pool.count(),
        db.dhcpV6Reservation.count(),
        db.dhcpV6PrefixDelegation.count(),
      ]);

    return NextResponse.json({
      totalSubnets,
      activeSubnets,
      totalPools,
      totalReservations,
      totalPdDelegations,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error fetching DHCPv6 stats:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
