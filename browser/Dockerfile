# KDE Ubuntu Session Image — Clean Chrome (matching :9500 test image)
# No policies, no presets, no extra flags

FROM lscr.io/linuxserver/webtop:ubuntu-kde

# Install Google Chrome
RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && \
    apt-get install -y google-chrome-stable && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Replace google-chrome with a wrapper that always injects flags
# This ensures flags are applied regardless of how Chrome is launched
# (Plasma autostart, desktop icon, docker exec, etc.)
RUN mv /usr/bin/google-chrome-stable /usr/bin/google-chrome-real && \
    printf '#!/bin/bash\nwhile true; do\n  /usr/bin/google-chrome-real \\\n  --no-sandbox \\\n  --start-maximized \\\n  --no-first-run \\\n  --disable-infobars \\\n  --disable-session-crashed-bubble \\\n  --noerrdialogs \\\n  --disable-features=TranslateUI,PasswordManagerOnboarding,MediaRouter \\\n  --disable-component-update \\\n  --disable-sync \\\n  --disable-default-apps \\\n  --disable-background-mode \\\n  --disable-prompt-on-repost \\\n  --disable-domain-reliability \\\n  --disable-breakpad \\\n  --metrics-recording-only \\\n  --no-default-browser-check \\\n  --no-pings \\\n  --disk-cache-dir=/tmp/chrome-cache \\\n  --disk-cache-size=1073741824 \\\n  "$@"\n  sleep 1\ndone\n' > /usr/bin/google-chrome-stable && \
    chmod +x /usr/bin/google-chrome-stable

# Suppress --no-sandbox security warning via Chrome policy
RUN mkdir -p /etc/opt/chrome/policies/managed && \
    echo '{"CommandLineFlagSecurityWarningsEnabled": false}' > /etc/opt/chrome/policies/managed/policies.json

# Stage toolbar files for runtime injection
COPY toolbar/toolbar.css /opt/toolbar/toolbar.css
COPY toolbar/toolbar.js  /opt/toolbar/toolbar.js

# Minimal init script — just toolbar injection
COPY scripts/01-setup-chrome.sh /custom-cont-init.d/01-setup-chrome.sh
RUN chmod +x /custom-cont-init.d/01-setup-chrome.sh

# Chrome launcher for backend docker exec
COPY scripts/launch-chrome.sh /usr/local/bin/launch-chrome.sh
RUN chmod +x /usr/local/bin/launch-chrome.sh
