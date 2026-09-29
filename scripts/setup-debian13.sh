#!/usr/bin/env bash
# Cryptsk ISP Platform — Production Setup for Debian 13
# Run as root: bash setup-debian13.sh
set -euo pipefail

# Color output
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Check root
[ "$(id -u)" -eq 0 ] || error "This script must be run as root"

# System update
info "Updating system packages..."
apt update && apt upgrade -y

# Install essential packages
info "Installing essential packages..."
apt install -y curl wget git unzip build-essential libsqlite3-dev \
  libssl-dev pkg-config libvips-dev nodejs npm \
  caddy python3 python3-pip \
  snmp snmpd fping traceroute dnsutils whois \
  fail2ban ufw logrotate cron \
  sqlite3 postgresql-client

# Install Bun (if not present)
if ! command -v bun &>/dev/null; then
  info "Installing Bun runtime..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi

# Install Node.js via NodeSource (LTS)
if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]; then
  info "Installing Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
fi

# Create cryptsk user
info "Creating cryptsk system user..."
id -u cryptsk &>/dev/null || useradd -r -m -s /bin/bash cryptsk

# Create directories
info "Creating application directories..."
mkdir -p /opt/cryptsk/{app,db,logs,backups,mini-services}
mkdir -p /opt/cryptsk/logs/{nextjs,billing-cron,network-monitor,radius-service,whatsapp-bot}
chown -R cryptsk:cryptsk /opt/cryptsk

# Configure firewall
info "Configuring UFW firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

# Configure logrotate
info "Configuring log rotation..."
cat > /etc/logrotate.d/cryptsk << 'LOGEOF'
/opt/cryptsk/logs/*.log {
  daily
  rotate 30
  compress
  delaycompress
  missingok
  notifempty
  create 0640 cryptsk cryptsk
}
LOGEOF

# Install FreeRADIUS (optional)
info "Checking FreeRADIUS..."
if command -v radiusd &>/dev/null; then
  info "FreeRADIUS is installed"
else
  warn "FreeRADIUS not found. Install with: apt install freeradius"
fi

# Install SNMP tools
info "Installing SNMP MIBs..."
if [ -d /usr/share/snmp/mibs ]; then
  info "SNMP MIBs directory found"
fi

echo ""
info "========================================"
info "  Cryptsk ISP Platform Setup Complete!"
info "========================================"
info ""
info "Next steps:"
info "  1. Copy your app to /opt/cryptsk/app/"
info "  2. Configure /opt/cryptsk/app/.env"
info "  3. Run: bash /opt/cryptsk/app/scripts/deploy.sh"
info "  4. Configure Caddy at /etc/caddy/Caddyfile"
info "  5. Start: systemctl start cryptsk"
echo ""
