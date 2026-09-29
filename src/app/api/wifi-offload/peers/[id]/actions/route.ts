import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/wifi-offload/peers/:id/connect or disconnect
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const action = url.pathname.split('/').pop(); // 'connect' or 'disconnect'

    const statusMap: Record<string, string> = {
      connect: 'CONNECTED',
      disconnect: 'DISCONNECTED',
    };

    const isConnectedMap: Record<string, boolean> = {
      connect: true,
      disconnect: false,
    };

    if (!statusMap[action]) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const peer = await db.wifiOffloadPeer.update({
      where: { id },
      data: {
        status: statusMap[action],
        isConnected: isConnectedMap[action],
      },
    });
    return NextResponse.json(peer);
  } catch (error) {
    console.error('[wifi-offload/peers/:id/actions] POST error:', error);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
