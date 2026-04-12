#!/bin/bash

# Bautilus Server Restart Script for Linux and macOS

OS="$(uname)"
SERVER_DIR="$(cd "$(dirname "$0")/server" && pwd)"
NODE_PATH=$(which node)

if [ "$OS" == "Darwin" ]; then
    # macOS: Use launchctl
    PLIST_NAME="com.bautilus.server"
    PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
    
    if [ -f "$PLIST_PATH" ]; then
        echo "Restarting Bautilus Server on macOS (launchctl)..."
        launchctl unload "$PLIST_PATH"
        launchctl load "$PLIST_PATH"
        echo "Done."
    else
        echo "Error: macOS startup service not found at $PLIST_PATH"
        echo "Please run ./setup-macos-startup.sh first."
        exit 1
    fi

elif [ "$OS" == "Linux" ]; then
    # Linux: Manual restart (since it uses .desktop autostart)
    echo "Restarting Bautilus Server on Linux..."
    
    # Find the PID of the server/index.js process
    # We use pgrep with -f to match the full command line
    PID=$(pgrep -f "$SERVER_DIR/src/index.js")
    
    if [ -n "$PID" ]; then
        echo "Stopping existing process ($PID)..."
        kill "$PID"
        sleep 1
    fi
    
    echo "Starting server..."
    # Start in background and redirect output to a log file
    nohup "$NODE_PATH" "$SERVER_DIR/src/index.js" > /tmp/bautilus-server.log 2>&1 &
    
    echo "Done. Server is running in background. Logs: /tmp/bautilus-server.log"

else
    echo "Unsupported OS: $OS"
    exit 1
fi
