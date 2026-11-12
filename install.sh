#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
command -v node >/dev/null || { echo "Node.js et npm sont requis (sudo apt install nodejs npm)."; exit 1; }
command -v npm >/dev/null || { echo "npm est requis (sudo apt install npm)."; exit 1; }

# Barre latérale, indicateur de volume et panneau PS : GTK 3 + gtk-layer-shell.
# Son et casques : PipeWire/PulseAudio (pactl) et BlueZ (bluetoothctl).
sudo apt-get install -y python3-gi gir1.2-gtk-3.0 gir1.2-gtklayershell-0.1 \
  pulseaudio-utils bluez playerctl swaybg kanshi grim

cd "$PROJECT_DIR"
npm install
mkdir -p "$HOME/.config/autostart" "$HOME/.config/raspy-tv/icons" "$HOME/.config/raspy-tv/logs" "$HOME/.config/systemd/user"
sed "s#@APP_DIR@#$PROJECT_DIR#g" "$PROJECT_DIR/raspy-tv.desktop" > "$HOME/.config/autostart/raspy-tv.desktop"
sed "s#@APP_DIR@#$PROJECT_DIR#g" "$PROJECT_DIR/raspytv.service" > "$HOME/.config/systemd/user/raspytv.service"
systemctl --user daemon-reload
if [ ! -f "$HOME/.config/raspy-tv/site.json" ]; then
  install -m 600 "$PROJECT_DIR/site.example.json" "$HOME/.config/raspy-tv/site.json"
  echo "Configuration créée : ~/.config/raspy-tv/site.json (à adapter)."
fi
chmod +x "$PROJECT_DIR/install.sh" "$PROJECT_DIR/start-kiosk.sh" "$PROJECT_DIR/layer-nav.py"
echo "Raspy TV installé. Pour la session kiosk labwc : cp labwc-autostart ~/.config/labwc/autostart"
echo "Démarrage manuel : systemctl --user start raspytv"
