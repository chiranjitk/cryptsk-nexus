import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── POST: Sync DHCP reservations into IPAM IpAddress records ─────
export async function POST(request: NextRequest) {
  try {
    try {
      try {
        await requireAuth(request as unknown as import("next/server").NextRequest);
      } catch (e) {
        if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
        throw e;
      }
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    let synced = 0;
    let created = 0;
    let updated = 0;
    let errors = 0;

    // Fetch all DHCP reservations that have MAC + IP
    const reservations = await db.dhcpReservation.findMany({
      where: {
        enabled: true,
        macAddress: { not: "" },
        ipAddress: { not: "" },
      },
    });

    for (const reservation of reservations) {
      try {
        const ip = reservation.ipAddress.trim();
        const mac = reservation.macAddress.trim();

        if (!ip || !mac) continue;

        // Check if an IpAddress record already exists for this IP in any subnet
        const existing = await db.ipAddress.findFirst({
          where: { address: ip },
        });

        if (existing) {
          // Update existing record if needed
          const updates: Record<string, unknown> = {};

          // Link subscriber if DHCP reservation has one and IP doesn't
          if (reservation.subscriberId && !existing.subscriberId) {
            updates.subscriberId = reservation.subscriberId;
          }

          // Update MAC if missing on existing
          if (!existing.macAddress && mac) {
            updates.macAddress = mac;
          }

          // Update hostname if missing
          if (!existing.hostname && reservation.hostname) {
            updates.hostname = reservation.hostname;
          }

          // Set status to "used" if it's "free"
          if (existing.status === "free") {
            updates.status = "used";
          }

          // Update description if empty
          if (!existing.description && reservation.description) {
            updates.description = reservation.description;
          }

          if (Object.keys(updates).length > 0) {
            await db.ipAddress.update({
              where: { id: existing.id },
              data: updates,
            });
            updated++;
          } else {
            synced++;
          }
        } else {
          // No existing IpAddress — find the right subnet
          // Try to find subnet by matching DHCP subnet's CIDR
          let subnetId = "";

          // Check if the DHCP subnet relates to an IPAM subnet
          if (reservation.dhcpSubnetId) {
            const dhcpSubnet = await db.dhcpSubnet.findUnique({
              where: { id: reservation.dhcpSubnetId },
              select: { ipamSubnetId: true, Subnet: true, gateway: true, netmask: true },
            });

            if (dhcpSubnet?.ipamSubnetId) {
              subnetId = dhcpSubnet.ipamSubnetId;
            } else {
              // Try to find an IPAM subnet with matching CIDR
              // Convert DHCP subnet address + netmask to CIDR
              if (dhcpSubnet?.subnet && dhcpSubnet?.netmask) {
                const cidr = netmaskToCidr(dhcpSubnet.netmask);
                if (cidr) {
                  const candidate = await db.subnet.findFirst({
                    where: { cidr: `${dhcpSubnet.subnet}/${cidr}` },
                  });
                  if (candidate) subnetId = candidate.id;
                }
              }
            }
          }

          // Fallback: find any subnet that contains this IP
          if (!subnetId) {
            subnetId = await findSubnetForIp(ip);
          }

          if (subnetId) {
            await db.ipAddress.create({
              data: {
                address: ip,
                subnetId,
                status: "used",
                hostname: reservation.hostname || "",
                macAddress: mac,
                description: reservation.description || `DHCP reservation: ${reservation.clientType}`,
                subscriberId: reservation.subscriberId || null,
              },
            });
            created++;
          } else {
            // No matching subnet found — skip (count as synced but not created)
            synced++;
          }
        }
      } catch (err) {
        console.error(`DHCP sync error for reservation ${reservation.id}:`, err);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      synced: synced + updated,
      created,
      updated,
      errors,
      total: reservations.length,
    });
  } catch (error) {
    console.error("IPAM dhcp-sync error:", error);
    return NextResponse.json({ error: "Failed to sync DHCP reservations" }, { status: 500 });
  }
}

// ─── Helper: Convert netmask (e.g., "255.255.255.0") to CIDR prefix ──
function netmaskToCidr(netmask: string): number | null {
  const parts = netmask.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;

  let cidr = 0;
  for (const part of parts) {
    const binary = part.toString(2).padStart(8, "0");
    for (const bit of binary) {
      if (bit === "1") cidr++;
      else break;
    }
  }
  return cidr;
}

// ─── Helper: Find the subnet that contains a given IP ─────────────
async function findSubnetForIp(ip: string): Promise<string> {
  const ipParts = ip.split(".").map(Number);
  if (ipParts.length !== 4 || ipParts.some((p) => isNaN(p))) return "";
  const ipInt = ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0;

  const subnets = await db.subnet.findMany({
    where: { cidr: { not: "" } },
    select: { id: true, cidr: true },
  });

  for (const subnet of subnets) {
    const match = subnet.cidr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d+)$/);
    if (!match) continue;

    const netParts = match[1].split(".").map(Number);
    const prefix = parseInt(match[2], 10);
    if (prefix > 32) continue;

    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    const netInt = ((netParts[0] << 24) | (netParts[1] << 16) | (netParts[2] << 8) | netParts[3]) >>> 0;
    const networkInt = (netInt & mask) >>> 0;
    const broadcastInt = (networkInt | (~mask >>> 0)) >>> 0;

    if (ipInt >= networkInt && ipInt <= broadcastInt) {
      return subnet.id;
    }
  }

  return "";
}
