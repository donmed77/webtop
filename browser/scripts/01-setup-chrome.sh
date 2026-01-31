#!/bin/bash

# Install Google Chrome on Ubuntu
if ! command -v google-chrome &> /dev/null; then
    echo "**** Installing Google Chrome ****"
    apt-get update
    apt-get install -y curl wget gnupg
    wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add -
    echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
    apt-get update
    apt-get install -y google-chrome-stable
    echo "**** Google Chrome installed ****"
fi

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

# Autostart Chrome browser with auto-restart loop (optimized - disabled unused features)
exec --no-startup-id bash -c 'while true; do google-chrome \
  --no-sandbox \
  --disable-gpu-sandbox \
  --ignore-gpu-blocklist \
  --enable-gpu-rasterization \
  --enable-webgpu-developer-features \
  --start-maximized \
  --no-first-run \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --noerrdialogs \
  --force-dark-mode \
  --enable-features=WebUIDarkMode \
  --disable-features=TranslateUI,PasswordManagerOnboarding,MediaRouter \
  --disable-component-update \
  --disable-sync \
  --disable-default-apps \
  --disable-background-mode \
  --disable-prompt-on-repost \
  --disable-domain-reliability \
  --disable-breakpad \
  --metrics-recording-only \
  --no-default-browser-check \
  --no-pings \
  --disk-cache-dir=/tmp/chrome-cache \
  --disk-cache-size=1073741824; sleep 1; done'
EOF
    
    chown -R abc:abc "$I3_CONFIG_DIR"
    echo "**** i3 config created ****"
fi

# Pre-configure Chrome preferences
CHROME_CONFIG_DIR="/config/.config/google-chrome"
mkdir -p "$CHROME_CONFIG_DIR/Default"

# Create Local State
if [ ! -f "$CHROME_CONFIG_DIR/Local State" ]; then
    cat > "$CHROME_CONFIG_DIR/Local State" << 'EOF'
{
  "browser": {
    "enabled_labs_experiments": []
  },
  "user_experience_metrics": {
    "reporting_enabled": false
  }
}
EOF
fi

# Create Default preferences
if [ ! -f "$CHROME_CONFIG_DIR/Default/Preferences" ]; then
    cat > "$CHROME_CONFIG_DIR/Default/Preferences" << 'EOF'
{
  "session": {
    "restore_on_startup": 4
  },
  "browser": {
    "show_home_button": false,
    "check_default_browser": false,
    "custom_chrome_frame": false
  },
  "ntp": {
    "custom_background_dict": {},
    "num_personal_suggestions": 0
  },
  "omnibox": {
    "prevent_url_elisions": true
  },
  "extensions": {
    "theme": {
      "use_system": false
    }
  },
  "profile": {
    "default_content_setting_values": {}
  },
  "autogenerated": {
    "theme": {
      "color": -7864065
    }
  },
  "webkit": {
    "webprefs": {
      "darkModeEnabled": true
    }
  }
}
EOF
fi

chown -R abc:abc "$CHROME_CONFIG_DIR"
echo "**** Chrome preferences configured ****"

# Install new Adwaita cursor theme (GNOME 45+)
echo "**** Installing new Adwaita cursor theme ****"
apt-get install -y adwaita-icon-theme-full 2>/dev/null || apt-get install -y adwaita-icon-theme

# Configure cursor theme
CURSOR_THEME="Adwaita"
echo "**** Configuring cursor theme ****"
mkdir -p /config/.config/gtk-3.0
cat > /config/.config/gtk-3.0/settings.ini << EOF
[Settings]
gtk-cursor-theme-name=$CURSOR_THEME
gtk-cursor-theme-size=24
gtk-theme-name=Adwaita-dark
gtk-application-prefer-dark-theme=true
EOF

mkdir -p /config/.icons/default
cat > /config/.icons/default/index.theme << EOF
[Icon Theme]
Inherits=$CURSOR_THEME
EOF

cat > /config/.Xresources << EOF
Xcursor.theme: $CURSOR_THEME
Xcursor.size: 24
EOF

chown -R abc:abc /config/.config/gtk-3.0 /config/.icons /config/.Xresources
echo "**** Cursor theme configured ****"
