import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/wifi-offload/events
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const interfaceType = url.searchParams.get('interface');
    const sessionId = url.searchParams.get('sessionId');
    const eventType = url.searchParams.get('eventType');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const where: Record<string, unknown> = {};
    if (interfaceType) where.interfaceType = interfaceType;
    if (sessionId) where.sessionId = sessionId;
    if (eventType) where.eventType = eventType;

    const [events, total] = await Promise.all([
      db.wifiOffloadEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.wifiOffloadEvent.count({ where }),
    ]);

    return NextResponse.json({ events, total });
  } catch (error) {
    console.error('[wifi-offload/events] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}

// POST /api/wifi-offload/events
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const event = await db.wifiOffloadEvent.create({
      data: {
        sessionId: body.sessionId || '',
        eventType: body.eventType || 'SYSTEM',
        interfaceType: body.interfaceType || body.interface || 'Gy',
        direction: body.direction || 'IN',
        statusCode: body.statusCode || body.resultCode || 0,
        details: typeof body.details === 'string' ? body.details : JSON.stringify(body.details || body.metadata || {}),
        peerName: body.peerName || '',
      },
    });
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error('[wifi-offload/events] POST error:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}

// DELETE /api/wifi-offload/events — clear old events
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const beforeDays = parseInt(url.searchParams.get('beforeDays') || '7');
    const cutoff = new Date(Date.now() - beforeDays * 86400000);

    const result = await db.wifiOffloadEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    console.error('[wifi-offload/events] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to clear events' }, { status: 500 });
  }
}
