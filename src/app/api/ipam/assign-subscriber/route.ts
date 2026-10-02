import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── GET: Query subscriber's assigned IPs ─────────────────────
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const { searchParams } = new URL(request.url);
    const username = searchParams.get("username") || "";

    if (!username) {
      return NextResponse.json({ error: "username query parameter is required" }, { status: 400 });
    }

    // Fetch IPAM IpAddress records matching this username
    const ipamIps = await db.ipAddress.findMany({
      where: { description: username },
      include: { Subnet: { select: { id: true, name: true, cidr: true, network: true, allocationStrategy: true } } },
      orderBy: { updatedAt: "desc" },
    });

    const transformedIpamIps = ipamIps.map((ip) => ({
      id: ip.id,
      ip: ip.address,
      subnetId: ip.subnetId,
      subnetName: ip.Subnet?.name || "",
      subnetCidr: ip.Subnet?.cidr || ip.Subnet?.network || "",
      allocationStrategy: ip.Subnet?.allocationStrategy || "STATIC",
      status: ip.status,
      subscriberId: ip.subscriberId || "",
      updatedAt: ip.updatedAt?.toISOString() || "",
    }));

    // Fetch radreply Framed-IP-Address for this user
    const radiusReplyRows = await db.$queryRawUnsafe<any[]>(
      `SELECT * FROM radreply WHERE username = $1 AND attribute = 'Framed-IP-Address'`,
      username,
    );

    const radiusReply = radiusReplyRows.length > 0
      ? { framedIp: radiusReplyRows[0].value || null }
      : { framedIp: null };

    return NextResponse.json({ ipamIps: transformedIpamIps, radiusReply });
  } catch (error) {
    console.error("Assign Subscriber GET error:", error);
    return NextResponse.json({ error: "Failed to fetch subscriber IP assignments" }, { status: 500 });
  }
}

// ─── POST: Assign/unassign subscriber IPs ─────────────────────
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const body = await request.json();
    const { action } = body;

    switch (action) {
      // ── assign: Link an IP to a subscriber via radreply ──────
      case "assign": {
        const { ipAddressId, username, strategy } = body;
        if (!ipAddressId || !username) {
          return NextResponse.json(
            { error: "ipAddressId and username are required" },
            { status: 400 },
          );
        }

        // Fetch the IP address and its subnet
        const ipRecord = await db.ipAddress.findUnique({
          where: { id: ipAddressId },
          include: {
            Subnet: { select: { id: true, gateway: true, allocationStrategy: true, frPoolName: true } },
          },
        });

        if (!ipRecord) {
          return NextResponse.json({ error: "IP address not found" }, { status: 404 });
        }

        // Update IpAddress to used with username as description
        await db.ipAddress.update({
          where: { id: ipAddressId },
          data: {
            status: "used",
            description: username,
          },
        });

        // Insert or update radreply with Framed-IP-Address
        await db.$executeRawUnsafe(
          `INSERT INTO radreply (username, attribute, op, value) VALUES ($1, 'Framed-IP-Address', ':=', $2)
           ON CONFLICT (username, attribute) DO UPDATE SET value = $2, op = ':='`,
          username,
          ipRecord.address,
        );

        // If strategy is DHCP_POOL, also update radippool
        if (strategy === "DHCP_POOL" && ipRecord.Subnet?.frPoolName) {
          const gateway = ipRecord.Subnet.gateway || "";
          await db.$executeRawUnsafe(
            `UPDATE radippool
             SET username = $1, "NASIPAddress" = $2
             WHERE "FramedIPAddress" = $3::inet AND pool_name = $4`,
            username,
            gateway,
            ipRecord.address,
            ipRecord.Subnet.frPoolName,
          );
        }

        return NextResponse.json({
          success: true,
          message: `IP ${ipRecord.address} assigned to ${username}`,
        });
      }

      // ── unassign: Release subscriber IP from radreply ────────
      case "unassign": {
        const { ipAddressId, username } = body;
        if (!ipAddressId || !username) {
          return NextResponse.json(
            { error: "ipAddressId and username are required" },
            { status: 400 },
          );
        }

        // Fetch the IP record
        const ipRecord = await db.ipAddress.findUnique({
          where: { id: ipAddressId },
          include: {
            Subnet: { select: { id: true, frPoolName: true } },
          },
        });

        if (!ipRecord) {
          return NextResponse.json({ error: "IP address not found" }, { status: 404 });
        }

        // Update IpAddress to free
        await db.ipAddress.update({
          where: { id: ipAddressId },
          data: {
            status: "free",
            description: "",
          },
        });

        // Delete from radreply
        await db.$executeRawUnsafe(
          `DELETE FROM radreply WHERE username = $1 AND attribute = 'Framed-IP-Address'`,
          username,
        );

        // If IP was in radippool, expire the lease
        if (ipRecord.Subnet?.frPoolName) {
          await db.$executeRawUnsafe(
            `UPDATE radippool SET expiry_time = NOW() WHERE "FramedIPAddress" = $1::inet AND pool_name = $2`,
            ipRecord.address,
            ipRecord.Subnet.frPoolName,
          );
        }

        return NextResponse.json({
          success: true,
          message: `IP ${ipRecord.address} unassigned from ${username}`,
        });
      }

      default:
        return NextResponse.json(
          { error: "Unknown action. Valid: assign, unassign" },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("Assign Subscriber POST error:", error);
    return NextResponse.json({ error: "Failed to process subscriber IP assignment" }, { status: 500 });
  }
}
