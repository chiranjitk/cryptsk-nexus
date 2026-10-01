import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ["*.space-z.ai", "127.0.0.1", "localhost"],
  // ─── Cap Turbopack memory (sandbox has 4GB RAM, OOM protection) ──
  // NOTE: turbopackFileSystemCacheForDev was measured to INFLATE baseline
  // next-server RSS by ~500 MB on this sandbox (cache state loaded into RAM
  // at startup: root-only 2332 MB warm vs 1816 MB fresh). Disabled — on
  // memory-constrained dev boxes prefer `rm -rf .next` over a persistent
  // cache, and run dev with NODE_OPTIONS=--max-old-space-size=1536.
  experimental: {
    // 256 OOM-crash-looped during cold compile of the full page-loaders
    // graph (dies ~30s into "Compiling / ..." with 0-byte responses).
    // 1536 fits the 4GB sandbox alongside the 12 mini-services.
    turbopackMemoryLimit: 1536,
  },
  // ─── Treat native/binary Node modules as externals ───────────
  // ssh2 / net-snmp / ros-client / pg use binary assets that
  // bundlers cannot place in ESM chunks. Marking them as server
  // external keeps them as require()'d Node modules in the
  // standalone server bundle.
  serverExternalPackages: [
    "ssh2",
    "net-snmp",
    "ros-client",
    "pg",
    "pg-native",
    "bcryptjs",
    "bcrypt",
    "nodemailer",
    "@prisma/client",
    "canvas",
    "jsdom",
  ],
};

export default nextConfig;
