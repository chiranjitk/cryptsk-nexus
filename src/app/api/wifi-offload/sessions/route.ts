import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/wifi-offload/sessions
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { sessionId: { contains: search } },
        { imsi: { contains: search } },
        { msisdn: { contains: search } },
        { macAddress: { contains: search } },
      ];
    }

    const [sessions, total] = await Promise.all([
      db.wifiOffloadSession.findMany({
        where,
        orderBy: { startTime: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.wifiOffloadSession.count({ where }),
    ]);

    return NextResponse.json({ sessions, total });
  } catch (error) {
    console.error('[wifi-offload/sessions] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

// POST /api/wifi-offload/sessions
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const session = await db.wifiOffloadSession.create({
      data: {
        sessionId: body.sessionId,
        imsi: body.imsi || '',
        msisdn: body.msisdn || '',
        imei: body.imei || '',
        macAddress: body.macAddress || '',
        ipAddress: body.ipAddress || '',
        apName: body.apName || '',
        locationId: body.locationId || '',
        loginMethod: body.loginMethod || 'EAP-AKA',
        grantedQuotaMb: body.grantedQuotaMb || 0,
        usedDownMb: body.usedDownMb || 0,
        usedUpMb: body.usedUpMb || 0,
        usedTimeSec: body.usedTimeSec || 0,
        remainingQuotaMb: body.remainingQuotaMb ?? (body.grantedQuotaMb || 0),
        speedDownKbps: body.speedDownKbps || 0,
        speedUpKbps: body.speedUpKbps || 0,
        qosClassId: body.qosClassId || 9,
        status: body.status || 'ACTIVE',
        terminateCause: body.terminateCause || '',
        chargedAmount: body.chargedAmount || 0,
        planId: body.planId || '',
      },
    });
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error('[wifi-offload/sessions] POST error:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}
