import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requirePermission, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(_request, "users.read");
    const { id } = await params;

    // Verify user exists
    const user = await db.user.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch active sessions for this user
    const sessions = await db.userSession.findMany({
      where: { userId: id, status: "active" },
      select: {
        id: true,
        ipAddress: true,
        device: true,
        browser: true,
        loginAt: true,
        status: true,
      },
      orderBy: { loginAt: "desc" },
    });

    return NextResponse.json({ userId: id, userName: user.name, sessions });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("User sessions fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch user sessions" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requirePermission(_request, "users.update");
    const { id } = await params;

    // Verify user exists
    const user = await db.user.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Terminate all active sessions for this user
    const result = await db.userSession.updateMany({
      where: { userId: id, status: "active" },
      data: {
        status: "terminated",
        logoutAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      terminated: result.count,
      message: `Terminated ${result.count} active session(s) for ${user.name}`,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("User sessions terminate error:", error);
    return NextResponse.json({ error: "Failed to terminate user sessions" }, { status: 500 });
  }
}
