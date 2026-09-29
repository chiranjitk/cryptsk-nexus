import { db } from "@/lib/db";

// ─── GET /api/wifi-offload/:id?type=peer|session ────
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    switch (type) {
      case "peer": {
        const peer = await db.wifiOffloadPeer.findUnique({ where: { id } });
        if (!peer) {
          return Response.json({ error: "Peer not found" }, { status: 404 });
        }
        return Response.json({ peer });
      }

      case "session": {
        const session = await db.wifiOffloadSession.findUnique({ where: { id } });
        if (!session) {
          return Response.json({ error: "Session not found" }, { status: 404 });
        }
        return Response.json({ session });
      }

      default:
        return Response.json({ error: `Unknown type: ${type}. Use 'peer' or 'session'` }, { status: 400 });
    }
  } catch (error) {
    console.error("WiFi Offload GET by ID error:", error);
    return Response.json({ error: "Failed to fetch resource" }, { status: 500 });
  }
}

// ─── PUT /api/wifi-offload/:id?type=peer ────
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type !== "peer") {
      return Response.json({ error: `PUT only supported for type=peer, got: ${type}` }, { status: 400 });
    }

    const body = await request.json();
    const { peerName, peerType, host, port, realm, protocol, status, isSimulator, priority } = body;

    const existing = await db.wifiOffloadPeer.findUnique({ where: { id } });
    if (!existing) {
      return Response.json({ error: "Peer not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (peerName !== undefined) data.peerName = peerName;
    if (peerType !== undefined) data.peerType = peerType;
    if (host !== undefined) data.host = host;
    if (port !== undefined) data.port = port;
    if (realm !== undefined) data.realm = realm;
    if (protocol !== undefined) data.protocol = protocol;
    if (status !== undefined) data.status = status;
    if (isSimulator !== undefined) data.isSimulator = isSimulator;
    if (priority !== undefined) data.priority = priority;

    // If status is explicitly set to CONNECTED, mark isConnected
    if (status === "CONNECTED") {
      data.isConnected = true;
    } else if (status === "DISCONNECTED") {
      data.isConnected = false;
    }

    const peer = await db.wifiOffloadPeer.update({ where: { id }, data });
    return Response.json({ success: true, peer });
  } catch (error) {
    console.error("WiFi Offload PUT error:", error);
    return Response.json({ error: "Failed to update resource" }, { status: 500 });
  }
}

// ─── DELETE /api/wifi-offload/:id?type=peer|policy|session ────
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    switch (type) {
      case "peer": {
        const existing = await db.wifiOffloadPeer.findUnique({ where: { id } });
        if (!existing) {
          return Response.json({ error: "Peer not found" }, { status: 404 });
        }
        await db.wifiOffloadPeer.delete({ where: { id } });
        return Response.json({ success: true, message: "Peer deleted" });
      }

      case "policy": {
        const existing = await db.wifiOffloadPolicy.findUnique({ where: { id } });
        if (!existing) {
          return Response.json({ error: "Policy not found" }, { status: 404 });
        }
        await db.wifiOffloadPolicy.delete({ where: { id } });
        return Response.json({ success: true, message: "Policy deleted" });
      }

      case "session": {
        const existing = await db.wifiOffloadSession.findUnique({ where: { id } });
        if (!existing) {
          return Response.json({ error: "Session not found" }, { status: 404 });
        }
        // "Disconnect" session — update status rather than hard delete
        const session = await db.wifiOffloadSession.update({
          where: { id },
          data: {
            status: "DISCONNECTED",
            terminateCause: "Admin-Disconnect",
            lastUpdate: new Date(),
          },
        });
        return Response.json({ success: true, session, message: "Session disconnected" });
      }

      default:
        return Response.json({ error: `Unknown type: ${type}. Use 'peer', 'policy', or 'session'` }, { status: 400 });
    }
  } catch (error) {
    console.error("WiFi Offload DELETE error:", error);
    return Response.json({ error: "Failed to delete resource" }, { status: 500 });
  }
}
