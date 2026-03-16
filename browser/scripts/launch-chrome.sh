#!/bin/bash
# =============================================================================
# Chrome Launcher Script — Clean launch (matching :9500 test image)
# No extra flags, no restart loop — just launch Chrome normally
# =============================================================================

URL="${1:-https://www.google.com}"

google-chrome \
  --no-sandbox \
  --start-maximized \
  "$URL"
