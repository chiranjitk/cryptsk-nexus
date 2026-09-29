import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/wifi-offload/events/stats
export async function GET() {
  try {
    const total = await db.wifiOffloadEvent.count();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [todayCount, errorCount, gyCount, gxCount, swaCount] = await Promise.all([
      db.wifiOffloadEvent.count({ where: { createdAt: { gte: todayStart } } }),
      db.wifiOffloadEvent.count({ where: { statusCode: { not: 2001 }, createdAt: { gte: todayStart } } }),
      db.wifiOffloadEvent.count({ where: { interfaceType: 'Gy' } }),
      db.wifiOffloadEvent.count({ where: { interfaceType: 'Gx' } }),
      db.wifiOffloadEvent.count({ where: { interfaceType: 'SWa' } }),
    ]);

    return NextResponse.json({
      total,
      todayCount,
      errorCount,
      byInterface: { Gy: gyCount, Gx: gxCount, SWa: swaCount },
      errorRate: todayCount > 0 ? Math.round((errorCount / todayCount) * 10000) / 100 : 0,
    });
  } catch (error) {
    console.error('[wifi-offload/events/stats] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch event stats' }, { status: 500 });
  }
}
