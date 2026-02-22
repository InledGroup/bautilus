#!/bin/bash

# Bautilus Server Startup Setup for Linux
# This script creates a .desktop file in the ~/.config/autostart folder.

APP_NAME="bautilus-server"
AUTOSTART_DIR="$HOME/.config/autostart"
SERVER_DIR="$(cd "$(dirname "$0")/server" && pwd)"
NODE_PATH=$(which node)

if [ -z "$NODE_PATH" ]; then
    echo "Error: node not found. Please install Node.js."
    exit 1
fi

echo "Setting up startup task for Bautilus Server..."
echo "Server directory: $SERVER_DIR"
echo "Node path: $NODE_PATH"

mkdir -p "$AUTOSTART_DIR"

# Create the .desktop file
cat <<EOF > "$AUTOSTART_DIR/$APP_NAME.desktop"
[Desktop Entry]
Type=Application
Exec=$NODE_PATH $SERVER_DIR/index.js
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Name=Bautilus Server
Comment=Bautilus Extension Backend Server
Path=$SERVER_DIR
Terminal=false
Categories=Utility;
EOF

chmod +x "$AUTOSTART_DIR/$APP_NAME.desktop"

echo "Success! The Bautilus server will now start automatically when you log in."
echo "To disable it, run: rm $AUTOSTART_DIR/$APP_NAME.desktop"
