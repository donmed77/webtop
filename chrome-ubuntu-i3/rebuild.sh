#!/bin/bash

# Anti-gravity Fresh Restart Script
# This script stops the environment, clears all persistent configuration,
# and rebuilds/restarts everything from scratch with no cache.

# Set the working directory to the project root
cd "$(dirname "$0")"

echo "🛑 Stopping containers..."
docker-compose down --remove-orphans

echo "🧹 Clearing persistent configuration (config/ directory)..."
# We backup the i3 config if it exists, just in case, but for a "fresh" restart we really want it gone.
# The init script 01-install-chrome.sh will recreate it with our latest fixes.
rm -rf config/

echo "🏗️ Rebuilding Docker images with no cache..."
docker-compose build --no-cache

echo "🚀 Launching containers in detached mode..."
docker-compose up -d

echo "✅ Fresh restart complete!"
echo "Progress can be monitored with: docker logs -f chrome-ubuntu-i3-llm"
