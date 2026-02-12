# Custom Webtop Image with Chrome Pre-installed
# Based on LinuxServer webtop:ubuntu-i3
# Pre-bakes Chrome installation and security hardening for fast startup

FROM lscr.io/linuxserver/webtop:ubuntu-i3

# =============================================================================
# Install Google Chrome
# =============================================================================
RUN apt-get update && \
    apt-get install -y curl wget gnupg && \
    curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && \
    apt-get install -y google-chrome-stable && \
    apt-get install -y adwaita-icon-theme-full || apt-get install -y adwaita-icon-theme && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# =============================================================================
# Security Hardening - Remove dangerous tools
# =============================================================================
RUN \
    # Remove terminal emulators
    apt-get remove -y --purge xterm rxvt-unicode gnome-terminal konsole terminator lxterminal st alacritty kitty tilix guake yakuake tilda 2>/dev/null || true && \
    # Remove sudo and su
    apt-get remove -y --purge sudo 2>/dev/null || true && \
    rm -f /usr/bin/sudo /bin/su /usr/bin/su 2>/dev/null || true && \
    # Remove launchers
    apt-get remove -y --purge dmenu rofi 2>/dev/null || true && \
    # Remove file managers
    apt-get remove -y --purge nautilus thunar pcmanfm dolphin nemo caja 2>/dev/null || true && \
    rm -f /usr/bin/nautilus /usr/bin/thunar /usr/bin/pcmanfm /usr/bin/dolphin /usr/bin/nemo /usr/bin/caja 2>/dev/null || true && \
    # Remove dangerous network tools
    rm -f /usr/bin/ssh /usr/bin/scp /usr/bin/sftp /usr/bin/nc /usr/bin/netcat /usr/bin/ncat /usr/bin/telnet /usr/bin/ftp /usr/bin/rsh /usr/bin/rlogin 2>/dev/null || true && \
    # Remove wget and curl (not needed after build)
    rm -f /usr/bin/wget /usr/bin/curl 2>/dev/null || true && \
    # Hide package managers
    chmod 000 /usr/bin/apt /usr/bin/apt-get /usr/bin/aptitude /usr/bin/dpkg 2>/dev/null || true && \
    # Remove compilers
    rm -f /usr/bin/gcc /usr/bin/g++ /usr/bin/cc /usr/bin/make /usr/bin/cmake /usr/bin/perl /usr/bin/pip /usr/bin/pip3 2>/dev/null || true && \
    # Remove editors
    rm -f /usr/bin/sensible-editor /usr/bin/i3-sensible-editor /usr/bin/select-editor /usr/bin/editor /usr/bin/sudoedit 2>/dev/null || true && \
    # Remove terminal binaries
    rm -f /usr/bin/xterm /usr/bin/rxvt /usr/bin/urxvt /usr/bin/gnome-terminal /usr/bin/konsole /usr/bin/terminator /usr/bin/lxterminal /usr/bin/st /usr/bin/alacritty /usr/bin/kitty /usr/bin/tilix /usr/bin/guake /usr/bin/yakuake /usr/bin/tilda /usr/bin/xfce4-terminal 2>/dev/null || true && \
    # Restrict i3 control
    chmod 000 /usr/bin/i3-msg /usr/bin/i3-nagbar 2>/dev/null || true && \
    # Clean apt cache
    apt-get clean 2>/dev/null || true && \
    rm -rf /var/lib/apt/lists/*

# =============================================================================
# Copy i3 config runtime script (runs on container start)
# =============================================================================
COPY scripts/01-setup-chrome.sh /custom-cont-init.d/01-setup-chrome.sh
RUN chmod +x /custom-cont-init.d/01-setup-chrome.sh

# =============================================================================
# Copy Chrome launcher script (called via docker exec when session starts)
# =============================================================================
COPY scripts/launch-chrome.sh /usr/local/bin/launch-chrome.sh
RUN chmod +x /usr/local/bin/launch-chrome.sh

# Note: Chrome is NOT auto-started. It launches via docker exec with URL argument.

