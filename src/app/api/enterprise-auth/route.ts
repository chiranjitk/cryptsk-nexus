import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function GET() {
  try {
    const subscribers = await db.enterpriseSubscriber.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        LdapConfig: { select: { id: true, healthStatus: true, lastCheckedAt: true, serverHost: true } },
        Plan: { select: { id: true, name: true } },
        _count: { select: { EnterpriseSession: true, EnterpriseUser: true } },
      },
    });

    return NextResponse.json({ subscribers });
  } catch (error: unknown) {
    const msg = error instanceof Prisma.PrismaClientKnownRequestError ? error.message : "Failed to fetch enterprise subscribers";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      companyName,
      subscriberId,
      planId,
      location,
      contactEmail,
      contactPhone,
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

    if (!companyName || !subscriberId) {
      return NextResponse.json({ error: "companyName and subscriberId are required" }, { status: 400 });
    }

    // Check unique subscriberId
    const existing = await db.enterpriseSubscriber.findUnique({ where: { subscriberId } });
    if (existing) {
      return NextResponse.json({ error: "Subscriber ID already exists" }, { status: 409 });
    }

    const subscriber = await db.enterpriseSubscriber.create({
      data: {
        companyName,
        subscriberId,
        planId: planId || null,
        location: location || "",
        contactEmail: contactEmail || "",
        contactPhone: contactPhone || "",
        authMethod: authMethod || "local",
        bandwidthMode: bandwidthMode || "shared_pool",
        sharedPoolMbps: sharedPoolMbps || 100,
        perUserDownMbps: perUserDownMbps || 50,
        perUserUpMbps: perUserUpMbps || 20,
        dataQuotaGB: dataQuotaGB != null ? dataQuotaGB : null,
        overageAction: overageAction || "throttle",
        sessionTimeout: sessionTimeout || 28800,
        maxConcurrent: maxConcurrent || 1,
        macBinding: macBinding || false,
        notes: notes || "",
        ...(ldapConfig && authMethod === "ldap"
          ? {
              LdapConfig: {
                create: {
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
              },
            }
          : {}),
      },
      include: { LdapConfig: true, Plan: true },
    });

    return NextResponse.json({ subscriber }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Prisma.PrismaClientKnownRequestError ? error.message : "Failed to create enterprise subscriber";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
