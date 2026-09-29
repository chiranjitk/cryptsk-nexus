import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// PUT /api/wifi-offload/policies/:id
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const policy = await db.wifiOffloadPolicy.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.imsiPrefix !== undefined && { imsiPrefix: body.imsiPrefix }),
        ...(body.locationId !== undefined && { locationId: body.locationId }),
        ...(body.defaultSpeedDownKbps !== undefined && { defaultSpeedDownKbps: body.defaultSpeedDownKbps }),
        ...(body.defaultSpeedUpKbps !== undefined && { defaultSpeedUpKbps: body.defaultSpeedUpKbps }),
        ...(body.dataLimitMb !== undefined && { dataLimitMb: body.dataLimitMb }),
        ...(body.sessionTimeoutSec !== undefined && { sessionTimeoutSec: body.sessionTimeoutSec }),
        ...(body.fupSpeedDownKbps !== undefined && { fupSpeedDownKbps: body.fupSpeedDownKbps }),
        ...(body.fupSpeedUpKbps !== undefined && { fupSpeedUpKbps: body.fupSpeedUpKbps }),
        ...(body.fupThresholdMb !== undefined && { fupThresholdMb: body.fupThresholdMb }),
        ...(body.priorityLevel !== undefined && { priorityLevel: body.priorityLevel }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });
    return NextResponse.json(policy);
  } catch (error) {
    console.error('[wifi-offload/policies/:id] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update policy' }, { status: 500 });
  }
}

// DELETE /api/wifi-offload/policies/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.wifiOffloadPolicy.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[wifi-offload/policies/:id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete policy' }, { status: 500 });
  }
}
