import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/wifi-offload/dashboard
export async function GET() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      activeSessions,
      todaySessions,
      totalSessions,
      peers,
    ] = await Promise.all([
      db.wifiOffloadSession.count({ where: { status: 'ACTIVE' } }),
      db.wifiOffloadSession.count({ where: { startTime: { gte: todayStart } } }),
      db.wifiOffloadSession.count(),
      db.wifiOffloadPeer.findMany(),
    ]);

    const connectedPeers = peers.filter(p => p.status === 'CONNECTED').length;

    // Aggregate data for today
    const todaySessionData = await db.wifiOffloadSession.aggregate({
      where: { startTime: { gte: todayStart } },
      _sum: {
        usedDownMb: true,
        usedUpMb: true,
        chargedAmount: true,
      },
      _avg: {
        speedDownKbps: true,
        speedUpKbps: true,
      },
    });

    const totalDataGb = ((todaySessionData._sum.usedDownMb || 0) + (todaySessionData._sum.usedUpMb || 0)) / 1024;
    const avgSpeedMbps = (((todaySessionData._avg.speedDownKbps || 0) + (todaySessionData._avg.speedUpKbps || 0)) / 2) / 1000;
    const revenueToday = todaySessionData._sum.chargedAmount || 0;

    // Peak concurrent (approximate from active sessions grouped by minute — simplified)
    const peakConcurrent = activeSessions; // Simplified; real impl would track peaks

    // Top APs
    const topApsRaw = await db.wifiOffloadSession.groupBy({
      by: ['apName'],
      where: { startTime: { gte: todayStart } },
      _count: { id: true },
      _sum: { usedDownMb: true, usedUpMb: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    const topAps = topApsRaw.map(row => ({
      name: row.apName || 'Unknown',
      sessions: row._count.id,
      dataDown: row._sum.usedDownMb || 0,
      dataUp: row._sum.usedUpMb || 0,
    }));

    // Recent events
    const recentEvents = await db.wifiOffloadEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({
      activeSessions,
      totalToday: todaySessions,
      totalSessions,
      peakConcurrent,
      totalDataGb: Math.round(totalDataGb * 100) / 100,
      avgSpeedMbps: Math.round(avgSpeedMbps * 100) / 100,
      revenueToday: Math.round(revenueToday * 100) / 100,
      peersConnected: connectedPeers,
      totalPeers: peers.length,
      topAps,
      recentEvents,
    });
  } catch (error) {
    console.error('[wifi-offload/dashboard] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: 500 });
  }
}
