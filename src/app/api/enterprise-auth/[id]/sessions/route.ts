import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const sessions = await db.enterpriseSession.findMany({
      where: { subscriberId: id },
      orderBy: { connectedAt: "desc" },
      take: 200,
    });

    // Calculate totals
    const activeSessions = sessions.filter((s) => s.status === "active");
    const totalDownload = sessions.reduce((sum, s) => sum + Number(s.downloadBytes), 0);
    const totalUpload = sessions.reduce((sum, s) => sum + Number(s.uploadBytes), 0);

    return NextResponse.json({
      sessions,
      stats: {
        total: sessions.length,
        active: activeSessions.length,
        totalDownload,
        totalUpload,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Prisma.PrismaClientKnownRequestError ? error.message : "Failed to fetch sessions";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { sessionIds } = body;

    if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
      return NextResponse.json({ error: "sessionIds array is required" }, { status: 400 });
    }

    const result = await db.enterpriseSession.updateMany({
      where: {
        subscriberId: id,
        id: { in: sessionIds },
        status: "active",
      },
      data: {
        status: "disconnected",
        disconnectedAt: new Date(),
        disconnectReason: "admin_disconnect",
      },
    });

    return NextResponse.json({
      success: true,
      disconnected: result.count,
    });
  } catch (error: unknown) {
    const msg = error instanceof Prisma.PrismaClientKnownRequestError ? error.message : "Failed to disconnect sessions";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = await db.enterpriseSession.updateMany({
      where: {
        subscriberId: id,
        status: "active",
      },
      data: {
        status: "disconnected",
        disconnectedAt: new Date(),
        disconnectReason: "admin_disconnect_all",
      },
    });

    return NextResponse.json({
      success: true,
      disconnected: result.count,
    });
  } catch (error: unknown) {
    const msg = error instanceof Prisma.PrismaClientKnownRequestError ? error.message : "Failed to disconnect all sessions";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
