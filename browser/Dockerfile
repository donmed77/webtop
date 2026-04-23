# Hardened KDE Ubuntu Session Image
# Testing: Dockerfile hardening only (no setup script changes)

# Pinned to build 94914aee-ls143 (2026-03-03) — update digest intentionally after testing
FROM lscr.io/linuxserver/webtop:ubuntu-kde@sha256:c476cdc357c969163eb76b8774da81edd91af4309d0f8f517eea15191178bbbd

# =============================================================================
# HARDENING GROUP 1: Remove unnecessary programs
# =============================================================================
RUN apt-get remove --purge -y \
    konsole foot stterm xterm \
    chromium chromium-common \
    dolphin kate kwrite kfind gwenview \
    systemsettings fonts-noto-color-emoji \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /usr/share/applications/org.kde.plasma.emojier.desktop \
    && rm -f /usr/share/applications/org.kde.konsole.desktop \
    && rm -f /usr/share/applications/org.kde.dolphin.desktop \
    && rm -f /usr/share/applications/org.kde.kate.desktop \
    && rm -f /usr/share/applications/org.kde.kwrite.desktop \
    && rm -f /usr/share/applications/org.kde.gwenview.desktop \
    && rm -f /usr/share/applications/org.kde.kfind.desktop \
    && rm -f /usr/share/applications/org.kde.systemsettings.desktop

# Install Google Chrome
RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && \
    apt-get install -y google-chrome-stable && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Chrome wrapper with flags + fast restart loop
RUN mv /usr/bin/google-chrome-stable /usr/bin/google-chrome-real && \
    cat > /usr/bin/google-chrome-stable << 'WRAPPER_EOF'
#!/bin/bash
FLAGS=(
  --no-sandbox
  --start-maximized
  --no-first-run
  --disable-infobars
  --disable-session-crashed-bubble
  --noerrdialogs
  --force-dark-mode
  --disable-features=TranslateUI,PasswordManagerOnboarding,MediaRouter
  --disable-component-update
  --disable-sync
  --disable-default-apps
  --disable-background-mode
  --disable-prompt-on-repost
  --disable-domain-reliability
  --disable-breakpad
  --metrics-recording-only
  --no-default-browser-check
  --no-pings
  --disk-cache-dir=/tmp/chrome-cache
  --disk-cache-size=1073741824
)
CHROME_DIR="$HOME/.config/google-chrome"
FIRST=true
while true; do
  # Kill any orphan Chrome processes that might block the new instance
  pkill -f google-chrome-real 2>/dev/null
  sleep 0.2
  # Clean stale lock files and temp sockets
  rm -f "$CHROME_DIR/SingletonLock" "$CHROME_DIR/SingletonSocket" "$CHROME_DIR/SingletonCookie" 2>/dev/null
  rm -rf /tmp/.com.google.Chrome.* 2>/dev/null
  if $FIRST; then
    /usr/bin/google-chrome-real "${FLAGS[@]}" "$@"
    FIRST=false
  else
    /usr/bin/google-chrome-real "${FLAGS[@]}" chrome://newtab
  fi
  sleep 0.5
done
WRAPPER_EOF
RUN chmod +x /usr/bin/google-chrome-stable

# Chrome policies
RUN mkdir -p /etc/opt/chrome/policies/managed
COPY chrome-policies.json /etc/opt/chrome/policies/managed/policies.json

# =============================================================================
# HARDENING GROUP 2: KIOSK lockdown
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
# HARDENING GROUP 3: Group removal + SUID stripping
# =============================================================================
RUN delgroup abc sudo 2>/dev/null || true \
    && delgroup abc docker 2>/dev/null || true

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
# HARDENING GROUP 4: Remove KDE .desktop files
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
    && rm -f /usr/share/applications/python3.12.desktop \
    # Remove Plasma desktop right-click context menu plugin entirely
    && rm -f /usr/lib/x86_64-linux-gnu/qt5/plugins/plasma/containmentactions/plasma_containmentactions_contextmenu.so

# Stage toolbar files
COPY toolbar/toolbar.css /opt/toolbar/toolbar.css
COPY toolbar/toolbar.js  /opt/toolbar/toolbar.js
COPY toolbar/touch-scroll.js /opt/toolbar/touch-scroll.js

# Init script (using CURRENT smooth version — no setup script hardening yet)
COPY scripts/01-setup-chrome.sh /custom-cont-init.d/01-setup-chrome.sh
RUN chmod +x /custom-cont-init.d/01-setup-chrome.sh

# Chrome launcher
COPY scripts/launch-chrome.sh /usr/local/bin/launch-chrome.sh
RUN chmod +x /usr/local/bin/launch-chrome.sh
