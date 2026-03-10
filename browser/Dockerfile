# Clean KDE Ubuntu Test Image
# Minimal — just the base KDE image + toolbar injection
# No Chrome, no security hardening — purely for testing KDE smoothness

FROM lscr.io/linuxserver/webtop:ubuntu-kde

# Stage toolbar files for runtime injection
COPY toolbar/toolbar.css /opt/toolbar/toolbar.css
COPY toolbar/toolbar.js  /opt/toolbar/toolbar.js

# Minimal init script — just toolbar injection
COPY scripts/01-setup-chrome.sh /custom-cont-init.d/01-setup-chrome.sh
RUN chmod +x /custom-cont-init.d/01-setup-chrome.sh

# Keep launch-chrome.sh so backend doesn't error (will just fail silently)
COPY scripts/launch-chrome.sh /usr/local/bin/launch-chrome.sh
RUN chmod +x /usr/local/bin/launch-chrome.sh
