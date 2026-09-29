import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/radius-sessions - Active RADIUS sessions
export async function GET(request: Request) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const sessions = await db.radiusSession.findMany({
      where: { stopTime: null },
      orderBy: { startTime: "desc" },
      include: {
        RadiusUser: {
          select: {
            id: true,
            Subscriber: {
              select: {
                id: true,
                name: true,
                code: true,
                phone: true,
                serviceUsername: true,
                Plan: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
    });

    // Map sessions to include serviceUsername from subscriber
    // Convert BigInt fields to Number for JSON serialization
    const mappedSessions = sessions.map((s: any) => ({
      ...s,
      inputOctets: Number(s.inputOctets || 0),
      outputOctets: Number(s.outputOctets || 0),
      ipv6InputOctets: Number(s.ipv6InputOctets || 0),
      ipv6OutputOctets: Number(s.ipv6OutputOctets || 0),
      sessionTimeout: Number(s.sessionTimeout || 0),
      idleTimeout: Number(s.idleTimeout || 0),
      username: s.RadiusUser.Subscriber.serviceUsername,
      subscriberName: s.RadiusUser.Subscriber.name,
      subscriberCode: s.RadiusUser.Subscriber.code,
      subscriberPhone: s.RadiusUser.Subscriber.phone,
      planName: s.RadiusUser.Subscriber.Plan?.name || "",
    }));

    const totalActive = mappedSessions.length;
    const totalInputBytes = mappedSessions.reduce(
      (sum, s) => sum + Number(s.inputOctets),
      0
    );
    const totalOutputBytes = mappedSessions.reduce(
      (sum, s) => sum + Number(s.outputOctets),
      0
    );

    return NextResponse.json(
      JSON.parse(
        JSON.stringify({
          sessions: mappedSessions,
          stats: {
            totalActive,
            totalInputBytes,
            totalOutputBytes,
            totalBytes: totalInputBytes + totalOutputBytes,
          },
        })
      )
    );
  } catch (error) {
    console.error("RADIUS sessions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch RADIUS sessions" },
      { status: 500 }
    );
  }
}

// POST /api/radius-sessions - Disconnect a RADIUS session (CoA/Disconnect-Message)
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const body = await request.json();
    const { action, sessionId } = body;

    if (action !== "disconnect" || !sessionId) {
      return NextResponse.json({ error: "Invalid action. Use { action: 'disconnect', sessionId: '...' }" }, { status: 400 });
    }

    // Find the active session
    const session = await db.radiusSession.findFirst({
      where: { sessionId, stopTime: null },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found or already terminated" }, { status: 404 });
    }

    // Terminate the session by setting stopTime and terminateCause
    await db.radiusSession.update({
      where: { id: session.id },
      data: {
        stopTime: new Date(),
        terminateCause: "Admin-Reset",
        lastUpdate: new Date(),
      },
    });

    return NextResponse.json({ success: true, message: "Session disconnected" });
  } catch (error) {
    console.error("RADIUS session disconnect error:", error);
    return NextResponse.json(
      { error: "Failed to disconnect session" },
      { status: 500 }
    );
  }
}
