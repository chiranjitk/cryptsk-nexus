// Cryptsk — Structured JSON Logger for Production
// All mini-services should use this for consistent log output

type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  data?: Record<string, unknown>;
}

export function log(
  level: LogLevel,
  service: string,
  message: string,
  data?: Record<string, unknown>
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service,
    message,
    ...(data && { data }),
  };
  const line = JSON.stringify(entry);
  if (level === "fatal" || level === "error") {
    process.stderr.write(line + "\n");
  } else if (level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export function createLogger(service: string) {
  return {
    debug: (message: string, data?: Record<string, unknown>) =>
      log("debug", service, message, data),
    info: (message: string, data?: Record<string, unknown>) =>
      log("info", service, message, data),
    warn: (message: string, data?: Record<string, unknown>) =>
      log("warn", service, message, data),
    error: (message: string, data?: Record<string, unknown>) =>
      log("error", service, message, data),
    fatal: (message: string, data?: Record<string, unknown>) =>
      log("fatal", service, message, data),
  };
}

export type { LogLevel, LogEntry };
