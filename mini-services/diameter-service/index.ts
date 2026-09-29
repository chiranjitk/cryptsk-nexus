// ============================================================
// CRYPTSKINTELLIGENT Diameter Service — Main Express Server
// Simulated Diameter protocol for WiFi Offload testing
// Port: 3870
// ============================================================

import express from 'express';
import cors from 'cors';
import { engine } from './simulator-engine';
import { getAvailableScenarios } from './simulator-scenarios';

const app = express();
const PORT = 3870;
const VERSION = '1.0.0';
const startTime = Date.now();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============================================================
// Health Check
// ============================================================

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.round((Date.now() - startTime) / 1000),
    version: VERSION,
    activeSessions: engine.getActiveSessionCount(),
    peersConnected: engine.getPeers().size,
  });
});

// ============================================================
// Gy Credit-Control (Simulated OCS)
// ============================================================

app.post('/gy/initialize', async (req, res) => {
  try {
    const { sessionId, imsi, msisdn, macAddress, apName, locationId, policyId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    const result = await engine.handleGyInitial({
      sessionId,
      imsi,
      msisdn,
      macAddress,
      apName,
      locationId,
      policyId,
    });
    res.json(result);
  } catch (err) {
    console.error('[/gy/initialize] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/gy/update', async (req, res) => {
  try {
    const { sessionId, usedDownMb, usedUpMb, usedTimeSec } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    const result = await engine.handleGyUpdate(sessionId, {
      usedDownMb: usedDownMb || 0,
      usedUpMb: usedUpMb || 0,
      usedTimeSec: usedTimeSec || 0,
    });
    res.json(result);
  } catch (err) {
    console.error('[/gy/update] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/gy/terminate', async (req, res) => {
  try {
    const { sessionId, finalDownMb, finalUpMb, finalTimeSec, terminateCause } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    const result = await engine.handleGyTerminate(sessionId, {
      finalDownMb,
      finalUpMb,
      finalTimeSec,
      terminateCause,
    });
    res.json(result);
  } catch (err) {
    console.error('[/gy/terminate] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// Gx Policy Control (Simulated PCRF)
// ============================================================

app.post('/gx/push-policy', async (req, res) => {
  try {
    const { sessionId, speedDownKbps, speedUpKbps, qosClassId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    const result = await engine.handleGxPush(sessionId, {
      speedDownKbps,
      speedUpKbps,
      qosClassId,
    });
    res.json(result);
  } catch (err) {
    console.error('[/gx/push-policy] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// SWa Authentication (Simulated HSS/EAP-AKA)
// ============================================================

app.post('/swa/authenticate', async (req, res) => {
  try {
    const { imsi } = req.body;
    if (!imsi) {
      return res.status(400).json({ error: 'imsi is required' });
    }
    const result = await engine.handleEapAkaAuth(imsi);
    res.json(result);
  } catch (err) {
    console.error('[/swa/authenticate] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/swa/verify', async (req, res) => {
  try {
    const { imsi, res, mac } = req.body;
    if (!imsi || !res) {
      return res.status(400).json({ error: 'imsi and res are required' });
    }
    const result = await engine.verifyEapAka(imsi, res, mac || '');
    res.json(result);
  } catch (err) {
    console.error('[/swa/verify] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// Peers
// ============================================================

app.get('/peers', async (_req, res) => {
  try {
    const response = await fetch('http://localhost:3000/api/wifi-offload/peers');
    const peers = await response.json();
    res.json(peers);
  } catch (err) {
    console.error('[/peers] GET error:', err);
    res.status(500).json({ error: 'Failed to fetch peers' });
  }
});

app.post('/peers', async (req, res) => {
  try {
    const response = await fetch('http://localhost:3000/api/wifi-offload/peers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const peer = await response.json();
    res.status(response.status).json(peer);
  } catch (err) {
    console.error('[/peers] POST error:', err);
    res.status(500).json({ error: 'Failed to create peer' });
  }
});

app.put('/peers/:id', async (req, res) => {
  try {
    const response = await fetch(`http://localhost:3000/api/wifi-offload/peers/${req.params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const peer = await response.json();
    res.status(response.status).json(peer);
  } catch (err) {
    console.error('[/peers/:id] PUT error:', err);
    res.status(500).json({ error: 'Failed to update peer' });
  }
});

app.delete('/peers/:id', async (req, res) => {
  try {
    const response = await fetch(`http://localhost:3000/api/wifi-offload/peers/${req.params.id}`, {
      method: 'DELETE',
    });
    res.status(response.status).json(await response.json());
  } catch (err) {
    console.error('[/peers/:id] DELETE error:', err);
    res.status(500).json({ error: 'Failed to delete peer' });
  }
});

app.post('/peers/:id/ping', async (req, res) => {
  try {
    const latency = Math.floor(Math.random() * 20) + 5;
    // Update lastPingAt in DB
    await fetch(`http://localhost:3000/api/wifi-offload/peers/${req.params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastPingAt: new Date().toISOString() }),
    });
    res.json({ latency, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[/peers/:id/ping] POST error:', err);
    res.status(500).json({ error: 'Ping failed' });
  }
});

app.post('/peers/:id/connect', async (req, res) => {
  try {
    const response = await fetch(`http://localhost:3000/api/wifi-offload/peers/${req.params.id}/actions/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const peer = await response.json();
    res.json(peer);
  } catch (err) {
    console.error('[/peers/:id/connect] POST error:', err);
    res.status(500).json({ error: 'Connect failed' });
  }
});

app.post('/peers/:id/disconnect', async (req, res) => {
  try {
    const response = await fetch(`http://localhost:3000/api/wifi-offload/peers/${req.params.id}/actions/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const peer = await response.json();
    res.json(peer);
  } catch (err) {
    console.error('[/peers/:id/disconnect] POST error:', err);
    res.status(500).json({ error: 'Disconnect failed' });
  }
});

// ============================================================
// Sessions
// ============================================================

app.get('/sessions', async (req, res) => {
  try {
    const { status, search, limit = '100', offset = '0' } = req.query;
    const params = new URLSearchParams();
    if (status) params.set('status', status as string);
    if (search) params.set('search', search as string);
    params.set('limit', limit as string);
    params.set('offset', offset as string);

    const response = await fetch(`http://localhost:3000/api/wifi-offload/sessions?${params}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('[/sessions] GET error:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

app.get('/sessions/:id', async (req, res) => {
  try {
    const response = await fetch(`http://localhost:3000/api/wifi-offload/sessions/${req.params.id}`);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Session not found' });
    }
    const session = await response.json();
    res.json(session);
  } catch (err) {
    console.error('[/sessions/:id] GET error:', err);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

app.delete('/sessions/:id', async (req, res) => {
  try {
    const response = await fetch(`http://localhost:3000/api/wifi-offload/sessions/${req.params.id}`, {
      method: 'DELETE',
    });
    const session = await response.json();
    res.json(session);
  } catch (err) {
    console.error('[/sessions/:id] DELETE error:', err);
    res.status(500).json({ error: 'Failed to terminate session' });
  }
});

app.post('/sessions/simulate', async (req, res) => {
  try {
    const { policyId } = req.body || {};
    const result = await engine.runFullSessionSimulation(
      engine.getPolicies().get(policyId || '') || {
        id: 'default',
        name: 'Default Simulation Policy',
        description: '',
        enabled: true,
        priority: 100,
        conditions: {},
        actions: {
          defaultQuota: 2048 * 1024 * 1024,
          bandwidthUL: 2560 * 1024,
          bandwidthDL: 5120 * 1024,
          qos: { arp: 6, qosClassIdentifier: 9, maxBandwidthUL: 2560 * 1024, maxBandwidthDL: 5120 * 1024 },
          chargingModel: 'volumetric',
          billingRatePerGB: 0.5,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        quotaUsageMB: 100 + Math.random() * 200,
        updates: 3,
        speed: 10,
        bandwidthVariation: true,
      }
    );
    res.json(result);
  } catch (err) {
    console.error('[/sessions/simulate] POST error:', err);
    res.status(500).json({ error: 'Simulation failed' });
  }
});

// ============================================================
// Events
// ============================================================

app.get('/events', async (req, res) => {
  try {
    const { interface: iface, sessionId, eventType, limit = '50', offset = '0' } = req.query;
    const params = new URLSearchParams();
    if (iface) params.set('interfaceType', iface as string);
    if (sessionId) params.set('sessionId', sessionId as string);
    if (eventType) params.set('eventType', eventType as string);
    params.set('limit', limit as string);
    params.set('offset', offset as string);

    // Merge in-memory events with DB events
    const memEvents = engine.getEvents();

    const response = await fetch(`http://localhost:3000/api/wifi-offload/events?${params}`);
    const dbData = await response.json();

    // Combine: in-memory events take priority (more recent), supplemented by DB
    const dbEvents = (dbData.events || []).map((e: Record<string, unknown>) => ({
      id: e.id,
      timestamp: e.createdAt,
      eventType: e.eventType,
      sessionId: e.sessionId,
      direction: e.direction,
      commandCode: 0,
      applicationId: 0,
      resultCode: e.statusCode,
      message: e.details || '',
      interfaceType: e.interfaceType,
    }));

    const mergedEvents = [...memEvents, ...dbEvents]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, parseInt(limit as string));

    res.json({ events: mergedEvents, total: dbData.total + memEvents.length });
  } catch (err) {
    console.error('[/events] GET error:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

app.get('/events/stats', async (_req, res) => {
  try {
    const response = await fetch('http://localhost:3000/api/wifi-offload/events/stats');
    const dbStats = await response.json();

    // Augment with in-memory stats
    const memEvents = engine.getEvents();
    const memErrors = memEvents.filter(e => e.resultCode && e.resultCode !== 2001).length;

    res.json({
      ...dbStats,
      inMemoryTotal: memEvents.length,
      inMemoryErrors: memErrors,
    });
  } catch (err) {
    console.error('[/events/stats] GET error:', err);
    res.status(500).json({ error: 'Failed to fetch event stats' });
  }
});

app.delete('/events', async (req, res) => {
  try {
    const { beforeDays = '7' } = req.query;
    const response = await fetch(`http://localhost:3000/api/wifi-offload/events?beforeDays=${beforeDays}`, {
      method: 'DELETE',
    });
    const result = await response.json();
    res.json(result);
  } catch (err) {
    console.error('[/events] DELETE error:', err);
    res.status(500).json({ error: 'Failed to clear events' });
  }
});

// ============================================================
// Dashboard
// ============================================================

app.get('/dashboard', async (_req, res) => {
  try {
    const response = await fetch('http://localhost:3000/api/wifi-offload/dashboard');
    const dbDash = await response.json();

    // Merge with in-memory engine stats
    const memDash = engine.getDashboard();

    res.json({
      activeSessions: Math.max(dbDash.activeSessions || 0, memDash.activeSessions),
      totalToday: dbDash.totalToday || 0,
      peakConcurrent: Math.max(dbDash.peakConcurrent || 0, engine.getPeakConcurrent()),
      totalDataGb: dbDash.totalDataGb || 0,
      avgSpeed: dbDash.avgSpeed || 0,
      revenueToday: dbDash.revenueToday || 0,
      totalSessions: dbDash.totalSessions || 0,
      peersConnected: dbDash.peersConnected || 0,
      totalPeers: dbDash.totalPeers || 0,
      topAps: dbDash.topAps || [],
      recentEvents: dbDash.recentEvents || [],
      // In-memory specific stats
      memoryStats: {
        totalBandwidthDL: memDash.totalBandwidthDL,
        totalBandwidthUL: memDash.totalBandwidthUL,
        quotaUtilizationPct: memDash.quotaUtilizationPct,
        totalCharged: memDash.totalCharged,
        eventsPerSecond: memDash.eventsPerSecond,
        errorRate: memDash.errorRate,
        peerHealth: memDash.peerHealth,
      },
    });
  } catch (err) {
    console.error('[/dashboard] GET error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

// ============================================================
// Policies
// ============================================================

app.get('/policies', async (_req, res) => {
  try {
    const response = await fetch('http://localhost:3000/api/wifi-offload/policies');
    const policies = await response.json();
    res.json(policies);
  } catch (err) {
    console.error('[/policies] GET error:', err);
    res.status(500).json({ error: 'Failed to fetch policies' });
  }
});

app.post('/policies', async (req, res) => {
  try {
    const response = await fetch('http://localhost:3000/api/wifi-offload/policies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const policy = await response.json();
    res.status(response.status).json(policy);
  } catch (err) {
    console.error('[/policies] POST error:', err);
    res.status(500).json({ error: 'Failed to create policy' });
  }
});

app.put('/policies/:id', async (req, res) => {
  try {
    const response = await fetch(`http://localhost:3000/api/wifi-offload/policies/${req.params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const policy = await response.json();
    res.status(response.status).json(policy);
  } catch (err) {
    console.error('[/policies/:id] PUT error:', err);
    res.status(500).json({ error: 'Failed to update policy' });
  }
});

app.delete('/policies/:id', async (req, res) => {
  try {
    const response = await fetch(`http://localhost:3000/api/wifi-offload/policies/${req.params.id}`, {
      method: 'DELETE',
    });
    res.status(response.status).json(await response.json());
  } catch (err) {
    console.error('[/policies/:id] DELETE error:', err);
    res.status(500).json({ error: 'Failed to delete policy' });
  }
});

// ============================================================
// Simulator
// ============================================================

app.post('/simulator/load-test', async (req, res) => {
  try {
    const { userCount = 10, durationSec = 30, policyId } = req.body;

    if (userCount < 1 || userCount > 10000) {
      return res.status(400).json({ error: 'userCount must be between 1 and 10000' });
    }

    // Run asynchronously and return immediately with a status endpoint
    res.json({
      status: 'STARTED',
      message: `Load test initiated: ${userCount} sessions for ${durationSec}s`,
      config: { userCount, durationSec, policyId },
    });

    // Fire-and-forget the actual test
    engine.runLoadTest(userCount, policyId, durationSec, 10).then(result => {
      console.log(`[Load Test] Complete: ${result.sessions}/${result.config.concurrentSessions} sessions, ${result.sessionsFailed} failures, peak=${result.peakConcurrent}`);
    }).catch(err => {
      console.error('[Load Test] Error:', err);
    });
  } catch (err) {
    console.error('[/simulator/load-test] POST error:', err);
    res.status(500).json({ error: 'Load test failed to start' });
  }
});

app.post('/simulator/scenario', async (req, res) => {
  try {
    const { scenarioName } = req.body;
    if (!scenarioName) {
      return res.status(400).json({ error: 'scenarioName is required' });
    }

    const available = getAvailableScenarios().map(s => s.name);
    if (!available.includes(scenarioName)) {
      return res.status(400).json({
        error: `Unknown scenario: ${scenarioName}`,
        available,
      });
    }

    res.json({
      status: 'STARTED',
      message: `Scenario "${scenarioName}" initiated`,
      scenarioName,
    });

    // Fire-and-forget
    engine.runScenario(scenarioName, 10).then(result => {
      console.log(`[Scenario] "${scenarioName}" complete: ${result.totalSessions} sessions, ${result.errors} errors, duration=${result.duration.toFixed(1)}s`);
    }).catch(err => {
      console.error(`[Scenario] "${scenarioName}" error:`, err);
    });
  } catch (err) {
    console.error('[/simulator/scenario] POST error:', err);
    res.status(500).json({ error: 'Scenario failed to start' });
  }
});

app.get('/simulator/scenarios', (_req, res) => {
  res.json(getAvailableScenarios());
});

// ============================================================
// Root — API overview
// ============================================================

app.get('/', (_req, res) => {
  res.json({
    service: 'CRYPTSKINTELLIGENT Diameter Simulator',
    version: VERSION,
    port: PORT,
    endpoints: {
      health: 'GET /health',
      gy: {
        initialize: 'POST /gy/initialize',
        update: 'POST /gy/update',
        terminate: 'POST /gy/terminate',
      },
      gx: {
        pushPolicy: 'POST /gx/push-policy',
      },
      swa: {
        authenticate: 'POST /swa/authenticate',
        verify: 'POST /swa/verify',
      },
      peers: {
        list: 'GET /peers',
        create: 'POST /peers',
        update: 'PUT /peers/:id',
        delete: 'DELETE /peers/:id',
        ping: 'POST /peers/:id/ping',
        connect: 'POST /peers/:id/connect',
        disconnect: 'POST /peers/:id/disconnect',
      },
      sessions: {
        list: 'GET /sessions',
        get: 'GET /sessions/:id',
        terminate: 'DELETE /sessions/:id',
        simulate: 'POST /sessions/simulate',
      },
      events: {
        list: 'GET /events',
        stats: 'GET /events/stats',
        clear: 'DELETE /events',
      },
      dashboard: 'GET /dashboard',
      policies: {
        list: 'GET /policies',
        create: 'POST /policies',
        update: 'PUT /policies/:id',
        delete: 'DELETE /policies/:id',
      },
      simulator: {
        loadTest: 'POST /simulator/load-test',
        scenario: 'POST /simulator/scenario',
        listScenarios: 'GET /simulator/scenarios',
      },
    },
  });
});

// ============================================================
// Start Server
// ============================================================

app.listen(PORT, () => {
  console.log(`╔══════════════════════════════════════════════════════╗`);
  console.log(`║  CRYPTSKINTELLIGENT Diameter Simulator Service      ║`);
  console.log(`║  Version: ${VERSION.padEnd(42)}║`);
  console.log(`║  Port: ${String(PORT).padEnd(47)}║`);
  console.log(`║  API: http://localhost:${String(PORT).padEnd(28)}║`);
  console.log(`║  Next.js API: http://localhost:3000${' '.repeat(15)}║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`[${new Date().toISOString()}] Diameter service started`);

  // Warm up policy cache
  engine.runFullSessionSimulation(
    {
      id: 'warmup',
      name: 'Warmup',
      description: '',
      enabled: true,
      priority: 100,
      conditions: {},
      actions: {
        defaultQuota: 1024 * 1024 * 1024,
        bandwidthUL: 2560 * 1024,
        bandwidthDL: 5120 * 1024,
        qos: { arp: 6, qosClassIdentifier: 9, maxBandwidthUL: 2560 * 1024, maxBandwidthDL: 5120 * 1024 },
        chargingModel: 'volumetric',
        billingRatePerGB: 0.5,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    { quotaUsageMB: 10, updates: 1, speed: 100 }
  ).then(() => {
    console.log(`[${new Date().toISOString()}] Policy cache warmed up`);
  }).catch(() => {
    // Warmup failure is non-critical
  });
});

export default app;
