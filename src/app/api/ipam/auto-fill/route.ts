import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── Helper: Parse CIDR to get network info ───────────────────────
function parseCidr(cidr: string): { networkInt: number; broadcastInt: number; prefix: number } | null {
  const match = cidr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d+)$/);
  if (!match) return null;

  const parts = match[1].split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;

  const prefix = parseInt(match[2], 10);
  if (prefix < 0 || prefix > 32) return null;
  // Skip /31 and /32 as they have no usable host range
  if (prefix >= 31) return null;

  const ipInt = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const networkInt = (ipInt & mask) >>> 0;
  const broadcastInt = (networkInt | (~mask >>> 0)) >>> 0;

  return { networkInt, broadcastInt, prefix };
}

// ─── Helper: 32-bit integer to IP string ──────────────────────────
function intToIp(n: number): string {
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ].join(".");
}

// ─── POST: Auto-fill all host IPs in a subnet ─────────────────────
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const body = await request.json();
    const { subnetId } = body;

    if (!subnetId) {
      return NextResponse.json({ error: "subnetId is required" }, { status: 400 });
    }

    // Fetch the subnet
    const subnet = await db.subnet.findUnique({
      where: { id: subnetId },
    });

    if (!subnet) {
      return NextResponse.json({ error: "Subnet not found" }, { status: 404 });
    }

    const cidr = subnet.cidr || subnet.network;
    if (!cidr) {
      return NextResponse.json({ error: "Subnet has no CIDR or network defined" }, { status: 400 });
    }

    const parsed = parseCidr(cidr);
    if (!parsed) {
      return NextResponse.json(
        { error: `Invalid CIDR format: ${cidr}. Expected format: x.x.x.x/y (prefix < 31)` },
        { status: 400 },
      );
    }

    // Calculate all host IPs (network+1 to broadcast-1)
    const totalHosts = parsed.broadcastInt - parsed.networkInt - 1;
    if (totalHosts <= 0) {
      return NextResponse.json({ error: "Subnet has no usable host addresses" }, { status: 400 });
    }

    // Safety limit: don't auto-fill huge subnets (> /24 = 254 hosts is a good limit)
    // Allow up to /22 (1022 hosts) for reasonable ISP subnets
    if (totalHosts > 1022) {
      return NextResponse.json(
        { error: `Subnet has ${totalHosts} hosts which exceeds the auto-fill limit of 1022. Use /22 or smaller subnets.` },
        { status: 400 },
      );
    }

    // Fetch all existing IPs for this subnet
    const existingIps = await db.ipAddress.findMany({
      where: { subnetId },
      select: { address: true },
    });

    const existingSet = new Set(existingIps.map((ip) => ip.address.trim()));

    // Generate all host IPs and find missing ones
    const missingIps: string[] = [];
    for (let i = 1; i <= totalHosts; i++) {
      const ipInt = (parsed.networkInt + i) >>> 0;
      const ipStr = intToIp(ipInt);

      if (!existingSet.has(ipStr)) {
        missingIps.push(ipStr);
      }
    }

    // Batch create missing IPs (SQLite can handle up to 100 variables per query,
    // so we create in batches of 50 to be safe)
    let created = 0;
    const BATCH_SIZE = 50;

    for (let i = 0; i < missingIps.length; i += BATCH_SIZE) {
      const batch = missingIps.slice(i, i + BATCH_SIZE);
      const result = await db.ipAddress.createMany({
        data: batch.map((address) => ({
          address,
          subnetId,
          status: "free",
        })),
      });
      created += result.count;
    }

    return NextResponse.json({
      success: true,
      totalHosts,
      existing: existingIps.length,
      missing: missingIps.length,
      created,
      subnetId,
      cidr,
    });
  } catch (error) {
    console.error("IPAM auto-fill error:", error);
    return NextResponse.json({ error: "Failed to auto-fill subnet IPs" }, { status: 500 });
  }
}
