// ============================================================
// CRYPTSK Nexus — shared formatters (client-safe)
// ============================================================

export function formatINR(n: number | null | undefined, opts?: { compact?: boolean }): string {
  const v = Math.round((n ?? 0) * 100) / 100;
  if (opts?.compact) {
    if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
    if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
    if (Math.abs(v) >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
    return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  }
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function humanBytes(bytes: number | null | undefined): string {
  const b = bytes ?? 0;
  if (!isFinite(b) || b <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  const val = b / Math.pow(1024, i);
  return `${val >= 100 ? val.toFixed(0) : val.toFixed(1)} ${units[i]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(seconds ?? 0));
  if (s === 0) return "—";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function relTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? "ago" : "from now";
  const mins = Math.floor(abs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ${suffix}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${suffix}`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ${suffix}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ${suffix}`;
  return `${Math.floor(months / 12)}y ${suffix}`;
}

export function formatNumber(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("en-IN");
}
