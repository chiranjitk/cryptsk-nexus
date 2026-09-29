import nodemailer from "nodemailer";
import { db } from "@/lib/db";

// ─── Types ──────────────────────────────────────────────────────
interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromEmail: string;
  encryption?: string;
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface TestConnectionResult {
  success: boolean;
  message: string;
}

// ─── Get SMTP config from IntegrationConfig table ───────────────
async function getSMTPConfig(): Promise<EmailConfig | null> {
  const config = await db.integrationConfig.findFirst({
    where: {
      type: "communication",
      provider: "smtp",
      enabled: true,
    },
  });

  if (!config) {
    // Fallback: try IspSettings
    try {
      const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
      if (settings && settings.smtpHost && settings.smtpUser) {
        return {
          host: settings.smtpHost,
          port: parseInt(settings.smtpPort?.toString() || "587"),
          user: settings.smtpUser,
          pass: settings.smtpPass || "",
          fromEmail: settings.smtpFromEmail || settings.smtpUser,
          encryption: "tls",
        };
      }
    } catch {
      // ignore
    }
    return null;
  }

  const extraConfig: Record<string, string> = {};
  try { Object.assign(extraConfig, JSON.parse(config.config || "{}")); } catch { /* ignore */ }

  return {
    host: extraConfig.host || '',
    port: parseInt(extraConfig.port || '587') || 587,
    user: extraConfig.username || '',
    pass: extraConfig.password || '',
    fromEmail: extraConfig.from || '',
    encryption: extraConfig.encryption || "tls",
  };
}

// ─── Create Transporter ─────────────────────────────────────────
function createTransporter(config: EmailConfig) {
  const isSecure = config.port === 465 || config.encryption === "ssl";

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: isSecure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    // Connection timeout
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });
}

// ─── Public API ─────────────────────────────────────────────────
export async function sendEmail(options: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}): Promise<SendEmailResult> {
  const config = await getSMTPConfig();
  if (!config) {
    return {
      success: false,
      error: "No SMTP provider configured. Configure in Settings > Integrations > Communication.",
    };
  }

  try {
    const transporter = createTransporter(config);
    const fromAddress = config.fromEmail || config.user;

    const result = await transporter.sendMail({
      from: `"Cryptsk ISP" <${fromAddress}>`,
      to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ""),
      attachments: options.attachments,
    });

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown email error",
    };
  }
}

export async function testEmailConnection(integrationId: string): Promise<TestConnectionResult> {
  const config = await db.integrationConfig.findUnique({ where: { id: integrationId } });
  if (!config) {
    return { success: false, message: "Integration not found" };
  }

  const extraConfig: Record<string, string> = {};
  try { Object.assign(extraConfig, JSON.parse(config.config || "{}")); } catch { /* ignore */ }

  const emailConfig: EmailConfig = {
    host: extraConfig.host || config.apiKey,
    port: parseInt(extraConfig.port || "587"),
    user: extraConfig.username || config.apiKey,
    pass: extraConfig.password || config.apiSecret,
    fromEmail: extraConfig.from || "",
    encryption: extraConfig.encryption || "tls",
  };

  try {
    const transporter = createTransporter(emailConfig);
    await transporter.verify();

    return {
      success: true,
      message: `Connected successfully to ${emailConfig.host}:${emailConfig.port}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

export async function testEmailFromISPSettings(): Promise<TestConnectionResult> {
  try {
    const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
    if (!settings || !settings.smtpHost || !settings.smtpUser) {
      return { success: false, message: "SMTP not configured in ISP Profile settings" };
    }

    const config: EmailConfig = {
      host: settings.smtpHost,
      port: parseInt(settings.smtpPort?.toString() || "587"),
      user: settings.smtpUser,
      pass: settings.smtpPass || "",
      fromEmail: settings.smtpFromEmail || settings.smtpUser,
    };

    const transporter = createTransporter(config);
    await transporter.verify();

    return {
      success: true,
      message: `Connected successfully to ${config.host}:${config.port}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
