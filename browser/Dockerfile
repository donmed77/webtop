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

# Stage toolbar files for runtime injection
COPY toolbar/toolbar.css /opt/toolbar/toolbar.css
COPY toolbar/toolbar.js  /opt/toolbar/toolbar.js

# Minimal init script — just toolbar injection
COPY scripts/01-setup-chrome.sh /custom-cont-init.d/01-setup-chrome.sh
RUN chmod +x /custom-cont-init.d/01-setup-chrome.sh

# Keep launch-chrome.sh so backend doesn't error (will just fail silently)
COPY scripts/launch-chrome.sh /usr/local/bin/launch-chrome.sh
RUN chmod +x /usr/local/bin/launch-chrome.sh
