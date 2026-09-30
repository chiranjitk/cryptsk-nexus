import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ["*.space-z.ai", "127.0.0.1", "localhost"],
  // ─── Cap Turbopack memory (sandbox has 4GB RAM, OOM protection) ──
  experimental: {
    turbopackMemoryLimit: 256,
    turbopackFileSystemCacheForDev: true,
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
