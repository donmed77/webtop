#!/bin/bash
# ============================================================
# KDE Kiosk Configuration Script
# Runs on container startup to enforce kiosk mode
# ============================================================

set -e

echo "=== Configuring KDE Kiosk Mode ==="

# ============================================================
# CLEANUP: Remove existing Plasma config for fresh start
# ============================================================
rm -f /config/.config/plasma-org.kde.plasma.desktop-appletsrc \
      /config/.config/plasmashellrc \
      /config/.config/kdeglobals \
      /config/.config/kwinrulesrc 2>/dev/null || true

# ============================================================
# SETUP: Create required directories
# ============================================================
mkdir -p /config/.config/autostart \
         /usr/share/backgrounds

# ============================================================
# WALLPAPER: Create black background
# ============================================================
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" \
    | base64 -d > /usr/share/backgrounds/black.png

# ============================================================
# KDE: Lock down desktop actions
# ============================================================
cat > /config/.config/kdeglobals << 'EOF'
[KDE Action Restrictions][$i]
action/start_shell=false
action/context_help=false
action/run_command=false
action/lock_screen=false
action/logout=false
global/start_new_session=false
plasma-desktop/add_plasmoids=false
plasma-desktop/scripting_console=false
plasma-desktop/unlockedDesktop=false
action/configure=false
action/edit_desktop=false
action/options_show_toolbar=false
action/switch_user=false

[General][$i]
BrowserApplication=google-chrome.desktop
EOF

# ============================================================
# PLASMA: Disable shell features
# ============================================================
cat > /config/.config/plasmashellrc << 'EOF'
[PlasmaShell]
check for updates=false
enable crash handler=false
dashboard=
EOF

# ============================================================
# KWIN: Window manager configuration
# ============================================================
cat > /config/.config/kwinrc << 'EOF'
[Windows]
BorderlessMaximizedWindows=true
NoBorder=true

[MouseBindings]
CommandActiveTitlebar1=Nothing
CommandActiveTitlebar2=Nothing
CommandActiveTitlebar3=Nothing
CommandAllKey=Nothing
CommandTitlebarWheel=Nothing
CommandWindow1=Nothing
CommandWindow2=Nothing
CommandWindow3=Nothing
CommandWindowWheel=Nothing

[Desktops]
Number=1
Rows=1
EOF

# ============================================================
# KWIN RULES: Force Chrome to fullscreen kiosk
# ============================================================
cat > /config/.config/kwinrulesrc << 'EOF'
[1]
Description=Chrome Kiosk
wmclass=google-chrome
wmclassmatch=2
types=1
noborder=true
noborderrule=2
maximize=true
maximizerule=2
closable=false
closablerule=2
minimizable=false
minimizablerule=2
shading=false
shadingrule=2
move=false
moverule=2
resize=false
resizerule=2
keepabove=true
keepaboverule=2
EOF

# ============================================================
# AUTOSTART: Chrome kiosk
# ============================================================
cat > /config/.config/autostart/google-chrome.desktop << 'EOF'
[Desktop Entry]
Type=Application
Name=Google Chrome
Exec=/usr/bin/run-chrome.sh
Icon=google-chrome
Terminal=false
X-GNOME-Autostart-enabled=true
StartupNotify=false
EOF

# ============================================================
# PERMISSIONS: Fix ownership
# ============================================================
chown -R 1000:1000 /config/.config

echo "=== Kiosk configuration complete ==="
