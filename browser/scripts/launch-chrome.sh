#!/bin/bash
# =============================================================================
# Chrome Launcher Script
# Flags are injected by the /usr/bin/google-chrome-stable wrapper in the image.
# This script just passes the URL to google-chrome.
# =============================================================================

URL="${1:-https://www.google.com}"

exec google-chrome "$URL"
