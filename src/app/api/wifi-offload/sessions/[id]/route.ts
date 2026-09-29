import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/wifi-offload/sessions/:id
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await db.wifiOffloadSession.findUnique({
      where: { id },
    });
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    return NextResponse.json(session);
  } catch (error) {
    console.error('[wifi-offload/sessions/:id] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
  }
}

// DELETE /api/wifi-offload/sessions/:id — force disconnect
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await db.wifiOffloadSession.update({
      where: { id },
      data: {
        status: 'TERMINATED',
        terminateCause: 'ADMIN_DISCONNECT',
        lastUpdate: new Date(),
      },
    });
    return NextResponse.json(session);
  } catch (error) {
    console.error('[wifi-offload/sessions/:id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to terminate session' }, { status: 500 });
  }
}

// PUT /api/wifi-offload/sessions/:id — update session
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const session = await db.wifiOffloadSession.update({
      where: { id },
      data: {
        ...(body.status !== undefined && { status: body.status }),
        ...(body.usedDownMb !== undefined && { usedDownMb: body.usedDownMb }),
        ...(body.usedUpMb !== undefined && { usedUpMb: body.usedUpMb }),
        ...(body.usedTimeSec !== undefined && { usedTimeSec: body.usedTimeSec }),
        ...(body.remainingQuotaMb !== undefined && { remainingQuotaMb: body.remainingQuotaMb }),
        ...(body.grantedQuotaMb !== undefined && { grantedQuotaMb: body.grantedQuotaMb }),
        ...(body.speedDownKbps !== undefined && { speedDownKbps: body.speedDownKbps }),
        ...(body.speedUpKbps !== undefined && { speedUpKbps: body.speedUpKbps }),
        ...(body.qosClassId !== undefined && { qosClassId: body.qosClassId }),
        ...(body.terminateCause !== undefined && { terminateCause: body.terminateCause }),
        ...(body.chargedAmount !== undefined && { chargedAmount: body.chargedAmount }),
        ...(body.ipAddress !== undefined && { ipAddress: body.ipAddress }),
        lastUpdate: new Date(),
      },
    });
    return NextResponse.json(session);
  } catch (error) {
    console.error('[wifi-offload/sessions/:id] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
  }
}
