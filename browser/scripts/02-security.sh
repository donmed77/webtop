#!/bin/bash
set -e  # Exit on error

# =============================================================================
# Security Hardening Script
# Runs last to lock down the system and remove dangerous tools
# =============================================================================

echo "**** Applying security hardening ****"

# Remove terminal emulators
echo "Removing terminal emulators..."
apt-get remove -y --purge xterm rxvt-unicode gnome-terminal konsole terminator lxterminal st alacritty kitty tilix guake yakuake tilda 2>/dev/null || true
rm -f /usr/bin/xterm /usr/bin/rxvt /usr/bin/urxvt /usr/bin/gnome-terminal /usr/bin/konsole /usr/bin/terminator 2>/dev/null || true
rm -f /usr/bin/lxterminal /usr/bin/st /usr/bin/alacritty /usr/bin/kitty /usr/bin/tilix /usr/bin/guake /usr/bin/yakuake /usr/bin/tilda 2>/dev/null || true
# Also remove xfce4-terminal if present
rm -f /usr/bin/xfce4-terminal 2>/dev/null || true

# Remove sudo and su
echo "Removing sudo and su..."
apt-get remove -y --purge sudo 2>/dev/null || true
rm -f /usr/bin/sudo /bin/su /usr/bin/su 2>/dev/null || true

# Remove dmenu and other launchers
echo "Removing application launchers..."
apt-get remove -y --purge dmenu rofi 2>/dev/null || true

# Remove file managers
echo "Removing file managers..."
apt-get remove -y --purge nautilus thunar pcmanfm dolphin nemo caja 2>/dev/null || true
rm -f /usr/bin/nautilus /usr/bin/thunar /usr/bin/pcmanfm /usr/bin/dolphin /usr/bin/nemo /usr/bin/caja 2>/dev/null || true

# Remove dangerous network tools (keep minimal for browser functionality)
echo "Removing dangerous network tools..."
rm -f /usr/bin/ssh /usr/bin/scp /usr/bin/sftp 2>/dev/null || true
rm -f /usr/bin/nc /usr/bin/netcat /usr/bin/ncat 2>/dev/null || true
rm -f /usr/bin/telnet 2>/dev/null || true
rm -f /usr/bin/ftp 2>/dev/null || true
rm -f /usr/bin/rsh /usr/bin/rlogin 2>/dev/null || true

# Remove wget and curl (browser can download files directly)
echo "Removing wget and curl..."
rm -f /usr/bin/wget /usr/bin/curl 2>/dev/null || true

# Remove package managers symlinks (keep dpkg for system but hide it)
echo "Hiding package managers..."
chmod 000 /usr/bin/apt 2>/dev/null || true
chmod 000 /usr/bin/apt-get 2>/dev/null || true
chmod 000 /usr/bin/aptitude 2>/dev/null || true
chmod 000 /usr/bin/dpkg 2>/dev/null || true

# Remove compilers and interpreters that could be abused
echo "Removing compilers and interpreters..."
rm -f /usr/bin/gcc /usr/bin/g++ /usr/bin/cc 2>/dev/null || true
rm -f /usr/bin/make /usr/bin/cmake 2>/dev/null || true
rm -f /usr/bin/perl 2>/dev/null || true
rm -f /usr/bin/pip /usr/bin/pip3 2>/dev/null || true

# NOTE: Python and shells must remain accessible for Selkies to function
# Users don't have direct access anyway (terminals are removed)

# Remove i3-msg to prevent programmatic i3 control
echo "Restricting i3 control..."
chmod 000 /usr/bin/i3-msg 2>/dev/null || true
chmod 000 /usr/bin/i3-nagbar 2>/dev/null || true

# Remove sensible-editor symlinks to prevent editor access
echo "Removing editor access..."
rm -f /usr/bin/sensible-editor /usr/bin/i3-sensible-editor /usr/bin/select-editor /usr/bin/editor 2>/dev/null || true
rm -f /usr/bin/sudoedit 2>/dev/null || true

# Clean up apt cache to prevent offline installs
echo "Cleaning apt cache..."
apt-get clean 2>/dev/null || true
rm -rf /var/lib/apt/lists/* 2>/dev/null || true

# ============================================================
# FILESYSTEM PERMISSION RESTRICTIONS
# Block the 'abc' user from accessing sensitive system paths
# Note: /etc must remain readable for system functionality
# ============================================================
echo "Applying filesystem permission restrictions..."

# Make sensitive directories inaccessible to abc user (chmod 700 = owner only)
chmod 700 /root 2>/dev/null || true
chmod 700 /boot 2>/dev/null || true

# /etc MUST be readable (755) or Chrome won't start - can't lock this down
# /var MUST be readable for Chrome temp files
# /run MUST be accessible for IPC

# Block access to our configuration scripts
chmod 700 /custom-cont-init.d 2>/dev/null || true

# Remove execute permission on bin directories listing (711 = execute only, no list)
# This prevents 'ls /bin' but allows running programs
chmod 711 /bin 2>/dev/null || true
chmod 711 /sbin 2>/dev/null || true  
chmod 711 /usr/bin 2>/dev/null || true
chmod 711 /usr/sbin 2>/dev/null || true
chmod 711 /usr/local/bin 2>/dev/null || true

# Ensure /config is accessible (user's home) and /tmp for temporary files
chmod 755 /config 2>/dev/null || true
chmod 1777 /tmp 2>/dev/null || true

# Create Downloads directory
mkdir -p /config/Downloads 2>/dev/null || true
chown -R abc:abc /config 2>/dev/null || true

echo "**** Filesystem permissions restricted ****"
echo "**** Security hardening complete ****"
