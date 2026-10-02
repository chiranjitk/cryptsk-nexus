import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: false,
  // Dev-origin allowlist — sandbox-local origins ONLY. Never add production
  // domains here (user order 2026-10-02: production hostnames stay out of git).
  allowedDevOrigins: ["*.space-z.ai", "127.0.0.1", "localhost"],
  // ─── Cap Turbopack memory (4GB sandbox, OOM protection) ───
  // NOTE: turbopackFileSystemCacheForDev was measured to INFLATE baseline
  // next-server RSS by ~500MB on this sandbox (cache state loaded into RAM
  // at startup). Disabled — prefer `rm -rf .next` over a persistent cache.
  experimental: {
    // 256 OOM-crash-looped during cold compile of the full page-loaders
    // graph; 1536 fits the 4GB sandbox alongside the mini-services.
    turbopackMemoryLimit: 1536,
  },
  // ─── Treat native/binary Node modules as externals ───
  // ssh2 / net-snmp / ros-client / pg ship binary assets that bundlers
  // cannot place in ESM chunks — keep them require()'d Node modules.
  serverExternalPackages: [
    "ssh2", "net-snmp", "ros-client", "pg", "pg-native",
    "bcryptjs", "bcrypt", "nodemailer", "@prisma/client", "canvas", "jsdom",
    "xlsx", "jspdf",
  ],
};

export default nextConfig;
