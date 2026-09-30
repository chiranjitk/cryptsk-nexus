# CRYPTSK Nexus — VPP + DPDK + Full Stack Installation Guide

This guide walks you through installing the **complete CRYPTSK ISP Platform** (or just VPP+DPDK) on a fresh OS.

## 📋 Prerequisites

- **Fresh OS install** (no LAMP/LEMP stack running)
- **Root access** (`sudo su -` or `sudo bash <script>`)
- **Minimum specs**: 4GB RAM, 2 CPU cores, 20GB disk
- **Recommended**: 8GB RAM, 4 CPU cores, 50GB disk (for production traffic)
- **NIC**: 1× 1Gbps+ NIC (any Intel/VMXNET3/VirtIO; Mellanox for DPDK)

## 🎯 Supported Operating Systems

| OS Family | Versions |
|---|---|
| RHEL family | Rocky Linux 10, RHEL 10, CentOS Stream 10, AlmaLinux 10 |
| Debian family | Debian 12 (Bookworm), Debian 13 (Trixie), Ubuntu 22.04 LTS, Ubuntu 24.04 LTS |

## 🚀 Quick Start (One-Liner)

### Option A: Full Stack (VPP + DPDK + PostgreSQL + Next.js + GoVPP + FreeRADIUS + nDPI)

```bash
# Run as root on a fresh OS:
curl -fsSL https://raw.githubusercontent.com/chiranjitk/cryptsk-nexus/main/scripts/setup-new-os.sh | bash
```

### Option B: VPP + DPDK Only (for a dedicated dataplane box)

```bash
curl -fsSL https://raw.githubusercontent.com/chiranjitk/cryptsk-nexus/main/scripts/setup-vpp-dpdk-only.sh | bash
```

## 📥 Download + Customize (recommended)

For production use, download the script first so you can customize the env vars:

```bash
# Download the full setup script
wget -O /root/setup.sh https://raw.githubusercontent.com/chiranjitk/cryptsk-nexus/main/scripts/setup-new-os.sh
chmod +x /root/setup.sh

# Edit env vars (optional — defaults are sensible for dev/cert)
vi /root/setup.sh

# Run as root
sudo bash /root/setup.sh
```

## ⚙️ Customizable Environment Variables

Set these before running the script (via `export` or by editing the script directly):

### Database
| Variable | Default | Description |
|---|---|---|
| `DB_NAME` | `cryptsknexus` | PostgreSQL database name |
| `DB_USER` | `cryptsknexus` | PostgreSQL user |
| `DB_PASS` | `CryptskNexus2026` | PostgreSQL password |
| `DB_HOST` | `127.0.0.1` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |

### App
| Variable | Default | Description |
|---|---|---|
| `APP_DIR` | `/opt/ispplatform` | Where to clone the app |
| `ADMIN_EMAIL` | `admin@cryptsk.com` | Admin user email |
| `ADMIN_PASS` | `Admin@2026` | Admin user password |
| `APP_PORT` | `3000` | Next.js port |
| `SESSION_SECRET` | `cryptsk_session_secret_key_2026_isp_platform` | Session HMAC secret |
| `RADIUS_API_SECRET` | `cryptsk-radius-shared-secret-2026` | Shared secret for FreeRADIUS rlm_rest → session-engine m2m |

### VPP / DPDK
| Variable | Default | Description |
|---|---|---|
| `VPP_VERSION` | `stable/2606` | VPP git branch (use `stable/2606` for v26.06, `master` for latest) |
| `INSTALL_VPP_FROM_SOURCE` | `true` | Set `false` to skip VPP source build (use pre-built packages only) |
| `CONFIGURE_DPDK_NIC` | `true` | Set `false` to use TAP fallback only (for VMs without PCI NIC binding) |
| `DPDK_NIC_PCI` | (auto-detect) | PCI address of NIC for DPDK (e.g. `0000:13:00.0`) |
| `NR_HUGEPAGES` | `1024` | Number of 2MB hugepages (1024 = 2GB) |

### GitHub
| Variable | Default | Description |
|---|---|---|
| `GITHUB_REPO` | `https://github.com/chiranjitk/cryptsk-nexus.git` | Repo to clone |
| `GITHUB_BRANCH` | `main` | Branch to checkout |

### Other
| Variable | Default | Description |
|---|---|---|
| `START_FIREWALL` | `false` | Set `true` to configure firewalld/ufw |

## 🎛 Example: Production Install with Custom Vars

```bash
sudo DB_PASS='MySecureDbPass2026' \
     ADMIN_PASS='MySecureAdminPass2026' \
     SESSION_SECRET='my-long-random-secret-32chars-min' \
     RADIUS_API_SECRET='my-radius-shared-secret-2026' \
     DPDK_NIC_PCI='0000:13:00.0' \
     START_FIREWALL=true \
     bash setup-new-os.sh
```

## 📊 What the Full Script Installs

`setup-new-os.sh` performs these steps in order:

| Step | Action | Duration |
|---|---|---|
| 1 | System update + base packages | 1-2 min |
| 2 | Go 1.26+ (for GoVPP adapter) | 30s |
| 3 | DPDK 25.11 (from package manager) | 30s |
| 4 | Hugepages configuration (1024 × 2MB = 2GB) | 5s |
| 5 | **Build VPP v26.06 from source** | **10-20 min** |
| 6 | Configure VPP (startup.conf + systemd) | 10s |
| 7 | PostgreSQL 18 + create DB + user | 1-2 min |
| 8 | Node.js 22 + Bun + PM2 + pnpm | 30s |
| 9 | FreeRADIUS 3.2 + rlm_rest module | 30s |
| 10 | Clone CRYPTSK Nexus app from GitHub | 30s |
| 11 | Install deps (npm + bun + prisma db push + generate) | 1-2 min |
| 12 | Build Next.js (webpack, `next build`) | 5-10 min |
| 13 | Build GoVPP adapter (Go binary) | 30s |
| 14 | Configure FreeRADIUS rlm_rest + clients + sites | 30s |
| 15 | Start PM2 processes (Next.js + 3 mini-services) | 10s |
| 16 | Configure systemd for govpp-adapter | 10s |
| 17 | Seed admin user + initial data | 30s |
| 18 | Configure firewall (optional) | 10s |
| 19 | End-to-end verification | 30s |

**Total time**: 20-40 minutes (mostly VPP source build + Next.js build).

## 📊 What the VPP-only Script Installs

`setup-vpp-dpdk-only.sh` performs these steps:

| Step | Action | Duration |
|---|---|---|
| 1 | System update + build tools | 1-2 min |
| 2 | DPDK 25.11 (from package manager) | 30s |
| 3 | Hugepages (1024 × 2MB = 2GB) | 5s |
| 4 | Build VPP v26.06 from source | 10-20 min |
| 5 | Auto-detect NIC PCI + write startup.conf + systemd | 10s |

**Total time**: 15-25 minutes.

## ✅ Verification

After the script completes, verify the install:

### Full Stack
```bash
# All services
pm2 status
systemctl is-active vpp cryptsk-govpp-adapter radiusd postgresql-18

# VPP
vppctl show version
vppctl show interface
vppctl show policer

# App
curl -s http://localhost:3000/

# Session Engine
curl -s http://localhost:3010/api/health

# GoVPP Adapter
curl -s http://localhost:3016/health

# FreeRADIUS
radtest admin@cryptsk.com Admin@2026 127.0.0.1:1812 0 testing123
```

### VPP-Only
```bash
systemctl is-active vpp
vppctl show version
vppctl show interface
vppctl show plugins | head -10
grep HugePages /proc/meminfo
```

## 🌐 Accessing the App

After full-stack install:

| URL | Purpose |
|---|---|
| `http://<server-ip>:3000` | Next.js app (login page) |
| `http://<server-ip>:3010/api/health` | Session engine health |
| `http://<server-ip>:3015/health` | VPP adapter health |
| `http://<server-ip>:3016/health` | GoVPP adapter health |
| `http://<server-ip>:3031/health` | nDPI service health |

**Login credentials** (defaults — change via env vars):
- Email: `admin@cryptsk.com`
- Password: `Admin@2026`

## 🔧 Common Issues + Fixes

### 1. VPP build fails with "DPDK not found"
The script installs DPDK from the OS package manager. If the build still can't find it:
```bash
# Verify DPDK headers
ls /usr/include/dpdk/         # RHEL
ls /usr/include/dpdk-rte/     # Debian/Ubuntu

# If missing, install manually:
# RHEL:
dnf install -y dpdk-devel dpdk-tools
# Debian/Ubuntu:
apt install -y libdpdk-dev dpdk-dev
```

### 2. Hugepages not allocated
```bash
# Check current
grep HugePages /proc/meminfo

# Force allocation
sudo sysctl -w vm.nr_hugepages=1024

# If still 0, your kernel doesn't support hugepages — reboot and try again
```

### 3. VPP service won't start
```bash
# Check logs
journalctl -u vpp -n 50 --no-pager

# Common causes:
# - NIC PCI address wrong (edit /etc/vpp/startup.conf and remove the dpdk {} block)
# - DPDK driver not loaded (modprobe vfio-pci or modprobe uio_pci_generic)
# - Permission issues (chmod 666 /dev/vfio/vfio or /dev/uio0)
```

### 4. GoVPP adapter can't connect to VPP
```bash
# Check VPP API socket exists
ls -la /run/vpp/api.sock

# Check GoVPP adapter logs
journalctl -u cryptsk-govpp-adapter -n 30 --no-pager

# Restart GoVPP adapter
systemctl restart cryptsk-govpp-adapter
```

### 5. FreeRADIUS rlm_rest "module not found"
The `freeradius-rest` package must be installed separately on some OSes:
```bash
# RHEL/Rocky
dnf install -y freeradius-rest

# Debian/Ubuntu
apt install -y freeradius-rest

# Verify the .so file
ls -la /usr/lib*/freeradius/rlm_rest.so
```

### 6. PostgreSQL "Authentication failed"
```bash
# Edit pg_hba.conf to trust local connections
# RHEL: /var/lib/pgsql/18/data/pg_hba.conf
# Debian: /etc/postgresql/18/main/pg_hba.conf

# Add this at the top:
# local   all             all                                     trust
# host    all             all             127.0.0.1/32            md5
# host    all             all             ::1/128                 md5

# Restart PostgreSQL
# RHEL:
systemctl restart postgresql-18
# Debian:
systemctl restart postgresql
```

### 7. Next.js build OOM (out of memory)
```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=2048" npx next build

# Or use 4GB if you have RAM
NODE_OPTIONS="--max-old-space-size=4096" npx next build
```

### 8. PM2 process won't stay alive
```bash
# Check PM2 logs
pm2 logs <process-name> --lines 50

# Common causes:
# - Missing env vars (set DATABASE_URL etc in PM2 ecosystem file)
# - Wrong working directory (check --cwd flag)
# - Bun not in PATH for PM2 (run: pm2 update)
```

## 🔄 Re-running the Script

Both scripts are **idempotent** — safe to re-run. They skip steps that are already done (e.g., if PostgreSQL is installed, it won't reinstall). Re-run is useful to:
- Update the app to latest version
- Rebuild VPP after changing startup.conf
- Apply OS updates
- Restart services

## 📜 Logs

| Log | Location |
|---|---|
| Full setup log | `/var/log/cryptsk-setup.log` |
| VPP setup log | `/var/log/cryptsk-vpp-setup.log` |
| VPP runtime | `journalctl -u vpp -f` |
| GoVPP adapter | `journalctl -u cryptsk-govpp-adapter -f` |
| FreeRADIUS | `journalctl -u radiusd -f` (or `freeradius` on Debian) |
| PostgreSQL | `journalctl -u postgresql-18 -f` (or `postgresql`) |
| Next.js | `pm2 logs cryptsk-nextjs` |
| Session Engine | `pm2 logs cryptsk-session-engine` |
| VPP Adapter | `pm2 logs cryptsk-vpp-adapter` |
| nDPI Service | `pm2 logs cryptsk-ndpi-service` |

## 🏗 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  CRYPTSK Nexus — Full Stack                                 │
│                                                              │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────┐   │
│  │  Next.js UI  │───▶│  Session Engine   │───▶│  VPP     │   │
│  │  (port 3000) │    │  (port 3010)      │    │  Adapter │   │
│  └──────────────┘    │  - transactional   │    │  (3015)  │   │
│         ▲            │    login flow     │    └────┬─────┘   │
│         │            └─────────┬──────────┘         │         │
│         │                      │                    ▼         │
│         │                      │       ┌──────────────────┐   │
│         │                      │       │  GoVPP Adapter  │   │
│         │                      │       │  (port 3016)     │   │
│         │                      │       │  Go binary API   │   │
│         │                      │       └────────┬─────────┘   │
│         │                      │                │             │
│         │                      ▼                ▼             │
│         │           ┌──────────────────┐   ┌──────────────┐   │
│         │           │  FreeRADIUS       │   │  VPP v26.06  │   │
│         │           │  (port 1812)      │   │  + DPDK      │   │
│         │           │  + rlm_rest →     │   │  (hugepages) │   │
│         │           │  /api/radius/auth │   │              │   │
│         │           └──────────────────┘   └──────────────┘   │
│         │                                                    │
│  ┌──────┴──────┐  ┌──────────────────┐                     │
│  │  PostgreSQL │  │  nDPI Service    │                     │
│  │  18 (DB)    │  │  (port 3031)     │                     │
│  └─────────────┘  └──────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

## 📚 Additional Resources

- [Worklog](../worklog.md) — Full development history
- [CICD Guide](../CICD-GUIDE.md) — CI/CD deploy via SSH
- [Fresh Setup Guide](../FRESH-SETUP-GUIDE.md) — Manual setup steps
- [CRYPTSK Feature Sheet](../CRYPTSK-FINAL-FEATURE-SHEET.md) — Full feature list

## 🆘 Getting Help

If the script fails:
1. Check `/var/log/cryptsk-setup.log` (full output)
2. Check the specific service log (see Logs table above)
3. Re-run the script — it's idempotent and will skip completed steps
4. Report issues: https://github.com/chiranjitk/cryptsk-nexus/issues

## 📝 License

CRYPTSK Nexus — proprietary. See repository for license details.
