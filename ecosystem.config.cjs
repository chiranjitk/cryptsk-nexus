// ============================================================
// CRYPTSK Nexus — PM2 Ecosystem Configuration
// Per: docs/CICD-GUIDE.md §8.1
//
// Manages:
//   1. cryptsk-gateway     — Next.js OSS/BSS app (port 3000)
//   2. cryptsk-session-engine — Go Session Engine (port 3010)
// ============================================================

module.exports = {
  apps: [
    {
      name: "cryptsk-gateway",
      script: "npx",
      args: "next start -p 3000 -H 0.0.0.0",
      cwd: "/opt/cryptsk-nexus",
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://cryptsknexus:CryptskNexus2026@localhost:5432/cryptsknexus",
        NEXTAUTH_URL: "https://nexus.cryptsk.com",
        NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "YyE9XpPO8xT4lCenrluBAQrj0V/4dHd5fjKyLiraplg=",
      },
      max_memory_restart: "1G",
      instances: 1,
      autorestart: true,
      watch: false,
      out_file: "/root/.pm2/logs/cryptsk-gateway-out.log",
      error_file: "/root/.pm2/logs/cryptsk-gateway-error.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "cryptsk-session-engine",
      script: "bun",
      args: "index.ts",
      cwd: "/opt/cryptsk-nexus/gateway/session-engine",
      env: {
        DATABASE_URL: "postgresql://cryptsknexus:CryptskNexus2026@localhost:5432/cryptsknexus",
        NODE_ENV: "production",
      },
      max_memory_restart: "500M",
      instances: 1,
      autorestart: true,
      watch: false,
      out_file: "/root/.pm2/logs/cryptsk-session-engine-out.log",
      error_file: "/root/.pm2/logs/cryptsk-session-engine-error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
