// ============================================================
// CRYPTSKINTELLIGENT Diameter Simulator — Core Engine
// Manages in-memory sessions, Gy/Gx/SWa message handling,
// load testing, and scenario execution
// ============================================================

import {
  OffloadSession,
  OffloadPolicy,
  DiameterEvent,
  DiameterPeer,
  SessionState,
  EventType,
  QoSInformation,
  ScenarioResult,
  LoadTestResult,
  LoadTestConfig,
  SimulatorConfig,
} from './diameter-types';
import { SimulatorStatsEngine } from './simulator-stats';

const NEXTJS_API = process.env.NEXTJS_API_URL || 'http://localhost:3000';

// --- Configuration ---

const DEFAULT_CONFIG: SimulatorConfig = {
  defaultDelayMs: [50, 150],
  defaultQuotaMB: 2048,
  fupQuotaMB: 1024,
  fupBandwidthMBps: 2,
  maxConcurrentSessions: 5000,
  sessionTimeoutSeconds: 86400,
};

// --- Helpers ---

function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDelay(): Promise<void> {
  const [min, max] = DEFAULT_CONFIG.defaultDelayMs;
  return new Promise(resolve => setTimeout(resolve, randomInRange(min, max)));
}

function generateId(): string {
  return `ses-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function generateHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  // Simple deterministic-ish random for simulation
  for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateImsi(): string {
  const mcc = randomInRange(200, 799);
  const mnc = randomInRange(1, 99).toString().padStart(2, '0');
  const msin = generateHex(5);
  return `${mcc}${mnc}${msin}`;
}

function generateMsisdn(): string {
  return `+91${randomInRange(7000000000, 9999999999)}`;
}

function generateMac(): string {
  return generateHex(6).match(/.{2}/g).join(':').toUpperCase();
}

function generateIp(): string {
  return `10.${randomInRange(0, 255)}.${randomInRange(0, 255)}.${randomInRange(2, 254)}`;
}

function generateIpv6(): string {
  return `2001:db8:${generateHex(2)}::${generateHex(2)}`;
}

function buildDiameterMessage(
  commandCode: number,
  applicationId: number,
  sessionId: string,
  direction: 'request' | 'answer',
  resultCode?: number
) {
  return {
    commandCode,
    applicationId,
    hopByHopId: randomInRange(100000, 999999),
    endToEndId: randomInRange(100000, 999999),
    avps: [],
    timestamp: new Date().toISOString(),
    direction,
    originHost: 'diameter.cryptskintelligent.com',
    originRealm: 'cryptskintelligent.com',
    sessionId,
    ...(resultCode !== undefined && { resultCode }),
  };
}

// --- In-Memory Stores ---

const sessions = new Map<string, OffloadSession>();
const events = new Map<string, DiameterEvent>();
const peers = new Map<string, DiameterPeer>();
const policies = new Map<string, OffloadPolicy>();
const authVectors = new Map<string, { xres: string; rand: string; autn: string; ck: string; ik: string }>();

// Peak tracking
let peakConcurrent = 0;
let peakTimestamp = '';
let eventCounter = 0;

const statsEngine = new SimulatorStatsEngine(sessions, events, peers, policies);

// --- Policy Cache ---

const policyCache = new Map<string, OffloadPolicy>();
let policyCacheExpiry = 0;

async function refreshPolicyCache(): Promise<void> {
  if (Date.now() < policyCacheExpiry) return;
  try {
    const res = await fetch(`${NEXTJS_API}/api/wifi-offload/policies`);
    if (res.ok) {
      const data = await res.json();
      policyCache.clear();
      for (const p of data) {
        policyCache.set(p.id, {
          id: p.id,
          name: p.name,
          description: p.description || '',
          enabled: p.isActive ?? true,
          priority: p.priorityLevel || 5,
          conditions: {
            plmnIds: [],
            apnPattern: '',
            planNames: [],
            maxConcurrentSessions: 0,
            ...(p.imsiPrefix && { imsiPrefix: p.imsiPrefix }),
          },
          actions: {
            defaultQuota: (p.dataLimitMb || DEFAULT_CONFIG.defaultQuotaMB) * 1024 * 1024,
            bandwidthUL: (p.defaultSpeedUpKbps || 2560) * 1024,
            bandwidthDL: (p.defaultSpeedDownKbps || 5120) * 1024,
            qos: {
              arp: 9 - Math.min(p.priorityLevel || 5, 9),
              qosClassIdentifier: 9,
              maxBandwidthUL: (p.defaultSpeedUpKbps || 2560) * 1024,
              maxBandwidthDL: (p.defaultSpeedDownKbps || 5120) * 1024,
            },
            fupQuota: p.fupThresholdMb ? p.fupThresholdMb * 1024 * 1024 : DEFAULT_CONFIG.fupQuotaMB * 1024 * 1024,
            fupBandwidthUL: p.fupSpeedUpKbps ? p.fupSpeedUpKbps * 1024 : DEFAULT_CONFIG.fupBandwidthMBps * 1024 * 1024,
            fupBandwidthDL: p.fupSpeedDownKbps ? p.fupSpeedDownKbps * 1024 : DEFAULT_CONFIG.fupBandwidthMBps * 1024 * 1024,
            chargingModel: 'volumetric' as const,
            billingRatePerGB: 0.5,
          },
          createdAt: p.createdAt || new Date().toISOString(),
          updatedAt: p.updatedAt || new Date().toISOString(),
        });
        policies.set(p.id, policyCache.get(p.id)!);
      }
      policyCacheExpiry = Date.now() + 30000; // 30s cache
    }
  } catch (err) {
    console.error('[SimulatorEngine] Failed to refresh policy cache:', err);
  }
}

function findPolicy(policyId?: string): OffloadPolicy | null {
  if (policyId && policyCache.has(policyId)) return policyCache.get(policyId)!;
  // Return first active policy
  for (const p of policyCache.values()) {
    if (p.enabled) return p;
  }
  // Fallback default policy
  return {
    id: 'default',
    name: 'Default Policy',
    description: 'Fallback policy',
    enabled: true,
    priority: 100,
    conditions: {},
    actions: {
      defaultQuota: DEFAULT_CONFIG.defaultQuotaMB * 1024 * 1024,
      bandwidthUL: 2560 * 1024,
      bandwidthDL: 5120 * 1024,
      qos: { arp: 6, qosClassIdentifier: 9, maxBandwidthUL: 2560 * 1024, maxBandwidthDL: 5120 * 1024 },
      fupQuota: DEFAULT_CONFIG.fupQuotaMB * 1024 * 1024,
      fupBandwidthUL: DEFAULT_CONFIG.fupBandwidthMBps * 1024 * 1024,
      fupBandwidthDL: DEFAULT_CONFIG.fupBandwidthMBps * 1024 * 1024,
      chargingModel: 'volumetric',
      billingRatePerGB: 0.5,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// --- Event Logging ---

async function logEvent(
  eventType: EventType,
  sessionId?: string,
  peerId?: string,
  direction: 'outgoing' | 'incoming' | 'internal' = 'internal',
  commandCode: number = 0,
  applicationId: number = 0,
  resultCode?: number,
  message: string = '',
  metadata?: Record<string, unknown>
): Promise<DiameterEvent> {
  const event: DiameterEvent = {
    id: `evt-${++eventCounter}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    eventType,
    sessionId,
    peerId,
    direction,
    commandCode,
    applicationId,
    resultCode,
    message,
    metadata,
  };
  events.set(event.id, event);

  // Also persist to DB
  try {
    await fetch(`${NEXTJS_API}/api/wifi-offload/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        eventType,
        interface: eventType.startsWith('GY') ? 'Gy' : eventType.startsWith('GX') ? 'Gx' : eventType.startsWith('SWA') ? 'SWa' : 'System',
        direction: direction.toUpperCase(),
        resultCode: resultCode || 0,
        details: metadata || {},
        peerName: peerId || '',
      }),
    });
  } catch {
    // DB logging is best-effort
  }

  return event;
}

// --- Session Tracking ---

function updatePeakTracking(): void {
  const active = statsEngine.getActiveSessionCount();
  if (active > peakConcurrent) {
    peakConcurrent = active;
    peakTimestamp = new Date().toISOString();
  }
}

// ============================================================
// EXPORTED: SimulatorEngine class
// ============================================================

export class SimulatorEngine {

  // --- Session Management ---

  async createSession(params: {
    imsi?: string;
    msisdn?: string;
    macAddress?: string;
    apn?: string;
    policyId?: string;
    ipAddress?: string;
    scenarioId?: string;
    simulationSpeed?: number;
  }): Promise<OffloadSession> {
    await randomDelay();
    await refreshPolicyCache();

    const policy = findPolicy(params.policyId);
    const imsi = params.imsi || generateImsi();
    const sessionId = generateId();
    const now = new Date().toISOString();

    const session: OffloadSession = {
      id: sessionId,
      imsi,
      msisdn: params.msisdn || generateMsisdn(),
      macAddress: params.macAddress || generateMac(),
      apn: params.apn || 'wifi-offload.cryptsk.com',
      ipAddress: params.ipAddress || generateIp(),
      ipv6Address: generateIpv6(),
      state: 'INITIALIZING',
      gySessionId: `gy-${sessionId}`,
      grantedQuotaTotal: 0,
      usedBytesDown: 0,
      usedBytesUp: 0,
      usedTime: 0,
      quotaExhausted: false,
      fupApplied: false,
      activePolicies: [],
      qos: policy.actions.qos,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
      estimatedDuration: policy.actions.chargingModel === 'time-based' ? 3600 : 0,
      chargedAmount: 0,
      billingModel: policy.actions.chargingModel,
      planName: policy.name,
      simulationSpeed: params.simulationSpeed || 1,
      scenarioId: params.scenarioId,
      eventIds: [],
    };

    sessions.set(sessionId, session);

    // Persist to DB
    try {
      await fetch(`${NEXTJS_API}/api/wifi-offload/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          imsi: session.imsi,
          msisdn: session.msisdn,
          macAddress: session.macAddress,
          ipAddress: session.ipAddress,
          apName: session.apn,
          grantedQuotaMb: 0,
          speedDownKbps: session.qos.maxBandwidthDL ? session.qos.maxBandwidthDL / 1024 : 5120,
          speedUpKbps: session.qos.maxBandwidthUL ? session.qos.maxBandwidthUL / 1024 : 2560,
          qosClassId: session.qos.qosClassIdentifier,
          status: 'INITIALIZING',
          planId: policy.id,
        }),
      });
    } catch {
      // Best-effort
    }

    await logEvent('SESSION_CREATE', sessionId, undefined, 'internal', 0, 0, undefined,
      `Session created for IMSI ${imsi}`, { imsi, policy: policy.name });

    updatePeakTracking();
    return session;
  }

  // --- Gy Credit-Control ---

  async handleGyInitial(params: {
    sessionId: string;
    imsi?: string;
    msisdn?: string;
    macAddress?: string;
    apName?: string;
    locationId?: string;
    policyId?: string;
  }): Promise<{ resultCode: number; grantedQuotaMb: number; sessionTimeout: number; speedDown: number; speedUp: number }> {
    await randomDelay();
    await refreshPolicyCache();

    let session = sessions.get(params.sessionId);
    if (!session) {
      // Auto-create session
      session = await this.createSession({
        imsi: params.imsi,
        msisdn: params.msisdn,
        macAddress: params.macAddress,
        apn: params.apName,
        policyId: params.policyId,
      });
    }

    const policy = findPolicy(params.policyId);
    const grantedQuotaBytes = policy.actions.defaultQuota;
    const grantedQuotaMb = Math.round(grantedQuotaBytes / (1024 * 1024));
    const sessionTimeout = DEFAULT_CONFIG.sessionTimeoutSeconds;

    session.state = 'ACTIVE';
    session.grantedQuotaTotal = grantedQuotaBytes;
    session.qos = policy.actions.qos;
    session.billingModel = policy.actions.chargingModel;
    session.planName = policy.name;
    session.updatedAt = new Date().toISOString();
    session.lastActivityAt = new Date().toISOString();
    sessions.set(session.id, session);

    await logEvent('GY_INITIAL_REQ', session.id, undefined, 'outgoing', 272, 4, undefined,
      'Gy CCR-Initial', { imsi: session.imsi });

    await logEvent('GY_INITIAL_ANS', session.id, undefined, 'incoming', 272, 4, 2001,
      'Gy CCA-Initial — Quota granted', {
        grantedQuotaMb,
        sessionTimeout,
        speedDown: session.qos.maxBandwidthDL || 0,
        speedUp: session.qos.maxBandwidthUL || 0,
      });

    // Persist to DB
    try {
      // Find the DB session by sessionId field
      const findRes = await fetch(`${NEXTJS_API}/api/wifi-offload/sessions?search=${session.id}&limit=1`);
      if (findRes.ok) {
        const findData = await findRes.json();
        if (findData.sessions?.length > 0) {
          await fetch(`${NEXTJS_API}/api/wifi-offload/sessions/${findData.sessions[0].id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'ACTIVE',
              grantedQuotaMb,
              remainingQuotaMb: grantedQuotaMb,
              speedDownKbps: session.qos.maxBandwidthDL ? Math.round(session.qos.maxBandwidthDL / 1024) : 5120,
              speedUpKbps: session.qos.maxBandwidthUL ? Math.round(session.qos.maxBandwidthUL / 1024) : 2560,
              qosClassId: session.qos.qosClassIdentifier,
            }),
          });
        }
      }
    } catch {
      // Best-effort
    }

    updatePeakTracking();

    return {
      resultCode: 2001,
      grantedQuotaMb,
      sessionTimeout,
      speedDown: session.qos.maxBandwidthDL ? session.qos.maxBandwidthDL / 1024 : 5120,
      speedUp: session.qos.maxBandwidthUL ? session.qos.maxBandwidthUL / 1024 : 2560,
    };
  }

  async handleGyUpdate(
    sessionId: string,
    used: { usedDownMb?: number; usedUpMb?: number; usedTimeSec?: number }
  ): Promise<{ resultCode: number; grantedQuotaMb?: number; remainingQuotaMb?: number }> {
    await randomDelay();

    const session = sessions.get(sessionId);
    if (!session) {
      return { resultCode: 5001 }; // DIAMETER_UNKNOWN_SESSION_ID
    }

    session.state = 'UPDATING';
    session.usedBytesDown += (used.usedDownMb || 0) * 1024 * 1024;
    session.usedBytesUp += (used.usedUpMb || 0) * 1024 * 1024;
    session.usedTime += used.usedTimeSec || 0;
    session.lastActivityAt = new Date().toISOString();

    const totalUsedBytes = session.usedBytesDown + session.usedBytesUp;
    const remainingBytes = session.grantedQuotaTotal - totalUsedBytes;

    await logEvent('GY_UPDATE_REQ', sessionId, undefined, 'outgoing', 272, 4, undefined,
      'Gy CCR-Update', { usedDownMb: used.usedDownMb, usedUpMb: used.usedUpMb });

    if (remainingBytes <= 0) {
      session.quotaExhausted = true;
      session.state = 'ACTIVE';
      session.updatedAt = new Date().toISOString();
      sessions.set(sessionId, session);

      await logEvent('GY_UPDATE_ANS', sessionId, undefined, 'incoming', 272, 4, 4012,
        'Gy CCA-Update — Credit limit reached', { totalUsedMb: Math.round(totalUsedBytes / (1024 * 1024)) });

      return { resultCode: 4012 }; // DIAMETER_CREDIT_LIMIT_REACHED
    }

    // Grant additional quota (refill)
    const policy = findPolicy();
    const refillAmount = Math.min(
      policy.actions.defaultQuota * 0.5,
      remainingBytes + policy.actions.defaultQuota * 0.25
    );
    session.grantedQuotaTotal += refillAmount;

    // Check FUP threshold
    if (!session.fupApplied && policy.actions.fupQuota && totalUsedBytes > policy.actions.fupQuota) {
      session.fupApplied = true;
      session.qos = {
        ...session.qos,
        maxBandwidthUL: policy.actions.fupBandwidthUL,
        maxBandwidthDL: policy.actions.fupBandwidthDL,
      };
    }

    session.state = 'ACTIVE';
    session.updatedAt = new Date().toISOString();
    sessions.set(sessionId, session);

    const newRemaining = session.grantedQuotaTotal - totalUsedBytes;
    const newGrantedMb = Math.round(refillAmount / (1024 * 1024));

    await logEvent('GY_UPDATE_ANS', sessionId, undefined, 'incoming', 272, 4, 2001,
      'Gy CCA-Update — Quota replenished', { grantedMb: newGrantedMb, remainingMb: Math.round(newRemaining / (1024 * 1024)) });

    // Update DB
    try {
      const findRes = await fetch(`${NEXTJS_API}/api/wifi-offload/sessions?search=${sessionId}&limit=1`);
      if (findRes.ok) {
        const findData = await findRes.json();
        if (findData.sessions?.length > 0) {
          await fetch(`${NEXTJS_API}/api/wifi-offload/sessions/${findData.sessions[0].id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'ACTIVE',
              usedDownMb: Math.round(session.usedBytesDown / (1024 * 1024)),
              usedUpMb: Math.round(session.usedBytesUp / (1024 * 1024)),
              usedTimeSec: session.usedTime,
              remainingQuotaMb: Math.round(newRemaining / (1024 * 1024)),
              grantedQuotaMb: Math.round(session.grantedQuotaTotal / (1024 * 1024)),
              speedDownKbps: Math.round((session.qos.maxBandwidthDL || 5120000) / 1024),
              speedUpKbps: Math.round((session.qos.maxBandwidthUL || 2560000) / 1024),
            }),
          });
        }
      }
    } catch {
      // Best-effort
    }

    return {
      resultCode: 2001,
      grantedQuotaMb: newGrantedMb,
      remainingQuotaMb: Math.round(newRemaining / (1024 * 1024)),
    };
  }

  async handleGyTerminate(
    sessionId: string,
    final: { finalDownMb?: number; finalUpMb?: number; finalTimeSec?: number; terminateCause?: string }
  ): Promise<{ resultCode: number; chargedAmount: number }> {
    await randomDelay();

    const session = sessions.get(sessionId);
    if (!session) {
      return { resultCode: 5001, chargedAmount: 0 };
    }

    session.state = 'TERMINATING';
    if (final.finalDownMb) session.usedBytesDown = final.finalDownMb * 1024 * 1024;
    if (final.finalUpMb) session.usedBytesUp = final.finalUpMb * 1024 * 1024;
    if (final.finalTimeSec) session.usedTime = final.finalTimeSec;
    session.lastActivityAt = new Date().toISOString();

    await logEvent('GY_TERMINATE_REQ', sessionId, undefined, 'outgoing', 272, 4, undefined,
      'Gy CCR-Termination', {
        terminateCause: final.terminateCause || 'USER_LOGOFF',
        totalUsedMb: Math.round((session.usedBytesDown + session.usedBytesUp) / (1024 * 1024)),
      });

    // Calculate charges
    const totalUsedMb = (session.usedBytesDown + session.usedBytesUp) / (1024 * 1024);
    const policy = findPolicy();
    const chargedAmount = session.billingModel === 'volumetric'
      ? Math.round((totalUsedMb / 1024) * policy.actions.billingRatePerGB * 100) / 100
      : 0;

    session.state = 'TERMINATED';
    session.terminatedAt = new Date().toISOString();
    session.chargedAmount = chargedAmount;
    session.updatedAt = new Date().toISOString();
    sessions.set(sessionId, session);

    await logEvent('GY_TERMINATE_ANS', sessionId, undefined, 'incoming', 272, 4, 2001,
      'Gy CCA-Termination — Session closed', { chargedAmount, totalUsedMb: Math.round(totalUsedMb) });

    // Persist to DB
    try {
      const findRes = await fetch(`${NEXTJS_API}/api/wifi-offload/sessions?search=${sessionId}&limit=1`);
      if (findRes.ok) {
        const findData = await findRes.json();
        if (findData.sessions?.length > 0) {
          await fetch(`${NEXTJS_API}/api/wifi-offload/sessions/${findData.sessions[0].id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'TERMINATED',
              usedDownMb: Math.round(session.usedBytesDown / (1024 * 1024)),
              usedUpMb: Math.round(session.usedBytesUp / (1024 * 1024)),
              usedTimeSec: session.usedTime,
              terminateCause: final.terminateCause || 'USER_LOGOFF',
              chargedAmount,
              remainingQuotaMb: 0,
            }),
          });
        }
      }
    } catch {
      // Best-effort
    }

    return { resultCode: 2001, chargedAmount };
  }

  // --- Gx Policy Control ---

  async handleGxPush(
    sessionId: string,
    qos: { speedDownKbps?: number; speedUpKbps?: number; qosClassId?: number }
  ): Promise<{ resultCode: number }> {
    await randomDelay();

    const session = sessions.get(sessionId);
    if (!session) {
      return { resultCode: 5001 };
    }

    const oldState = session.state;
    session.state = 'POLICY_CHANGE';

    if (qos.speedDownKbps) session.qos.maxBandwidthDL = qos.speedDownKbps * 1024;
    if (qos.speedUpKbps) session.qos.maxBandwidthUL = qos.speedUpKbps * 1024;
    if (qos.qosClassId) session.qos.qosClassIdentifier = qos.qosClassId;

    session.updatedAt = new Date().toISOString();
    session.lastActivityAt = new Date().toISOString();
    session.state = oldState === 'UPDATING' ? 'ACTIVE' : oldState;
    sessions.set(sessionId, session);

    await logEvent('GX_RAR_REQ', sessionId, undefined, 'outgoing', 258, 16777238, undefined,
      'Gx RAR — Policy push', { qos });

    await logEvent('GX_RAR_ANS', sessionId, undefined, 'incoming', 258, 16777238, 2001,
      'Gx RAA — Policy applied', {
        speedDown: session.qos.maxBandwidthDL,
        speedUp: session.qos.maxBandwidthUL,
        qci: session.qos.qosClassIdentifier,
      });

    return { resultCode: 2001 };
  }

  // --- SWa EAP-AKA Authentication ---

  async handleEapAkaAuth(imsi: string): Promise<{
    resultCode: number;
    msisdn: string;
    rand: string;
    autn: string;
    keys: { ck: string; ik: string };
  }> {
    await randomDelay();

    // Validate IMSI format (15 digits, starts with MCC)
    if (!imsi || !/^\d{15}$/.test(imsi)) {
      await logEvent('SWA_AUTH_REQ', undefined, undefined, 'outgoing', 0, 0, undefined,
        `SWa Auth — Invalid IMSI: ${imsi}`);
      await logEvent('SWA_AUTH_ANS', undefined, undefined, 'incoming', 0, 0, 5012,
        'SWa Auth — REJECTED: Invalid IMSI');
      return { resultCode: 5012, msisdn: '', rand: '', autn: '', keys: { ck: '', ik: '' } };
    }

    const msisdn = generateMsisdn();
    const rand = generateHex(16);
    const autn = generateHex(16);
    const xres = generateHex(8);
    const ck = generateHex(16);
    const ik = generateHex(16);

    authVectors.set(imsi, { rand, autn, xres, ck, ik });

    await logEvent('SWA_AUTH_REQ', undefined, undefined, 'outgoing', 0, 0, undefined,
      `SWa Auth — EAP-AKA challenge for ${imsi}`);

    await logEvent('SWA_AUTH_ANS', undefined, undefined, 'incoming', 0, 0, 2001,
      'SWa Auth — SUCCESS: Vectors generated', { imsi, msisdn });

    return {
      resultCode: 2001,
      msisdn,
      rand,
      autn,
      keys: { ck, ik },
    };
  }

  async verifyEapAka(imsi: string, res: string, _mac: string): Promise<{ resultCode: number }> {
    await randomDelay();

    const vector = authVectors.get(imsi);
    if (!vector) {
      return { resultCode: 5012 };
    }

    // In simulation, accept if res matches or is close
    if (res === vector.xres || res === vector.xres.substring(0, 4)) {
      authVectors.delete(imsi);
      return { resultCode: 2001 };
    }

    return { resultCode: 5012 };
  }

  // --- Full Session Lifecycle ---

  async runFullSessionSimulation(
    policy: OffloadPolicy,
    options: {
      quotaUsageMB?: number;
      updates?: number;
      speed?: number;
      shouldFail?: boolean;
      bandwidthVariation?: boolean;
      apName?: string;
    } = {}
  ): Promise<OffloadSession> {
    const { quotaUsageMB = 100, updates = 3, speed = 1, shouldFail = false, bandwidthVariation = false } = options;

    const session = await this.createSession({
      apn: options.apName || `wifi-${Math.random().toString(36).substring(2, 6)}`,
      policyId: policy.id,
      simulationSpeed: speed,
    });

    if (shouldFail) {
      session.state = 'FAILED';
      session.updatedAt = new Date().toISOString();
      sessions.set(session.id, session);
      await logEvent('SESSION_ERROR', session.id, undefined, 'internal', 0, 0, 5001,
        'Simulated failure');
      return session;
    }

    // Gy Initial
    await this.handleGyInitial({ sessionId: session.id, policyId: policy.id });

    // Simulate usage with Gy Updates
    const quotaPerUpdate = quotaUsageMB / updates;
    for (let i = 0; i < updates; i++) {
      const downUsage = quotaPerUpdate * (0.6 + Math.random() * 0.4);
      const upUsage = quotaPerUpdate * (0.2 + Math.random() * 0.3);
      const timeUsed = randomInRange(30, 300) / speed;

      const result = await this.handleGyUpdate(session.id, {
        usedDownMb: downUsage,
        usedUpMb: upUsage,
        usedTimeSec: Math.round(timeUsed),
      });

      // Apply bandwidth variation
      if (bandwidthVariation && Math.random() < 0.3) {
        await this.handleGxPush(session.id, {
          speedDownKbps: randomInRange(1024, 51200),
          speedUpKbps: randomInRange(512, 25600),
        });
      }

      if (result.resultCode === 4012) break;
    }

    // Terminate
    await this.handleGyTerminate(session.id, {
      terminateCause: 'USER_LOGOFF',
    });

    return sessions.get(session.id)!;
  }

  // --- Load Test ---

  async runLoadTest(
    count: number,
    policyId?: string,
    duration: number = 60,
    speedMultiplier: number = 1
  ): Promise<LoadTestResult> {
    await refreshPolicyCache();
    const policy = findPolicy(policyId);

    const result: LoadTestResult = {
      status: 'RUNNING',
      startedAt: new Date().toISOString(),
      config: {
        concurrentSessions: count,
        policyId: policyId || policy.id,
        durationSeconds: duration,
        simulationSpeed: speedMultiplier,
        rampUpInterval: Math.max(10, Math.floor((duration * 1000) / count / speedMultiplier)),
      },
      sessions: 0,
      sessionsFailed: 0,
      peakConcurrent: 0,
      totalDataDown: 0,
      totalDataUp: 0,
      totalCharged: 0,
      eventsGenerated: 0,
      sessionsPerSecond: 0,
    };

    await logEvent('LOAD_TEST_START', undefined, undefined, 'internal', 0, 0, undefined,
      `Load test: ${count} sessions, ${duration}s`, { count, duration, policy: policy.name });

    const eventCountBefore = events.size;
    const startPeak = peakConcurrent;

    // Staggered session creation
    const promises: Promise<void>[] = [];
    const intervalMs = result.config.rampUpInterval;

    for (let i = 0; i < count; i++) {
      promises.push(
        (async () => {
          if (intervalMs > 0) {
            await new Promise(resolve => setTimeout(resolve, intervalMs));
          }
          try {
            await this.runFullSessionSimulation(policy, {
              quotaUsageMB: randomInRange(50, 500),
              updates: randomInRange(2, 5),
              speed: speedMultiplier,
              shouldFail: Math.random() < 0.02,
              bandwidthVariation: true,
            });
            result.sessions++;
          } catch {
            result.sessionsFailed++;
          }
        })()
      );
    }

    await Promise.all(promises);

    result.status = 'COMPLETED';
    result.completedAt = new Date().toISOString();
    result.eventsGenerated = events.size - eventCountBefore;
    result.peakConcurrent = peakConcurrent - startPeak;
    result.sessionsPerSecond = duration > 0 ? Math.round((result.sessions / duration) * 100) / 100 : 0;

    // Tally data from sessions
    const completedSessions = Array.from(sessions.values())
      .filter(s => s.state === 'TERMINATED' && s.createdAt >= new Date(result.startedAt).toISOString());
    result.totalDataDown = completedSessions.reduce((s, ses) => s + ses.usedBytesDown, 0);
    result.totalDataUp = completedSessions.reduce((s, ses) => s + ses.usedBytesUp, 0);
    result.totalCharged = completedSessions.reduce((s, ses) => s + ses.chargedAmount, 0);

    await logEvent('LOAD_TEST_COMPLETE', undefined, undefined, 'internal', 0, 0, undefined,
      `Load test complete: ${result.sessions}/${count} success`, {
        sessions: result.sessions,
        failed: result.sessionsFailed,
        peak: result.peakConcurrent,
        dataGb: Math.round((result.totalDataDown + result.totalDataUp) / (1024 * 1024 * 1024) * 100) / 100,
      });

    return result;
  }

  // --- Run Named Scenario ---

  async runScenario(
    scenarioName: string,
    speed: number = 1
  ): Promise<ScenarioResult> {
    // Dynamic import to avoid circular dependency
    const { runScenario: executeScenario } = await import('./simulator-scenarios');
    return executeScenario(scenarioName, this, speed);
  }

  // --- Stats / Query Methods ---

  getSession(sessionId: string): OffloadSession | undefined {
    return sessions.get(sessionId);
  }

  getAllSessions(): OffloadSession[] {
    return Array.from(sessions.values());
  }

  getActiveSessionCount(): number {
    return statsEngine.getActiveSessionCount();
  }

  getTotalSessionCount(): number {
    return sessions.size;
  }

  getEventCount(): number {
    return events.size;
  }

  getEvents(): DiameterEvent[] {
    return Array.from(events.values()).sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  getEventsSince(timestamp: string): DiameterEvent[] {
    return this.getEvents().filter(e => e.timestamp >= timestamp);
  }

  getDashboard() {
    return statsEngine.getDashboard();
  }

  getPeakConcurrent(): number {
    return peakConcurrent;
  }

  getPeakConcurrentSince(since: string): number {
    const sessionsCreatedSince = Array.from(sessions.values())
      .filter(s => s.createdAt >= since);
    if (sessionsCreatedSince.length === 0) return 0;
    return Math.max(peakConcurrent, sessionsCreatedSince.length);
  }

  getPeers(): Map<string, DiameterPeer> {
    return peers;
  }

  getPolicies(): Map<string, OffloadPolicy> {
    return policies;
  }

  getConfig(): SimulatorConfig {
    return DEFAULT_CONFIG;
  }
}

// Singleton export
export const engine = new SimulatorEngine();
