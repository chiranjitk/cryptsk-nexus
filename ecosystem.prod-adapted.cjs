// Adapted production ecosystem — uses system PostgreSQL 18.4 (already running)
// instead of v1's bundled PG (which would conflict on port 5432).

const ROOT = "/opt/ispplatform";
const LOG_DIR = ROOT + "/.logs";
const DB_URL = "postgresql://cryptsknexus:CryptskNexus2026@127.0.0.1:5432/cryptsknexus";

const prodSettings = {
  watch: false,
  autorestart: true,
  max_memory_restart: "2G",
  log_date_format: "YYYY-MM-DD HH:mm:ss Z",
  kill_timeout: 5000,
};

module.exports = {
  apps: [
    {
      name: "cryptsk-nextjs",
      script: "bun",
      args: ".next/standalone/server.js",
      cwd: ROOT,
      env: {
        NODE_ENV: "production",
        DATABASE_URL: DB_URL,
        SESSION_SECRET: "cryptsk_session_secret_key_2026_isp_platform",
        NEXTAUTH_URL: "https://nexus.cryptsk.com",
        PORT: 3000,
        HOSTNAME: "0.0.0.0",
      },
      out_file: LOG_DIR + "/cryptsk-nextjs-out.log",
      error_file: LOG_DIR + "/cryptsk-nextjs-error.log",
      merge_logs: true,
      watch: false,
      autorestart: true,
      max_memory_restart: "2G",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      kill_timeout: 5000,
    },
  ],
};
