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

# =============================================================================
# Install Google Chrome (AFTER removal step so autoremove can't uninstall it)
# =============================================================================
RUN set -e && \
    apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && \
    apt-get install -y google-chrome-stable && \
    google-chrome --version && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# =============================================================================
# KDE KIOSK: System-wide lockdown (cannot be overridden by user)
# Written to /etc/xdg/kdeglobals — the system-wide KDE config
# [$i] suffix = immutable — user cannot change these
# =============================================================================
RUN printf '\n\
[KDE Action Restrictions][$i]\n\
plasma/allow_configure_when_locked=false\n\
action/configdesktop=false\n\
action/lock widgets=false\n\
run_command=false\n\
shell_access=false\n\
logout=false\n\
action/start_new_session=false\n\
action/switch_user=false\n' >> /etc/xdg/kdeglobals

# =============================================================================
# Security Hardening: Remove abc from privileged groups
# =============================================================================
RUN delgroup abc sudo 2>/dev/null || true \
    && delgroup abc docker 2>/dev/null || true

# =============================================================================
# Security Hardening: Strip SUID/SGID from unnecessary binaries
# =============================================================================
RUN chmod u-s /usr/bin/su 2>/dev/null || true \
    && chmod u-s /usr/bin/newgrp 2>/dev/null || true \
    && chmod u-s /usr/bin/chsh 2>/dev/null || true \
    && chmod u-s /usr/bin/chfn 2>/dev/null || true \
    && chmod u-s /usr/bin/mount 2>/dev/null || true \
    && chmod u-s /usr/bin/umount 2>/dev/null || true \
    && chmod u-s /usr/bin/passwd 2>/dev/null || true \
    && chmod u-s /usr/bin/gpasswd 2>/dev/null || true \
    && chmod g-s /usr/bin/chage 2>/dev/null || true \
    && chmod g-s /usr/bin/expiry 2>/dev/null || true \
    && chmod g-s /usr/bin/ssh-agent 2>/dev/null || true \
    && chmod g-s /usr/bin/crontab 2>/dev/null || true \
    && chmod u-s /usr/bin/fusermount3 2>/dev/null || true \
    && chmod u-s /usr/bin/sudo 2>/dev/null || true

# =============================================================================
# Security Hardening: Remove KDE config module .desktop files + crash handler
# These are accessible through KDE dialogs and provide settings/info access
# =============================================================================
RUN rm -f /usr/share/applications/kcm_*.desktop \
    && rm -f /usr/share/applications/org.kde.drkonqi*.desktop \
    && rm -f /usr/share/applications/org.kde.kcolorschemeeditor.desktop \
    && rm -f /usr/share/applications/org.kde.keditfiletype.desktop \
    && rm -f /usr/share/applications/org.kde.kfontview.desktop \
    && rm -f /usr/share/applications/org.kde.knetattach.desktop \
    && rm -f /usr/share/applications/org.kde.knewstuff-dialog.desktop \
    && rm -f /usr/share/applications/org.kde.kwalletd5.desktop \
    && rm -f /usr/share/applications/org.kde.kwin_rules_dialog.desktop \
    && rm -f /usr/share/applications/org.kde.plasma.settings.open.desktop \
    && rm -f /usr/share/applications/org.kde.klipper.desktop \
    && rm -f /usr/share/applications/org.kde.systemmonitor.desktop \
    && rm -f /usr/share/applications/kwincompositing.desktop \
    && rm -f /usr/share/applications/ktelnetservice5.desktop \
    && rm -f /usr/share/applications/software-properties*.desktop \
    && rm -f /usr/share/applications/breezestyleconfig.desktop \
    && rm -f /usr/share/applications/python3.12.desktop

# Stage toolbar files for runtime injection
COPY toolbar/toolbar.css /opt/toolbar/toolbar.css
COPY toolbar/toolbar.js  /opt/toolbar/toolbar.js

# Init script for runtime configuration
COPY scripts/01-setup-chrome.sh /custom-cont-init.d/01-setup-chrome.sh
RUN chmod +x /custom-cont-init.d/01-setup-chrome.sh

# Keep launch-chrome.sh so backend doesn't error
COPY scripts/launch-chrome.sh /usr/local/bin/launch-chrome.sh
RUN chmod +x /usr/local/bin/launch-chrome.sh
