#!/bin/bash
# Cleanup script - Removes all test instances

echo "Stopping and removing test instances..."

for i in {1..9}; do
    CONTAINER_NAME="brave-webtop-test-$i"
    CONFIG_DIR="./config-test-$i"
    
    echo "Removing $CONTAINER_NAME..."
    docker stop "$CONTAINER_NAME" 2>/dev/null
    docker rm "$CONTAINER_NAME" 2>/dev/null
    rm -rf "$CONFIG_DIR"
done

echo ""
echo "=== All test instances cleaned up! ==="
echo "Only brave-webtop (original) remains."
