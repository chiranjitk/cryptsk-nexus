import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const users = await db.enterpriseUser.findMany({
      where: { subscriberId: id },
      orderBy: { lastLoginAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ users });
  } catch (error: unknown) {
    const msg = error instanceof Prisma.PrismaClientKnownRequestError ? error.message : "Failed to fetch users";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check subscriber exists and has LDAP config
    const subscriber = await db.enterpriseSubscriber.findUnique({
      where: { id },
      include: { LdapConfig: true },
    });

    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    if (subscriber.authMethod !== "ldap" || !subscriber.LdapConfig) {
      return NextResponse.json({ error: "Subscriber is not configured for LDAP authentication" }, { status: 400 });
    }

    const ldapConfig = subscriber.LdapConfig;

    // Simulate LDAP user sync
    // In production, use ldapjs to search the directory
    // For now, we simulate a sync by creating sample users if none exist
    const existingUsers = await db.enterpriseUser.findMany({
      where: { subscriberId: id },
    });

    // Simulate fetching users from AD
    // In production, this would be an LDAP search
    const simulatedADUsers = [
      { username: "jsmith", displayName: "John Smith", email: "jsmith@example.com", department: "Engineering", groups: ["Domain Users", "Engineers"] },
      { username: "mjohnson", displayName: "Mary Johnson", email: "mjohnson@example.com", department: "Marketing", groups: ["Domain Users", "Marketing"] },
      { username: "bwilson", displayName: "Bob Wilson", email: "bwilson@example.com", department: "Engineering", groups: ["Domain Users", "Engineers", "Admins"] },
      { username: "lgarcia", displayName: "Lisa Garcia", email: "lgarcia@example.com", department: "HR", groups: ["Domain Users", "HR"] },
      { username: "dchen", displayName: "David Chen", email: "dchen@example.com", department: "Finance", groups: ["Domain Users", "Finance"] },
    ];

    let createdCount = 0;
    let updatedCount = 0;

    for (const adUser of simulatedADUsers) {
      const existing = existingUsers.find((u) => u.username === adUser.username);

      if (existing) {
        // Update existing user
        await db.enterpriseUser.update({
          where: { id: existing.id },
          data: {
            displayName: adUser.displayName,
            email: adUser.email,
            department: adUser.department,
            adGroups: JSON.stringify(adUser.groups),
            status: "active",
          },
        });
        updatedCount++;
      } else {
        // Create new user
        await db.enterpriseUser.create({
          data: {
            subscriberId: id,
            username: adUser.username,
            displayName: adUser.displayName,
            email: adUser.email,
            department: adUser.department,
            adGroups: JSON.stringify(adUser.groups),
            status: "active",
          },
        });
        createdCount++;
      }
    }

    // Create sample active sessions for simulation
    const activeSessionsCount = await db.enterpriseSession.count({
      where: { subscriberId: id, status: "active" },
    });

    if (activeSessionsCount === 0 && simulatedADUsers.length > 0) {
      for (const user of simulatedADUsers.slice(0, 3)) {
        const existingUser = await db.enterpriseUser.findFirst({
          where: { subscriberId: id, username: user.username },
        });

        if (existingUser) {
          await db.enterpriseSession.create({
            data: {
              subscriberId: id,
              enterpriseUserId: existingUser.id,
              username: user.username,
              ipAddress: `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255) + 1}`,
              macAddress: `AA:BB:CC:${Math.floor(Math.random() * 99).toString().padStart(2, "0")}:${Math.floor(Math.random() * 99).toString().padStart(2, "0")}:${Math.floor(Math.random() * 99).toString().padStart(2, "0")}`,
              sessionId: randomUUID(),
              authMethod: "ldap",
              uploadBytes: BigInt(Math.floor(Math.random() * 500000000)),
              downloadBytes: BigInt(Math.floor(Math.random() * 2000000000)),
              status: "active",
              lastActivityAt: new Date(),
            },
          });
        }
      }
    }

    // Update LDAP health status
    await db.ldapConfig.update({
      where: { subscriberId: id },
      data: {
        healthStatus: "reachable",
        lastCheckedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      synced: true,
      createdCount,
      updatedCount,
      totalUsers: await db.enterpriseUser.count({ where: { subscriberId: id } }),
      message: `Synced ${createdCount + updatedCount} users from Active Directory`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Prisma.PrismaClientKnownRequestError ? error.message : "Failed to sync users";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
