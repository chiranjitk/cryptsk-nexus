// ─── Integration Provider Catalog ─────────────────────────────
// CLIENT-SAFE: pure metadata, no server imports. Rendered by the
// INTEGRATIONS pages to drive dynamic credential forms, capability
// badges, and documentation links.
//
// The server-side execution layer lives in src/lib/integrations/
// adapters.ts — every provider below MUST have a matching entry in
// ADAPTERS (testConnection) and SENDERS (sendTest) keyed by id.

export type ProviderKind = "payment" | "sms" | "email" | "whatsapp" | "push";

export interface ProviderField {
  /** Key inside the IntegrationConfig.config JSON blob (or a top-level alias) */
  key: string;
  label: string;
  type: "text" | "password" | "number" | "select" | "textarea";
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: { value: string; label: string }[];
  /** Persist into a named IntegrationConfig column instead of config JSON */
  topLevel?: "apiKey" | "apiSecret" | "merchantId";
  /** Default value used when opening a fresh config dialog */
  defaultValue?: string;
}

export interface ProviderMeta {
  id: string;              // stable adapter id, e.g. "razorpay"
  name: string;            // display name
  kind: ProviderKind;
  /** Short badge shown in the logo chip */
  badge: string;
  /** Tailwind classes for the logo chip */
  color: string;
  description: string;
  docsUrl: string;
  capabilities: string[];
  /** Credential fields the provider needs */
  fields: ProviderField[];
  /** Has a REAL server-side test-connection implementation (all catalog providers do) */
  testable?: true;
  /** Supports sendTest (SMS/email/whatsapp/push only) */
  sendable: boolean;
  /** Extra notes shown in the config dialog (webhook URLs to register, etc.) */
  setupNotes?: string[];
}

// ─── Shared field factories ──────────────────────────────────
const F = {
  apiKey: (label = "API Key", helpText?: string, opts: Partial<ProviderField> = {}): ProviderField => ({
    key: "apiKey", label, type: "password", required: true, topLevel: "apiKey" as const, helpText, ...opts,
  }),
  apiSecret: (label = "API Secret", helpText?: string, opts: Partial<ProviderField> = {}): ProviderField => ({
    key: "apiSecret", label, type: "password", required: true, topLevel: "apiSecret" as const, helpText, ...opts,
  }),
  merchantId: (label: string, helpText?: string): ProviderField => ({
    key: "merchantId", label, type: "text", required: true, topLevel: "merchantId" as const, helpText,
  }),
  text: (key: string, label: string, opts: Partial<ProviderField> = {}): ProviderField => ({
    key, label, type: "text", required: false, ...opts,
  }),
  secret: (key: string, label: string, opts: Partial<ProviderField> = {}): ProviderField => ({
    key, label, type: "password", required: false, ...opts,
  }),
  numberField: (key: string, label: string, opts: Partial<ProviderField> = {}): ProviderField => ({
    key, label, type: "number", required: false, ...opts,
  }),
  select: (key: string, label: string, options: string[] | { value: string; label: string }[], opts: Partial<ProviderField> = {}): ProviderField => ({
    key,
    label,
    type: "select",
    required: false,
    options: typeof options[0] === "string" ? (options as string[]).map((o) => ({ value: o, label: o })) : (options as { value: string; label: string }[]),
    ...opts,
  }),
};

// ══════════════════════════════════════════════════════════════
//  PAYMENT GATEWAYS (9)
// ══════════════════════════════════════════════════════════════
const PAYMENT_PROVIDERS: ProviderMeta[] = [
  {
    id: "razorpay",
    name: "Razorpay",
    kind: "payment",
    badge: "RZ",
    color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    description: "India's leading full-stack payments platform — UPI, cards, netbanking, wallets.",
    docsUrl: "https://razorpay.com/docs/api/",
    capabilities: ["UPI", "Cards", "Netbanking", "Subscriptions", "Payment Links"],
    fields: [
      F.apiKey("Key ID", "Format: rzp_test_xxx / rzp_live_xxx"),
      F.apiSecret("Key Secret"),
      F.text("webhookSecret", "Webhook Secret", { helpText: "Set the same secret in Dashboard → Settings → Webhooks" }),
    ],
    sendable: false,
    setupNotes: ["Register this webhook endpoint in your Razorpay Dashboard: /api/integrations/webhooks/razorpay"],
  },
  {
    id: "phonepe",
    name: "PhonePe",
    kind: "payment",
    badge: "PP",
    color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    description: "India's largest UPI app — payments via UPI intent, collect and QR.",
    docsUrl: "https://developer.phonepe.com/",
    capabilities: ["UPI", "Collect", "Intent", "QR", "Refunds"],
    fields: [
      F.text("clientId", "Client ID", { required: true }),
      F.secret("clientSecret", "Client Secret", { required: true }),
      F.select("hostEnv", "Environment", [
        { value: "prod", label: "Production (api.phonepe.com)" },
        { value: "uat", label: "UAT / Sandbox (api-preprod.phonepe.com)" },
      ], { defaultValue: "prod" }),
      F.merchantId("Merchant ID"),
    ],
    sendable: false,
  },
  {
    id: "paytm",
    name: "Paytm",
    kind: "payment",
    badge: "₹P",
    color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
    description: "Paytm Payments — UPI, cards, wallets via All-in-One SDK.",
    docsUrl: "https://developer.paytm.com/docs/api/",
    capabilities: ["UPI", "Cards", "Wallet", "EMI"],
    fields: [
      F.merchantId("MID (Merchant ID)"),
      F.secret("merchantKey", "Merchant Key", { required: true }),
      F.select("industryType", "Industry Type", ["Retail"], { defaultValue: "Retail" }),
      F.select("hostEnv", "Environment", [
        { value: "prod", label: "Production (securegw.paytm.in)" },
        { value: "staging", label: "Staging (securegw-stage.paytm.in)" },
      ], { defaultValue: "prod" }),
    ],
    sendable: false,
  },
  {
    id: "cashfree",
    name: "Cashfree",
    kind: "payment",
    badge: "CF",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    description: "Payments and payouts API — UPI, cards, and instant settlements.",
    docsUrl: "https://docs.cashfree.com/",
    capabilities: ["UPI", "Cards", "Payouts", "Subscriptions", "Settlements"],
    fields: [
      F.text("appId", "App ID", { required: true }),
      F.secret("appSecret", "Secret Key", { required: true, helpText: "x-client-secret header" }),
      F.select("hostEnv", "Environment", [
        { value: "prod", label: "Production (api.cashfree.com)" },
        { value: "test", label: "Sandbox (api-test.cashfree.com)" },
      ], { defaultValue: "prod" }),
      F.text("apiVersion", "API Version", { placeholder: "2023-08-01", defaultValue: "2023-08-01" }),
    ],
    sendable: false,
  },
  {
    id: "ccavenue",
    name: "CCAvenue",
    kind: "payment",
    badge: "CCA",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    description: "South Asia's oldest gateway — 200+ payment options, multi-currency.",
    docsUrl: "https://developer.ccavenue.com/",
    capabilities: ["Cards", "Netbanking", "Multi-currency", "EMI"],
    fields: [
      F.merchantId("Merchant ID"),
      F.secret("workingKey", "Working Key", { required: true, helpText: "16-character AES working key" }),
      F.text("accessCode", "Access Code", { required: true }),
      F.select("hostEnv", "Environment", [
        { value: "prod", label: "Production (secure.ccavenue.com)" },
        { value: "test", label: "Test (test.ccavenue.com)" },
      ], { defaultValue: "prod" }),
    ],
    sendable: false,
  },
  {
    id: "payu",
    name: "PayU",
    kind: "payment",
    badge: "PU",
    color: "bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300",
    description: "Global payment gateway with strong India presence — cards, UPI, BNPL.",
    docsUrl: "https://docs.payu.in/",
    capabilities: ["Cards", "UPI", "BNPL", "Vault", "Bundles"],
    fields: [
      F.merchantId("Merchant Key", "PayU merchant key (mint)"),
      F.secret("salt", "Salt", { required: true, helpText: "Salt from dashboard, used for SHA-512 hash" }),
      F.select("hostEnv", "Environment", [
        { value: "prod", label: "Production (info.payu.in)" },
        { value: "test", label: "Test (test.payu.in)" },
      ], { defaultValue: "prod" }),
    ],
    sendable: false,
  },
  {
    id: "stripe",
    name: "Stripe",
    kind: "payment",
    badge: "S",
    color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    description: "Global payments for internet businesses — 135+ currencies.",
    docsUrl: "https://stripe.com/docs/api",
    capabilities: ["Cards", "Wallets", "Billing", "Connect", "Radar"],
    fields: [
      F.secret("secretKey", "Secret Key", { required: true, helpText: "sk_test_… / sk_live_… (stored in apiSecret slot)" }),
      F.text("publishableKey", "Publishable Key", { placeholder: "pk_test_…" }),
      F.secret("webhookSecret", "Webhook Signing Secret", { placeholder: "whsec_…" }),
    ],
    sendable: false,
  },
  {
    id: "paypal",
    name: "PayPal",
    kind: "payment",
    badge: "PPa",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    description: "Cross-border wallet payments in 200+ markets.",
    docsUrl: "https://developer.paypal.com/api/rest/",
    capabilities: ["Wallet", "Subscriptions", "Payouts", "Multi-currency"],
    fields: [
      F.text("clientId", "Client ID", { required: true, topLevel: "apiKey" }),
      F.secret("clientSecret", "Client Secret", { required: true, topLevel: "apiSecret" }),
      F.select("hostEnv", "Environment", [
        { value: "prod", label: "Live (api-m.paypal.com)" },
        { value: "sandbox", label: "Sandbox (api-m.sandbox.paypal.com)" },
      ], { defaultValue: "prod" }),
    ],
    sendable: false,
  },
  {
    id: "instamojo",
    name: "Instamojo",
    kind: "payment",
    badge: "IM",
    color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    description: "India SMB payments — payment links, onboarding-light.",
    docsUrl: "https://docs.instamojo.com/",
    capabilities: ["Payment Links", "UPI", "Cards", "Marketplace"],
    fields: [
      F.apiKey("X-Api-Key"),
      F.apiSecret("X-Auth-Token"),
      F.select("hostEnv", "Environment", [
        { value: "prod", label: "Live (www.instamojo.com)" },
        { value: "test", label: "Test (test.instamojo.com)" },
      ], { defaultValue: "prod" }),
    ],
    sendable: false,
  },
];

// ══════════════════════════════════════════════════════════════
//  SMS GATEWAYS (6)
// ══════════════════════════════════════════════════════════════
const SMS_PROVIDERS: ProviderMeta[] = [
  {
    id: "msg91",
    name: "MSG91",
    kind: "sms",
    badge: "91",
    color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    description: "Indian OTP/SMS leader — DLT compliant, transactional + promotional routes.",
    docsUrl: "https://docs.msg91.com/",
    capabilities: ["OTP", "DLT Templates", "Flows", "Balance API"],
    fields: [
      F.apiKey("Auth Key", "From MSG91 Dashboard → Settings → API"),
      F.text("senderId", "Sender ID", { required: true, placeholder: "CRYPTK", helpText: "6-character DLT-approved sender" }),
      F.select("route", "Route", [
        { value: "1", label: "1 — Transactional (DLT)" },
        { value: "4", label: "4 — Promotional" },
      ], { defaultValue: "1" }),
      F.text("templateId", "Default DLT Template ID", { helpText: "Required for transactional SMS in India" }),
    ],
    sendable: true,
  },
  {
    id: "twilio-sms",
    name: "Twilio SMS",
    kind: "sms",
    badge: "TW",
    color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    description: "Global messaging API — delivery to 180+ countries.",
    docsUrl: "https://www.twilio.com/docs/sms",
    capabilities: ["Global SMS", "MMS", "Short Codes", "Status Callbacks"],
    fields: [
      F.text("accountSid", "Account SID", { required: true, topLevel: "apiKey", placeholder: "AC…" }),
      F.apiSecret("Auth Token"),
      F.text("fromNumber", "From Number", { required: true, placeholder: "+1415…", helpText: "Twilio-purchased or verified number" }),
    ],
    sendable: true,
  },
  {
    id: "textlocal",
    name: "TextLocal",
    kind: "sms",
    badge: "TL",
    color: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    description: "India/UK bulk SMS with delivery reports and scheduler.",
    docsUrl: "https://api.textlocal.in/docs/",
    capabilities: ["Bulk SMS", "Delivery Reports", "Balance API"],
    fields: [
      F.apiKey("API Key", "hash from Settings → API Keys"),
      F.text("senderId", "Sender Name", { required: true, placeholder: "TXTLCL" }),
    ],
    sendable: true,
  },
  {
    id: "vonage",
    name: "Vonage (Nexmo)",
    kind: "sms",
    badge: "VX",
    color: "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
    description: "Global communications APIs — reliable A2P messaging.",
    docsUrl: "https://developer.vonage.com/messaging/sms/overview",
    capabilities: ["Global SMS", "Delivery Receipts", "Verify API"],
    fields: [
      F.apiKey("API Key", "8-character key"),
      F.apiSecret("API Secret"),
      F.text("fromBrand", "From / Brand", { required: true, placeholder: "Cryptsk" }),
    ],
    sendable: true,
  },
  {
    id: "infobip",
    name: "Infobip",
    kind: "sms",
    badge: "IB",
    color: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
    description: "Omnichannel CPaaS with strong MENA/APAC coverage.",
    docsUrl: "https://www.infobip.com/docs/api",
    capabilities: ["Global SMS", "WhatsApp", "RCS", "Balance API"],
    fields: [
      F.apiKey("API Key", "Authorization: App <key>"),
      F.text("baseUrl", "Base URL", { required: true, placeholder: "xxxxx.api.infobip.com", helpText: "Personal base URL from portal" }),
      F.text("senderId", "Sender", { required: true, placeholder: "InfoSMS" }),
    ],
    sendable: true,
  },
  {
    id: "aws-sns",
    name: "AWS SNS",
    kind: "sms",
    badge: "AWS",
    color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    description: "Amazon Simple Notification Service — pay-per-message global SMS.",
    docsUrl: "https://docs.aws.amazon.com/sns/latest/dg/sms-console.html",
    capabilities: ["Global SMS", "Topics", "Fan-out", "Origination Numbers"],
    fields: [
      F.apiKey("Access Key ID", "IAM user key with sns:Publish + sns:GetSMSAttributes", { topLevel: "apiKey" }),
      F.apiSecret("Secret Access Key"),
      F.select("region", "AWS Region", ["ap-south-1", "us-east-1", "us-west-2", "eu-west-1", "eu-central-1", "ap-southeast-1"], { defaultValue: "ap-south-1" }),
      F.text("senderId", "Sender ID", { helpText: "Optional, SNS.SenderID in origination settings" }),
    ],
    sendable: true,
  },
];

// ══════════════════════════════════════════════════════════════
//  EMAIL GATEWAYS (6)
// ══════════════════════════════════════════════════════════════
const EMAIL_PROVIDERS: ProviderMeta[] = [
  {
    id: "smtp-generic",
    name: "SMTP (Any Provider)",
    kind: "email",
    badge: "SMTP",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    description: "Universal SMTP adapter — Gmail, Zoho, cPanel, private relay, anything.",
    docsUrl: "https://nodemailer.com/smtp/",
    capabilities: ["TLS/SSL", "Auth Login", "Attachments", "Reply-To"],
    fields: [
      F.text("host", "SMTP Host", { required: true, placeholder: "smtp.gmail.com" }),
      F.numberField("port", "Port", { required: true, defaultValue: "587", helpText: "587 STARTTLS · 465 SSL · 25 plain" }),
      F.text("username", "Username", { required: true, topLevel: "apiKey" }),
      F.secret("password", "Password", { required: true, topLevel: "apiSecret" }),
      F.select("encryption", "Encryption", [
        { value: "tls", label: "STARTTLS (587)" },
        { value: "ssl", label: "SSL/TLS (465)" },
        { value: "none", label: "None (25)" },
      ], { defaultValue: "tls" }),
      F.text("fromEmail", "From Email", { required: true, placeholder: "billing@isp.com" }),
      F.text("fromName", "From Name", { placeholder: "Cryptsk Billing" }),
    ],
    sendable: true,
  },
  {
    id: "sendgrid",
    name: "SendGrid",
    kind: "email",
    badge: "SG",
    color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    description: "Twilio SendGrid — 100B+ emails/month infrastructure.",
    docsUrl: "https://docs.sendgrid.com/api-reference",
    capabilities: ["Templates", "Suppression", "Webhooks", "Analytics"],
    fields: [
      F.apiKey("API Key", "SG.xxxx — Mail Send + scopes read", { required: true }),
      F.text("fromEmail", "From Email", { required: true }),
      F.text("fromName", "From Name", { placeholder: "Cryptsk Billing" }),
    ],
    sendable: true,
  },
  {
    id: "mailgun",
    name: "Mailgun",
    kind: "email",
    badge: "MG",
    color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    description: "Sinch Mailgun — developers' email API with strong deliverability.",
    docsUrl: "https://documentation.mailgun.com/docs/mailgun/api-reference/",
    capabilities: ["Domains", "Templates", "Routes", "Analytics"],
    fields: [
      F.apiKey("Private API Key", "key-xxxx", { required: true }),
      F.text("domain", "Sending Domain", { required: true, placeholder: "mg.yourisp.com" }),
      F.select("hostEnv", "Region", [
        { value: "api.mailgun.net", label: "US (api.mailgun.net)" },
        { value: "api.eu.mailgun.net", label: "EU (api.eu.mailgun.net)" },
      ], { defaultValue: "api.mailgun.net" }),
      F.text("fromEmail", "From Email", { required: true }),
    ],
    sendable: true,
  },
  {
    id: "aws-ses",
    name: "AWS SES",
    kind: "email",
    badge: "SES",
    color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    description: "Amazon Simple Email Service — cheapest at scale, IAM-signed API.",
    docsUrl: "https://docs.aws.amazon.com/ses/latest/APIReference-V2/",
    capabilities: ["IAM SigV4", "Sandbox Escalation", "Reputation Dashboard"],
    fields: [
      F.apiKey("Access Key ID", "IAM user key with sns:Publish / ses permissions"),
      F.apiSecret("Secret Access Key"),
      F.select("region", "AWS Region", ["ap-south-1", "us-east-1", "us-west-2", "eu-west-1", "eu-central-1"], { defaultValue: "ap-south-1" }),
      F.text("fromEmail", "From (verified identity)", { required: true }),
    ],
    sendable: true,
  },
  {
    id: "resend",
    name: "Resend",
    kind: "email",
    badge: "RE",
    color: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200",
    description: "Modern email API built for developers — React Email native.",
    docsUrl: "https://resend.com/docs/api-reference",
    capabilities: ["Domains", "Audiences", "Webhooks"],
    fields: [
      F.apiKey("API Key", "re_xxx", { required: true }),
      F.text("fromEmail", "From Email", { required: true, placeholder: "billing@yourisp.com" }),
      F.text("fromName", "From Name", { placeholder: "Cryptsk Billing" }),
    ],
    sendable: true,
  },
  {
    id: "postmark",
    name: "Postmark",
    kind: "email",
    badge: "PM",
    color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
    description: "ActiveCampaign Postmark — transactional email specialists.",
    docsUrl: "https://postmarkapp.com/developer/api/overview",
    capabilities: ["Transactional Focus", "Templates", "Message Streams"],
    fields: [
      F.apiKey("Server API Token", "xxxx-xxxx-xxxx", { required: true }),
      F.text("fromEmail", "From Email", { required: true }),
      F.text("messageStream", "Message Stream", { placeholder: "outbound", defaultValue: "outbound" }),
    ],
    sendable: true,
  },
];

// ══════════════════════════════════════════════════════════════
//  WHATSAPP (3)
// ══════════════════════════════════════════════════════════════
const WHATSAPP_PROVIDERS: ProviderMeta[] = [
  {
    id: "whatsapp-cloud",
    name: "WhatsApp Cloud API (Meta)",
    kind: "whatsapp",
    badge: "WA",
    color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    description: "Official Meta Cloud API — templates, media, interactive buttons.",
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
    capabilities: ["Templates", "Media", "Interactive", "Webhooks", "24h Window"],
    fields: [
      F.apiKey("Permanent Access Token", "System-user token from Meta Business Settings", { required: true }),
      F.text("phoneNumberId", "Phone Number ID", { required: true, placeholder: "1234567890" }),
      F.text("wabaId", "WABA ID", { helpText: "WhatsApp Business Account ID" }),
      F.select("graphVersion", "Graph API Version", ["v18.0", "v19.0", "v20.0", "v21.0"], { defaultValue: "v21.0" }),
    ],
    sendable: true,
    setupNotes: ["Subscribe to 'messages' webhook on /{phoneId}/webhooks pointing at /api/integrations/webhooks/whatsapp"],
  },
  {
    id: "twilio-whatsapp",
    name: "Twilio WhatsApp",
    kind: "whatsapp",
    badge: "TW",
    color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    description: "Twilio's WhatsApp Business API — sandbox in minutes.",
    docsUrl: "https://www.twilio.com/docs/whatsapp",
    capabilities: ["Sandbox", "Templates", "Media", "Status Callbacks"],
    fields: [
      F.text("accountSid", "Account SID", { required: true, topLevel: "apiKey", placeholder: "AC…" }),
      F.apiSecret("Auth Token"),
      F.text("fromNumber", "WhatsApp From", { required: true, placeholder: "+1415…", helpText: "Twilio WhatsApp-enabled sender (wa_ prefix added automatically)" }),
    ],
    sendable: true,
  },
  {
    id: "gupshup",
    name: "Gupshup",
    kind: "whatsapp",
    badge: "GS",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    description: "Gupshup CPaaS — WhatsApp + 30 channels, strong India BSP.",
    docsUrl: "https://www.gupshup.io/docs/whatsapp/home",
    capabilities: ["BSP India", "Templates", "Opt-in", "Bot Builder"],
    fields: [
      F.apiKey("Partner/App API Key", "Gupshup dashboard API key"),
      F.text("appName", "App Name", { required: true, helpText: "Gupshup WhatsApp app name" }),
      F.text("sourceNumber", "Source Number", { required: true, placeholder: "+9198…" }),
    ],
    sendable: true,
  },
];

// ══════════════════════════════════════════════════════════════
//  PUSH (3)
// ══════════════════════════════════════════════════════════════
const PUSH_PROVIDERS: ProviderMeta[] = [
  {
    id: "fcm",
    name: "Firebase Cloud Messaging",
    kind: "push",
    badge: "FCM",
    color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    description: "Google FCM — Android/iOS/Web push via HTTP v1 or legacy key.",
    docsUrl: "https://firebase.google.com/docs/cloud-messaging",
    capabilities: ["HTTP v1", "Legacy Key", "Topics", "Device Groups"],
    fields: [
      F.secret("serverKey", "Legacy Server Key", { helpText: "Console → Project settings → Cloud Messaging (legacy)" }),
      F.secret("serviceAccountJson", "Service Account JSON", { type: "textarea", helpText: "Full JSON for HTTP v1 (RSA-signed OAuth) — takes priority over legacy key" }),
      F.text("projectId", "Firebase Project ID", { helpText: "Required for HTTP v1" }),
    ],
    sendable: true,
  },
  {
    id: "onesignal",
    name: "OneSignal",
    kind: "push",
    badge: "OS",
    color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    description: "OneSignal — push, in-app, email, SMS with segmentation.",
    docsUrl: "https://documentation.onesignal.com/reference",
    capabilities: ["Segments", "Delivery Stats", "A/B Tests"],
    fields: [
      F.text("appId", "App ID", { required: true, placeholder: "xxxxxxxx-xxxx-xxxx" }),
      F.apiKey("REST API Key", "OneSignal REST API key"),
    ],
    sendable: true,
  },
  {
    id: "web-push-vapid",
    name: "Web Push (VAPID)",
    kind: "push",
    badge: "WP",
    color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    description: "Standard W3C Web Push for browser notifications — no vendor lock-in.",
    docsUrl: "https://web.dev/push-notifications-web-push-protocol/",
    capabilities: ["Chrome/Firefox/Safari", "No App Store", "VAPID Keys"],
    fields: [
      F.text("publicKey", "VAPID Public Key", { required: true }),
      F.secret("privateKey", "VAPID Private Key", { required: true }),
      F.text("subject", "Subject (mailto:)", { placeholder: "mailto:ops@isp.com" }),
    ],
    sendable: false,
    setupNotes: ["Web Push send is delivered through the browser subscription registry — wire your service worker to /api/push/subscribe"],
  },
];

export const PROVIDERS: ProviderMeta[] = [
  ...PAYMENT_PROVIDERS,
  ...SMS_PROVIDERS,
  ...EMAIL_PROVIDERS,
  ...WHATSAPP_PROVIDERS,
  ...PUSH_PROVIDERS,
];

export function getProvider(id: string): ProviderMeta | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function providersByKind(kind: ProviderKind): ProviderMeta[] {
  return PROVIDERS.filter((p) => p.kind === kind);
}

export const KIND_META: Record<ProviderKind, { label: string; plural: string; icon: string; color: string }> = {
  payment: { label: "Payment", plural: "Payment Gateways", icon: "CreditCard", color: "text-emerald-600 dark:text-emerald-400" },
  sms: { label: "SMS", plural: "SMS Gateways", icon: "Smartphone", color: "text-rose-600 dark:text-rose-400" },
  email: { label: "Email", plural: "Email Gateways", icon: "Mail", color: "text-amber-600 dark:text-amber-400" },
  whatsapp: { label: "WhatsApp", plural: "WhatsApp", icon: "MessageSquare", color: "text-green-600 dark:text-green-400" },
  push: { label: "Push", plural: "Push Notifications", icon: "Bell", color: "text-violet-600 dark:text-violet-400" },
};
