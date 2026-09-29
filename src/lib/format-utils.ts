/**
 * Cryptsk — Shared Formatting Utilities
 * Common formatting helpers used across the platform.
 */

/**
 * Converts bytes to a human-readable string (B, KB, MB, GB, TB).
 */
export function formatBytes(bytes: number): string {
  if (typeof bytes !== 'number' || isNaN(bytes) || !isFinite(bytes)) return '0 B';
  if (bytes < 0) return "0 B";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const index = Math.min(i, units.length - 1);

  const value = bytes / Math.pow(k, index);

  // Show up to 1 decimal place, drop trailing zeros
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

/**
 * Converts seconds to a human-readable uptime string (Xd Xh Xm).
 * Omits zero-valued units.
 */
export function formatUptime(seconds: number): string {
  if (seconds < 0) return "0m";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.join(" ");
}

/**
 * Calculates memory usage as a percentage.
 */
export function formatMemoryUsage(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((used / total) * 1000) / 10; // 1 decimal place
}
