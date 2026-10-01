// ─── Client-safe integration types ────────────────────────────
// Re-exports the pure-metadata types from provider-meta.ts and
// defines UI-facing result types (mirrors adapters.AdapterOutcome
// without importing the server-only module).

export type {
  ProviderKind,
  ProviderField,
  ProviderMeta,
} from "@/lib/integrations/provider-meta";

export { PROVIDERS, getProvider, providersByKind, KIND_META } from "@/lib/integrations/provider-meta";

export interface AdapterTestResult {
  ok: boolean;
  message: string;
  latencyMs: number;
  details?: Record<string, unknown>;
  testedAt?: string;
  sentAt?: string;
}

export interface IntegrationConfigRow {
  id: string;
  type: string;
  name: string;
  provider: string;
  apiKey: string;
  apiSecret: string;
  merchantId: string;
  environment: string;
  enabled: boolean;
  config: string | null;
  costPerRequest: number;
  monthlyBudget: number;
  monthlyCost: number;
  ipAllowlist: string;
  apiCalls: number;
  estimatedCost: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface WebhookRow {
  id: string;
  url: string;
  events: string | null;
  secret: string;
  enabled: boolean;
  lastDeliveryAt: string | null;
  successCount: number;
  failureCount: number;
  createdAt: string;
  deliveries?: WebhookDeliveryRow[];
}

export interface WebhookDeliveryRow {
  id: string;
  webhookId: string;
  event: string;
  payload: string | null;
  statusCode: number;
  success: boolean;
  duration: number;
  errorMessage: string;
  createdAt: string;
}

export interface IntegrationLogRow {
  id: string;
  integrationId: string;
  method: string;
  url: string;
  statusCode: number;
  status: string;
  requestSummary: string;
  responseSummary: string;
  errorMessage: string;
  durationMs: number;
  createdAt: string;
  integration?: { name: string; provider: string; type: string } | null;
}
