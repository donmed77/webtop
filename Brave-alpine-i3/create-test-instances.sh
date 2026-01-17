#!/bin/bash
# Load test script - Creates 9 additional Brave webtop instances with FULL resources

echo "Creating 9 test instances with full resources (10 CPU, 16GB RAM each)..."

for i in {1..9}; do
    PORT_HTTP=$((3080 + i * 10))  # 3090, 3100, 3110, etc.
    PORT_HTTPS=$((3081 + i * 10)) # 3091, 3101, 3111, etc.
    CONTAINER_NAME="brave-webtop-test-$i"
    CONFIG_DIR="./config-test-$i"
    
    echo "Creating instance $i: $CONTAINER_NAME on port $PORT_HTTP"
    
    mkdir -p "$CONFIG_DIR"
    
    docker run -d \
        --name "$CONTAINER_NAME" \
        --security-opt seccomp=unconfined \
        --shm-size=16gb \
        --cpus=10.0 \
        --memory=16g \
        -e PUID=1000 \
        -e PGID=1000 \
        -e TZ=Africa/Algiers \
        -e TITLE="Brave Test $i" \
        -e LANG=en_US.UTF-8 \
        -e LC_ALL=en_US.UTF-8 \
        -e SELKIES_ENCODER=h264 \
        -e SELKIES_FRAMERATE=50 \
        -e SELKIES_VIDEO_BITRATE=8000 \
        -e SELKIES_ENABLE_RESIZE=true \
        -e SELKIES_AUDIO_BITRATE=128000 \
        -e SELKIES_FILE_TRANSFERS= \
        -e SELKIES_UI_SIDEBAR_SHOW_FILES=false \
        -e SELKIES_UI_SIDEBAR_SHOW_APPS=false \
        -e SELKIES_COMMAND_ENABLED=false \
        -e SELKIES_ENABLE_BASIC_UI=false \
        -e SELKIES_BASIC_SETTINGS_ENABLE_AUDIO=true \
        -e SELKIES_BASIC_SETTINGS_ENABLE_CLIPBOARD=true \
        -v "$(pwd)/policies.json:/etc/brave/policies/managed/policies.json:ro" \
        -v "$(pwd)/$CONFIG_DIR:/config" \
        -v "$(pwd)/custom-cont-init.d:/custom-cont-init.d:ro" \
        -v /run/dbus/system_bus_socket:/run/dbus/system_bus_socket \
        -p "$PORT_HTTP:3000" \
        -p "$PORT_HTTPS:3001" \
        --device /dev/dri:/dev/dri \
        --restart no \
        lscr.io/linuxserver/webtop:ubuntu-i3
done

echo ""
echo "=== All 9 test instances created with FULL resources! ==="
echo "Each instance: 10 CPU cores, 16GB RAM, 16GB shared memory"
echo ""
echo "Instance URLs:"
for i in {1..9}; do
    PORT=$((3080 + i * 10))
    echo "  Instance $i: http://167.235.2.54:$PORT"
done
echo ""
echo "To monitor all containers:"
echo "  docker stats"
echo ""
echo "To cleanup test instances, run:"
echo "  ./cleanup-test-instances.sh"
