#!/usr/bin/env bash
# Installs (or updates) EchoReader on a fresh Ubuntu cloud server, e.g. an Oracle Cloud
# "Always Free" instance, behind Caddy with an automatic HTTPS certificate.
#
#   First install:  curl -fsSL https://raw.githubusercontent.com/Nickrockwall/echoreader/main/scripts/cloud/setup.sh | sudo bash
#   Update later:   sudo bash /opt/echoreader/scripts/cloud/setup.sh
#
# Options (environment variables):
#   ECHOREADER_PASSWORD  access password (asked for on first install if not given)
#   ECHOREADER_DOMAIN    your own domain; default <public-ip>.sslip.io, which needs no registration
#   ECHOREADER_REPO      git repository to install from
set -euo pipefail

REPO="${ECHOREADER_REPO:-https://github.com/Nickrockwall/echoreader.git}"
APP_DIR=/opt/echoreader
ENV_FILE=/etc/echoreader.env
SERVICE=echoreader
APP_USER=echoreader

[ "$(id -u)" -eq 0 ] || { echo "请用 sudo 运行这个脚本"; exit 1; }
log() { printf '\n\033[1;31m==>\033[0m %s\n' "$*"; }

log "安装系统软件"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q git curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  log "安装 Node.js（LTS）"
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get install -y -q nodejs
fi

if ! command -v caddy >/dev/null; then
  log "安装 Caddy（负责 HTTPS 证书）"
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
fi

# Small instances (1 GB RAM) need swap to build the client and load the dictionaries.
if [ "$(free -m | awk '/^Mem:/{print $2}')" -lt 3000 ] && ! swapon --show | grep -q /swapfile; then
  log "添加 2 GB 交换空间"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Oracle's Ubuntu images reject everything but SSH in iptables, in addition to the cloud firewall.
log "开放 80 / 443 端口"
for port in 80 443; do
  iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
done
netfilter-persistent save >/dev/null

id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/echoreader --shell /usr/sbin/nologin "$APP_USER"

if [ -d "$APP_DIR/.git" ]; then
  log "更新代码"
  sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only
else
  log "下载代码"
  install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
  sudo -u "$APP_USER" git clone --depth 1 "$REPO" "$APP_DIR"
fi

log "安装依赖并构建（第一次要几分钟）"
cd "$APP_DIR"
sudo -u "$APP_USER" -H npm ci --no-audit --no-fund
sudo -u "$APP_USER" -H npm run build

if [ ! -f "$ENV_FILE" ]; then
  password="${ECHOREADER_PASSWORD:-}"
  while [ -z "$password" ]; do
    read -r -s -p "设置访问密码（手机第一次打开时要输入）：" password < /dev/tty; echo
  done
  ip="$(curl -fsS4 https://api.ipify.org)"
  domain="${ECHOREADER_DOMAIN:-${ip//./-}.sslip.io}"
  umask 077
  cat > "$ENV_FILE" <<EOF
ECHOREADER_PASSWORD=$password
ECHOREADER_DOMAIN=$domain
HOST=127.0.0.1
PORT=3001
NODE_ENV=production
EOF
  chown root:"$APP_USER" "$ENV_FILE"
  chmod 640 "$ENV_FILE"
fi
domain="$(grep '^ECHOREADER_DOMAIN=' "$ENV_FILE" | cut -d= -f2-)"

log "设置后台服务"
cat > /etc/systemd/system/$SERVICE.service <<EOF
[Unit]
Description=EchoReader
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR/server
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node $APP_DIR/node_modules/tsx/dist/cli.mjs src/index.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/caddy/Caddyfile <<EOF
$domain {
	encode gzip
	reverse_proxy 127.0.0.1:3001
}
EOF

systemctl daemon-reload
systemctl enable --now $SERVICE >/dev/null
systemctl restart $SERVICE
systemctl reload caddy || systemctl restart caddy

log "完成"
echo "用手机打开：https://$domain"
echo "第一次启动要解压词典，大约需要 1 分钟。查看运行日志：sudo journalctl -u $SERVICE -f"
