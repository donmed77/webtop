# Chrome Kiosk Webtop Image
# A hardened, single-application kiosk environment

FROM lscr.io/linuxserver/webtop:ubuntu-kde

# ============================================================
# CLEANUP: Remove unnecessary applications
# ============================================================
RUN apt-get update && \
    apt-get remove -y --purge \
        firefox* chromium* \
        xterm* uxterm* st* foot* term* \
        rxvt* lxterminal* qterminal* sakura* terminology* alacritty* kitty* \
        libreoffice* thunderbird* \
        nautilus* dolphin* thunar* pcmanfm* nemo* caja* \
        kwrite* kate* kcalc* \
        2>/dev/null || true && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# ============================================================
# INSTALL: Google Chrome
# ============================================================
RUN apt-get update && \
    apt-get install -y wget gnupg && \
    wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - && \
    echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && \
    apt-get install -y google-chrome-stable && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# ============================================================
# CLEANUP: Remove desktop entries and terminal binaries
# ============================================================
RUN find /usr/share/applications -type f -name "*.desktop" ! -name "*chrome*" -delete 2>/dev/null || true && \
    rm -f /usr/bin/xterm /usr/bin/uxterm /usr/bin/st /usr/bin/foot 2>/dev/null || true

# ============================================================
# CONFIG: Disable KDE Wallet
# ============================================================
RUN mkdir -p /etc/skel/.config /etc/xdg && \
    printf "[Wallet]\nEnabled=false\nFirst Use=false\n" > /etc/skel/.config/kwalletrc && \
    printf "[Wallet]\nEnabled=false\nFirst Use=false\n" > /etc/xdg/kwalletrc

# ============================================================
# CONFIG: Disable KDE Panels via layout script
# ============================================================
RUN printf '%s\n' \
    'var desktop = new Activity("Desktop");' \
    'desktop.name = "Kiosk";' \
    'desktop.screen = 0;' \
    'desktop.wallpaperPlugin = "org.kde.color";' \
    'desktop.currentConfigGroup = Array("Wallpaper", "org.kde.color", "General");' \
    'desktop.writeConfig("Color", "0,0,0");' \
    'var panels = panels();' \
    'for (var i = 0; i < panels.length; i++) { panels[i].remove(); }' \
    > /usr/share/plasma/shells/org.kde.plasma.desktop/contents/layout.js && \
    find /usr/share/plasma/look-and-feel -name "org.kde.plasma.desktop-defaultPanel.js" \
        -exec sh -c 'echo "print(\"Panel Disabled\");" > {}' \; && \
    echo 'print("Default panel functionality disabled");' \
        > /usr/share/plasma/shells/org.kde.plasma.desktop/contents/updates/00_default_panel.js

# ============================================================
# CONFIG: Set Chrome as default browser
# ============================================================
RUN update-alternatives --set x-www-browser /usr/bin/google-chrome-stable 2>/dev/null || true

# ============================================================
# COPY: Chrome kiosk wrapper script
# ============================================================
COPY run-chrome.sh /usr/bin/run-chrome.sh
RUN chmod +x /usr/bin/run-chrome.sh

# ============================================================
# CONFIG: Chrome first-run and preferences
# ============================================================
RUN rm -rf /etc/skel/Desktop/* 2>/dev/null || true && \
    mkdir -p /etc/skel/.config/google-chrome && \
    touch "/etc/skel/.config/google-chrome/First Run" && \
    echo '{"browser":{"check_default_browser":false},"distribution":{"skip_first_run_ui":true,"suppress_first_run_bubble":true}}' \
        > /etc/skel/.config/google-chrome/master_preferences && \
    cp /etc/skel/.config/google-chrome/master_preferences /opt/google/chrome/master_preferences
