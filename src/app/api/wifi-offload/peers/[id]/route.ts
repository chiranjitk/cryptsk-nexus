import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// PUT /api/wifi-offload/peers/:id
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const peer = await db.wifiOffloadPeer.update({
      where: { id },
      data: {
        ...(body.peerName !== undefined && { peerName: body.peerName }),
        ...(body.name !== undefined && { peerName: body.name }),
        ...(body.peerType !== undefined && { peerType: body.peerType }),
        ...(body.host !== undefined && { host: body.host }),
        ...(body.port !== undefined && { port: body.port }),
        ...(body.realm !== undefined && { realm: body.realm }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.isConnected !== undefined && { isConnected: body.isConnected }),
        ...(body.priority !== undefined && { priority: body.priority }),
        ...(body.lastError !== undefined && { lastError: body.lastError }),
        ...(body.messagesIn !== undefined && { messagesIn: body.messagesIn }),
        ...(body.messagesOut !== undefined && { messagesOut: body.messagesOut }),
      },
    });
    return NextResponse.json(peer);
  } catch (error) {
    console.error('[wifi-offload/peers/:id] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update peer' }, { status: 500 });
  }
}

// DELETE /api/wifi-offload/peers/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.wifiOffloadPeer.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[wifi-offload/peers/:id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete peer' }, { status: 500 });
  }
}

// POST /api/wifi-offload/peers/:id/ping
export async function POST_ping(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const latency = Math.floor(Math.random() * 20) + 5; // 5-25ms simulated
    const peer = await db.wifiOffloadPeer.update({
      where: { id },
      data: { lastPingAt: new Date() },
    });
    return NextResponse.json({ ...peer, latency });
  } catch (error) {
    console.error('[wifi-offload/peers/:id/ping] POST error:', error);
    return NextResponse.json({ error: 'Ping failed' }, { status: 500 });
  }
}
