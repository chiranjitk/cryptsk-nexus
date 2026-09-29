// ============================================================
// CRYPTSKINTELLIGENT Diameter Protocol Type Definitions
// Simulated Diameter interfaces for WiFi Offload testing
// ============================================================

// --- Core Diameter Types ---

export interface DiameterAVP {
  code: number;
  vendorId?: number;
  flags: number; // M=1, V=1, P=1 (bit flags)
  value: string | number | boolean;
}

export interface DiameterMessage {
  commandCode: number;
  applicationId: number;
  hopByHopId: number;
  endToEndId: number;
  avps: DiameterAVP[];
  timestamp: string;
  direction: 'request' | 'answer';
  originHost: string;
  originRealm: string;
  destinationHost?: string;
  destinationRealm?: string;
  sessionId?: string;
}

// --- Gy Credit-Control Types ---

export type CcRequestType = 'INITIAL_REQUEST' | 'UPDATE_REQUEST' | 'TERMINATION_REQUEST';

export interface GyRequest {
  sessionId: string;
  username: string;
  imsi: string;
  ccRequestType: CcRequestType;
  usedBytesDown: number;
  usedBytesUp: number;
  usedTime: number;
  requestedUnits?: number;
  serviceInformation?: {
    psi?: string;
    calledStationId?: string;
  };
}

export interface GyResponse {
  resultCode: number; // 2001 = SUCCESS, 4012 = CREDIT_LIMIT_REACHED, etc.
  grantedUnits: {
    totalOctets?: number;
    inputOctets?: number;
    outputOctets?: number;
    timeSeconds?: number;
  };
  finalUnit?: {
    action: 'TERMINATE' | 'REDIRECT' | 'RESTRICT_ACCESS';
    redirectAddress?: string;
  };
  volumeQuotaThreshold?: number;
  timeQuotaThreshold?: number;
  diameterMessage: DiameterMessage;
}

// --- Gx Policy Control Types ---

export interface QoSInformation {
  arp: number; // Allocation and Retention Priority
  qosClassIdentifier: number; // QCI
  maxBandwidthUL?: number;
  maxBandwidthDL?: number;
  guaranteedBitrateUL?: number;
  guaranteedBitrateDL?: number;
}

export interface GxRequest {
  sessionId: string;
  imsi: string;
  qosInformation: QoSInformation;
  ipCanType?: string;
  ratType?: string;
}

export interface GxResponse {
  resultCode: number;
  installedRules?: string[];
  qosInformation?: QoSInformation;
  diameterMessage: DiameterMessage;
}

// --- SWa EAP-AKA Authentication Types ---

export interface SwaAuthRequest {
  imsi: string;
  plmnId: string;
  apn: string;
  macAddress?: string;
  sessionId?: string;
}

export interface SwaAuthResponse {
  resultCode: number; // 2001 = SUCCESS, 5012 = AUTHENTICATION_REJECTED
  msisdn: string;
  imsi: string;
  subscriberProfile?: {
    planName: string;
    dataQuota: number;
    bandwidthUL: number;
    bandwidthDL: number;
    ipv6Enabled: boolean;
  };
  eapAkaChallenge?: {
    rand: string;
    autn: string;
    xres: string;
    ck: string;
    ik: string;
  };
  diameterMessage: DiameterMessage;
}

// --- Session Types ---

export type SessionState = 
  | 'AUTHENTICATING'
  | 'INITIALIZING'
  | 'ACTIVE'
  | 'UPDATING'
  | 'POLICY_CHANGE'
  | 'TERMINATING'
  | 'TERMINATED'
  | 'FAILED';

export interface OffloadSession {
  id: string;
  imsi: string;
  msisdn: string;
  macAddress: string;
  apn: string;
  ipAddress: string;
  ipv6Address: string;
  state: SessionState;
  
  // Gy state
  gySessionId: string;
  grantedQuotaTotal: number;
  usedBytesDown: number;
  usedBytesUp: number;
  usedTime: number;
  quotaExhausted: boolean;
  fupApplied: boolean;
  
  // Gx state
  activePolicies: string[];
  qos: QoSInformation;
  
  // Timing
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  terminatedAt?: string;
  estimatedDuration: number; // seconds
  
  // Charging
  chargedAmount: number;
  billingModel: 'volumetric' | 'time-based' | 'unlimited';
  planName: string;
  
  // Simulation metadata
  simulationSpeed: number;
  scenarioId?: string;
  
  // Events reference
  eventIds: string[];
}

// --- Peer Types ---

export type PeerState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTING' | 'FAILED';

export interface DiameterPeer {
  id: string;
  host: string;
  realm: string;
  ipAddress: string;
  port: number;
  state: PeerState;
  capabilities: {
    vendorId: number;
    firmwareRevision: number;
    authApplicationIds: number[];
    acctApplicationIds: number[];
  };
  statistics: {
    messagesSent: number;
    messagesReceived: number;
    errors: number;
    lastMessageAt: string;
    connectedAt?: string;
    disconnectedAt?: string;
  };
  watchdogInterval: number;
  createdAt: string;
}

// --- Event/Log Types ---

export type EventType = 
  | 'GY_INITIAL_REQ'
  | 'GY_INITIAL_ANS'
  | 'GY_UPDATE_REQ'
  | 'GY_UPDATE_ANS'
  | 'GY_TERMINATE_REQ'
  | 'GY_TERMINATE_ANS'
  | 'GX_RAR_REQ'
  | 'GX_RAR_ANS'
  | 'SWA_AUTH_REQ'
  | 'SWA_AUTH_ANS'
  | 'PEER_CONNECT'
  | 'PEER_DISCONNECT'
  | 'PEER_PING'
  | 'SESSION_CREATE'
  | 'SESSION_TERMINATE'
  | 'SESSION_ERROR'
  | 'SCENARIO_START'
  | 'SCENARIO_COMPLETE'
  | 'LOAD_TEST_START'
  | 'LOAD_TEST_COMPLETE'
  | 'SYSTEM';

export interface DiameterEvent {
  id: string;
  timestamp: string;
  eventType: EventType;
  sessionId?: string;
  peerId?: string;
  direction: 'outgoing' | 'incoming' | 'internal';
  commandCode: number;
  applicationId: number;
  resultCode?: number;
  message: string;
  diameterMessage?: DiameterMessage;
  metadata?: Record<string, unknown>;
}

// --- Policy Types ---

export interface OffloadPolicy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  
  // Matching criteria
  conditions: {
    plmnIds?: string[];
    apnPattern?: string;
    planNames?: string[];
    timeRange?: {
      start: string;
      end: string;
    };
    maxConcurrentSessions?: number;
  };
  
  // Actions
  actions: {
    defaultQuota: number; // bytes
    bandwidthUL: number;
    bandwidthDL: number;
    qos: QoSInformation;
    fupQuota?: number; // fair usage policy
    fupBandwidthUL?: number;
    fupBandwidthDL?: number;
    chargingModel: 'volumetric' | 'time-based' | 'unlimited';
    billingRatePerGB: number;
  };
  
  createdAt: string;
  updatedAt: string;
}

// --- Scenario Types ---

export interface ScenarioResult {
  scenarioName: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  startedAt: string;
  completedAt?: string;
  duration: number;
  totalSessions: number;
  peakConcurrent: number;
  totalDataDown: number;
  totalDataUp: number;
  totalCharged: number;
  avgSessionDuration: number;
  eventsGenerated: number;
  errors: number;
  details: ScenarioStepResult[];
}

export interface ScenarioStepResult {
  name: string;
  startedAt: string;
  completedAt: string;
  sessions: number;
  successRate: number;
  dataTransferred: number;
}

// --- Dashboard Types ---

export interface DashboardStats {
  totalSessions: number;
  activeSessions: number;
  peakConcurrentSessions: number;
  totalBandwidthDL: number;
  totalBandwidthUL: number;
  totalQuotaAllocated: number;
  totalQuotaUsed: number;
  quotaUtilizationPct: number;
  totalCharged: number;
  avgSessionDuration: number;
  eventsPerSecond: number;
  peerHealth: {
    total: number;
    connected: number;
    disconnected: number;
    failed: number;
  };
  errorRate: number;
  topAps: Array<{
    name: string;
    sessions: number;
    dataDown: number;
    dataUp: number;
  }>;
}

// --- Load Test Types ---

export interface LoadTestConfig {
  concurrentSessions: number;
  policyId?: string;
  durationSeconds: number;
  simulationSpeed: number;
  rampUpInterval: number; // ms between session starts
}

export interface LoadTestResult {
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  startedAt: string;
  completedAt?: string;
  config: LoadTestConfig;
  sessions: number;
  sessionsFailed: number;
  peakConcurrent: number;
  totalDataDown: number;
  totalDataUp: number;
  totalCharged: number;
  eventsGenerated: number;
  sessionsPerSecond: number;
}

// --- Simulator Configuration ---

export interface SimulatorConfig {
  defaultDelayMs: [number, number]; // [min, max] random delay range
  defaultQuotaMB: number;
  fupQuotaMB: number;
  fupBandwidthMBps: number;
  maxConcurrentSessions: number;
  sessionTimeoutSeconds: number;
}
