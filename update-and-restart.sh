#!/bin/bash

# Script para actualizar dependencias y reiniciar el servicio Bautilus en macOS
# Jaime, este script asegura que el servidor use los últimos cambios del código.

OS="$(uname)"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$ROOT_DIR/server"

echo "🚀 Iniciando actualización del servidor Bautilus..."

if [ "$OS" == "Darwin" ]; then
    PLIST_NAME="com.bautilus.server"
    PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
    
    # 1. Actualizar dependencias de npm en la carpeta server
    echo "📦 Actualizando dependencias de Node.js en $SERVER_DIR..."
    cd "$SERVER_DIR" && npm install --silent
    cd "$ROOT_DIR"

    # 2. Reiniciar el servicio usando launchctl
    if [ -f "$PLIST_PATH" ]; then
        echo "🔄 Reiniciando servicio launchctl: $PLIST_NAME..."
        launchctl unload "$PLIST_PATH" 2>/dev/null
        sleep 1
        launchctl load "$PLIST_PATH"
        echo "✅ Servidor reiniciado con éxito."
        echo "📝 Puedes ver los logs en: /tmp/bautilus-server.log"
    else
        echo "⚠️  Aviso: El servicio launchctl no existe en $PLIST_PATH"
        echo "💡 Intentando iniciar el servidor manualmente para probar..."
        cd "$SERVER_DIR" && node index.js &
        echo "✅ Servidor iniciado manualmente en segundo plano."
    fi

elif [ "$OS" == "Linux" ]; then
    echo "📦 Actualizando dependencias de Node.js..."
    cd "$SERVER_DIR" && npm install --silent
    cd "$ROOT_DIR"
    
    echo "🔄 Reiniciando proceso en Linux..."
    PID=$(pgrep -f "$SERVER_DIR/index.js")
    if [ -n "$PID" ]; then
        kill "$PID"
        sleep 1
    fi
    nohup node "$SERVER_DIR/index.js" > /tmp/bautilus-server.log 2>&1 &
    echo "✅ Servidor Linux reiniciado."

else
    echo "❌ Sistema operativo no soportado directamente por este script: $OS"
    exit 1
fi
