#!/bin/bash
# Security Hardening Script - Runs last to lock down the system
# This script removes dangerous tools that could allow users to escape the browser

echo "**** Applying security hardening ****"

# Remove terminal emulators
echo "Removing terminal emulators..."
apt-get remove -y --purge xterm rxvt-unicode gnome-terminal konsole terminator 2>/dev/null || true
rm -f /usr/bin/xterm /usr/bin/rxvt /usr/bin/urxvt /usr/bin/gnome-terminal /usr/bin/konsole /usr/bin/terminator 2>/dev/null || true

# Remove sudo and su
echo "Removing sudo and su..."
apt-get remove -y --purge sudo 2>/dev/null || true
rm -f /usr/bin/sudo /bin/su /usr/bin/su 2>/dev/null || true

# Remove dmenu and other launchers
echo "Removing application launchers..."
apt-get remove -y --purge dmenu rofi 2>/dev/null || true

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
# Keep python as it may be needed for system scripts, but remove pip
rm -f /usr/bin/pip /usr/bin/pip3 2>/dev/null || true

# Remove i3-msg to prevent programmatic i3 control
echo "Restricting i3 control..."
chmod 000 /usr/bin/i3-msg 2>/dev/null || true
chmod 000 /usr/bin/i3-nagbar 2>/dev/null || true

# Make shells non-executable for regular users (keep for root/system)
# Note: This may break things, commenting out for safety
# chmod 700 /bin/bash /bin/sh /bin/dash 2>/dev/null || true

# Clean up apt cache to prevent offline installs
echo "Cleaning apt cache..."
apt-get clean 2>/dev/null || true
rm -rf /var/lib/apt/lists/* 2>/dev/null || true

echo "**** Security hardening complete ****"
