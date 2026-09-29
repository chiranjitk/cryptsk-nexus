import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/wifi-offload/peers
export async function GET() {
  try {
    const peers = await db.wifiOffloadPeer.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(peers);
  } catch (error) {
    console.error('[wifi-offload/peers] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch peers' }, { status: 500 });
  }
}

// POST /api/wifi-offload/peers
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const peer = await db.wifiOffloadPeer.create({
      data: {
        peerName: body.peerName || body.name || 'Unnamed Peer',
        peerType: body.peerType || 'PCRF',
        host: body.host || '127.0.0.1',
        port: body.port || 3868,
        realm: body.realm || '',
        protocol: body.protocol || 'diameter',
        status: body.status || 'DISCONNECTED',
        isConnected: body.isConnected || false,
        isSimulator: body.isSimulator ?? true,
        priority: body.priority || 1,
      },
    });
    return NextResponse.json(peer, { status: 201 });
  } catch (error) {
    console.error('[wifi-offload/peers] POST error:', error);
    return NextResponse.json({ error: 'Failed to create peer' }, { status: 500 });
  }
}
