import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── IP address to 32-bit integer ─────────────────────────────────
function ipToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return -1;
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

// ─── 32-bit integer to IP address string ──────────────────────────
function intToIp(n: number): string {
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ].join(".");
}

// ─── Parse CIDR into { networkInt, broadcastInt, prefix } ─────────
function parseCidr(cidr: string): { networkInt: number; broadcastInt: number; prefix: number } | null {
  const match = cidr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d+)$/);
  if (!match) return null;

  const ip = ipToInt(match[1]);
  if (ip === -1) return null;

  const prefix = parseInt(match[2], 10);
  if (prefix < 0 || prefix > 32) return null;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const networkInt = (ip & mask) >>> 0;
  const broadcastInt = (networkInt | (~mask >>> 0)) >>> 0;

  return { networkInt, broadcastInt, prefix };
}

// ─── Check if two ranges overlap ──────────────────────────────────
function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

// ─── POST: Check for CIDR overlap and duplicate IP ────────────────
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const body = await request.json();
    const conflicts: Array<
      | { type: "cidr_overlap"; existing: Record<string, unknown> }
      | { type: "duplicate_ip"; existing: Record<string, unknown> }
    > = [];

    // ─── Case 1: CIDR overlap check ──────────────────────────────
    if (body.cidr) {
      const parsed = parseCidr(body.cidr);
      if (!parsed) {
        return NextResponse.json({ error: "Invalid CIDR format. Expected e.g. 10.0.0.0/24" }, { status: 400 });
      }

      const existingSubnets = await db.subnet.findMany({
        where: { cidr: { not: "" } },
        select: { id: true, name: true, cidr: true, network: true, description: true },
      });

      for (const subnet of existingSubnets) {
        const subnetCidr = subnet.cidr || subnet.network;
        const subnetParsed = parseCidr(subnetCidr);
        if (!subnetParsed) continue;

        // Skip self (if the subnet being checked already exists)
        if (subnet.cidr === body.cidr) continue;

        if (rangesOverlap(parsed.networkInt, parsed.broadcastInt, subnetParsed.networkInt, subnetParsed.broadcastInt)) {
          conflicts.push({
            type: "cidr_overlap",
            existing: {
              id: subnet.id,
              name: subnet.name,
              cidr: subnetCidr,
              description: subnet.description,
            },
          });
        }
      }
    }

    // ─── Case 2: Duplicate IP address check ──────────────────────
    if (body.address) {
      const ipToCheck = body.address.trim();

      // Validate it's an IP address
      const ipInt = ipToInt(ipToCheck);
      if (ipInt === -1) {
        return NextResponse.json({ error: "Invalid IP address format" }, { status: 400 });
      }

      // Search across all subnets for the IP
      const existingIps = await db.ipAddress.findMany({
        where: { address: ipToCheck },
        include: { Subnet: { select: { id: true, name: true, cidr: true } } },
      });

      for (const ip of existingIps) {
        // If a subnetId was provided and it matches, skip (it's expected)
        if (body.subnetId && ip.subnetId === body.subnetId) continue;

        conflicts.push({
          type: "duplicate_ip",
          existing: {
            id: ip.id,
            address: ip.address,
            status: ip.status,
            hostname: ip.hostname,
            macAddress: ip.macAddress,
            description: ip.description,
            subnetId: ip.subnetId,
            subnetName: ip.Subnet?.name || "",
            subnetCidr: ip.Subnet?.cidr || "",
          },
        });
      }

      // Also check if the IP falls within any existing subnet CIDR range
      if (!body.cidr) {
        const existingSubnets = await db.subnet.findMany({
          where: { cidr: { not: "" } },
          select: { id: true, name: true, cidr: true, description: true },
        });

        // Check if the IP belongs to any subnet
        const belongingSubnets: string[] = [];
        for (const subnet of existingSubnets) {
          const subnetCidr = subnet.cidr || "";
          const subnetParsed = parseCidr(subnetCidr);
          if (!subnetParsed) continue;

          if (ipInt >= subnetParsed.networkInt && ipInt <= subnetParsed.broadcastInt) {
            belongingSubnets.push(subnet.name || subnetCidr);
          }
        }

        // If IP doesn't belong to any known subnet, add info
        if (belongingSubnets.length === 0 && conflicts.length === 0) {
          // Not a conflict per se, but useful info — we don't flag it as conflict
        }
      }
    }

    return NextResponse.json({ conflicts });
  } catch (error) {
    console.error("IPAM conflict-check error:", error);
    return NextResponse.json({ error: "Failed to perform conflict check" }, { status: 500 });
  }
}
