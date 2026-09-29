// ============================================================
// CRYPTSKINTELLIGENT Diameter Simulator — Statistics Engine
// Calculates real-time dashboard metrics from session & event stores
// ============================================================

import {
  OffloadSession,
  DiameterEvent,
  DiameterPeer,
  OffloadPolicy,
  DashboardStats,
} from './diameter-types';

export class SimulatorStatsEngine {
  constructor(
    private sessions: Map<string, OffloadSession>,
    private events: Map<string, DiameterEvent>,
    private peers: Map<string, DiameterPeer>,
    private policies: Map<string, OffloadPolicy>,
  ) {}

  /** Main dashboard stats — called by GET /dashboard */
  getDashboard(): DashboardStats {
    const allSessions = Array.from(this.sessions.values());
    const active = allSessions.filter(s => 
      s.state === 'ACTIVE' || s.state === 'UPDATING' || s.state === 'INITIALIZING'
    );
    const terminated = allSessions.filter(s => s.state === 'TERMINATED' || s.state === 'FAILED');

    const totalDataDown = allSessions.reduce((sum, s) => sum + s.usedBytesDown, 0);
    const totalDataUp = allSessions.reduce((sum, s) => sum + s.usedBytesUp, 0);
    const totalQuotaAllocated = allSessions.reduce((sum, s) => sum + s.grantedQuotaTotal, 0);
    const totalQuotaUsed = totalDataDown + totalDataUp;
    const totalCharged = allSessions.reduce((sum, s) => sum + s.chargedAmount, 0);

    // Average session duration (only terminated sessions)
    let avgSessionDuration = 0;
    if (terminated.length > 0) {
      const totalDuration = terminated.reduce((sum, s) => {
        const end = s.terminatedAt ? new Date(s.terminatedAt).getTime() : Date.now();
        const start = new Date(s.createdAt).getTime();
        return sum + ((end - start) / 1000);
      }, 0);
      avgSessionDuration = totalDuration / terminated.length;
    }

    // Peak concurrent (approximate from active count + recent terminations)
    const peakConcurrent = this.calculatePeakConcurrent(allSessions);

    // Events per second (over last 60 seconds)
    const eventsPerSecond = this.calculateEventsPerSecond();

    // Error rate
    const errorRate = this.calculateErrorRate();

    // Peer health
    const peersArr = Array.from(this.peers.values());
    const peerHealth = {
      total: peersArr.length,
      connected: peersArr.filter(p => p.state === 'CONNECTED').length,
      disconnected: peersArr.filter(p => p.state === 'DISCONNECTED').length,
      failed: peersArr.filter(p => p.state === 'FAILED').length,
    };

    // Top APs by usage
    const topAps = this.calculateTopAps(allSessions);

    return {
      totalSessions: allSessions.length,
      activeSessions: active.length,
      peakConcurrentSessions: peakConcurrent,
      totalBandwidthDL: totalDataDown,
      totalBandwidthUL: totalDataUp,
      totalQuotaAllocated,
      totalQuotaUsed,
      quotaUtilizationPct: totalQuotaAllocated > 0 
        ? Math.round((totalQuotaUsed / totalQuotaAllocated) * 100 * 100) / 100 
        : 0,
      totalCharged: Math.round(totalCharged * 100) / 100,
      avgSessionDuration: Math.round(avgSessionDuration),
      eventsPerSecond: Math.round(eventsPerSecond * 100) / 100,
      peerHealth,
      errorRate: Math.round(errorRate * 10000) / 100, // percentage with 2 decimals
      topAps,
    };
  }

  /** Active sessions count */
  getActiveSessionCount(): number {
    let count = 0;
    for (const s of this.sessions.values()) {
      if (s.state === 'ACTIVE' || s.state === 'UPDATING' || s.state === 'INITIALIZING') {
        count++;
      }
    }
    return count;
  }

  /** Peak concurrent sessions */
  getPeakConcurrent(): number {
    return this.calculatePeakConcurrent(Array.from(this.sessions.values()));
  }

  /** Total bandwidth in bytes */
  getTotalBandwidth(): { down: number; up: number } {
    let down = 0, up = 0;
    for (const s of this.sessions.values()) {
      down += s.usedBytesDown;
      up += s.usedBytesUp;
    }
    return { down, up };
  }

  /** Average session duration in seconds */
  getAverageSessionDuration(): number {
    const terminated = Array.from(this.sessions.values()).filter(
      s => s.state === 'TERMINATED' || s.state === 'FAILED'
    );
    if (terminated.length === 0) return 0;
    const total = terminated.reduce((sum, s) => {
      const end = s.terminatedAt ? new Date(s.terminatedAt).getTime() : Date.now();
      const start = new Date(s.createdAt).getTime();
      return sum + ((end - start) / 1000);
    }, 0);
    return Math.round(total / terminated.length);
  }

  /** Quota utilization percentage */
  getQuotaUtilization(): number {
    const sessions = Array.from(this.sessions.values());
    const totalQuota = sessions.reduce((sum, s) => sum + s.grantedQuotaTotal, 0);
    const totalUsed = sessions.reduce((sum, s) => sum + s.usedBytesDown + s.usedBytesUp, 0);
    if (totalQuota === 0) return 0;
    return Math.round((totalUsed / totalQuota) * 100 * 100) / 100;
  }

  /** Top APs by usage */
  getTopApsByUsage(limit = 10): Array<{ name: string; sessions: number; dataDown: number; dataUp: number }> {
    return this.calculateTopAps(Array.from(this.sessions.values()), limit);
  }

  /** Revenue estimate */
  getRevenueEstimate(): number {
    let total = 0;
    for (const s of this.sessions.values()) {
      total += s.chargedAmount;
    }
    return Math.round(total * 100) / 100;
  }

  /** Events per second (over last 60s) */
  getEventsPerSecond(): number {
    return this.calculateEventsPerSecond();
  }

  /** Peer health summary */
  getPeerHealth(): { total: number; connected: number; disconnected: number; failed: number } {
    const peers = Array.from(this.peers.values());
    return {
      total: peers.length,
      connected: peers.filter(p => p.state === 'CONNECTED').length,
      disconnected: peers.filter(p => p.state === 'DISCONNECTED').length,
      failed: peers.filter(p => p.state === 'FAILED').length,
    };
  }

  /** Error rate percentage */
  getErrorRate(): number {
    return this.calculateErrorRate();
  }

  /** Event statistics summary */
  getEventStats(): {
    total: number;
    byType: Record<string, number>;
    byHour: Record<string, number>;
    errors: number;
    lastHour: number;
  } {
    const events = Array.from(this.events.values());
    const byType: Record<string, number> = {};
    const byHour: Record<string, number> = {};
    let errors = 0;
    const oneHourAgo = Date.now() - 3600000;

    for (const e of events) {
      byType[e.eventType] = (byType[e.eventType] || 0) + 1;
      if (e.resultCode !== undefined && e.resultCode !== 2001) errors++;
      
      const hour = e.timestamp.substring(0, 13); // "2025-01-01T12"
      byHour[hour] = (byHour[hour] || 0) + 1;
    }

    const lastHour = events.filter(e => new Date(e.timestamp).getTime() > oneHourAgo).length;

    return { total: events.length, byType, byHour, errors, lastHour };
  }

  // --- Private helpers ---

  private calculatePeakConcurrent(sessions: OffloadSession[]): number {
    // Use the max of current active + peak from session history
    const currentActive = sessions.filter(s =>
      s.state === 'ACTIVE' || s.state === 'UPDATING' || s.state === 'INITIALIZING'
    ).length;
    
    // Estimate peak from all sessions — group by creation hour
    const hourCounts: Record<string, Set<string>> = {};
    for (const s of sessions) {
      const hour = s.createdAt.substring(0, 13);
      if (!hourCounts[hour]) hourCounts[hour] = new Set();
      hourCounts[hour].add(s.id);
    }
    
    let maxFromHistory = 0;
    for (const count of Object.values(hourCounts)) {
      if (count.size > maxFromHistory) maxFromHistory = count.size;
    }
    
    return Math.max(currentActive, maxFromHistory);
  }

  private calculateEventsPerSecond(): number {
    const now = Date.now();
    const oneMinAgo = now - 60000;
    let count = 0;
    for (const e of this.events.values()) {
      if (new Date(e.timestamp).getTime() > oneMinAgo) count++;
    }
    return count / 60;
  }

  private calculateErrorRate(): number {
    const events = Array.from(this.events.values());
    if (events.length === 0) return 0;
    let errors = 0;
    for (const e of events) {
      if (e.resultCode !== undefined && e.resultCode !== 2001) errors++;
    }
    // Also count SESSION_ERROR events
    for (const e of events) {
      if (e.eventType === 'SESSION_ERROR') errors++;
    }
    return (errors / events.length) * 100;
  }

  private calculateTopAps(
    sessions: OffloadSession[],
    limit = 10
  ): Array<{ name: string; sessions: number; dataDown: number; dataUp: number }> {
    const apMap = new Map<string, { sessions: number; dataDown: number; dataUp: number }>();
    
    for (const s of sessions) {
      // Use APN as AP identifier (in real deployments this would be AP name)
      const key = s.apn || 'unknown';
      const existing = apMap.get(key) || { sessions: 0, dataDown: 0, dataUp: 0 };
      existing.sessions++;
      existing.dataDown += s.usedBytesDown;
      existing.dataUp += s.usedBytesUp;
      apMap.set(key, existing);
    }
    
    return Array.from(apMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.dataDown + b.dataUp - (a.dataDown + a.dataUp))
      .slice(0, limit);
  }
}
