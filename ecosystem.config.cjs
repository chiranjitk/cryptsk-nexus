module.exports = {
  apps: [
    // ─── 1. Main Next.js Application (Port 3000) ─────────────
    {
      name: 'cryptsk-isp',
      script: 'npx',
      args: 'next dev -p 3000 -H 0.0.0.0',
      cwd: '/home/z/my-project',
      env: {
        DATABASE_URL: 'postgresql://cryptsk:Cryptsk2026@127.0.0.1:5432/ispplatform',
        SESSION_SECRET: 'cryptsk_session_secret_key_2026_isp_platform',
        NODE_OPTIONS: '--max-old-space-size=2048',
      },
      watch: false,
      max_memory_restart: '3800M',
      restart_delay: 5000,
      exp_backoff_restart_delay: 5000,
      max_restarts: 50,
      listen_timeout: 120000,
      kill_timeout: 15000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/z/my-project/.logs/cryptsk-isp-error.log',
      out_file: '/home/z/my-project/.logs/cryptsk-isp-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 2. RADIUS Service (Port 3799) ──────────────────────
    {
      name: 'cryptsk-radius-service',
      script: 'index.ts',
      interpreter: 'bun',
      cwd: '/home/z/my-project/mini-services/radius-service',
      env: {
        DATABASE_URL: 'postgresql://cryptsk:Cryptsk2026@127.0.0.1:5432/ispplatform',
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/z/my-project/.logs/radius-service-error.log',
      out_file: '/home/z/my-project/.logs/radius-service-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 3. IPS Daemon (Port 3030) ───────────────────────────
    {
      name: 'cryptsk-ips-daemon',
      script: 'index.ts',
      interpreter: 'bun',
      cwd: '/home/z/my-project/mini-services/ips-daemon',
      env: {
        DATABASE_URL: 'postgresql://cryptsk:Cryptsk2026@127.0.0.1:5432/ispplatform',
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/z/my-project/.logs/ips-daemon-error.log',
      out_file: '/home/z/my-project/.logs/ips-daemon-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 4. nDPI Service (Port 3031) ─────────────────────────
    {
      name: 'cryptsk-ndpi-service',
      script: 'index.ts',
      interpreter: 'bun',
      cwd: '/home/z/my-project/mini-services/ndpi-service',
      env: {
        DATABASE_URL: 'postgresql://cryptsk:Cryptsk2026@127.0.0.1:5432/ispplatform',
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/z/my-project/.logs/ndpi-service-error.log',
      out_file: '/home/z/my-project/.logs/ndpi-service-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 5. Gateway Service (Port 3005) ───────────────────────
    {
      name: 'cryptsk-gateway-service',
      script: 'index.ts',
      interpreter: 'bun',
      cwd: '/home/z/my-project/mini-services/gateway-service',
      env: {
        DATABASE_URL: 'postgresql://cryptsk:Cryptsk2026@127.0.0.1:5432/ispplatform',
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/z/my-project/.logs/gateway-service-error.log',
      out_file: '/home/z/my-project/.logs/gateway-service-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 6. Multi-WAN Monitor (Port 3006) ────────────────────
    {
      name: 'cryptsk-multiwan-monitor',
      script: 'index.ts',
      interpreter: 'bun',
      cwd: '/home/z/my-project/mini-services/multiwan-monitor',
      env: {
        DATABASE_URL: 'postgresql://cryptsk:Cryptsk2026@127.0.0.1:5432/ispplatform',
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/z/my-project/.logs/multiwan-monitor-error.log',
      out_file: '/home/z/my-project/.logs/multiwan-monitor-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 7. Syslog Service (UDP Port 1514) ───────────────────
    {
      name: 'cryptsk-syslog-service',
      script: 'index.ts',
      interpreter: 'bun',
      cwd: '/home/z/my-project/mini-services/syslog-service',
      env: {
        DATABASE_URL: 'postgresql://cryptsk:Cryptsk2026@127.0.0.1:5432/ispplatform',
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/z/my-project/.logs/syslog-service-error.log',
      out_file: '/home/z/my-project/.logs/syslog-service-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 8. Diameter Service (Port 3870) ─────────────────────
    {
      name: 'cryptsk-diameter-service',
      script: 'index.ts',
      interpreter: 'bun',
      cwd: '/home/z/my-project/mini-services/diameter-service',
      env: {},
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/z/my-project/.logs/diameter-service-error.log',
      out_file: '/home/z/my-project/.logs/diameter-service-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 9. SNMP Service (Port 3020) ──────────────────────────
    {
      name: 'cryptsk-snmp-service',
      script: 'index.ts',
      interpreter: 'bun',
      cwd: '/home/z/my-project/mini-services/snmp-service',
      env: {},
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/z/my-project/.logs/snmp-service-error.log',
      out_file: '/home/z/my-project/.logs/snmp-service-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 10. Network Monitor (polling only) ────────────────
    {
      name: 'cryptsk-network-monitor',
      script: 'index.ts',
      interpreter: 'bun',
      cwd: '/home/z/my-project/mini-services/network-monitor',
      env: {
        DATABASE_URL: 'postgresql://cryptsk:Cryptsk2026@127.0.0.1:5432/ispplatform',
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/z/my-project/.logs/network-monitor-error.log',
      out_file: '/home/z/my-project/.logs/network-monitor-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 11. Billing Cron (scheduled tasks) ────────────────
    {
      name: 'cryptsk-billing-cron',
      script: 'index.ts',
      interpreter: 'bun',
      cwd: '/home/z/my-project/mini-services/billing-cron',
      env: {
        DATABASE_URL: 'postgresql://cryptsk:Cryptsk2026@127.0.0.1:5432/ispplatform',
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/z/my-project/.logs/billing-cron-error.log',
      out_file: '/home/z/my-project/.logs/billing-cron-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 12. WhatsApp Bot (webhook receiver) ────────────────
    {
      name: 'cryptsk-whatsapp-bot',
      script: 'index.ts',
      interpreter: 'bun',
      cwd: '/home/z/my-project/mini-services/whatsapp-bot',
      env: {
        DATABASE_URL: 'postgresql://cryptsk:Cryptsk2026@127.0.0.1:5432/ispplatform',
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/z/my-project/.logs/whatsapp-bot-error.log',
      out_file: '/home/z/my-project/.logs/whatsapp-bot-out.log',
      merge_logs: true,
      time: true,
    },

    // ─── 13. Session Engine (internal) ──────────────────────
    {
      name: 'cryptsk-session-engine',
      script: 'index.ts',
      interpreter: 'bun',
      cwd: '/home/z/my-project/mini-services/session-engine',
      env: {
        DATABASE_URL: 'postgresql://cryptsk:Cryptsk2026@127.0.0.1:5432/ispplatform',
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 30,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/z/my-project/.logs/session-engine-error.log',
      out_file: '/home/z/my-project/.logs/session-engine-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
