import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const subscriber = await db.enterpriseSubscriber.findUnique({
      where: { id },
      include: {
        LdapConfig: true,
        Plan: { select: { id: true, name: true, downloadSpeed: true, uploadSpeed: true } },
        EnterpriseUser: {
          orderBy: { lastLoginAt: "desc" },
          take: 50,
        },
        EnterpriseSession: {
          where: { status: "active" },
          orderBy: { connectedAt: "desc" },
          take: 100,
        },
      },
    });

    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    // Aggregate session counts
    const activeSessions = await db.enterpriseSession.count({
      where: { subscriberId: id, status: "active" },
    });
    const totalSessions = await db.enterpriseSession.count({
      where: { subscriberId: id },
    });
    const totalUsers = await db.enterpriseUser.count({
      where: { subscriberId: id },
    });

    return NextResponse.json({
      subscriber,
      stats: { activeSessions, totalSessions, totalUsers },
    });
  } catch (error: unknown) {
    const msg = error instanceof Prisma.PrismaClientKnownRequestError ? error.message : "Failed to fetch subscriber";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await db.enterpriseSubscriber.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    const {
      companyName,
      planId,
      location,
      contactEmail,
      contactPhone,
      status,
      authMethod,
      bandwidthMode,
      sharedPoolMbps,
      perUserDownMbps,
      perUserUpMbps,
      dataQuotaGB,
      overageAction,
      sessionTimeout,
      maxConcurrent,
      macBinding,
      notes,
      ldapConfig,
    } = body;

    const subscriber = await db.enterpriseSubscriber.update({
      where: { id },
      data: {
        ...(companyName !== undefined ? { companyName } : {}),
        ...(planId !== undefined ? { planId: planId || null } : {}),
        ...(location !== undefined ? { location } : {}),
        ...(contactEmail !== undefined ? { contactEmail } : {}),
        ...(contactPhone !== undefined ? { contactPhone } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(authMethod !== undefined ? { authMethod } : {}),
        ...(bandwidthMode !== undefined ? { bandwidthMode } : {}),
        ...(sharedPoolMbps !== undefined ? { sharedPoolMbps } : {}),
        ...(perUserDownMbps !== undefined ? { perUserDownMbps } : {}),
        ...(perUserUpMbps !== undefined ? { perUserUpMbps } : {}),
        ...(dataQuotaGB !== undefined ? { dataQuotaGB: dataQuotaGB != null ? dataQuotaGB : null } : {}),
        ...(overageAction !== undefined ? { overageAction } : {}),
        ...(sessionTimeout !== undefined ? { sessionTimeout } : {}),
        ...(maxConcurrent !== undefined ? { maxConcurrent } : {}),
        ...(macBinding !== undefined ? { macBinding } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
      include: { LdapConfig: true, Plan: true },
    });

    // Handle LDAP config update
    if (ldapConfig && authMethod === "ldap") {
      if (existing.ldapConfigId) {
        await db.ldapConfig.update({
          where: { subscriberId: id },
          data: {
            serverHost: ldapConfig.serverHost,
            serverPort: ldapConfig.serverPort || 636,
            useTls: ldapConfig.useTls !== false,
            baseDn: ldapConfig.baseDn || "",
            bindDn: ldapConfig.bindDn || "",
            ...(ldapConfig.bindPassword ? { bindPassword: ldapConfig.bindPassword } : {}),
            userFilter: ldapConfig.userFilter || "(sAMAccountName=%s)",
            groupRestriction: ldapConfig.groupRestriction || null,
            tlsCert: ldapConfig.tlsCert || null,
            connectionTimeout: ldapConfig.connectionTimeout || 5,
          },
        });
      } else {
        await db.ldapConfig.create({
          data: {
            subscriberId: id,
            serverHost: ldapConfig.serverHost,
            serverPort: ldapConfig.serverPort || 636,
            useTls: ldapConfig.useTls !== false,
            baseDn: ldapConfig.baseDn || "",
            bindDn: ldapConfig.bindDn || "",
            bindPassword: ldapConfig.bindPassword || "",
            userFilter: ldapConfig.userFilter || "(sAMAccountName=%s)",
            groupRestriction: ldapConfig.groupRestriction || null,
            tlsCert: ldapConfig.tlsCert || null,
            connectionTimeout: ldapConfig.connectionTimeout || 5,
          },
        });
      }
    }

    return NextResponse.json({ subscriber });
  } catch (error: unknown) {
    const msg = error instanceof Prisma.PrismaClientKnownRequestError ? error.message : "Failed to update subscriber";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await db.enterpriseSubscriber.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    await db.enterpriseSubscriber.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Prisma.PrismaClientKnownRequestError ? error.message : "Failed to delete subscriber";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
