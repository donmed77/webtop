#!/bin/bash
# ============================================================
# Chrome Kiosk Wrapper Script
# Monitors Chrome process and auto-restarts if it crashes
# ============================================================

set -u

# Configurable startup URL (can be overridden via environment)
STARTUP_URL="${CHROME_STARTUP_URL:-https://www.google.com}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

clean_locks() {
    rm -f /config/.config/google-chrome/SingletonLock \
          /config/.config/google-chrome/SingletonSocket \
          /config/.config/google-chrome/SingletonCookie 2>/dev/null
}

# Initial cleanup
clean_locks

log "Chrome Kiosk starting with URL: $STARTUP_URL"

while true; do
    clean_locks
    log "Starting Chrome..."

    /usr/bin/google-chrome \
        --no-sandbox \
        --disable-gpu-sandbox \
        --ignore-gpu-blocklist \
        --enable-gpu-rasterization \
        --enable-webgpu-developer-features \
        --force-dark-mode \
        --start-maximized \
        --disable-session-crashed-bubble \
        --disable-infobars \
        --noerrdialogs \
        --disable-translate \
        --no-first-run \
        --no-default-browser-check \
        --disable-features=TranslateUI,PasswordManagerOnboarding \
        --password-store=basic \
        --disable-background-networking \
        --disable-sync \
        --kiosk "$STARTUP_URL" &

    CHROME_PID=$!
    wait $CHROME_PID
    EXIT_CODE=$?
    
    log "Chrome exited with code $EXIT_CODE. Restarting in 2 seconds..."
    sleep 2
done
