#!/bin/bash
# =============================================================================
# Chrome Launcher Script - SINGLE SOURCE OF TRUTH FOR CHROME FLAGS
# Called via docker exec when session starts with URL argument
# First launch: opens to user's URL
# Subsequent reopens: opens to Chrome new tab page (start screen)
# =============================================================================

URL="${1:-https://www.google.com}"
FIRST_RUN=true

# Launch Chrome in a restart loop - if closed/crashed, reopens automatically
while true; do
    if [ "$FIRST_RUN" = true ]; then
        # First launch: open to user's requested URL
        google-chrome \
          --no-sandbox \
          --disable-gpu-sandbox \
          --ignore-gpu-blocklist \
          --enable-gpu-rasterization \
          --enable-webgpu-developer-features \
          --start-maximized \
          --no-first-run \
          --disable-infobars \
          --disable-session-crashed-bubble \
          --noerrdialogs \
          --force-dark-mode \
          --enable-features=WebUIDarkMode \
          --disable-features=TranslateUI,PasswordManagerOnboarding,MediaRouter \
          --disable-component-update \
          --disable-sync \
          --disable-default-apps \
          --disable-background-mode \
          --disable-prompt-on-repost \
          --disable-domain-reliability \
          --disable-breakpad \
          --metrics-recording-only \
          --no-default-browser-check \
          --no-pings \
          --disk-cache-dir=/tmp/chrome-cache \
          --disk-cache-size=1073741824 \
          "$URL"
        FIRST_RUN=false
    else
        # Subsequent launches: open to Chrome new tab page (start screen)
        google-chrome \
          --no-sandbox \
          --disable-gpu-sandbox \
          --ignore-gpu-blocklist \
          --enable-gpu-rasterization \
          --enable-webgpu-developer-features \
          --start-maximized \
          --no-first-run \
          --disable-infobars \
          --disable-session-crashed-bubble \
          --noerrdialogs \
          --force-dark-mode \
          --enable-features=WebUIDarkMode \
          --disable-features=TranslateUI,PasswordManagerOnboarding,MediaRouter \
          --disable-component-update \
          --disable-sync \
          --disable-default-apps \
          --disable-background-mode \
          --disable-prompt-on-repost \
          --disable-domain-reliability \
          --disable-breakpad \
          --metrics-recording-only \
          --no-default-browser-check \
          --no-pings \
          --disk-cache-dir=/tmp/chrome-cache \
          --disk-cache-size=1073741824 \
          "chrome://newtab"
    fi
    sleep 1
done
