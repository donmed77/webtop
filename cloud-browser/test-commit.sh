#!/bin/bash
# test-commit.sh — Spin up any commit on port 8443 for comparison
# Usage:
#   ./test-commit.sh <commit-hash>   → build & run test instance
#   ./test-commit.sh down            → tear down test instance

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEST_DIR="/tmp/cb-test"
PROJECT_NAME="test-cb"
TEST_BACKEND_PORT=4005
TEST_FRONTEND_PORT=4008
NGINX_TEST_CONF="/etc/nginx/sites-available/test-compare.conf"
NGINX_TEST_LINK="/etc/nginx/sites-enabled/test-compare.conf"

teardown() {
    echo "🧹 Tearing down test instance..."
    cd "$TEST_DIR/cloud-browser" 2>/dev/null && docker compose -p "$PROJECT_NAME" down --remove-orphans 2>/dev/null || true
    rm -f "$NGINX_TEST_CONF" "$NGINX_TEST_LINK" 2>/dev/null || true
    nginx -s reload 2>/dev/null || true
    cd "$SCRIPT_DIR"
    git worktree remove "$TEST_DIR" --force 2>/dev/null || true
    rm -rf "$TEST_DIR" 2>/dev/null || true
    echo "✅ Test instance removed."
}

if [ "$1" = "down" ]; then
    teardown
    exit 0
fi

if [ -z "$1" ]; then
    echo "Usage: $0 <commit-hash> | down"
    exit 1
fi

COMMIT="$1"

# Verify commit exists
cd "$SCRIPT_DIR"
if ! git cat-file -t "$COMMIT" >/dev/null 2>&1; then
    echo "❌ Commit $COMMIT not found"
    exit 1
fi

SHORT=$(git rev-parse --short "$COMMIT")
echo "🔧 Setting up test instance for commit $SHORT..."

# Teardown any previous test
teardown 2>/dev/null || true

# Create worktree
echo "📂 Creating worktree at $TEST_DIR..."
git worktree add "$TEST_DIR" "$COMMIT" --detach 2>/dev/null

# Create docker-compose override for different ports and container names
# Patch the base docker-compose.yml: remove Redis host port, change container names/ports
cd "$TEST_DIR/cloud-browser"
sed -i 's/- "6379:6379"/- "7379:6379"/' docker-compose.yml
sed -i 's/container_name: cloud-browser-redis/container_name: test-cb-redis/' docker-compose.yml
sed -i 's/container_name: cloud-browser-backend/container_name: test-cb-backend/' docker-compose.yml
sed -i 's/container_name: cloud-browser-frontend/container_name: test-cb-frontend/' docker-compose.yml
sed -i 's/- "3005:3005"/- "4005:3005"/' docker-compose.yml
sed -i 's/- "3002:3000"/- "4008:3000"/' docker-compose.yml
sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=https://test.unshortlink.com:8443|" docker-compose.yml
sed -i "s|NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=https://test.unshortlink.com:8443/api|" docker-compose.yml
sed -i 's/POOL_SIZE=.*/POOL_SIZE=1/' docker-compose.yml
sed -i 's/INITIAL_WARM=.*/INITIAL_WARM=1/' docker-compose.yml
sed -i 's/MAX_CONTAINERS=.*/MAX_CONTAINERS=2/' docker-compose.yml
sed -i 's/PORT_RANGE_START=.*/PORT_RANGE_START=5000/' docker-compose.yml
sed -i 's/PORT_RANGE_END=.*/PORT_RANGE_END=5200/' docker-compose.yml
cd "$SCRIPT_DIR"

# Create Nginx config for port 8443
cat > "$NGINX_TEST_CONF" <<'NGINX'
server {
    listen 8443 ssl http2;
    listen [::]:8443 ssl http2;
    server_name test.unshortlink.com;

    ssl_certificate /etc/letsencrypt/live/test.unshortlink.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/test.unshortlink.com/privkey.pem;

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:4005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /socket.io/ {
        proxy_pass http://127.0.0.1:4005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Browser sessions (port range 5000-5200 for test)
    location ~ ^/browser/(\d+)/?$ {
        set $browser_port $1;
        proxy_pass http://127.0.0.1:$browser_port/;
        proxy_http_version 1.1;
        proxy_hide_header X-Frame-Options;
        proxy_hide_header Content-Security-Policy;
        proxy_hide_header Content-Security-Policy-Report-Only;

        sub_filter_once on;
        sub_filter_types text/html;

        sub_filter '</head>' '<style>
        .virtual-keyboard-button { display: none !important; }
        .status-bar, #playButton { display: none !important; }
        .sidebar, .toggle-button-sidebar, .dashboard-overlay-container { display: none !important; }
        </style></head>';

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache off;
    }

    # Browser sub-resources
    location ~ ^/browser/(\d+)/(.+)$ {
        set $browser_port $1;
        set $browser_path $2;
        proxy_pass http://127.0.0.1:$browser_port/$browser_path$is_args$args;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_hide_header X-Frame-Options;
        proxy_hide_header Content-Security-Policy;
        proxy_set_header Host $host;
        proxy_cache off;
    }

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:4008;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

# Enable and reload nginx
ln -sf "$NGINX_TEST_CONF" "$NGINX_TEST_LINK"
if nginx -t 2>&1; then
    nginx -s reload
    echo "✅ Nginx configured on port 8443"
else
    echo "❌ Nginx config error"
    rm -f "$NGINX_TEST_CONF" "$NGINX_TEST_LINK"
    exit 1
fi

# Build and run
echo "🔨 Building test instance (commit $SHORT)..."
cd "$TEST_DIR/cloud-browser"
docker compose -p "$PROJECT_NAME" up -d --build 2>&1 | tail -15

echo ""
echo "============================================"
echo "✅ Test instance running!"
echo "   Commit:  $SHORT"
echo "   URL:     https://test.unshortlink.com:8443"
echo "   Current: https://test.unshortlink.com"
echo ""
echo "   Tear down: ./test-commit.sh down"
echo "============================================"
