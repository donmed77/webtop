#!/bin/bash
# =============================================================================
# i3 and Chrome Configuration Script (Optimized for pre-built image)
# Chrome and security hardening are already baked into the Docker image
# This script only handles runtime configuration
# =============================================================================

# Pre-configure i3 to skip first-run wizard
I3_CONFIG_DIR="/config/.config/i3"
if [ ! -f "$I3_CONFIG_DIR/config" ]; then
    echo "**** Creating default i3 config ****"
    mkdir -p "$I3_CONFIG_DIR"
    
    # Copy default i3 config and set Alt as modifier - HARDENED VERSION
    cat > "$I3_CONFIG_DIR/config" << 'EOF'
# i3 config file (v4) - SECURITY HARDENED
set $mod Mod1

# Font
font pango:monospace 8

# Use Mouse+$mod to drag floating windows
floating_modifier $mod

# REMOVED: Terminal access (security)
# REMOVED: dmenu access (security)
# REMOVED: Kill window (Alt+Shift+q disabled)

# Change focus
bindsym $mod+j focus left
bindsym $mod+k focus down
bindsym $mod+l focus up
bindsym $mod+semicolon focus right
bindsym $mod+Left focus left
bindsym $mod+Down focus down
bindsym $mod+Up focus up
bindsym $mod+Right focus right

# Move focused window
bindsym $mod+Shift+j move left
bindsym $mod+Shift+k move down
bindsym $mod+Shift+l move up
bindsym $mod+Shift+semicolon move right
bindsym $mod+Shift+Left move left
bindsym $mod+Shift+Down move down
bindsym $mod+Shift+Up move up
bindsym $mod+Shift+Right move right

# Split orientation
bindsym $mod+h split h
bindsym $mod+v split v

# Fullscreen
bindsym $mod+f fullscreen toggle

# Change container layout
bindsym $mod+s layout stacking
bindsym $mod+w layout tabbed
bindsym $mod+e layout toggle split

# Toggle floating
bindsym $mod+Shift+space floating toggle
bindsym $mod+space focus mode_toggle

# Focus parent
bindsym $mod+a focus parent

# Workspaces
set $ws1 "1"
set $ws2 "2"
set $ws3 "3"
set $ws4 "4"
set $ws5 "5"
set $ws6 "6"
set $ws7 "7"
set $ws8 "8"
set $ws9 "9"
set $ws10 "10"

bindsym $mod+1 workspace number $ws1
bindsym $mod+2 workspace number $ws2
bindsym $mod+3 workspace number $ws3
bindsym $mod+4 workspace number $ws4
bindsym $mod+5 workspace number $ws5
bindsym $mod+6 workspace number $ws6
bindsym $mod+7 workspace number $ws7
bindsym $mod+8 workspace number $ws8
bindsym $mod+9 workspace number $ws9
bindsym $mod+0 workspace number $ws10

bindsym $mod+Shift+1 move container to workspace number $ws1
bindsym $mod+Shift+2 move container to workspace number $ws2
bindsym $mod+Shift+3 move container to workspace number $ws3
bindsym $mod+Shift+4 move container to workspace number $ws4
bindsym $mod+Shift+5 move container to workspace number $ws5
bindsym $mod+Shift+6 move container to workspace number $ws6
bindsym $mod+Shift+7 move container to workspace number $ws7
bindsym $mod+Shift+8 move container to workspace number $ws8
bindsym $mod+Shift+9 move container to workspace number $ws9
bindsym $mod+Shift+0 move container to workspace number $ws10

# REMOVED: Reload/restart/exit i3 (security)

# Resize mode
mode "resize" {
    bindsym j resize shrink width 10 px or 10 ppt
    bindsym k resize grow height 10 px or 10 ppt
    bindsym l resize shrink height 10 px or 10 ppt
    bindsym semicolon resize grow width 10 px or 10 ppt
    bindsym Left resize shrink width 10 px or 10 ppt
    bindsym Down resize grow height 10 px or 10 ppt
    bindsym Up resize shrink height 10 px or 10 ppt
    bindsym Right resize grow width 10 px or 10 ppt
    bindsym Return mode "default"
    bindsym Escape mode "default"
    bindsym $mod+r mode "default"
}
bindsym $mod+r mode "resize"

# Remove window decorations (title bars with buttons)
default_border none
default_floating_border none
for_window [class=".*"] border none

# NOTE: Chrome is NOT auto-started here
# It will be launched on-demand via /usr/local/bin/launch-chrome.sh
# This allows passing the URL as an argument when the session starts
EOF
    
    chown -R abc:abc "$I3_CONFIG_DIR"
    echo "**** i3 config created ****"
fi

# Chrome preferences: NOT pre-configured (clean launch like :9500 test image)

# Final runtime security lockdown
chmod 700 /root /boot 2>/dev/null || true
chmod 700 /custom-cont-init.d 2>/dev/null || true
chmod 711 /bin /sbin /usr/bin /usr/sbin /usr/local/bin 2>/dev/null || true
chmod 755 /config 2>/dev/null || true
chmod 1777 /tmp 2>/dev/null || true
mkdir -p /config/Downloads 2>/dev/null || true
chown -R abc:abc /config 2>/dev/null || true

# KDE Compositing: Enable with balanced latency policy
# LatencyPolicy: 0=ExtremelyLow, 1=Low, 2=Medium(balanced), 3=High, 4=ExtremelyHigh
mkdir -p /config/.config
kwriteconfig5 --file /config/.config/kwinrc --group Compositing --key Enabled true
kwriteconfig5 --file /config/.config/kwinrc --group Compositing --key LatencyPolicy 2
chown abc:abc /config/.config/kwinrc 2>/dev/null || true
# Reload KWin compositor if already running
su -c "DISPLAY=:1 dbus-send --session --dest=org.kde.KWin --type=method_call /Compositor org.kde.kwin.Compositing.resume" abc 2>/dev/null || true

# Set default cursor theme to Adwaita
kwriteconfig5 --file /config/.config/kcminputrc --group Mouse --key cursorTheme Adwaita
chown abc:abc /config/.config/kcminputrc 2>/dev/null || true

# Fix scroll magnitude: cap to 1 event per wheel notch (server-side)
# This patches the Selkies input handler so each scroll tick fires exactly once,
# preventing the jumpy multi-event scrolling behavior
SELKIES_INPUT="/lsiopy/lib/python3.12/site-packages/selkies/input_handler.py"
if [ -f "$SELKIES_INPUT" ]; then
  sed -i 's/for _ in range(max(1, scroll_magnitude))/for _ in range(1)/' "$SELKIES_INPUT"
  echo "**** Scroll magnitude patched ****"
fi

# Inject Cloud Browser toolbar into Selkies web UI
# (Selkies populates /usr/share/selkies/web/ at startup, so we inject at runtime)
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

echo "**** Chrome and i3 configured ****"
