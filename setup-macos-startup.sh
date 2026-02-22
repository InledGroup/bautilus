#!/bin/bash

# Bautilus Server Startup Setup for macOS
# This script creates a LaunchAgent to run the Node.js server on login.

APP_NAME="com.bautilus.server"
PLIST_PATH="$HOME/Library/LaunchAgents/$APP_NAME.plist"
SERVER_DIR="$(cd "$(dirname "$0")/server" && pwd)"
NODE_PATH=$(which node)

if [ -z "$NODE_PATH" ]; then
    echo "Error: node not found. Please install Node.js."
    exit 1
fi

echo "Setting up startup task for Bautilus Server..."
echo "Server directory: $SERVER_DIR"
echo "Node path: $NODE_PATH"

# Create the plist file
cat <<EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$APP_NAME</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_PATH</string>
        <string>$SERVER_DIR/index.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>$SERVER_DIR</string>
    <key>StandardOutPath</key>
    <string>/tmp/bautilus-server.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/bautilus-server.err.log</string>
</dict>
</plist>
EOF

# Set permissions
chmod 644 "$PLIST_PATH"

# Load the agent
launchctl unload "$PLIST_PATH" 2>/dev/null
launchctl load "$PLIST_PATH"

echo "Success! The Bautilus server will now start automatically when you log in."
echo "To disable it, run: launchctl unload $PLIST_PATH && rm $PLIST_PATH"
echo "Log files are available at /tmp/bautilus-server.log"
