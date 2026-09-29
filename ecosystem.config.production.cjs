// ============================================================================
// Cryptsk — Intelligent ISP Platform
// PM2 Production Ecosystem Configuration
// Root: /opt/ispplatform
// ============================================================================

const ROOT = '/opt/ispplatform';
const LOG_DIR = `${ROOT}/.logs`;
const PG_BIN = `${ROOT}/runtime-applications/pgsql/bin`;
const PG_DATA = `${ROOT}/runtime-applications/pgsql/data`;

// ─── Shared Environment ────────────────────────────────────────────────────
const sharedEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://ispplatform:Cryptsk2026@localhost:5432/ispplatform',
};

// ─── Shared Production Settings ─────────────────────────────────────────────
const prodSettings = {
  watch: false,
  autorestart: true,
  max_memory_restart: '2G',
  log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  kill_timeout: 5000,
  wait_ready: false,
  listen_timeout: 10000,
};

// ============================================================================
module.exports = {
  apps: [
    // ─── PostgreSQL 18.4 ──────────────────────────────────────
    {
      name: 'cryptsk-postgresql',
      script: `${PG_BIN}/postgres`,
      args: `-D ${PG_DATA}`,
      interpreter: 'none',
      cwd: ROOT,
      env: {
        PGDATA: PG_DATA,
        PATH: `${PG_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
        LD_LIBRARY_PATH: `${ROOT}/runtime-applications/pgsql/lib`,
      },
      ...prodSettings,
      max_memory_restart: '4G',
      error_file: `${LOG_DIR}/postgresql-error.log`,
      out_file: `${LOG_DIR}/postgresql-out.log`,
    },

    // ─── Next.js Main App (Production) ────────────────────────
    {
      name: 'cryptsk-nextjs',
      script: `${ROOT}/.next/standalone/server.js`,
      cwd: ROOT,
      env: {
        ...sharedEnv,
        NODE_OPTIONS: '--max-old-space-size=8192',
        HOSTNAME: '0.0.0.0',
        PORT: '3000',
      },
      ...prodSettings,
      max_memory_restart: '4G',
      error_file: `${LOG_DIR}/nextjs-error.log`,
      out_file: `${LOG_DIR}/nextjs-out.log`,
    },

    // ─── Mini-Services ────────────────────────────────────────
    {
      name: 'cryptsk-billing-cron',
      script: 'index.ts',
      cwd: `${ROOT}/mini-services/billing-cron`,
      interpreter: 'bun',
      env: { ...sharedEnv },
      ...prodSettings,
      max_memory_restart: '1G',
      error_file: `${LOG_DIR}/billing-cron-error.log`,
      out_file: `${LOG_DIR}/billing-cron-out.log`,
    },
    {
      name: 'cryptsk-radius-service',
      script: 'index.ts',
      cwd: `${ROOT}/mini-services/radius-service`,
      interpreter: 'bun',
      env: { ...sharedEnv },
      ...prodSettings,
      max_memory_restart: '1G',
      error_file: `${LOG_DIR}/radius-service-error.log`,
      out_file: `${LOG_DIR}/radius-service-out.log`,
    },
    {
      name: 'cryptsk-network-monitor',
      script: 'index.ts',
      cwd: `${ROOT}/mini-services/network-monitor`,
      interpreter: 'bun',
      env: { ...sharedEnv },
      ...prodSettings,
      max_memory_restart: '1G',
      error_file: `${LOG_DIR}/network-monitor-error.log`,
      out_file: `${LOG_DIR}/network-monitor-out.log`,
    },
    {
      name: 'cryptsk-whatsapp-bot',
      script: 'index.ts',
      cwd: `${ROOT}/mini-services/whatsapp-bot`,
      interpreter: 'bun',
      env: { ...sharedEnv },
      ...prodSettings,
      max_memory_restart: '1G',
      error_file: `${LOG_DIR}/whatsapp-bot-error.log`,
      out_file: `${LOG_DIR}/whatsapp-bot-out.log`,
    },
    {
      name: 'cryptsk-ndpi-service',
      script: 'index.ts',
      cwd: `${ROOT}/mini-services/ndpi-service`,
      interpreter: 'bun',
      env: { ...sharedEnv },
      ...prodSettings,
      max_memory_restart: '1G',
      error_file: `${LOG_DIR}/ndpi-service-error.log`,
      out_file: `${LOG_DIR}/ndpi-service-out.log`,
    },
    {
      name: 'cryptsk-gateway-service',
      script: 'index.ts',
      cwd: `${ROOT}/mini-services/gateway-service`,
      interpreter: 'bun',
      env: { ...sharedEnv },
      ...prodSettings,
      max_memory_restart: '1G',
      error_file: `${LOG_DIR}/gateway-service-error.log`,
      out_file: `${LOG_DIR}/gateway-service-out.log`,
    },
    {
      name: 'cryptsk-ips-daemon',
      script: 'index.ts',
      cwd: `${ROOT}/mini-services/ips-daemon`,
      interpreter: 'bun',
      env: { ...sharedEnv },
      ...prodSettings,
      max_memory_restart: '1G',
      error_file: `${LOG_DIR}/ips-daemon-error.log`,
      out_file: `${LOG_DIR}/ips-daemon-out.log`,
    },
    {
      name: 'cryptsk-multiwan-monitor',
      script: 'index.ts',
      cwd: `${ROOT}/mini-services/multiwan-monitor`,
      interpreter: 'bun',
      env: { ...sharedEnv },
      ...prodSettings,
      max_memory_restart: '512M',
      error_file: `${LOG_DIR}/multiwan-monitor-error.log`,
      out_file: `${LOG_DIR}/multiwan-monitor-out.log`,
    },
    {
      name: 'cryptsk-syslog-service',
      script: 'index.ts',
      cwd: `${ROOT}/mini-services/syslog-service`,
      interpreter: 'bun',
      env: { ...sharedEnv },
      ...prodSettings,
      max_memory_restart: '512M',
      error_file: `${LOG_DIR}/syslog-service-error.log`,
      out_file: `${LOG_DIR}/syslog-service-out.log`,
    },
    {
      name: 'cryptsk-diameter-service',
      script: 'index.ts',
      cwd: `${ROOT}/mini-services/diameter-service`,
      interpreter: 'bun',
      env: { ...sharedEnv },
      ...prodSettings,
      max_memory_restart: '512M',
      error_file: `${LOG_DIR}/diameter-service-error.log`,
      out_file: `${LOG_DIR}/diameter-service-out.log`,
    },
    {
      name: 'cryptsk-snmp-service',
      script: 'index.ts',
      cwd: `${ROOT}/mini-services/snmp-service`,
      interpreter: 'bun',
      env: { ...sharedEnv },
      ...prodSettings,
      max_memory_restart: '512M',
      error_file: `${LOG_DIR}/snmp-service-error.log`,
      out_file: `${LOG_DIR}/snmp-service-out.log`,
    },
  ],

  // ─── PM2 Deployment Configuration ────────────────────────────────────────
  deploy: {
    production: {
      user: 'root',
      host: 'your-server-ip',
      ref: 'origin/main',
      repo: 'https://github.com/chiranjitk/CRYPTSKINTELLIGENT-ISP-PLATFORM.git',
      path: ROOT,
      'pre-deploy-local': '',
      'post-deploy': `
        cd /opt/ispplatform &&
        bun install --frozen-lockfile &&
        bun run db:push &&
        bun run build &&
        cp -r .next/static .next/standalone/.next/ &&
        cp -r public .next/standalone/ &&
        mkdir -p .logs &&
        pm2 restart ecosystem.config.cjs --env production
      `,
      'pre-setup': `
        mkdir -p /opt/ispplatform
      `,
    },
  },
};
