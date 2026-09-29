import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { Prisma } from "@prisma/client";

// GET /api/captive-portal/subnet-mapping — Return DHCP + IPAM subnets with portal assignments
export async function GET(_request: NextRequest) {
  try {
    await requireAuth(_request);

    const [dhcpSubnets, ipamSubnets, portals] = await Promise.all([
      db.dhcpSubnet.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          Subnet: true,
          interfaceName: true,
          captivePortalId: true,
          enabled: true,
          captivePortal: { select: { id: true, name: true } },
        },
      }),
      db.subnet.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          cidr: true,
          areaId: true,
          captivePortalId: true,
          Area: { select: { name: true } },
          captivePortal: { select: { id: true, name: true } },
        },
      }),
      db.captivePortal.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          template: true,
          venueType: true,
          enabled: true,
        },
      }),
    ]);

    return NextResponse.json({
      dhcpSubnets: dhcpSubnets.map((ds) => ({
        id: ds.id,
        name: ds.name,
        subnet: ds.subnet,
        interfaceName: ds.interfaceName,
        captivePortalId: ds.captivePortalId,
        portalName: ds.captivePortal?.name || null,
        enabled: ds.enabled,
      })),
      ipamSubnets: ipamSubnets.map((s) => ({
        id: s.id,
        name: s.name,
        cidr: s.cidr,
        areaName: s.Area?.name || null,
        captivePortalId: s.captivePortalId,
        portalName: s.captivePortal?.name || null,
      })),
      portals: portals.map((p) => ({
        id: p.id,
        name: p.name,
        template: p.template,
        venueType: p.venueType,
        enabled: p.enabled,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal SubnetMapping] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch subnet mapping" }, { status: 500 });
  }
}

// POST /api/captive-portal/subnet-mapping — Update subnet mapping
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { subnetType, subnetId, portalId } = body;

    if (!subnetType || !subnetId) {
      return NextResponse.json(
        { error: "subnetType (dhcp|ipam) and subnetId are required" },
        { status: 400 }
      );
    }

    if (subnetType === "dhcp") {
      // Verify subnet exists
      const subnet = await db.dhcpSubnet.findUnique({ where: { id: subnetId } });
      if (!subnet) {
        return NextResponse.json({ error: "DHCP subnet not found" }, { status: 404 });
      }
      // Verify portal if provided
      if (portalId) {
        const portal = await db.captivePortal.findUnique({ where: { id: portalId } });
        if (!portal) {
          return NextResponse.json({ error: "Portal not found" }, { status: 404 });
        }
      }

      await db.dhcpSubnet.update({
        where: { id: subnetId },
        data: { captivePortalId: portalId || null },
      });
    } else if (subnetType === "ipam") {
      // Verify subnet exists
      const subnet = await db.subnet.findUnique({ where: { id: subnetId } });
      if (!subnet) {
        return NextResponse.json({ error: "IPAM subnet not found" }, { status: 404 });
      }
      // Verify portal if provided
      if (portalId) {
        const portal = await db.captivePortal.findUnique({ where: { id: portalId } });
        if (!portal) {
          return NextResponse.json({ error: "Portal not found" }, { status: 404 });
        }
      }

      await db.subnet.update({
        where: { id: subnetId },
        data: { captivePortalId: portalId || null },
      });
    } else {
      return NextResponse.json({ error: "subnetType must be 'dhcp' or 'ipam'" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal SubnetMapping] POST error:", error);
    return NextResponse.json({ error: "Failed to update subnet mapping" }, { status: 500 });
  }
}
