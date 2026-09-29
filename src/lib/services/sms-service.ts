import { db } from "@/lib/db";

// ─── Types ──────────────────────────────────────────────────────
interface SMSConfig {
  provider: string;
  apiKey: string;
  senderId: string;
  route?: string;
  phoneId?: string;
  accessToken?: string;
  from?: string;
}

interface SendSMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: string;
}

interface TestConnectionResult {
  success: boolean;
  message: string;
  provider: string;
}

// ─── Get SMS config from IntegrationConfig table ────────────────
async function getSMSConfig(): Promise<SMSConfig | null> {
  const config = await db.integrationConfig.findFirst({
    where: {
      type: "communication",
      provider: { in: ["msg91", "twilio"] },
      enabled: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!config) return null;

  const extraConfig: Record<string, string> = {};
  try {
    Object.assign(extraConfig, JSON.parse(config.config || "{}"));
  } catch {
    // ignore parse errors
  }

  return {
    provider: config.provider,
    apiKey: config.apiKey,
    senderId: extraConfig.senderId || config.merchantId || "",
    route: extraConfig.route || "4",
    phoneId: extraConfig.phoneId || "",
    accessToken: extraConfig.accessToken || config.apiSecret || "",
    from: extraConfig.from || "",
  };
}

// ─── MSG91 SMS Provider ─────────────────────────────────────────
async function sendViaMSG91(to: string, message: string, config: SMSConfig): Promise<SendSMSResult> {
  try {
    // Use v2 API directly — v5 flow API requires a valid flow_id
    const response = await fetch("https://api.msg91.com/api/v2/sendsms", {
      method: "POST",
      headers: {
        "authkey": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: config.senderId,
        route: parseInt(config.route || "4"),
        SMS: [{
          message,
          to: [to.replace(/\D/g, "")],
        }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      return { success: false, error: `MSG91 API error: ${response.status} - ${errorData}`, provider: "msg91" };
    }

    const data = await response.json();
    return {
      success: data.type === "success",
      messageId: data.message?.toString(),
      provider: "msg91",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown MSG91 error",
      provider: "msg91",
    };
  }
}

async function testMSG91(config: SMSConfig): Promise<TestConnectionResult> {
  try {
    const response = await fetch('https://api.msg91.com/api/v5/balance', {
      method: "GET",
      headers: { 'authkey': config.apiKey },
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: `Connected! Balance: ${data.balance || "available"}`,
        provider: "msg91",
      };
    }

    // Try alternate balance endpoint
    const response2 = await fetch("https://api.msg91.com/api/balance.php?authkey=" + config.apiKey + "&type=1");
    if (response2.ok) {
      const text = await response2.text();
      return { success: true, message: `Connected! SMS balance: ${text}`, provider: "msg91" };
    }

    return { success: false, message: `Authentication failed (HTTP ${response.status}). Check your API key.`, provider: "msg91" };
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : "Network error"}`,
      provider: "msg91",
    };
  }
}

// ─── Twilio SMS Provider ────────────────────────────────────────
async function sendViaTwilio(to: string, message: string, config: SMSConfig): Promise<SendSMSResult> {
  try {
    const from = config.from || config.senderId;
    if (!from) {
      return { success: false, error: "Twilio 'From' number is required", provider: "twilio" };
    }

    const accountSid = config.apiKey.includes(":") ? config.apiKey.split(":")[0] : config.apiKey;
    const authToken = config.apiKey.includes(":") ? config.apiKey.split(":")[1] : config.accessToken;

    if (!accountSid || !authToken) {
      return { success: false, error: "Twilio Account SID and Auth Token are required", provider: "twilio" };
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        },
        body: new URLSearchParams({
          From: from,
          To: to.startsWith("+") ? to : `+${to}`,
          Body: message,
        }).toString(),
      }
    );

    const data = await response.json();

    if (response.ok) {
      return {
        success: true,
        messageId: data.sid,
        provider: "twilio",
      };
    }

    return {
      success: false,
      error: `Twilio error: ${data.message || JSON.stringify(data)}`,
      provider: "twilio",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown Twilio error",
      provider: "twilio",
    };
  }
}

async function testTwilio(config: SMSConfig): Promise<TestConnectionResult> {
  try {
    const accountSid = config.apiKey.includes(":") ? config.apiKey.split(":")[0] : config.apiKey;
    const authToken = config.apiKey.includes(":") ? config.apiKey.split(":")[1] : config.accessToken;

    if (!accountSid || !authToken) {
      return { success: false, message: "Account SID and Auth Token are required", provider: "twilio" };
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      {
        method: "GET",
        headers: {
          "Authorization": "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: `Connected! Account: ${data.friendly_name || accountSid}`,
        provider: "twilio",
      };
    }

    return {
      success: false,
      message: `Authentication failed (HTTP ${response.status}). Check your credentials.`,
      provider: "twilio",
    };
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : "Network error"}`,
      provider: "twilio",
    };
  }
}

// ─── Public API ─────────────────────────────────────────────────
export async function sendSMS(to: string, message: string): Promise<SendSMSResult> {
  const config = await getSMSConfig();
  if (!config) {
    return { success: false, error: "No SMS provider configured. Configure in Settings > Integrations > Communication.", provider: "none" };
  }

  switch (config.provider) {
    case "msg91":
      return sendViaMSG91(to, message, config);
    case "twilio":
      return sendViaTwilio(to, message, config);
    default:
      return { success: false, error: `Unsupported SMS provider: ${config.provider}`, provider: config.provider };
  }
}

export async function testSMSConnection(integrationId: string): Promise<TestConnectionResult> {
  const config = await db.integrationConfig.findUnique({ where: { id: integrationId } });
  if (!config) {
    return { success: false, message: "Integration not found", provider: "unknown" };
  }

  const extraConfig: Record<string, string> = {};
  try { Object.assign(extraConfig, JSON.parse(config.config || "{}")); } catch { /* ignore */ }

  const smsConfig: SMSConfig = {
    provider: config.provider,
    apiKey: config.apiKey,
    senderId: extraConfig.senderId || config.merchantId || "",
    route: extraConfig.route || "4",
    phoneId: extraConfig.phoneId || "",
    accessToken: extraConfig.accessToken || config.apiSecret || "",
    from: extraConfig.from || "",
  };

  switch (config.provider) {
    case "msg91":
      return testMSG91(smsConfig);
    case "twilio":
      return testTwilio(smsConfig);
    default:
      return { success: false, message: `Testing not supported for provider: ${config.provider}`, provider: config.provider };
  }
}
