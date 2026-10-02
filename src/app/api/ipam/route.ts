import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

const PAGE_SIZE = 20;

function calculateTotalIps(cidr: string): number {
  const match = cidr.match(/\/(\d+)/);
  if (!match) return 0;
  const prefix = parseInt(match[1], 10);
  if (prefix >= 32) return 1;
  const hostBits = 32 - prefix;
  return Math.max(0, Math.pow(2, hostBits) - 2);
}

// ─── GET: Fetch subnets, vlans, and IPs ────────────────────────────
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const subnetPage = parseInt(searchParams.get("subnetPage") || "1", 10);
    const ipPage = parseInt(searchParams.get("ipPage") || "1", 10);
    const vlanPage = parseInt(searchParams.get("vlanPage") || "1", 10);
    const subnetFilter = searchParams.get("subnetFilter") || "";

    // Subnets with pagination
    const subnetWhere: Record<string, unknown> = {};
    if (subnetFilter) {
      subnetWhere.OR = [
        { name: { contains: subnetFilter } },
        { network: { contains: subnetFilter } },
        { cidr: { contains: subnetFilter } },
        { description: { contains: subnetFilter } },
      ];
    }

    const [subnets, subnetTotal] = await Promise.all([
      db.subnet.findMany({
        where: subnetFilter ? subnetWhere : undefined,
        include: { Vlan: true, IpAddress: true, Area: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        skip: (subnetPage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      db.subnet.count({ where: subnetFilter ? subnetWhere : undefined }),
    ]);

    // IPs with pagination
    const ipWhere: Record<string, unknown> = {};
    if (search) {
      ipWhere.OR = [
        { address: { contains: search } },
        { hostname: { contains: search } },
        { macAddress: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [ips, ipTotal] = await Promise.all([
      db.ipAddress.findMany({
        where: search ? ipWhere : undefined,
        include: { Subnet: true },
        orderBy: { createdAt: "desc" },
        skip: (ipPage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      db.ipAddress.count({ where: search ? ipWhere : undefined }),
    ]);

    // VLANs with pagination
    const vlanWhere: Record<string, unknown> = {};
    if (search) {
      vlanWhere.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [vlans, vlanTotal] = await Promise.all([
      db.vlan.findMany({
        where: search ? vlanWhere : undefined,
        orderBy: { vlanId: "asc" },
        skip: (vlanPage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      db.vlan.count({ where: search ? vlanWhere : undefined }),
    ]);

    // Get port counts per VLAN
    const vlanIds = vlans.map((v) => v.id);
    const subnetCountsByVlan = vlanIds.length > 0
      ? await db.subnet.groupBy({
          by: ["vlanId"],
          where: { vlanId: { in: vlanIds } },
          _count: true,
        })
      : [];
    const vlanPortCountMap: Record<string, number> = {};
    subnetCountsByVlan.forEach((item) => {
      if (item.vlanId) vlanPortCountMap[item.vlanId] = item._count;
    });

    // Transform subnets
    const transformedSubnets = subnets.map((sn) => {
      const totalIps = calculateTotalIps(sn.cidr || sn.network);
      const usedIps = sn.IpAddress.filter((ip) => ip.status === "used" || ip.status === "reserved").length;
      return {
        id: sn.id, name: sn.name, network: sn.cidr || sn.network, gateway: sn.gateway,
        totalIps, usedIps, vlan: sn.Vlan ? String(sn.Vlan.vlanId) : "",
        description: sn.description, status: "Active",
        networkv6: sn.networkv6 || "", prefixv6: sn.prefixv6 || "",
        parentId: sn.parentId || "",
        areaId: sn.areaId || "",
        areaName: sn.Area?.name || "",
        tcEnabled: sn.tcEnabled || false,
        tcSubnetIndex: sn.tcSubnetIndex || 0,
        bandwidthPoolDownMbps: sn.bandwidthPoolDownMbps || 0,
        bandwidthBurstDownMbps: sn.bandwidthBurstDownMbps || 0,
        bandwidthPoolUpMbps: sn.bandwidthPoolUpMbps || 0,
        bandwidthBurstUpMbps: sn.bandwidthBurstUpMbps || 0,
        defaultUserDownMbps: sn.defaultUserDownMbps || 0,
        defaultUserUpMbps: sn.defaultUserUpMbps || 0,
        allocationStrategy: sn.allocationStrategy || "STATIC",
        frPoolName: sn.frPoolName || "",
        ipRangeStart: sn.ipRangeStart || "",
        ipRangeEnd: sn.ipRangeEnd || "",
      };
    });

    // Transform IPs
    const transformedIps = ips.map((ip) => ({
      id: ip.id, ip: ip.address, subnet: ip.Subnet?.cidr || ip.Subnet?.network || "",
      subnetId: ip.subnetId,
      assignedTo: ip.description || "", mac: ip.macAddress || "", hostname: ip.hostname || "",
      status: ip.status === "used" ? "Used" : ip.status === "reserved" ? "Reserved" : "Free",
      since: ip.updatedAt ? ip.updatedAt.toISOString().split("T")[0] : "",
      customFields: ip.customFields || "{}",
    }));

    // Transform VLANs
    const transformedVlans = vlans.map((v) => ({
      id: v.id, vlanId: String(v.vlanId), name: v.name,
      subnet: v.subnet || "", description: v.description || "",
      portCount: vlanPortCountMap[v.id] || 0, status: "Active", // Vlan model has no status field; all VLANs considered active
    }));

    const totalSubnetIps = transformedSubnets.reduce((s, sn) => s + sn.totalIps, 0);
    const totalUsedIps = transformedSubnets.reduce((s, sn) => s + sn.usedIps, 0);

    return NextResponse.json({
      subnets: transformedSubnets, subnetTotal, subnetPage, subnetTotalPages: Math.ceil(subnetTotal / PAGE_SIZE),
      vlans: transformedVlans, vlanTotal, vlanPage, vlanTotalPages: Math.ceil(vlanTotal / PAGE_SIZE),
      ips: transformedIps, ipTotal, ipPage, ipTotalPages: Math.ceil(ipTotal / PAGE_SIZE),
      stats: { totalSubnets: subnetTotal, totalIps: totalSubnetIps, usedIps: totalUsedIps, freeIps: totalSubnetIps - totalUsedIps },
    });
  } catch (error) {
    console.error("IPAM GET error:", error);
    return NextResponse.json({ error: "Failed to fetch IPAM data" }, { status: 500 });
  }
}

// ─── POST: Create/update/delete subnets, vlans, allocate IPs ───────
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
      case "create-subnet": {
        const { name, network, gateway, dns, vlanId, description, networkv6, prefixv6, parentId, areaId, allocationStrategy, frPoolName, ipRangeStart, ipRangeEnd, tcEnabled, bandwidthPoolDownMbps, bandwidthBurstDownMbps, bandwidthPoolUpMbps, bandwidthBurstUpMbps, defaultUserDownMbps, defaultUserUpMbps } = body;
        if (!name || !network) return NextResponse.json({ error: "Name and network are required" }, { status: 400 });
        const subnet = await db.subnet.create({
          data: {
            name, network, cidr: network, gateway: gateway || "", dns: dns || "", vlanId: vlanId || null,
            description: description || "", networkv6: networkv6 || "", prefixv6: prefixv6 || "", parentId: parentId || null,
            areaId: areaId || null,
            allocationStrategy: allocationStrategy || "STATIC",
            frPoolName: frPoolName || "",
            ipRangeStart: ipRangeStart || "",
            ipRangeEnd: ipRangeEnd || "",
            tcEnabled: !!tcEnabled,
            bandwidthPoolDownMbps: Number(bandwidthPoolDownMbps) || 0,
            bandwidthBurstDownMbps: Number(bandwidthBurstDownMbps) || 0,
            bandwidthPoolUpMbps: Number(bandwidthPoolUpMbps) || 0,
            bandwidthBurstUpMbps: Number(bandwidthBurstUpMbps) || 0,
            defaultUserDownMbps: Number(defaultUserDownMbps) || 0,
            defaultUserUpMbps: Number(defaultUserUpMbps) || 0,
          },
        });
        return NextResponse.json({ success: true, data: subnet });
      }

      case "update-subnet": {
        const { id, name, network, gateway, vlanId, description, networkv6, prefixv6, parentId, areaId, allocationStrategy, frPoolName, ipRangeStart, ipRangeEnd, tcEnabled, bandwidthPoolDownMbps, bandwidthBurstDownMbps, bandwidthPoolUpMbps, bandwidthBurstUpMbps, defaultUserDownMbps, defaultUserUpMbps } = body;
        if (!id) return NextResponse.json({ error: "Subnet ID is required" }, { status: 400 });
        const updated = await db.subnet.update({
          where: { id },
          data: {
            ...(name ? { name } : {}),
            ...(network ? { network, cidr: network } : {}),
            ...(gateway !== undefined ? { gateway } : {}),
            ...(vlanId != null ? { vlanId: String(vlanId) } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(networkv6 !== undefined ? { networkv6 } : {}),
            ...(prefixv6 !== undefined ? { prefixv6 } : {}),
            ...(parentId !== undefined ? { parentId: parentId || null } : {}),
            ...(areaId !== undefined ? { areaId: areaId || null } : {}),
            ...(allocationStrategy ? { allocationStrategy } : {}),
            ...(frPoolName !== undefined ? { frPoolName } : {}),
            ...(ipRangeStart !== undefined ? { ipRangeStart } : {}),
            ...(ipRangeEnd !== undefined ? { ipRangeEnd } : {}),
            ...(tcEnabled !== undefined ? { tcEnabled: !!tcEnabled } : {}),
            ...(bandwidthPoolDownMbps !== undefined ? { bandwidthPoolDownMbps: Number(bandwidthPoolDownMbps) || 0 } : {}),
            ...(bandwidthBurstDownMbps !== undefined ? { bandwidthBurstDownMbps: Number(bandwidthBurstDownMbps) || 0 } : {}),
            ...(bandwidthPoolUpMbps !== undefined ? { bandwidthPoolUpMbps: Number(bandwidthPoolUpMbps) || 0 } : {}),
            ...(bandwidthBurstUpMbps !== undefined ? { bandwidthBurstUpMbps: Number(bandwidthBurstUpMbps) || 0 } : {}),
            ...(defaultUserDownMbps !== undefined ? { defaultUserDownMbps: Number(defaultUserDownMbps) || 0 } : {}),
            ...(defaultUserUpMbps !== undefined ? { defaultUserUpMbps: Number(defaultUserUpMbps) || 0 } : {}),
          },
        });
        return NextResponse.json({ success: true, data: updated });
      }

      case "delete-subnet": {
        const { id } = body;
        if (!id) return NextResponse.json({ error: "Subnet ID is required" }, { status: 400 });
        await db.subnet.delete({ where: { id } });
        return NextResponse.json({ success: true, message: "Subnet deleted" });
      }

      case "create-vlan": {
        const { vlanId, name, description, subnet } = body;
        if (!vlanId || !name) return NextResponse.json({ error: "VLAN ID and name are required" }, { status: 400 });
        const vlan = await db.vlan.create({
          data: { vlanId: parseInt(String(vlanId), 10), name, description: description || "", subnet: subnet || "" },
        });
        return NextResponse.json({ success: true, data: vlan });
      }

      case "update-vlan": {
        const { id, vlanId, name, description, subnet } = body;
        if (!id) return NextResponse.json({ error: "VLAN ID is required" }, { status: 400 });
        const updated = await db.vlan.update({
          where: { id },
          data: {
            ...(vlanId ? { vlanId: parseInt(String(vlanId), 10) } : {}),
            ...(name ? { name } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(subnet !== undefined ? { subnet } : {}),
          },
        });
        return NextResponse.json({ success: true, data: updated });
      }

      case "delete-vlan": {
        const { id } = body;
        if (!id) return NextResponse.json({ error: "VLAN ID is required" }, { status: 400 });
        await db.vlan.delete({ where: { id } });
        return NextResponse.json({ success: true, message: "VLAN deleted" });
      }

      case "allocate-ip": {
        const { address, subnetId, status, hostname, macAddress, description } = body;
        if (!address || !subnetId) return NextResponse.json({ error: "IP address and subnet ID are required" }, { status: 400 });
        const ip = await db.ipAddress.create({
          data: { address, subnetId, status: status || "free", hostname: hostname || "", macAddress: macAddress || "", description: description || "" },
        });
        return NextResponse.json({ success: true, data: ip });
      }

      case "update-ip": {
        const { id, address, status, hostname, macAddress, description, assignedTo, assignedType, customFields } = body;
        if (!id) return NextResponse.json({ error: "IP ID is required" }, { status: 400 });

        const existing = await db.ipAddress.findUnique({ where: { id } });
        if (!existing) return NextResponse.json({ error: "IP not found" }, { status: 400 });

        const updated = await db.ipAddress.update({
          where: { id },
          data: {
            ...(address ? { address } : {}),
            ...(status ? { status } : {}),
            ...(hostname !== undefined ? { hostname } : {}),
            ...(macAddress !== undefined ? { macAddress } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(customFields !== undefined ? { customFields: typeof customFields === "string" ? customFields : JSON.stringify(customFields) } : {}),
          },
        });

        // Log assignment/release history
        if (status && status !== existing.status) {
          if (status === "used" || status === "reserved") {
            await db.ipAssignmentHistory.create({
              data: {
                ipAddressId: id,
                assignedTo: assignedTo || "",
                assignedType: assignedType || "",
                assignedById: "",
                assignedAt: new Date(),
              },
            }).catch(() => {});
          } else if (existing.status === "used" || existing.status === "reserved") {
            // Release: update last active assignment
            const lastAssignment = await db.ipAssignmentHistory.findFirst({
              where: { ipAddressId: id, releasedAt: null },
              orderBy: { assignedAt: "desc" },
            });
            if (lastAssignment) {
              await db.ipAssignmentHistory.update({
                where: { id: lastAssignment.id },
                data: { releasedAt: new Date() },
              }).catch(() => {});
            }
          }
        }

        return NextResponse.json({ success: true, data: updated });
      }

      case "delete-ip": {
        const { id } = body;
        if (!id) return NextResponse.json({ error: "IP ID is required" }, { status: 400 });
        await db.ipAddress.delete({ where: { id } });
        return NextResponse.json({ success: true, message: "IP allocation removed" });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("IPAM POST error:", error);
    return NextResponse.json({ error: "Failed to process IPAM request" }, { status: 500 });
  }
}
