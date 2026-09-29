import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

/**
 * GET /api/subnets
 *
 * Two modes:
 *  1. No query params (or missing available flag) → list all subnets with IP counts
 *  2. ?subnetId=XXX&available=true → list free IP addresses for that subnet
 *
 * All responses are authenticated via requireAuth.
 */

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
  }

  try {
    const { searchParams } = new URL(req.url);
    const subnetId = searchParams.get("subnetId");
    const available = searchParams.get("available");

    // ── Mode 2: return free IPs for a specific subnet ────────────────
    if (subnetId && available === "true") {
      const ips = await db.ipAddress.findMany({
        where: { subnetId, status: "free" },
        select: {
          id: true,
          address: true,
          hostname: true,
          macAddress: true,
        },
        orderBy: { address: "asc" },
      });

      return NextResponse.json({ items: ips, total: ips.length });
    }

    // ── Mode 1: return all subnets with IP counts ────────────────────
    const subnets = await db.subnet.findMany({
      select: {
        id: true,
        name: true,
        cidr: true,
        network: true,
        gateway: true,
        description: true,
        Vlan: { select: { name: true } },
        IpAddress: {
          select: { status: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const result = subnets.map((sn) => {
      const totalIps = sn.ipAddresses.length;
      const freeIps = sn.ipAddresses.filter(
        (ip) => ip.status === "free",
      ).length;
      const usedIps = sn.ipAddresses.filter(
        (ip) => ip.status === "used" || ip.status === "reserved",
      ).length;

      return {
        id: sn.id,
        name: sn.name,
        cidr: sn.cidr || sn.network || "",
        gateway: sn.gateway,
        description: sn.description,
        vlanName: sn.vlan?.name ?? null,
        totalIps,
        freeIps,
        usedIps,
      };
    });

    return NextResponse.json({ items: result, total: result.length });
  } catch (error) {
    console.error("[GET /api/subnets]", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch subnets" },
      { status: 500 },
    );
  }
}
