import { NextRequest, NextResponse } from "next/server";
import { VpnTunnelStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";

const VPN_TYPES = ["ipsec", "wireguard", "openvpn"];

// Never return the PSK in list responses — return hasPsk boolean instead.
// BigInt fields cannot pass through NextResponse.json — convert to Number.
function serializeTunnel(tunnel: any) {
  const { psk, ...rest } = tunnel;
  return {
    ...rest,
    hasPsk: Boolean(psk),
    rxBytes: rest.rxBytes != null ? Number(rest.rxBytes) : null,
    txBytes: rest.txBytes != null ? Number(rest.txBytes) : null,
  };
}

// GET /api/vpn/tunnels — list VPN tunnels (filters: ?status ?type), PSK withheld
export async function GET(req: NextRequest) {
  try {
    await requirePermission("network.device", "list");

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "";
    const type = searchParams.get("type") || "";

    const where: Record<string, unknown> = {};
    if (status) {
      if (!Object.values(VpnTunnelStatus).includes(status as VpnTunnelStatus)) {
        return NextResponse.json({ error: "Invalid status — must be up, down, connecting or error" }, { status: 400 });
      }
      where.status = status as VpnTunnelStatus;
    }
    if (type) where.type = type;

    const tunnels = await db.vpnTunnel.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ tunnels: tunnels.map(serializeTunnel) });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch VPN tunnels" }, { status: 500 });
  }
}

// POST /api/vpn/tunnels — create a VPN tunnel
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("network.device", "create");
    const body = await req.json();
    const { tunnelName, type, status, localEndpoint, localSubnet, remoteEndpoint, remoteSubnet,
            ikeVersion, encryption, hash, dhGroup, psk, description } = body;

    if (!tunnelName || !type || !localEndpoint || !localSubnet || !remoteEndpoint || !remoteSubnet) {
      return NextResponse.json({ error: "tunnelName, type, localEndpoint, localSubnet, remoteEndpoint, remoteSubnet required" }, { status: 400 });
    }
    if (!VPN_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid type — must be ipsec, wireguard or openvpn" }, { status: 400 });
    }
    if (status && !Object.values(VpnTunnelStatus).includes(status)) {
      return NextResponse.json({ error: "Invalid status — must be up, down, connecting or error" }, { status: 400 });
    }
    if (ikeVersion !== undefined && ikeVersion !== "" && !["1", "2", 1, 2].includes(ikeVersion)) {
      return NextResponse.json({ error: "ikeVersion must be 1 or 2" }, { status: 400 });
    }

    const existing = await db.vpnTunnel.findUnique({ where: { tunnelName } });
    if (existing) return NextResponse.json({ error: "Tunnel name already exists" }, { status: 409 });

    const tunnel = await db.vpnTunnel.create({
      data: {
        tunnelName, type,
        status: status || "down",
        localEndpoint, localSubnet, remoteEndpoint, remoteSubnet,
        ikeVersion: ikeVersion !== undefined && ikeVersion !== "" ? Number(ikeVersion) : 2,
        encryption: encryption || "aes256",
        hash: hash || "sha256",
        dhGroup: dhGroup || "14",
        psk: psk || null,
        description: description || null,
        createdBy: user.id,
      },
    });

    await auditCreateEntity({
      userId: user.id, action: "create", resource: "vpn_tunnel",
      resourceId: tunnel.id, resourceName: tunnel.tunnelName,
      after: { tunnelName, type, localSubnet, remoteSubnet, remoteEndpoint, hasPsk: Boolean(psk) },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ tunnel: serializeTunnel(tunnel) }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to create VPN tunnel" }, { status: 500 });
  }
}
