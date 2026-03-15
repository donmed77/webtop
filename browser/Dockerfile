# Hardened KDE Ubuntu Session Image
# Based on LinuxServer webtop:ubuntu-kde
# Removes all unnecessary programs (terminals, editors, file managers)
# for a locked-down browser-only session

FROM lscr.io/linuxserver/webtop:ubuntu-kde

# =============================================================================
# Remove unnecessary programs for security & cleanliness
# =============================================================================
RUN apt-get remove --purge -y \
    # Terminals (security risk - shell access)
    konsole \
    foot \
    stterm \
    xterm \
    # Browsers (we use Google Chrome, not Chromium)
    chromium \
    chromium-common \
    # File manager
    dolphin \
    # Text editors
    kate \
    kwrite \
    # File finder
    kfind \
    # Image viewer
    gwenview \
    # System settings (security risk)
    systemsettings \
    # Emoji selector
    fonts-noto-color-emoji \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    # Remove any leftover .desktop files that might still show in KDE menu
    && rm -f /usr/share/applications/org.kde.plasma.emojier.desktop \
    && rm -f /usr/share/applications/org.kde.konsole.desktop \
    && rm -f /usr/share/applications/org.kde.dolphin.desktop \
    && rm -f /usr/share/applications/org.kde.kate.desktop \
    && rm -f /usr/share/applications/org.kde.kwrite.desktop \
    && rm -f /usr/share/applications/org.kde.gwenview.desktop \
    && rm -f /usr/share/applications/org.kde.kfind.desktop \
    && rm -f /usr/share/applications/org.kde.systemsettings.desktop

# Stage toolbar files for runtime injection
COPY toolbar/toolbar.css /opt/toolbar/toolbar.css
COPY toolbar/toolbar.js  /opt/toolbar/toolbar.js

# Init script for runtime configuration
COPY scripts/01-setup-chrome.sh /custom-cont-init.d/01-setup-chrome.sh
RUN chmod +x /custom-cont-init.d/01-setup-chrome.sh

# Keep launch-chrome.sh so backend doesn't error
COPY scripts/launch-chrome.sh /usr/local/bin/launch-chrome.sh
RUN chmod +x /usr/local/bin/launch-chrome.sh
