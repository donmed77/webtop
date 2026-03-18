#!/bin/bash
# =============================================================================
# KDE and Chrome Configuration Script — SECURITY HARDENED
# Locks down KDE shortcuts, configures Chrome, and injects toolbar
# NOTE: Chrome preferences removed — they forced CSD mode causing sluggish resize
# =============================================================================

# =============================================================================
# KDE Shortcut Hardening
# Disable dangerous shortcuts that could give users shell/system access
# =============================================================================
echo "**** Applying KDE security hardening ****"

mkdir -p /config/.config

# =============================================================================
# Plasma Desktop Lockdown (via KDE autostart)
# Plasma generates its default layout AFTER this init script runs.
# We create a lockdown script + autostart entry that runs INSIDE the KDE
# session (with full D-Bus access), patches the layout config, and uses
# plasmashell --replace to cleanly reload without the panel.
# =============================================================================
LOCKDOWN_SCRIPT="/config/.config/plasma-lockdown.sh"
cat > "$LOCKDOWN_SCRIPT" << 'LOCKDOWN_EOF'
#!/bin/bash
# Plasma Desktop Lockdown — runs inside KDE session via autostart
# Has full D-Bus access since it runs as the abc user in the session

PLASMA_LAYOUT="$HOME/.config/plasma-org.kde.plasma.desktop-appletsrc"

# Wait for plasmashell to be fully loaded
for i in $(seq 1 30); do
  if qdbus org.kde.plasmashell /PlasmaShell 2>/dev/null | grep -q "evaluateScript"; then
    break
  fi
  sleep 1
done

# --- Method 1: Use Plasma scripting API (preferred) ---
RESULT=$(qdbus org.kde.plasmashell /PlasmaShell org.kde.PlasmaShell.evaluateScript '
  // Remove all panels (taskbar, start menu, system tray)
  var allPanels = panels();
  for (var i = allPanels.length - 1; i >= 0; i--) {
    allPanels[i].remove();
  }
  // Lock the desktop (prevents Add Widgets, Add Panel, Enter Edit Mode)
  locked = true;
  // Set wallpaper to solid black
  var allDesktops = desktops();
  for (var j = 0; j < allDesktops.length; j++) {
    allDesktops[j].wallpaperPlugin = "org.kde.color";
    allDesktops[j].currentConfigGroup = ["Wallpaper", "org.kde.color", "General"];
    allDesktops[j].writeConfig("Color", "0,0,0");
  }
' 2>&1)

if [ $? -eq 0 ]; then
  echo "Plasma lockdown via qdbus: SUCCESS"
else
  echo "qdbus failed ($RESULT), falling back to config patch..."

  # --- Method 2: Patch config + restart (fallback) ---
  if [ -f "$PLASMA_LAYOUT" ]; then
    python3 << 'PYEOF'
import re
layout_file = "/config/.config/plasma-org.kde.plasma.desktop-appletsrc"
with open(layout_file, 'r') as f:
    lines = f.readlines()
panel_prefixes = []
current_section = ""
for line in lines:
    line_s = line.strip()
    if line_s.startswith('['):
        current_section = line_s
    if line_s.startswith('plugin='):
        plugin = line_s.split('=', 1)[1]
        if plugin in ('org.kde.panel', 'org.kde.plasma.private.systemtray'):
            match = re.match(r'(\[Containments\]\[\d+\])', current_section)
            if match:
                panel_prefixes.append(match.group(1))
lines_out = []
skip = False
for line in lines:
    if line.strip().startswith('['):
        skip = any(line.strip().startswith(p) for p in panel_prefixes)
    if not skip:
        lines_out.append(line)
with open(layout_file, 'w') as f:
    f.write(re.sub(r'\n{3,}', '\n\n', ''.join(lines_out)))
print(f"Fallback: removed {panel_prefixes}")
PYEOF
    plasmashell --replace &>/dev/null &
    disown
  fi
fi

# Always patch right-click menu regardless of method
if [ -f "$PLASMA_LAYOUT" ]; then
  sed -i 's/^RightButton;NoModifier=org.kde.contextmenu$/RightButton;NoModifier=/' "$PLASMA_LAYOUT"
fi

# --- Background minimize watcher ---
# Since the taskbar/panel is removed, users can't restore minimized windows.
# This watcher detects minimized Chrome windows and immediately restores them.
(
  while true; do
    for wid in $(xdotool search --class google-chrome 2>/dev/null); do
      if xprop -id "$wid" _NET_WM_STATE 2>/dev/null | grep -q "_NET_WM_STATE_HIDDEN"; then
        xdotool windowactivate "$wid" 2>/dev/null
      fi
    done
    sleep 1
  done
) &
disown

# Self-destruct: remove autostart entry (but watcher keeps running in background)
rm -f "$HOME/.config/autostart/plasma-lockdown.desktop"
LOCKDOWN_EOF
chmod +x "$LOCKDOWN_SCRIPT"
chown abc:abc "$LOCKDOWN_SCRIPT"

# Create autostart entry
mkdir -p /config/.config/autostart
cat > /config/.config/autostart/plasma-lockdown.desktop << EOF
[Desktop Entry]
Type=Application
Name=Plasma Lockdown
Exec=bash /config/.config/plasma-lockdown.sh
X-KDE-autostart-phase=2
X-KDE-AutostartScript=true
EOF
chown abc:abc /config/.config/autostart/plasma-lockdown.desktop

# --- Disable KRunner (Alt+Space / Alt+F2) ---
# KRunner can execute arbitrary commands — critical security risk
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "org.kde.krunner.desktop" --key "_launch" "none,none,KRunner"
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "krunner.desktop" --key "_launch" "none,none,KRunner"
# Also disable the Alt+F2 "Run Command" shortcut
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "kwin" --key "Run Command" "none,none,Run Command"

# --- Disable Alt+F4 (Close Window) ---
# Prevent users from closing Chrome and being stuck on bare desktop
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "kwin" --key "Window Close" "none,none,Close Window"

# --- Disable Session Logout/Restart/Shutdown shortcuts ---
# Prevent Ctrl+Alt+Del and other session-ending shortcuts
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "ksmserver" --key "Log Out" "none,none,Log Out"
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "ksmserver" --key "Log Out Without Confirmation" "none,none,Log Out Without Confirmation"
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "ksmserver" --key "Shut Down Without Confirmation" "none,none,Shut Down Without Confirmation"
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "ksmserver" --key "Reboot Without Confirmation" "none,none,Reboot Without Confirmation"
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "ksmserver" --key "Halt Without Confirmation" "none,none,Halt Without Confirmation"

# --- Disable terminal-related shortcuts ---
# Terminals are already uninstalled, but disable shortcuts to avoid errors
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "org.kde.konsole.desktop" --key "_launch" "none,none,Konsole"

# --- Disable Activities / Desktop switching (prevents escape from session) ---
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "kwin" --key "Show Desktop" "none,none,Show Desktop"
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "kwin" --key "Switch to Desktop 1" "none,none,Switch to Desktop 1"
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "kwin" --key "Switch to Desktop 2" "none,none,Switch to Desktop 2"
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "kwin" --key "Switch to Desktop 3" "none,none,Switch to Desktop 3"
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "kwin" --key "Switch to Desktop 4" "none,none,Switch to Desktop 4"

# --- Disable screen locking ---
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "ksmserver" --key "Lock Session" "none,none,Lock Session"

# --- Disable Kill Window (Meta+Ctrl+Esc) ---
# Lets user click any window to force-kill it
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "kwin" --key "Kill Window" "none,none,Kill Window"

# --- Disable Show System Activity (Ctrl+Esc) ---
# Opens KDE System Monitor — shows/kills processes
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "kded5" --key "Show System Activity" "none,none,Show System Activity"

# --- Disable Activity Switcher (Meta+Q / Meta+Tab) ---
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "plasmashell" --key "manage activities" "none,none,Show Activity Switcher"
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "plasmashell" --key "next activity" "none,none,Walk through activities"

# --- Disable Tiles Editor (Meta+T) ---
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "kwin" --key "Edit Tiles" "none,none,Toggle Tiles Editor"

# --- Disable Expose/Present Windows (Ctrl+F9/F10) ---
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "kwin" --key "Expose" "none,none,Toggle Present Windows (Current desktop)"
kwriteconfig5 --file /config/.config/kglobalshortcutsrc \
    --group "kwin" --key "ExposeAll" "none,none,Toggle Present Windows (All desktops)"

chown abc:abc /config/.config/kglobalshortcutsrc 2>/dev/null || true

echo "**** KDE shortcuts hardened ****"

# =============================================================================
# GTK dark theme (Breeze Dark)
# =============================================================================
mkdir -p /config/.config/gtk-3.0
cat > /config/.config/gtk-3.0/settings.ini << EOF
[Settings]
gtk-theme-name=Breeze-Dark
gtk-application-prefer-dark-theme=true
gtk-icon-theme-name=breeze-dark
EOF
chown -R abc:abc /config/.config/gtk-3.0

# =============================================================================
# Runtime Security Lockdown
# =============================================================================
chmod 700 /root /boot 2>/dev/null || true
chmod 700 /custom-cont-init.d 2>/dev/null || true
chmod 711 /bin /sbin /usr/bin /usr/sbin /usr/local/bin 2>/dev/null || true
chmod 755 /config 2>/dev/null || true
chmod 1777 /tmp 2>/dev/null || true
mkdir -p /config/Downloads 2>/dev/null || true
chown -R abc:abc /config 2>/dev/null || true

# =============================================================================
# KDE Desktop Configuration
# =============================================================================

# KDE Compositing: Enable with balanced latency policy
kwriteconfig5 --file /config/.config/kwinrc --group Compositing --key Enabled true
kwriteconfig5 --file /config/.config/kwinrc --group Compositing --key LatencyPolicy 2
chown abc:abc /config/.config/kwinrc 2>/dev/null || true
# Reload KWin compositor if already running
su -c "DISPLAY=:1 dbus-send --session --dest=org.kde.KWin --type=method_call /Compositor org.kde.kwin.Compositing.resume" abc 2>/dev/null || true

# Set default cursor theme to Adwaita
kwriteconfig5 --file /config/.config/kcminputrc --group Mouse --key cursorTheme Adwaita
chown abc:abc /config/.config/kcminputrc 2>/dev/null || true

# Apply Breeze Dark global theme
kwriteconfig5 --file /config/.config/kdeglobals --group General --key ColorScheme BreezeDark
kwriteconfig5 --file /config/.config/kdeglobals --group General --key Name "Breeze Dark"
kwriteconfig5 --file /config/.config/kdeglobals --group KDE --key LookAndFeelPackage "org.kde.breezedark.desktop"
kwriteconfig5 --file /config/.config/kdeglobals --group KDE --key widgetStyle "breeze"
kwriteconfig5 --file /config/.config/kdeglobals --group Icons --key Theme "breeze-dark"
kwriteconfig5 --file /config/.config/plasmarc --group Theme --key name "breeze-dark"
chown abc:abc /config/.config/kdeglobals /config/.config/plasmarc 2>/dev/null || true

# Apply Breeze Dark window decorations
kwriteconfig5 --file /config/.config/kwinrc --group org.kde.kdecoration2 --key library "org.kde.breeze"
kwriteconfig5 --file /config/.config/kwinrc --group org.kde.kdecoration2 --key theme "Breeze"
kwriteconfig5 --file /config/.config/kdeglobals --group "WM" --key activeBackground "49,54,59"
kwriteconfig5 --file /config/.config/kdeglobals --group "WM" --key activeForeground "252,252,252"
kwriteconfig5 --file /config/.config/kdeglobals --group "WM" --key inactiveBackground "42,46,50"
kwriteconfig5 --file /config/.config/kdeglobals --group "WM" --key inactiveForeground "161,169,177"
kwriteconfig5 --file /config/.config/kdeglobals --group "WM" --key activeBlend "252,252,252"
kwriteconfig5 --file /config/.config/kdeglobals --group "WM" --key inactiveBlend "161,169,177"
kwriteconfig5 --file /config/.config/kwinrc --group WindowSwitcher --key LayoutName "org.kde.breeze.desktop"
kwriteconfig5 --file /config/.config/kwinrc --group DesktopSwitcher --key LayoutName "org.kde.breeze.desktop"
chown abc:abc /config/.config/kwinrc /config/.config/kdeglobals 2>/dev/null || true
echo "**** Breeze Dark theme applied ****"

# Remove KDE Plasma panel (bottom taskbar) — not needed, Chrome fills the desktop
kwriteconfig5 --file /config/.config/plasmashellrc --group "PlasmaViews" --group "Panel 2" --group "Defaults" --key thickness 0
# Delete panel containment to prevent it from loading
sed -i '/\[Containments\]\[2\]/,/^\[Containments\]\[/{ /^\[Containments\]\[2\]/d; /^\[Containments\]\[[^2]/!d; }' /config/.config/plasma-org.kde.plasma.desktop-appletsrc 2>/dev/null || true
echo "**** KDE panel removed ****"

# =============================================================================
# Selkies Patches
# =============================================================================

# Fix scroll magnitude: cap to 1 event per wheel notch (server-side)
SELKIES_INPUT="/lsiopy/lib/python3.12/site-packages/selkies/input_handler.py"
if [ -f "$SELKIES_INPUT" ]; then
  sed -i 's/for _ in range(max(1, scroll_magnitude))/for _ in range(1)/' "$SELKIES_INPUT"
  echo "**** Scroll magnitude patched ****"
fi

# Inject Cloud Browser toolbar into Selkies web UI
(
  SELKIES_WEB="/usr/share/selkies/web"
  for i in $(seq 1 30); do
    if [ -f "$SELKIES_WEB/index.html" ]; then
      cp /opt/toolbar/toolbar.css "$SELKIES_WEB/toolbar.css"
      cp /opt/toolbar/toolbar.js  "$SELKIES_WEB/toolbar.js"
      if ! grep -q 'toolbar.css' "$SELKIES_WEB/index.html"; then
        sed -i 's|</head>|<link rel="stylesheet" href="toolbar.css"></head>|' "$SELKIES_WEB/index.html"
      fi
      if ! grep -q 'toolbar.js' "$SELKIES_WEB/index.html"; then
        sed -i 's|</body>|<script src="toolbar.js"></script></body>|' "$SELKIES_WEB/index.html"
      fi
      echo "**** Toolbar injected into Selkies ****"
      break
    fi
    sleep 1
  done
) &

echo "**** KDE and Chrome configured ****"
