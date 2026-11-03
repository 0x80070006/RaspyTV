#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
command -v node >/dev/null
command -v npm >/dev/null
cd "$PROJECT_DIR"
npm install
mkdir -p "$HOME/.config/autostart" "$HOME/.config/raspy-tv/icons" "$HOME/.config/raspy-tv/logs"
sed "s#@APP_DIR@#$PROJECT_DIR#g" "$PROJECT_DIR/raspy-tv.desktop" > "$HOME/.config/autostart/raspy-tv.desktop"
if [ ! -f "$HOME/.config/raspy-tv/site.json" ]; then
  install -m 600 "$PROJECT_DIR/site.example.json" "$HOME/.config/raspy-tv/site.json"
  echo "Configuration créée : ~/.config/raspy-tv/site.json (à adapter)."
fi
chmod +x "$PROJECT_DIR/install.sh" "$PROJECT_DIR/start-kiosk.sh"
echo "Raspy TV installé. Déconnecte/reconnecte la session graphique pour tester l'autostart."
