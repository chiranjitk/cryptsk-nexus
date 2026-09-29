# Deploy — Rocky Linux 10 Production Deployment

This directory contains everything needed to deploy CRYPTSK Nexus on a bare-metal
Rocky Linux 10.x appliance (or a VM with DPDK-capable NICs).

## Files

| File | Purpose |
|---|---|
| `install-rocky10.sh` | One-shot installer: packages, Go, DPDK, VPP, FreeRADIUS, PostgreSQL, Bun, CRYPTSK repo clone, systemd units |
| `systemd/` | systemd unit files for all services (no PM2 — 10_AI_AGENT §33) |
| `caddy/` | Production Caddyfile (TLS auto via Let's Encrypt) |
| `postgres/` | PostgreSQL migrations runner + `pgsql-production/complete-database.sql` (8 DB functions, 5 reporting views, FreeRADIUS native tables) |

## Target prerequisites

- Rocky Linux 10.x Minimal install (kernel 6.12.x target)
- DPDK-capable NIC (Intel X710/XL710, Mellanox ConnectX-4/5/6, etc.) — for production 50 Gbps target
- For dev/cert: 10 Gbps NIC is sufficient (per user, 2026-09-28)
- Sufficient RAM for hugepages (VPP wants 1 GB × N hugepages)
- Isolated CPU cores for VPP workers (`isolcpus` kernel arg)
- Public IP for management (Caddy will use it for TLS)

## Install workflow

```bash
# On a fresh Rocky 10 box as root:
git clone https://github.com/chiranjitk/cryptsk-nexus.git /opt/cryptsk
cd /opt/cryptsk
./deploy/install-rocky10.sh

# After install completes:
systemctl start cryptsk-oss-bss cryptsk-session-engine cryptsk-freeradius cryptsk-vpp
systemctl status cryptsk-*
```

## Status

🚧 **Phase 0 — scaffolding only.** Real install script + systemd units land
in Phase 0 (later commit) and Phase 6 (VPP). See
`docs/architecture/12_IMPLEMENTATION_PHASE_ROADMAP.md`.
