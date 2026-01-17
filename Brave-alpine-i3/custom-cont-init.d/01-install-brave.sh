#!/bin/bash

# Install Brave browser on Ubuntu
if ! command -v brave-browser &> /dev/null; then
    echo "**** Installing Brave browser ****"
    apt-get update
    apt-get install -y curl
    curl -fsSLo /usr/share/keyrings/brave-browser-archive-keyring.gpg https://brave-browser-apt-release.s3.brave.com/brave-browser-archive-keyring.gpg
    echo "deb [signed-by=/usr/share/keyrings/brave-browser-archive-keyring.gpg] https://brave-browser-apt-release.s3.brave.com/ stable main" | tee /etc/apt/sources.list.d/brave-browser-release.list
    apt-get update
    apt-get install -y brave-browser
    echo "**** Brave browser installed ****"
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

# Autostart Brave browser
exec --no-startup-id brave-browser --no-sandbox --disable-gpu-sandbox --ignore-gpu-blocklist --enable-gpu-rasterization --enable-webgpu-developer-features --start-maximized --no-first-run --disable-infobars --disable-session-crashed-bubble --noerrdialogs --disable-features=TranslateUI,PasswordManagerOnboarding,BraveRewards,BraveWallet,BraveVPN,BraveTalk,BraveAIChat --disable-brave-update --disable-component-update --disable-background-networking --disable-sync
EOF
    
    chown -R abc:abc "$I3_CONFIG_DIR"
    echo "**** i3 config created ****"
fi

# Pre-configure Brave preferences to disable P3A and other notifications
BRAVE_CONFIG_DIR="/config/.config/BraveSoftware/Brave-Browser"
mkdir -p "$BRAVE_CONFIG_DIR/Default"

# Create Local State to disable P3A notice (only if it doesn't exist)
if [ ! -f "$BRAVE_CONFIG_DIR/Local State" ]; then
    cat > "$BRAVE_CONFIG_DIR/Local State" << 'EOF'
{
  "browser": {
    "enabled_labs_experiments": []
  },
  "brave": {
    "p3a": {
      "enabled": false,
      "notice_acknowledged": true
    },
    "stats": {
      "reporting_enabled": false
    },
    "webtorrent_enabled": false,
    "hangouts_enabled": false,
    "new_tab_page": {
      "show_background_image": false,
      "show_branded_background_image": false,
      "show_together": false,
      "show_rewards": false,
      "show_binance": false,
      "show_gemini": false,
      "show_cryptoDotCom": false,
      "show_brave_news": false,
      "show_brave_talk": false
    }
  },
  "user_experience_metrics": {
    "reporting_enabled": false
  }
}
EOF
fi

# Create Default preferences (only if it doesn't exist)
if [ ! -f "$BRAVE_CONFIG_DIR/Default/Preferences" ]; then
    cat > "$BRAVE_CONFIG_DIR/Default/Preferences" << 'EOF'
{
  "brave": {
    "p3a": {
      "enabled": false,
      "notice_acknowledged": true
    },
    "rewards": {
      "enabled": false
    },
    "wallet": {
      "show_wallet_icon_on_toolbar": false
    },
    "new_tab_page": {
      "show_background_image": true,
      "show_branded_background_image": false,
      "show_together": false,
      "show_rewards": false,
      "shows_options": 1,
      "selected_custom_background_index": 3
    },
    "brave_news": {
      "show_on_ntp": false,
      "was_ever_enabled": false
    },
    "brave_talk": {
      "enabled": false
    },
    "today": {
      "should_show_on_ntp": false
    },
    "dark_mode": 1,
    "theme": {
      "color": "#7C4DFF"
    }
  },
  "session": {
    "restore_on_startup": 5
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
  "webkit": {
    "webprefs": {
      "darkModeEnabled": true
    }
  }
}
EOF
fi

chown -R abc:abc "$BRAVE_CONFIG_DIR"
echo "**** Brave preferences configured ****"
