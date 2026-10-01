/**
 * StaySuite Mini-Services Structured Logger
 *
 * Provides consistent, structured logging across all mini-services.
 * Replaces console.log/warn/error with JSON-formatted log entries
 * that include timestamp, service name, level, and context.
 *
 * Usage:
 *   import { createLogger } from '../shared/logger';
 *   const log = createLogger('dns-service');
 *   log.info('Service started', { port: 3012 });
 *   log.warn('Auth not configured');
 *   log.error('Database connection failed', { error: err.message });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  context?: Record<string, unknown>;
}

function formatEntry(entry: LogEntry): string {
  const { timestamp, level, service, message, context } = entry;
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${service}]`;
  if (context && Object.keys(context).length > 0) {
    return `${prefix} ${message} ${JSON.stringify(context)}`;
  }
  return `${prefix} ${message}`;
}

export function createLogger(serviceName: string) {
  const isoNow = () => new Date().toISOString();

  function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: isoNow(),
      level,
      service: serviceName,
      message,
      context,
    };
    const formatted = formatEntry(entry);

    switch (level) {
      case 'error':
        process.stderr.write(formatted + '\n');
        break;
      case 'warn':
        process.stderr.write(formatted + '\n');
        break;
      default:
        process.stdout.write(formatted + '\n');
        break;
    }
  }

  return {
    debug(message: string, context?: Record<string, unknown>) {
      write('debug', message, context);
    },
    info(message: string, context?: Record<string, unknown>) {
      write('info', message, context);
    },
    warn(message: string, context?: Record<string, unknown>) {
      write('warn', message, context);
    },
    error(message: string, context?: Record<string, unknown>) {
      write('error', message, context);
    },
  };
}
