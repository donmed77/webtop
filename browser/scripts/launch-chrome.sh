#!/bin/bash
# =============================================================================
# Chrome Launcher Script
# Flags are injected by the /usr/bin/google-chrome-stable wrapper in the image.
# Usage: launch-chrome.sh <url> [--zoom=<percent>]
# =============================================================================

URL="${1:-https://www.google.com}"
ZOOM="${2:-}"

# If --zoom flag is passed (e.g. --zoom=120), set Chrome's default zoom level
# Chrome uses a logarithmic scale: zoom_level = log(zoom_percent/100) / log(1.2)
if [[ "$ZOOM" == --zoom=* ]]; then
    ZOOM_PCT="${ZOOM#--zoom=}"
    PREFS_DIR="$HOME/.config/google-chrome/Default"
    PREFS_FILE="$PREFS_DIR/Preferences"
    mkdir -p "$PREFS_DIR"
    
    # Calculate Chrome's internal zoom level value
    ZOOM_LEVEL=$(python3 -c "import math; print(math.log(${ZOOM_PCT}/100) / math.log(1.2))" 2>/dev/null)
    
    if [ -n "$ZOOM_LEVEL" ]; then
        if [ -f "$PREFS_FILE" ]; then
            # Update existing preferences
            python3 -c "
import json, sys
with open('$PREFS_FILE', 'r') as f:
    p = json.load(f)
p.setdefault('partition', {}).setdefault('default_zoom_level', {})['x'] = $ZOOM_LEVEL
p.setdefault('profile', {})['default_zoom_level'] = $ZOOM_LEVEL
with open('$PREFS_FILE', 'w') as f:
    json.dump(p, f)
" 2>/dev/null
        else
            # Create minimal preferences
            echo "{\"partition\":{\"default_zoom_level\":{\"x\":$ZOOM_LEVEL}},\"profile\":{\"default_zoom_level\":$ZOOM_LEVEL}}" > "$PREFS_FILE"
        fi
    fi
fi

exec google-chrome "$URL"
