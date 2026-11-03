#!/bin/sh
export DISPLAY="${DISPLAY:-:0}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
cd "$(dirname "$0")" || exit 1
LOG="${XDG_RUNTIME_DIR}/raspy-tv.log"

# Exit cleanly on a requested shutdown. Restart only when Electron/npm reports
# a crash, preventing both a dead kiosk and an unwanted relaunch after logout.
while :; do
  /usr/bin/npm start >>"$LOG" 2>&1
  status=$?
  [ "$status" -eq 0 ] && exit 0
  printf '%s RaspyTV crashed with status %s; restarting in 2s\n' "$(date -Is)" "$status" >>"$LOG"
  sleep 2
done
