import { NextRequest, NextResponse } from "next/server";
import { VpnTunnelStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditConfigChange, auditDelete } from "@/lib/audit";

const VPN_TYPES = ["ipsec", "wireguard", "openvpn"];

// GET /api/vpn/tunnels/[id] — get single tunnel incl. PSK (requires network.device manage)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("network.device", "manage");
    const { id } = await params;

    const tunnel = await db.vpnTunnel.findUnique({ where: { id } });
    if (!tunnel) return NextResponse.json({ error: "VPN tunnel not found" }, { status: 404 });

    return NextResponse.json({
      tunnel: {
        ...tunnel,
        rxBytes: tunnel.rxBytes != null ? Number(tunnel.rxBytes) : null,
        txBytes: tunnel.txBytes != null ? Number(tunnel.txBytes) : null,
      },
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch VPN tunnel" }, { status: 500 });
  }
}

// PATCH /api/vpn/tunnels/[id] — update tunnel fields + active toggle (PSK never returned)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("network.device", "update");
    const { id } = await params;
    const body = await req.json();
    const { tunnelName, type, status, localEndpoint, localSubnet, remoteEndpoint, remoteSubnet,
            ikeVersion, encryption, hash, dhGroup, psk, isActive, description } = body;

    const existing = await db.vpnTunnel.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "VPN tunnel not found" }, { status: 404 });

    if (type && !VPN_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid type — must be ipsec, wireguard or openvpn" }, { status: 400 });
    }
    if (status && !Object.values(VpnTunnelStatus).includes(status)) {
      return NextResponse.json({ error: "Invalid status — must be up, down, connecting or error" }, { status: 400 });
    }
    if (ikeVersion !== undefined && ikeVersion !== "" && !["1", "2", 1, 2].includes(ikeVersion)) {
      return NextResponse.json({ error: "ikeVersion must be 1 or 2" }, { status: 400 });
    }
    if (tunnelName && tunnelName !== existing.tunnelName) {
      const dup = await db.vpnTunnel.findUnique({ where: { tunnelName } });
      if (dup) return NextResponse.json({ error: "Tunnel name already exists" }, { status: 409 });
    }

    const data: Record<string, unknown> = {};
    if (tunnelName !== undefined) data.tunnelName = tunnelName;
    if (type !== undefined) data.type = type;
    if (status !== undefined) data.status = status;
    if (localEndpoint !== undefined) data.localEndpoint = localEndpoint;
    if (localSubnet !== undefined) data.localSubnet = localSubnet;
    if (remoteEndpoint !== undefined) data.remoteEndpoint = remoteEndpoint;
    if (remoteSubnet !== undefined) data.remoteSubnet = remoteSubnet;
    if (ikeVersion !== undefined) data.ikeVersion = Number(ikeVersion);
    if (encryption !== undefined) data.encryption = encryption;
    if (hash !== undefined) data.hash = hash;
    if (dhGroup !== undefined) data.dhGroup = dhGroup;
    if (psk !== undefined) data.psk = psk || null;
    if (isActive !== undefined) data.isActive = isActive;
    if (description !== undefined) data.description = description || null;

    const tunnel = await db.vpnTunnel.update({ where: { id }, data });

    await auditConfigChange({
      userId: user.id, action: "config_change", resource: "vpn_tunnel",
      resourceId: id, resourceName: tunnel.tunnelName,
      before: { tunnelName: existing.tunnelName, type: existing.type, status: existing.status, remoteEndpoint: existing.remoteEndpoint, isActive: existing.isActive },
      after: { tunnelName: tunnel.tunnelName, type: tunnel.type, status: tunnel.status, remoteEndpoint: tunnel.remoteEndpoint, isActive: tunnel.isActive },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    const { psk: _psk, ...rest } = tunnel;
    return NextResponse.json({
      tunnel: {
        ...rest,
        hasPsk: Boolean(tunnel.psk),
        rxBytes: tunnel.rxBytes != null ? Number(tunnel.rxBytes) : null,
        txBytes: tunnel.txBytes != null ? Number(tunnel.txBytes) : null,
      },
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to update VPN tunnel" }, { status: 500 });
  }
}

// DELETE /api/vpn/tunnels/[id] — delete a VPN tunnel
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("network.device", "delete");
    const { id } = await params;

    const existing = await db.vpnTunnel.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "VPN tunnel not found" }, { status: 404 });

    await db.vpnTunnel.delete({ where: { id } });

    await auditDelete({
      userId: user.id, action: "delete", resource: "vpn_tunnel",
      resourceId: id, resourceName: existing.tunnelName,
      before: { tunnelName: existing.tunnelName, type: existing.type, remoteEndpoint: existing.remoteEndpoint, remoteSubnet: existing.remoteSubnet },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to delete VPN tunnel" }, { status: 500 });
  }
}
