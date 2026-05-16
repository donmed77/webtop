#!/bin/bash
set -e

# Capture version info from git
export GIT_COMMIT=$(git rev-parse --short HEAD)
export GIT_BRANCH=$(git branch --show-current)
export BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Warn if building from dirty tree
if [ -n "$(git status --short)" ]; then
    echo "⚠️  WARNING: Building from uncommitted changes!"
    export GIT_COMMIT="${GIT_COMMIT}-dirty"
fi

echo "🚀 Deploying ${GIT_COMMIT} (${GIT_BRANCH}) at ${BUILD_TIME}"

# Build and deploy (pass extra args like: ./deploy.sh backend)
SERVICES="${@:-frontend backend}"
docker compose up -d --build --force-recreate $SERVICES

echo "✅ Deployed ${GIT_COMMIT} (${GIT_BRANCH})"
