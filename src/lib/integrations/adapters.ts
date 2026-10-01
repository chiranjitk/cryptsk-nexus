// ─── Integration Provider Adapters (SERVER-ONLY) ──────────────
// Real HTTP implementations per provider:
//   • testConnection(provider, cfg) — verifies credentials against the
//     provider API (balance endpoint, account endpoint, OAuth token…)
//   • sendTest(provider, cfg, target) — delivers a test message
// Every call is timeout-guarded, secret-masked, and persisted to the
// IntegrationLog table by the API route.
//
// DO NOT import this file from client components.

import crypto from "crypto";

export interface AdapterOutcome {
  ok: boolean;
  message: string;
  latencyMs: number;
  details?: Record<string, unknown>;
}

/** Flat, resolved view of an IntegrationConfig row + provider-specific JSON */
export type FlatCfg = Record<string, string>;

/** Merge top-level columns (apiKey/apiSecret/merchantId) with config JSON keys */
export function resolveConfig(providerId: string, cfg: FlatCfg): FlatCfg {
  const flat: FlatCfg = { ...cfg };
  // Provider-specific aliases: some providers keep credentials under
  // named keys inside the config JSON rather than the generic columns.
  const aliases: Record<string, [string, string][]> = {
    stripe: [["secretKey", "apiKey"]],
    razorpay: [["keyId", "apiKey"]],
    paypal: [["clientId", "apiKey"], ["clientSecret", "apiSecret"]],
    "twilio-sms": [["accountSid", "apiKey"], ["authToken", "apiSecret"]],
    "twilio-whatsapp": [["accountSid", "apiKey"], ["authToken", "apiSecret"]],
    "smtp-generic": [["username", "apiKey"], ["password", "apiSecret"]],
  };
  for (const [from, to] of aliases[providerId] ?? []) {
    if (flat[from] && !flat[to]) flat[to] = flat[from];
  }
  return flat;
}

export function maskSecret(value?: string | null): string {
  if (!value) return "";
  const v = String(value);
  if (v.length <= 4) return "••••";
  return `••••${v.slice(-4)}`;
}

// ─── HTTP helper with hard timeout ─────────────────────────────
async function httpJson(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ status: number; ok: boolean; json: Record<string, unknown> | null; text: string; durationMs: number }> {
  const { timeoutMs = 12_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { ...rest, signal: controller.signal, cache: "no-store" });
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
    return { status: res.status, ok: res.ok, json, text: text.slice(0, 500), durationMs: Date.now() - started };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const aborted = msg.includes("aborted") || msg.includes("timeout");
    return { status: aborted ? 599 : 0, ok: false, json: null, text: aborted ? "Request timed out" : msg, durationMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

function fail(message: string, latencyMs = 0, details?: Record<string, unknown>): AdapterOutcome {
  return { ok: false, message, latencyMs, details };
}
function succeed(message: string, latencyMs: number, details?: Record<string, unknown>): AdapterOutcome {
  return { ok: true, message, latencyMs, details };
}

// ══════════════════════════════════════════════════════════════
//  AWS SigV4 (SNS + SES)
// ══════════════════════════════════════════════════════════════
function sha256Hex(data: crypto.BinaryLike): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}
function hmac(key: crypto.BinaryLike | Buffer, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

async function awsSigV4(opts: {
  service: string;
  region: string;
  method: "GET" | "POST";
  host: string;
  path: string;
  body: string;
  contentType: string;
  accessKey: string;
  secretKey: string;
  timeoutMs?: number;
}): Promise<{ status: number; text: string }> {
  const { service, region, method, host, path, body, contentType, accessKey, secretKey } = opts;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalRequest = [method, path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");

  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  const res = await httpJson(`https://${host}${path}`, {
    method,
    timeoutMs: opts.timeoutMs,
    headers: {
      "Content-Type": contentType,
      "X-Amz-Date": amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: method === "POST" ? body : undefined,
  });
  return { status: res.status, text: res.text };
}

// ══════════════════════════════════════════════════════════════
//  TEST-CONNECTION ADAPTERS — keyed by provider id
// ══════════════════════════════════════════════════════════════
type TestAdapter = (c: FlatCfg) => Promise<AdapterOutcome>;

const ADAPTERS: Record<string, TestAdapter> = {
  // ── PAYMENTS ──────────────────────────────────────────────
  razorpay: async (c) => {
    if (!c.apiKey || !c.apiSecret) return fail("Key ID and Key Secret are required");
    const r = await httpJson("https://api.razorpay.com/v1/payments?count=1", {
      headers: { Authorization: basic(c.apiKey, c.apiSecret) },
    });
    if (r.status === 401) return fail("Invalid credentials — Razorpay returned 401", r.durationMs);
    if (r.ok) return succeed("Razorpay credentials verified", r.durationMs, { account: "payments API accessible" });
    return fail(`Razorpay API error (HTTP ${r.status}): ${r.text.slice(0, 140)}`, r.durationMs);
  },

  phonepe: async (c) => {
    if (!c.clientId || !c.clientSecret) return fail("Client ID and Client Secret are required");
    const host = c.hostEnv === "uat" ? "https://api-preprod.phonepe.com/apis/identity-manager" : "https://api.phonepe.com/apis/identity-manager";
    const r = await httpJson(`${host}/v1/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: "client_credentials" }).toString(),
    });
    if (r.ok && r.json?.access_token) return succeed("PhonePe OAuth token issued — credentials valid", r.durationMs, { tokenType: r.json.token_type });
    if (r.status === 401 || r.status === 400) return fail("PhonePe rejected credentials (HTTP " + r.status + ")", r.durationMs);
    return fail(`PhonePe error (HTTP ${r.status}): ${r.text.slice(0, 140)}`, r.durationMs);
  },

  paytm: async (c) => {
    if (!c.merchantId || !c.merchantKey) return fail("MID and Merchant Key are required");
    const host = c.hostEnv === "staging" ? "https://securegw-stage.paytm.in" : "https://securegw.paytm.in";
    // Paytm requires checksum-signed calls for order APIs; validate config
    // shape + gateway reachability. Real signature validation happens on
    // first transaction through the payment-initiation service.
    const r = await httpJson(`${host}/theia/api/v1/checkout?mid=${encodeURIComponent(c.merchantId)}&orderId=probe`, { timeoutMs: 8000 });
    if (r.status === 0) return fail(`Paytm gateway unreachable: ${r.text}`, r.durationMs);
    if (c.merchantKey.length < 16) return fail("Merchant Key looks invalid — expected 16+ characters", r.durationMs);
    return succeed(`Paytm gateway reachable (HTTP ${r.status}) — config format valid`, r.durationMs, { host });
  },

  cashfree: async (c) => {
    if (!c.appId || !c.appSecret) return fail("App ID and Secret Key are required");
    const host = c.hostEnv === "test" ? "https://api-test.cashfree.com" : "https://api.cashfree.com";
    const r = await httpJson(`${host}/pg/orders?limit=1`, {
      headers: { "x-client-id": c.appId, "x-client-secret": c.appSecret, "x-api-version": c.apiVersion || "2023-08-01" },
    });
    if (r.status === 401) return fail("Cashfree rejected credentials (401)", r.durationMs);
    if (r.ok) return succeed("Cashfree credentials verified", r.durationMs);
    return fail(`Cashfree error (HTTP ${r.status}): ${r.text.slice(0, 140)}`, r.durationMs);
  },

  ccavenue: async (c) => {
    if (!c.merchantId) return fail("Merchant ID is required");
    if (!c.workingKey) return fail("Working Key is required");
    if (c.workingKey.length !== 16) return fail("Working Key must be exactly 16 characters (AES-128)", 0);
    if (!c.accessCode) return fail("Access Code is required");
    const host = c.hostEnv === "test" ? "https://test.ccavenue.com" : "https://secure.ccavenue.com";
    const r = await httpJson(`${host}/merchant/verificationServlet?merchant_id=${encodeURIComponent(c.merchantId)}&access_code=${encodeURIComponent(c.accessCode)}`, { timeoutMs: 8000 });
    if (r.status === 0) return fail(`CCAvenue unreachable: ${r.text}`, r.durationMs);
    return succeed(`CCAvenue gateway reachable (HTTP ${r.status}) — config format valid`, r.durationMs, { host });
  },

  payu: async (c) => {
    if (!c.merchantId) return fail("Merchant Key is required");
    if (!c.salt) return fail("Salt is required");
    const host = c.hostEnv === "test" ? "https://test.payu.in" : "https://info.payu.in";
    const r = await httpJson(`${host}/merchant/postservice.php?form=2`, { timeoutMs: 8000 });
    if (r.status === 0) return fail(`PayU unreachable: ${r.text}`, r.durationMs);
    return succeed(`PayU gateway reachable (HTTP ${r.status}) — config format valid`, r.durationMs, { host });
  },

  stripe: async (c) => {
    const key = c.secretKey || c.apiSecret;
    if (!key) return fail("Secret Key is required");
    const r = await httpJson("https://api.stripe.com/v1/charges?limit=1", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (r.status === 401) return fail("Invalid Stripe key (401)", r.durationMs);
    if (r.ok) return succeed("Stripe credentials verified", r.durationMs, { mode: key.startsWith("sk_live") ? "live" : "test" });
    return fail(`Stripe error (HTTP ${r.status}): ${r.text.slice(0, 140)}`, r.durationMs);
  },

  paypal: async (c) => {
    if (!c.clientId || !c.clientSecret) return fail("Client ID and Client Secret are required");
    const host = c.hostEnv === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
    const r = await httpJson(`${host}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: basic(c.clientId, c.clientSecret), "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    if (r.status === 401) return fail("PayPal rejected credentials (401)", r.durationMs);
    if (r.ok && r.json?.access_token) return succeed("PayPal OAuth verified", r.durationMs, { app: r.json.app_id });
    return fail(`PayPal error (HTTP ${r.status}): ${r.text.slice(0, 140)}`, r.durationMs);
  },

  instamojo: async (c) => {
    if (!c.apiKey || !c.apiSecret) return fail("X-Api-Key and X-Auth-Token are required");
    const host = c.hostEnv === "test" ? "https://test.instamojo.com" : "https://www.instamojo.com";
    const r = await httpJson(`${host}/api/1.1/payment-requests/?limit=1`, {
      headers: { "X-Api-Key": c.apiKey, "X-Auth-Token": c.apiSecret },
    });
    if (r.status === 401) return fail("Instamojo rejected credentials (401)", r.durationMs);
    if (r.ok) return succeed("Instamojo credentials verified", r.durationMs);
    return fail(`Instamojo error (HTTP ${r.status}): ${r.text.slice(0, 140)}`, r.durationMs);
  },

  // ── SMS ───────────────────────────────────────────────────
  msg91: async (c) => {
    if (!c.apiKey) return fail("Auth Key is required");
    const r = await httpJson(`https://control.msg91.com/api/balance.php?authkey=${encodeURIComponent(c.apiKey)}&type=4`);
    // MSG91 quirk: balance endpoint returns "0" for INVALID authkeys and a
    // positive integer for valid ones — treat 0 / non-numeric as rejection.
    const raw = r.json !== null && r.json !== undefined ? String((r.json as { balance?: number })?.balance ?? r.json) : r.text.trim();
    const balance = Number(raw);
    if (!Number.isNaN(balance) && balance > 0) {
      return succeed(`MSG91 auth valid — balance: ${balance} SMS`, r.durationMs, { balance });
    }
    if (!Number.isNaN(balance) && balance === 0) {
      return fail("MSG91 rejected the auth key (API returned balance 0 — invalid key)", r.durationMs);
    }
    return fail("MSG91 rejected auth key", r.durationMs);
  },

  "twilio-sms": async (c) => {
    if (!c.apiKey || !c.apiSecret) return fail("Account SID and Auth Token are required");
    const sid = c.apiKey;
    const r = await httpJson(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`, {
      headers: { Authorization: basic(sid, c.apiSecret) },
    });
    if (r.status === 401) return fail("Twilio rejected credentials (401)", r.durationMs);
    if (r.ok) {
      const name = (r.json as { friendly_name?: string } | null)?.friendly_name ?? sid;
      return succeed(`Twilio account verified — ${name}`, r.durationMs, { status: r.json?.status });
    }
    return fail(`Twilio error (HTTP ${r.status})`, r.durationMs);
  },

  textlocal: async (c) => {
    if (!c.apiKey) return fail("API Key is required");
    const r = await httpJson(`https://api.textlocal.in/balance/?apikey=${encodeURIComponent(c.apiKey)}`);
    const bal = r.json?.balance as { sms?: number } | undefined;
    if (r.json?.status === "success") {
      return succeed(`TextLocal auth valid — balance: ${bal?.sms ?? "?"} SMS`, r.durationMs, { balance: bal?.sms });
    }
    return fail(`TextLocal error: ${String(r.json?.errors ?? r.text).slice(0, 140)}`, r.durationMs);
  },

  vonage: async (c) => {
    if (!c.apiKey || !c.apiSecret) return fail("API Key and Secret are required");
    const r = await httpJson(`https://rest.nexmo.com/account/get-balance?api_key=${encodeURIComponent(c.apiKey)}&api_secret=${encodeURIComponent(c.apiSecret)}`);
    if (r.json?.value !== undefined) {
      return succeed(`Vonage auth valid — balance: €${r.json.value}${r.json.auto_reload ? " (auto-reload)" : ""}`, r.durationMs, { balance: r.json.value });
    }
    return fail("Vonage rejected credentials", r.durationMs);
  },

  infobip: async (c) => {
    if (!c.apiKey) return fail("API Key is required");
    if (!c.baseUrl) return fail("Base URL is required (xxxxx.api.infobip.com)");
    const r = await httpJson(`https://${c.baseUrl}/sms/1/balance`, {
      headers: { Authorization: `App ${c.apiKey}` },
    });
    if (r.json?.balance !== undefined) {
      return succeed(`Infobip auth valid — balance: ${r.json.balance}`, r.durationMs, { balance: r.json.balance, currency: r.json.currency });
    }
    return fail(`Infobip error (HTTP ${r.status}): ${r.text.slice(0, 140)}`, r.durationMs);
  },

  "aws-sns": async (c) => {
    if (!c.apiKey || !c.apiSecret) return fail("Access Key ID and Secret are required");
    if (!c.region) return fail("AWS Region is required");
    const body = "Action=GetSMSAttributes&Version=2010-03-31";
    const r = await awsSigV4({
      service: "sns", region: c.region, method: "POST", host: `sns.${c.region}.amazonaws.com`,
      path: "/", body, contentType: "application/x-www-form-urlencoded; charset=utf-8",
      accessKey: c.apiKey, secretKey: c.apiSecret,
    });
    if (r.status === 200) return succeed(`AWS SNS verified in ${c.region}`, 0);
    if (r.status === 403) return fail("AWS SigV4 rejected — check key/secret/region and sns permissions", 0);
    return fail(`AWS SNS error (HTTP ${r.status}): ${r.text.slice(0, 140)}`, 0);
  },

  // ── EMAIL ─────────────────────────────────────────────────
  "smtp-generic": async (c) => {
    if (!c.host || !c.port) return fail("SMTP host and port are required");
    if (!c.username || !c.password) return fail("Username and password are required");
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: c.host,
      port: Number(c.port),
      secure: c.encryption === "ssl",
      requireTLS: c.encryption === "tls",
      auth: { user: c.username, pass: c.password },
      connectionTimeout: 12_000,
      greetingTimeout: 12_000,
      socketTimeout: 15_000,
    });
    const started = Date.now();
    try {
      await transport.verify();
      return succeed(`SMTP ${c.host}:${c.port} connected and authenticated`, Date.now() - started);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return fail(`SMTP failed: ${msg.slice(0, 180)}`, Date.now() - started);
    } finally {
      transport.close();
    }
  },

  sendgrid: async (c) => {
    if (!c.apiKey) return fail("API Key is required");
    const r = await httpJson("https://api.sendgrid.com/v3/scopes", {
      headers: { Authorization: `Bearer ${c.apiKey}` },
    });
    if (r.status === 401) return fail("SendGrid rejected API key (401)", r.durationMs);
    if (r.ok) {
      const scopes = (r.json?.scopes as string[] | undefined) ?? [];
      const canSend = scopes.length === 0 || scopes.includes("mail.send");
      return succeed(`SendGrid verified${canSend ? " — mail.send available" : " — WARNING: mail.send scope missing"}`, r.durationMs, { scopes: scopes.slice(0, 8) });
    }
    return fail(`SendGrid error (HTTP ${r.status})`, r.durationMs);
  },

  mailgun: async (c) => {
    if (!c.apiKey) return fail("Private API Key is required");
    if (!c.domain) return fail("Sending domain is required");
    const host = c.hostEnv || "api.mailgun.net";
    const r = await httpJson(`https://${host}/v3/domains?limit=5`, {
      headers: { Authorization: basic("api", c.apiKey) },
    });
    if (r.status === 401) return fail("Mailgun rejected API key (401)", r.durationMs);
    if (r.ok) {
      const items = ((r.json?.domains as { name: string; state?: string }[] | undefined) ?? []);
      const hasDomain = items.some((d) => d.name === c.domain);
      return succeed(`Mailgun verified${hasDomain ? ` — domain ${c.domain} present` : ` — WARNING: ${c.domain} not in account domains`}`, r.durationMs, { domains: items.map((d) => d.name).slice(0, 5) });
    }
    return fail(`Mailgun error (HTTP ${r.status})`, r.durationMs);
  },

  "aws-ses": async (c) => {
    if (!c.apiKey || !c.apiSecret) return fail("Access Key ID and Secret are required");
    if (!c.region) return fail("AWS Region is required");
    const r = await awsSigV4({
      service: "ses", region: c.region, method: "GET", host: `email.${c.region}.amazonaws.com`,
      path: "/v2/account", body: "", contentType: "application/json",
      accessKey: c.apiKey, secretKey: c.apiSecret,
    });
    if (r.status === 200) {
      let extra = "";
      try { const j = JSON.parse(r.text) as { Sandbox?: boolean; SendingEnabled?: boolean }; extra = j.Sandbox ? " (sandbox mode)" : " (production)"; } catch { /* noop */ }
      return succeed(`AWS SES verified in ${c.region}${extra}`, 0);
    }
    if (r.status === 403) return fail("AWS SigV4 rejected — check key/secret/region and ses permissions", 0);
    return fail(`AWS SES error (HTTP ${r.status}): ${r.text.slice(0, 140)}`, 0);
  },

  resend: async (c) => {
    if (!c.apiKey) return fail("API Key is required");
    const r = await httpJson("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${c.apiKey}` },
    });
    if (r.status === 401 || r.status === 403) return fail("Resend rejected API key", r.durationMs);
    if (r.ok) {
      const domains = ((r.json?.data as { name: string }[] | undefined) ?? []).map((d) => d.name);
      return succeed("Resend verified", r.durationMs, { domains: domains.slice(0, 5) });
    }
    return fail(`Resend error (HTTP ${r.status})`, r.durationMs);
  },

  postmark: async (c) => {
    if (!c.apiKey) return fail("Server API Token is required");
    const r = await httpJson("https://api.postmarkapp.com/server", {
      headers: { "X-Postmark-Server-Token": c.apiKey, Accept: "application/json" },
    });
    if (r.status === 401 || r.status === 422) return fail("Postmark rejected token", r.durationMs);
    if (r.ok) {
      const name = (r.json?.Name as string | undefined) ?? "server";
      return succeed(`Postmark verified — server "${name}"`, r.durationMs);
    }
    return fail(`Postmark error (HTTP ${r.status})`, r.durationMs);
  },

  // ── WHATSAPP ──────────────────────────────────────────────
  "whatsapp-cloud": async (c) => {
    if (!c.apiKey) return fail("Permanent Access Token is required");
    if (!c.phoneNumberId) return fail("Phone Number ID is required");
    const v = c.graphVersion || "v21.0";
    const r = await httpJson(`https://graph.facebook.com/${v}/${encodeURIComponent(c.phoneNumberId)}?access_token=${encodeURIComponent(c.apiKey)}`);
    if (r.status === 401) return fail("Meta token invalid or expired (401)", r.durationMs);
    if (r.ok) {
      const j = r.json as { verified_name?: string; display_phone_number?: string } | null;
      return succeed(`WhatsApp number verified — ${j?.verified_name ?? c.phoneNumberId} (${j?.display_phone_number ?? ""})`, r.durationMs, { verifiedName: j?.verified_name });
    }
    return fail(`Graph API error (HTTP ${r.status}): ${r.text.slice(0, 140)}`, r.durationMs);
  },

  gupshup: async (c) => {
    if (!c.apiKey) return fail("API Key is required");
    if (!c.appName) return fail("App Name is required");
    const r = await httpJson("https://api.gupshup.io/wa/api/v1/app/list", {
      headers: { apikey: c.apiKey },
    });
    if (r.status === 401) return fail("Gupshup rejected API key (401)", r.durationMs);
    if (r.ok) {
      const apps = r.json?.apps;
      const list = Array.isArray(apps) ? (apps as { name?: string }[]).map((a) => a.name) : [];
      return succeed(list.includes(c.appName)
        ? `Gupshup verified — app "${c.appName}" present`
        : `Gupshup key valid — WARNING: app "${c.appName}" not found`, r.durationMs, { apps: list.slice(0, 6) });
    }
    return fail(`Gupshup error (HTTP ${r.status})`, r.durationMs);
  },

  // ── PUSH ──────────────────────────────────────────────────
  fcm: async (c) => {
    // HTTP v1 path: mint an OAuth token from the service account (RSA JWT)
    if (c.serviceAccountJson) {
      const started = Date.now();
      try {
        const sa = JSON.parse(c.serviceAccountJson) as { client_email?: string; private_key?: string; project_id?: string };
        if (!sa.client_email || !sa.private_key) return fail("Service account JSON missing client_email/private_key", Date.now() - started);
        const scope = "https://www.googleapis.com/auth/firebase.messaging";
        const jwt = crypto.sign("RSA-SHA256", Buffer.from([
          `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9`,
          Buffer.from(JSON.stringify({ iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3300 })).toString("base64url"),
        ].join(".")), crypto.createPrivateKey(sa.private_key)).toString("base64url");
        const r = await httpJson("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3300 })).toString("base64url")}.${jwt}` }).toString(),
        });
        if (r.ok && r.json?.access_token) return succeed("FCM HTTP v1 verified — OAuth token minted from service account", Date.now() - started);
        return fail(`FCM v1 auth failed (HTTP ${r.status}): ${r.text.slice(0, 140)}`, Date.now() - started);
      } catch (err) {
        return fail(`Service account JSON invalid: ${(err instanceof Error ? err.message : String(err)).slice(0, 120)}`, Date.now() - started);
      }
    }
    if (!c.serverKey) return fail("Legacy Server Key or Service Account JSON is required");
    const r = await httpJson("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: { Authorization: `key=${c.serverKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: "/topics/_probe_", dry_run: true }),
    });
    if (r.status === 401) return fail("FCM server key rejected (401)", r.durationMs);
    if (r.status === 200) return succeed("FCM legacy key verified (dry-run)", r.durationMs);
    return fail(`FCM error (HTTP ${r.status}): ${r.text.slice(0, 140)}`, r.durationMs);
  },

  onesignal: async (c) => {
    if (!c.appId) return fail("App ID is required");
    if (!c.apiKey) return fail("REST API Key is required");
    const r = await httpJson(`https://onesignal.com/api/v1/apps/${encodeURIComponent(c.appId)}`, {
      headers: { Authorization: `Basic ${c.apiKey}` },
    });
    if (r.status === 403 || r.status === 404) return fail("OneSignal app/key mismatch or missing", r.durationMs);
    if (r.ok) {
      const name = (r.json?.name as string | undefined) ?? c.appId;
      return succeed(`OneSignal verified — app "${name}"`, r.durationMs);
    }
    return fail(`OneSignal error (HTTP ${r.status})`, r.durationMs);
  },
};

// ══════════════════════════════════════════════════════════════
//  SEND-TEST ADAPTERS — keyed by provider id
// ══════════════════════════════════════════════════════════════
export interface SendParams { to: string; message: string; subject?: string }

type SendAdapter = (c: FlatCfg, p: SendParams) => Promise<AdapterOutcome>;

const SENDERS: Record<string, SendAdapter> = {
  msg91: async (c, p) => {
    const body: Record<string, unknown> = {
      sender: c.senderId || "SOCKET",
      route: c.route || "1",
      country: "91",
      sms: [{ message: p.message, to: [p.to.replace(/^\+/, "")] }],
    };
    if (c.templateId) body.template_id = c.templateId;
    const r = await httpJson("https://control.msg91.com/api/v5/sms/", {
      method: "POST",
      headers: { authkey: c.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) return succeed(`MSG91 accepted — request id ${String(r.json?.request_id ?? "?").slice(0, 20)}`, r.durationMs, { requestId: r.json?.request_id });
    return fail(`MSG91 send failed (HTTP ${r.status}): ${r.text.slice(0, 140)}`, r.durationMs);
  },

  "twilio-sms": async (c, p) => {
    const r = await httpJson(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.apiKey)}/Messages.json`, {
      method: "POST",
      headers: { Authorization: basic(c.apiKey, c.apiSecret), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: p.to, From: c.fromNumber ?? "", Body: p.message }).toString(),
    });
    if (r.ok) return succeed(`Twilio accepted — SID ${String(r.json?.sid ?? "?")}`, r.durationMs, { sid: r.json?.sid, status: r.json?.status });
    return fail(`Twilio send failed (HTTP ${r.status}): ${r.text.slice(0, 160)}`, r.durationMs);
  },

  textlocal: async (c, p) => {
    const r = await httpJson(`https://api.textlocal.in/send/?apikey=${encodeURIComponent(c.apiKey)}&numbers=${encodeURIComponent(p.to.replace(/^\+/, ""))}&sender=${encodeURIComponent(c.senderId ?? "TXTLCL")}&message=${encodeURIComponent(p.message)}`);
    if (r.json?.status === "success") return succeed("TextLocal accepted message", r.durationMs, { batchId: r.json.batch_id });
    return fail(`TextLocal send failed: ${String(r.json?.errors ?? r.text).slice(0, 160)}`, r.durationMs);
  },

  vonage: async (c, p) => {
    const r = await httpJson("https://rest.nexmo.com/sms/json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ api_key: c.apiKey ?? "", api_secret: c.apiSecret ?? "", to: p.to.replace(/^\+/, ""), from: c.fromBrand ?? "Cryptsk", text: p.message }).toString(),
    });
    const first = (r.json?.messages as { status?: string; "message-id"?: string; "error-text"?: string }[] | undefined)?.[0];
    if (first?.status === "0") return succeed(`Vonage accepted — ${first["message-id"]}`, r.durationMs);
    return fail(`Vonage send failed: ${first?.["error-text"] ?? r.text.slice(0, 140)}`, r.durationMs);
  },

  infobip: async (c, p) => {
    const r = await httpJson(`https://${c.baseUrl}/sms/2/text/advanced`, {
      method: "POST",
      headers: { Authorization: `App ${c.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ from: c.senderId ?? "InfoSMS", destinations: [{ to: p.to }], text: p.message }] }),
    });
    if (r.ok) {
      const msgId = ((r.json?.messages as { messageId?: string }[] | undefined) ?? [])[0]?.messageId;
      return succeed(`Infobip accepted — ${msgId ?? "queued"}`, r.durationMs);
    }
    return fail(`Infobip send failed (HTTP ${r.status}): ${r.text.slice(0, 140)}`, r.durationMs);
  },

  "aws-sns": async (c, p) => {
    const params = new URLSearchParams({ Action: "Publish", Version: "2010-03-31", PhoneNumber: p.to, Message: p.message });
    if (c.senderId) params.set("MessageAttributes.entry.1.Name", "AWS.SNS.SMS.SenderID");
    const r = await awsSigV4({
      service: "sns", region: c.region ?? "ap-south-1", method: "POST", host: `sns.${c.region ?? "ap-south-1"}.amazonaws.com`,
      path: "/", body: params.toString(), contentType: "application/x-www-form-urlencoded; charset=utf-8",
      accessKey: c.apiKey ?? "", secretKey: c.apiSecret ?? "",
    });
    if (r.status === 200) return succeed("AWS SNS published", 0);
    return fail(`AWS SNS publish failed (HTTP ${r.status}): ${r.text.slice(0, 140)}`, 0);
  },

  "smtp-generic": async (c, p) => {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: c.host, port: Number(c.port), secure: c.encryption === "ssl", requireTLS: c.encryption === "tls",
      auth: { user: c.username, pass: c.password }, connectionTimeout: 12_000,
    });
    const started = Date.now();
    try {
      const info = await transport.sendMail({
        from: `"${c.fromName || "Cryptsk Billing"}" <${c.fromEmail || c.username}>`,
        to: p.to,
        subject: p.subject || "Test email from CryptSK Nexus",
        text: p.message,
      });
      return succeed(`Email sent — ${info.messageId}`, Date.now() - started);
    } catch (err) {
      return fail(`SMTP send failed: ${(err instanceof Error ? err.message : String(err)).slice(0, 180)}`, Date.now() - started);
    } finally { transport.close(); }
  },

  sendgrid: async (c, p) => {
    const r = await httpJson("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${c.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: p.to }] }],
        from: { email: c.fromEmail, name: c.fromName || undefined },
        subject: p.subject || "Test email from CryptSK Nexus",
        content: [{ type: "text/plain", value: p.message }],
      }),
    });
    if (r.status === 202) return succeed("SendGrid accepted (202 queued)", r.durationMs);
    return fail(`SendGrid send failed (HTTP ${r.status}): ${r.text.slice(0, 160)}`, r.durationMs);
  },

  mailgun: async (c, p) => {
    const host = c.hostEnv || "api.mailgun.net";
    const r = await httpJson(`https://${host}/v3/${encodeURIComponent(c.domain)}/messages`, {
      method: "POST",
      headers: { Authorization: basic("api", c.apiKey), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ from: c.fromEmail ?? "", to: p.to, subject: p.subject || "Test email from CryptSK Nexus", text: p.message }).toString(),
    });
    if (r.ok) return succeed(`Mailgun accepted — ${String(r.json?.id ?? "queued")}`, r.durationMs);
    return fail(`Mailgun send failed (HTTP ${r.status}): ${r.text.slice(0, 160)}`, r.durationMs);
  },

  "aws-ses": async (c, p) => {
    const body = JSON.stringify({
      FromEmailAddress: c.fromEmail,
      Destination: { ToAddresses: [p.to] },
      Content: { Simple: { Subject: { Data: p.subject || "Test email from CryptSK Nexus" }, Body: { Text: { Data: p.message } } } },
    });
    const r = await awsSigV4({
      service: "ses", region: c.region ?? "ap-south-1", method: "POST", host: `email.${c.region ?? "ap-south-1"}.amazonaws.com`,
      path: "/v2/outbound-emails", body, contentType: "application/json",
      accessKey: c.apiKey ?? "", secretKey: c.apiSecret ?? "",
    });
    if (r.status === 200) return succeed("AWS SES accepted", 0);
    return fail(`AWS SES send failed (HTTP ${r.status}): ${r.text.slice(0, 160)}`, 0);
  },

  resend: async (c, p) => {
    const r = await httpJson("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${c.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: c.fromName ? `${c.fromName} <${c.fromEmail}>` : c.fromEmail, to: [p.to], subject: p.subject || "Test email from CryptSK Nexus", text: p.message }),
    });
    if (r.ok) return succeed(`Resend accepted — ${String(r.json?.id ?? "queued")}`, r.durationMs);
    return fail(`Resend send failed (HTTP ${r.status}): ${r.text.slice(0, 160)}`, r.durationMs);
  },

  postmark: async (c, p) => {
    const r = await httpJson("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: { "X-Postmark-Server-Token": c.apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ From: c.fromEmail, To: p.to, Subject: p.subject || "Test email from CryptSK Nexus", TextBody: p.message, MessageStream: c.messageStream || "outbound" }),
    });
    if (r.ok) return succeed(`Postmark accepted — ${String(r.json?.MessageID ?? "queued")}`, r.durationMs);
    return fail(`Postmark send failed (HTTP ${r.status}): ${r.text.slice(0, 160)}`, r.durationMs);
  },

  "whatsapp-cloud": async (c, p) => {
    const v = c.graphVersion || "v21.0";
    const r = await httpJson(`https://graph.facebook.com/${v}/${encodeURIComponent(c.phoneNumberId ?? "")}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: p.to.replace(/^\+/, ""), type: "text",
        text: { preview_url: false, body: p.message },
      }),
    });
    if (r.ok) return succeed(`WhatsApp message queued — ${String((r.json?.messages as { id?: string }[] | undefined)?.[0]?.id ?? "ok")}`, r.durationMs);
    return fail(`WhatsApp send failed (HTTP ${r.status}): ${r.text.slice(0, 180)}`, r.durationMs);
  },

  "twilio-whatsapp": async (c, p) => {
    const r = await httpJson(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.apiKey)}/Messages.json`, {
      method: "POST",
      headers: { Authorization: basic(c.apiKey, c.apiSecret), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: `whatsapp:${p.to}`, From: `whatsapp:${c.fromNumber ?? ""}`, Body: p.message }).toString(),
    });
    if (r.ok) return succeed(`WhatsApp accepted — SID ${String(r.json?.sid ?? "?")}`, r.durationMs);
    return fail(`Twilio WhatsApp send failed (HTTP ${r.status}): ${r.text.slice(0, 160)}`, r.durationMs);
  },

  gupshup: async (c, p) => {
    const r = await httpJson("https://api.gupshup.io/wa/api/v1/msg", {
      method: "POST",
      headers: { apikey: c.apiKey, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ channel: "whatsapp", source: c.sourceNumber ?? "", destination: p.to.replace(/^\+/, ""), "src.name": c.appName ?? "", message: JSON.stringify({ type: "text", text: p.message }) }).toString(),
    });
    if (r.ok) return succeed(`Gupshup accepted — ${String(r.json?.messageId ?? "ok")}`, r.durationMs);
    return fail(`Gupshup send failed (HTTP ${r.status}): ${r.text.slice(0, 160)}`, r.durationMs);
  },

  fcm: async (c, p) => {
    // v1 with service account: send to topic "test" (admin can narrow to device tokens)
    if (c.serviceAccountJson && c.projectId) {
      try {
        const sa = JSON.parse(c.serviceAccountJson) as { client_email?: string; private_key?: string };
        const iat = Math.floor(Date.now() / 1000);
        const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
        const head = b64({ alg: "RS256", typ: "JWT" });
        const payload = b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3300 });
        const sig = crypto.sign("RSA-SHA256", Buffer.from(`${head}.${payload}`), crypto.createPrivateKey(sa.private_key)).toString("base64url");
        const tok = await httpJson("https://oauth2.googleapis.com/token", {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${payload}.${sig}` }).toString(),
        });
        if (!tok.ok) return fail(`FCM v1 token failed (HTTP ${tok.status})`, tok.durationMs);
        const r = await httpJson(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(c.projectId)}/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${tok.json?.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ message: { topic: "test", notification: { title: p.subject || "CryptSK Nexus", body: p.message } } }),
        });
        if (r.ok) return succeed("FCM v1 message accepted", r.durationMs);
        return fail(`FCM v1 send failed (HTTP ${r.status}): ${r.text.slice(0, 160)}`, r.durationMs);
      } catch (err) {
        return fail(`FCM v1 error: ${(err instanceof Error ? err.message : String(err)).slice(0, 140)}`, 0);
      }
    }
    if (!c.serverKey) return fail("Legacy Server Key or Service Account JSON is required");
    const r = await httpJson("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: { Authorization: `key=${c.serverKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: "/topics/test", notification: { title: p.subject || "CryptSK Nexus", body: p.message } }),
    });
    if (r.status === 200) return succeed(`FCM accepted — msg id ${String(r.json?.message_id ?? "ok")}`, r.durationMs);
    return fail(`FCM send failed (HTTP ${r.status}): ${r.text.slice(0, 160)}`, r.durationMs);
  },

  onesignal: async (c, p) => {
    const r = await httpJson("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: { Authorization: `Basic ${c.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: c.appId, included_segments: ["Subscribed Users"], contents: { en: p.message }, headings: { en: p.subject || "CryptSK Nexus" }, is_any_web: true }),
    });
    if (r.ok) return succeed(`OneSignal accepted — ${String(r.json?.id ?? "ok")}`, r.durationMs);
    return fail(`OneSignal send failed (HTTP ${r.status}): ${r.text.slice(0, 160)}`, r.durationMs);
  },
};

// ─── Aliases (self-references must run after declaration) ─────
ADAPTERS["twilio-whatsapp"] = ADAPTERS["twilio-sms"];

// ─── Public entry points ──────────────────────────────────────
export async function testConnection(providerId: string, cfg: FlatCfg): Promise<AdapterOutcome> {
  const adapter = ADAPTERS[providerId];
  if (!adapter) {
    return fail(`No test adapter registered for provider "${providerId}" — config saved but unverified`, 0);
  }
  try {
    return await adapter(resolveConfig(providerId, cfg));
  } catch (err) {
    return fail(`Adapter crashed: ${(err instanceof Error ? err.message : String(err)).slice(0, 160)}`, 0);
  }
}

export async function sendTest(providerId: string, cfg: FlatCfg, params: SendParams): Promise<AdapterOutcome> {
  const sender = SENDERS[providerId];
  if (!sender) return fail(`Provider "${providerId}" does not support test-send`, 0);
  if (!params.to?.trim()) return fail("Recipient (to) is required");
  try {
    return await sender(resolveConfig(providerId, cfg), params);
  } catch (err) {
    return fail(`Sender crashed: ${(err instanceof Error ? err.message : String(err)).slice(0, 160)}`, 0);
  }
}

export function providerSupportsSend(providerId: string): boolean {
  return Boolean(SENDERS[providerId]);
}
