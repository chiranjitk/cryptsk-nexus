// Reports Phase 3 (RPT-P3-A) — Next.js instrumentation hook.
// Next.js calls register() once per server process start (Node.js runtime only).
// We use it to bootstrap the report-snapshot scheduler:
//   - first pass 45s after boot, then every 15 minutes;
//   - runDueSnapshots() itself is idempotent + guarded, so overlapping ticks
//     and restarts are safe;
//   - timers are unref()'d so they never hold the process open at shutdown.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const g = globalThis as { __reportSnapScheduler?: boolean };
  if (g.__reportSnapScheduler) return;
  g.__reportSnapScheduler = true;

  setTimeout(async () => {
    try {
      const { runDueSnapshots } = await import("@/lib/report-snapshot-engine");
      await runDueSnapshots();
    } catch (e) {
      console.error("[snapshots] initial run failed:", e);
    }
  }, 45_000).unref?.();

  setInterval(async () => {
    try {
      const { runDueSnapshots } = await import("@/lib/report-snapshot-engine");
      await runDueSnapshots();
    } catch (e) {
      console.error("[snapshots] scheduled run failed:", e);
    }
  }, 15 * 60_000).unref?.();

  console.log("[snapshots] scheduler registered (initial run in 45s, then every 15min)");
}
