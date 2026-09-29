// ============================================================
// CRYPTSKINTELLIGENT Diameter Simulator — Predefined Scenarios
// 8 realistic WiFi Offload test scenarios
// ============================================================

import {
  OffloadPolicy,
  QoSInformation,
  ScenarioResult,
  ScenarioStepResult,
  OffloadSession,
  DiameterEvent,
  EventType,
  SessionState,
} from './diameter-types';
import { SimulatorEngine } from './simulator-engine';

export interface ScenarioDefinition {
  name: string;
  description: string;
  durationMinutes: number;
  userCount: number;
  rampUpSeconds: number;
  policies: OffloadPolicy[];
  steps: ScenarioStep[];
}

export interface ScenarioStep {
  name: string;
  durationSeconds: number;
  targetConcurrent: number;
  actionsPerSession: number; // number of Gy updates per session
  quotaUsageMB: number;
  errorChance: number; // 0-1 chance of failure
  bandwidthVariation: boolean;
}

// --- Default policies used across scenarios ---

const DEFAULT_POLICIES: OffloadPolicy[] = [
  {
    id: 'policy-basic',
    name: 'Basic WiFi Offload',
    description: 'Standard mobile data offload — 2GB quota, 20/5 Mbps',
    enabled: true,
    priority: 100,
    conditions: {},
    actions: {
      defaultQuota: 2 * 1024 * 1024 * 1024, // 2GB
      bandwidthUL: 5 * 1024 * 1024, // 5 Mbps
      bandwidthDL: 20 * 1024 * 1024, // 20 Mbps
      qos: { arp: 6, qosClassIdentifier: 9, maxBandwidthUL: 5 * 1024 * 1024, maxBandwidthDL: 20 * 1024 * 1024 },
      fupQuota: 1 * 1024 * 1024 * 1024,
      fupBandwidthUL: 1 * 1024 * 1024,
      fupBandwidthDL: 2 * 1024 * 1024,
      chargingModel: 'volumetric',
      billingRatePerGB: 0.50,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'policy-premium',
    name: 'Premium WiFi Offload',
    description: 'Premium tier — 10GB quota, 50/25 Mbps',
    enabled: true,
    priority: 200,
    conditions: {},
    actions: {
      defaultQuota: 10 * 1024 * 1024 * 1024, // 10GB
      bandwidthUL: 25 * 1024 * 1024,
      bandwidthDL: 50 * 1024 * 1024,
      qos: { arp: 3, qosClassIdentifier: 5, maxBandwidthUL: 25 * 1024 * 1024, maxBandwidthDL: 50 * 1024 * 1024 },
      fupQuota: 5 * 1024 * 1024 * 1024,
      fupBandwidthUL: 5 * 1024 * 1024,
      fupBandwidthDL: 10 * 1024 * 1024,
      chargingModel: 'volumetric',
      billingRatePerGB: 0.30,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'policy-unlimited',
    name: 'Unlimited WiFi',
    description: 'Unlimited data — 100/50 Mbps, time-based billing',
    enabled: true,
    priority: 300,
    conditions: {},
    actions: {
      defaultQuota: 100 * 1024 * 1024 * 1024, // 100GB (effectively unlimited)
      bandwidthUL: 50 * 1024 * 1024,
      bandwidthDL: 100 * 1024 * 1024,
      qos: { arp: 1, qosClassIdentifier: 1, maxBandwidthUL: 50 * 1024 * 1024, maxBandwidthDL: 100 * 1024 * 1024 },
      chargingModel: 'time-based',
      billingRatePerGB: 0,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'policy-quota-test',
    name: 'Low Quota Test',
    description: '500MB quota for exhaustion testing',
    enabled: true,
    priority: 50,
    conditions: {},
    actions: {
      defaultQuota: 500 * 1024 * 1024, // 500MB
      bandwidthUL: 10 * 1024 * 1024,
      bandwidthDL: 30 * 1024 * 1024,
      qos: { arp: 8, qosClassIdentifier: 9, maxBandwidthUL: 10 * 1024 * 1024, maxBandwidthDL: 30 * 1024 * 1024 },
      fupQuota: 500 * 1024 * 1024,
      fupBandwidthUL: 512 * 1024,
      fupBandwidthDL: 1 * 1024 * 1024,
      chargingModel: 'volumetric',
      billingRatePerGB: 1.00,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// --- All 8 Scenario Definitions ---

export const SCENARIOS: ScenarioDefinition[] = [
  {
    name: 'airport-rush-hour',
    description: 'Simulates 500 concurrent passengers connecting at a major airport during peak hours. Users arrive in waves, connect briefly for social media/checking-in, and disconnect. Mix of basic and premium plans with moderate quota usage.',
    durationMinutes: 30,
    userCount: 500,
    rampUpSeconds: 300,
    policies: [DEFAULT_POLICIES[0], DEFAULT_POLICIES[1]],
    steps: [
      { name: 'Early arrival wave', durationSeconds: 300, targetConcurrent: 100, actionsPerSession: 2, quotaUsageMB: 50, errorChance: 0.02, bandwidthVariation: true },
      { name: 'Rush hour peak', durationSeconds: 600, targetConcurrent: 500, actionsPerSession: 4, quotaUsageMB: 200, errorChance: 0.03, bandwidthVariation: true },
      { name: 'Boarding wave', durationSeconds: 600, targetConcurrent: 350, actionsPerSession: 3, quotaUsageMB: 150, errorChance: 0.02, bandwidthVariation: true },
      { name: 'Departure wind-down', durationSeconds: 600, targetConcurrent: 100, actionsPerSession: 2, quotaUsageMB: 75, errorChance: 0.01, bandwidthVariation: true },
    ],
  },
  {
    name: 'hotel-check-in',
    description: 'Simulates 50 hotel rooms connecting over 30 minutes during check-in time. Each room may have 2-3 devices. Premium speeds required for streaming services. Stable connections expected.',
    durationMinutes: 30,
    userCount: 50,
    rampUpSeconds: 600,
    policies: [DEFAULT_POLICIES[1], DEFAULT_POLICIES[2]],
    steps: [
      { name: 'Check-in begins', durationSeconds: 300, targetConcurrent: 10, actionsPerSession: 3, quotaUsageMB: 100, errorChance: 0.01, bandwidthVariation: false },
      { name: 'Evening settling in', durationSeconds: 600, targetConcurrent: 40, actionsPerSession: 5, quotaUsageMB: 500, errorChance: 0.01, bandwidthVariation: true },
      { name: 'Prime time streaming', durationSeconds: 900, targetConcurrent: 50, actionsPerSession: 8, quotaUsageMB: 2000, errorChance: 0.005, bandwidthVariation: false },
    ],
  },
  {
    name: 'mall-weekend',
    description: 'Simulates 1000 shoppers over 8 hours at a large shopping mall. High churn rate — users connect, browse briefly, walk away, reconnect elsewhere. Mix of all plan types.',
    durationMinutes: 480,
    userCount: 1000,
    rampUpSeconds: 1800,
    policies: DEFAULT_POLICIES,
    steps: [
      { name: 'Morning shoppers', durationSeconds: 3600, targetConcurrent: 200, actionsPerSession: 2, quotaUsageMB: 30, errorChance: 0.02, bandwidthVariation: true },
      { name: 'Lunch rush', durationSeconds: 3600, targetConcurrent: 500, actionsPerSession: 3, quotaUsageMB: 80, errorChance: 0.03, bandwidthVariation: true },
      { name: 'Afternoon peak', durationSeconds: 3600, targetConcurrent: 800, actionsPerSession: 4, quotaUsageMB: 120, errorChance: 0.04, bandwidthVariation: true },
      { name: 'Evening crowd', durationSeconds: 3600, targetConcurrent: 1000, actionsPerSession: 3, quotaUsageMB: 100, errorChance: 0.03, bandwidthVariation: true },
      { name: 'Closing time', durationSeconds: 3600, targetConcurrent: 300, actionsPerSession: 2, quotaUsageMB: 50, errorChance: 0.02, bandwidthVariation: true },
    ],
  },
  {
    name: 'corporate-meeting',
    description: 'Simulates 200 corporate users in a conference center. Premium QoS required, stable long sessions, video conferencing traffic. Low tolerance for errors.',
    durationMinutes: 120,
    userCount: 200,
    rampUpSeconds: 300,
    policies: [DEFAULT_POLICIES[1], DEFAULT_POLICIES[2]],
    steps: [
      { name: 'Pre-meeting setup', durationSeconds: 600, targetConcurrent: 50, actionsPerSession: 2, quotaUsageMB: 200, errorChance: 0.005, bandwidthVariation: false },
      { name: 'Main presentation', durationSeconds: 3600, targetConcurrent: 200, actionsPerSession: 6, quotaUsageMB: 1500, errorChance: 0.002, bandwidthVariation: false },
      { name: 'Breakout sessions', durationSeconds: 1800, targetConcurrent: 150, actionsPerSession: 5, quotaUsageMB: 800, errorChance: 0.003, bandwidthVariation: true },
      { name: 'Wrap-up', durationSeconds: 1200, targetConcurrent: 80, actionsPerSession: 3, quotaUsageMB: 300, errorChance: 0.005, bandwidthVariation: false },
    ],
  },
  {
    name: 'quota-exhaustion',
    description: 'Tests quota management with 10 heavy users hitting their data caps. Verifies FUP (Fair Usage Policy) triggers, quota re-authorization cycles, and graceful degradation.',
    durationMinutes: 20,
    userCount: 10,
    rampUpSeconds: 30,
    policies: [DEFAULT_POLICIES[3]],
    steps: [
      { name: 'Initial quota allocation', durationSeconds: 120, targetConcurrent: 10, actionsPerSession: 1, quotaUsageMB: 100, errorChance: 0, bandwidthVariation: false },
      { name: 'Heavy usage phase', durationSeconds: 300, targetConcurrent: 10, actionsPerSession: 5, quotaUsageMB: 300, errorChance: 0.01, bandwidthVariation: false },
      { name: 'Quota exhaustion', durationSeconds: 300, targetConcurrent: 10, actionsPerSession: 8, quotaUsageMB: 200, errorChance: 0.05, bandwidthVariation: false },
      { name: 'FUP degraded service', durationSeconds: 480, targetConcurrent: 10, actionsPerSession: 10, quotaUsageMB: 50, errorChance: 0.02, bandwidthVariation: true },
    ],
  },
  {
    name: 'failover-test',
    description: 'Tests Diameter peer failover and session recovery. Simulates peer disconnection, automatic reconnection, and session continuity for active users.',
    durationMinutes: 10,
    userCount: 50,
    rampUpSeconds: 60,
    policies: [DEFAULT_POLICIES[0], DEFAULT_POLICIES[1]],
    steps: [
      { name: 'Stable operation', durationSeconds: 180, targetConcurrent: 50, actionsPerSession: 3, quotaUsageMB: 100, errorChance: 0.01, bandwidthVariation: false },
      { name: 'Primary peer failure', durationSeconds: 120, targetConcurrent: 50, actionsPerSession: 4, quotaUsageMB: 80, errorChance: 0.15, bandwidthVariation: true },
      { name: 'Failover to backup', durationSeconds: 120, targetConcurrent: 50, actionsPerSession: 3, quotaUsageMB: 100, errorChance: 0.05, bandwidthVariation: false },
      { name: 'Peer recovery', durationSeconds: 180, targetConcurrent: 50, actionsPerSession: 4, quotaUsageMB: 120, errorChance: 0.02, bandwidthVariation: false },
    ],
  },
  {
    name: 'handoff-test',
    description: 'Simulates users moving between access points (APs). Tests session continuity as users roam — L2 handoff, IP address preservation, and seamless QoS transition.',
    durationMinutes: 15,
    userCount: 30,
    rampUpSeconds: 60,
    policies: [DEFAULT_POLICIES[0], DEFAULT_POLICIES[1]],
    steps: [
      { name: 'Initial connection to AP-1', durationSeconds: 120, targetConcurrent: 30, actionsPerSession: 2, quotaUsageMB: 50, errorChance: 0.01, bandwidthVariation: false },
      { name: 'Roaming to AP-2', durationSeconds: 180, targetConcurrent: 30, actionsPerSession: 5, quotaUsageMB: 150, errorChance: 0.03, bandwidthVariation: true },
      { name: 'Roaming to AP-3', durationSeconds: 180, targetConcurrent: 30, actionsPerSession: 5, quotaUsageMB: 150, errorChance: 0.03, bandwidthVariation: true },
      { name: 'Roaming back to AP-1', durationSeconds: 180, targetConcurrent: 30, actionsPerSession: 5, quotaUsageMB: 150, errorChance: 0.03, bandwidthVariation: true },
      { name: 'Stable final position', durationSeconds: 180, targetConcurrent: 30, actionsPerSession: 3, quotaUsageMB: 100, errorChance: 0.01, bandwidthVariation: false },
    ],
  },
  {
    name: 'billing-test',
    description: 'Tests all charging models — volumetric, time-based, and unlimited. Verifies accurate charging records, quota tracking, and billing reconciliation.',
    durationMinutes: 30,
    userCount: 20,
    rampUpSeconds: 60,
    policies: [
      { ...DEFAULT_POLICIES[0], actions: { ...DEFAULT_POLICIES[0].actions, chargingModel: 'volumetric' as const, billingRatePerGB: 0.50 } },
      { ...DEFAULT_POLICIES[1], actions: { ...DEFAULT_POLICIES[1].actions, chargingModel: 'time-based' as const, billingRatePerGB: 0 } },
      { ...DEFAULT_POLICIES[2], actions: { ...DEFAULT_POLICIES[2].actions, chargingModel: 'unlimited' as const, billingRatePerGB: 0 } },
    ],
    steps: [
      { name: 'Volumetric billing phase', durationSeconds: 600, targetConcurrent: 20, actionsPerSession: 6, quotaUsageMB: 300, errorChance: 0.01, bandwidthVariation: true },
      { name: 'Time-based billing phase', durationSeconds: 600, targetConcurrent: 20, actionsPerSession: 6, quotaUsageMB: 400, errorChance: 0.01, bandwidthVariation: true },
      { name: 'Unlimited verification', durationSeconds: 600, targetConcurrent: 20, actionsPerSession: 6, quotaUsageMB: 500, errorChance: 0.01, bandwidthVariation: true },
    ],
  },
];

/**
 * Run a predefined scenario by name.
 * Creates sessions, runs through steps, collects statistics.
 */
export async function runScenario(
  scenarioName: string,
  engine: SimulatorEngine,
  speed: number = 1,
): Promise<ScenarioResult> {
  const scenario = SCENARIOS.find(s => s.name === scenarioName);
  if (!scenario) {
    throw new Error(`Unknown scenario: ${scenarioName}. Available: ${SCENARIOS.map(s => s.name).join(', ')}`);
  }

  const result: ScenarioResult = {
    scenarioName,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    duration: 0,
    totalSessions: 0,
    peakConcurrent: 0,
    totalDataDown: 0,
    totalDataUp: 0,
    totalCharged: 0,
    avgSessionDuration: 0,
    eventsGenerated: 0,
    errors: 0,
    details: [],
  };

  const eventCountBefore = engine.getEventCount();

  for (const step of scenario.steps) {
    const stepResult: ScenarioStepResult = {
      name: step.name,
      startedAt: new Date().toISOString(),
      completedAt: '',
      sessions: 0,
      successRate: 0,
      dataTransferred: 0,
    };

    const stepDurationMs = (step.durationSeconds * 1000) / speed;
    const sessionsToCreate = Math.max(0, step.targetConcurrent - engine.getActiveSessionCount());
    let stepErrors = 0;
    let stepSuccess = 0;
    let stepData = 0;

    // Create sessions with staggered timing
    const createPromises: Promise<void>[] = [];
    const intervalMs = sessionsToCreate > 0 
      ? Math.min(stepDurationMs / sessionsToCreate, 100 / speed)
      : 0;

    for (let i = 0; i < sessionsToCreate; i++) {
      createPromises.push(
        new Promise<void>(async (resolve) => {
          if (intervalMs > 0) {
            await delay(intervalMs);
          }
          
          try {
            const policy = scenario.policies[i % scenario.policies.length];
            const session = await engine.runFullSessionSimulation(policy, {
              quotaUsageMB: step.quotaUsageMB + Math.random() * step.quotaUsageMB * 0.5,
              updates: step.actionsPerSession,
              speed,
              shouldFail: Math.random() < step.errorChance,
              bandwidthVariation: step.bandwidthVariation,
            });
            
            if (session.state === 'TERMINATED') {
              stepSuccess++;
              stepData += session.usedBytesDown + session.usedBytesUp;
            } else {
              stepErrors++;
            }
          } catch (err) {
            stepErrors++;
          }
          resolve();
        })
      );
    }

    await Promise.all(createPromises);

    stepResult.completedAt = new Date().toISOString();
    stepResult.sessions = sessionsToCreate;
    stepResult.successRate = sessionsToCreate > 0 ? (stepSuccess / sessionsToCreate) * 100 : 100;
    stepResult.dataTransferred = stepData;
    result.details.push(stepResult);
  }

  // Finalize
  result.status = 'COMPLETED';
  result.completedAt = new Date().toISOString();
  result.duration = (new Date(result.completedAt).getTime() - new Date(result.startedAt).getTime()) / 1000;
  result.totalSessions = engine.getTotalSessionCount();
  result.eventsGenerated = engine.getEventCount() - eventCountBefore;

  // Calculate totals from all sessions
  const allSessions = engine.getAllSessions();
  result.totalDataDown = allSessions.reduce((s, ses) => s + ses.usedBytesDown, 0);
  result.totalDataUp = allSessions.reduce((s, ses) => s + ses.usedBytesUp, 0);
  result.totalCharged = allSessions.reduce((s, ses) => s + ses.chargedAmount, 0);
  result.errors = engine.getEventsSince(new Date(result.startedAt).toISOString())
    .filter(e => e.resultCode !== undefined && e.resultCode !== 2001).length;

  const terminated = allSessions.filter(s => s.state === 'TERMINATED');
  if (terminated.length > 0) {
    result.avgSessionDuration = terminated.reduce((sum, s) => {
      const end = s.terminatedAt ? new Date(s.terminatedAt).getTime() : Date.now();
      return sum + ((end - new Date(s.createdAt).getTime()) / 1000);
    }, 0) / terminated.length;
  }

  result.peakConcurrent = engine.getPeakConcurrentSince(result.startedAt);

  return result;
}

/** Get list of available scenarios */
export function getAvailableScenarios(): Array<{ name: string; description: string; durationMinutes: number; userCount: number }> {
  return SCENARIOS.map(s => ({
    name: s.name,
    description: s.description,
    durationMinutes: s.durationMinutes,
    userCount: s.userCount,
  }));
}

/** Internal helper */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
