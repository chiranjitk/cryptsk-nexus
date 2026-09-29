import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/wifi-offload/policies
export async function GET() {
  try {
    const policies = await db.wifiOffloadPolicy.findMany({
      orderBy: { priorityLevel: 'asc' },
    });
    return NextResponse.json(policies);
  } catch (error) {
    console.error('[wifi-offload/policies] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch policies' }, { status: 500 });
  }
}

// POST /api/wifi-offload/policies
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const policy = await db.wifiOffloadPolicy.create({
      data: {
        name: body.name || 'Unnamed Policy',
        description: body.description || '',
        imsiPrefix: body.imsiPrefix || '',
        locationId: body.locationId || '',
        defaultSpeedDownKbps: body.defaultSpeedDownKbps || 5120,
        defaultSpeedUpKbps: body.defaultSpeedUpKbps || 2560,
        dataLimitMb: body.dataLimitMb ?? null,
        sessionTimeoutSec: body.sessionTimeoutSec || 86400,
        fupSpeedDownKbps: body.fupSpeedDownKbps || 1024,
        fupSpeedUpKbps: body.fupSpeedUpKbps || 512,
        fupThresholdMb: body.fupThresholdMb ?? null,
        priorityLevel: body.priorityLevel || 5,
        isActive: body.isActive ?? true,
      },
    });
    return NextResponse.json(policy, { status: 201 });
  } catch (error) {
    console.error('[wifi-offload/policies] POST error:', error);
    return NextResponse.json({ error: 'Failed to create policy' }, { status: 500 });
  }
}
