#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/lib/mac-common.sh"

PORT="$(dream_installed_port)"
RESTART_EXISTING=0
PROFILE_PATH=""
FOREGROUND_INJECTOR=0
APP_PATH=""
NODE_PATH=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) [ "$#" -ge 2 ] || dream_die "--port requires a value"; PORT="$2"; shift 2 ;;
    --restart-existing) RESTART_EXISTING=1; shift ;;
    --profile-path) [ "$#" -ge 2 ] || dream_die "--profile-path requires a value"; PROFILE_PATH="$2"; shift 2 ;;
    --foreground-injector) FOREGROUND_INJECTOR=1; shift ;;
    --app) [ "$#" -ge 2 ] || dream_die "--app requires a value"; APP_PATH="$2"; shift 2 ;;
    --node) [ "$#" -ge 2 ] || dream_die "--node requires a value"; NODE_PATH="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--port 9335] [--restart-existing] [--profile-path DIR] [--foreground-injector] [--app PATH]"
      exit 0 ;;
    *) dream_die "unknown argument: $1" ;;
  esac
done

dream_require_macos
dream_validate_port "$PORT"
dream_resolve_app "$APP_PATH"
dream_resolve_node "$NODE_PATH"

INJECTOR="$SCRIPT_DIR/injector.mjs"
STATE_ROOT="$(dream_state_root)"
STATE_PATH="$STATE_ROOT/state.json"
STDOUT_PATH="$STATE_ROOT/injector.log"
STDERR_PATH="$STATE_ROOT/injector-error.log"
mkdir -p "$STATE_ROOT"
INJECTOR_PID=""
VERIFY_PID=""
START_SUCCEEDED=0

cleanup_start() {
  if [ -n "$VERIFY_PID" ] && dream_process_alive "$VERIFY_PID"; then
    kill "$VERIFY_PID" 2>/dev/null || true
  fi
  if [ "$START_SUCCEEDED" -ne 1 ] && [ -n "$INJECTOR_PID" ]; then
    dream_stop_pid_if_matches "$INJECTOR_PID" "$INJECTOR"
    if [ -f "$STATE_PATH" ]; then
      local recorded_pid
      recorded_pid="$(dream_read_json_number "$STATE_PATH" injectorPid 2>/dev/null || true)"
      [ "$recorded_pid" != "$INJECTOR_PID" ] || rm -f "$STATE_PATH"
    fi
  fi
}
trap cleanup_start EXIT
trap 'exit 130' INT TERM

stop_codex_completely() {
  if [ -n "$APP_BUNDLE_ID" ]; then
    osascript -e "tell application id \"$APP_BUNDLE_ID\" to quit" >/dev/null 2>&1 || true
  fi
  local attempt=0 pids
  while [ "$attempt" -lt 40 ]; do
    pids="$(dream_main_pids)"
    [ -z "$pids" ] && return 0
    sleep 0.25
    attempt=$((attempt + 1))
  done
  pids="$(dream_main_pids)"
  [ -z "$pids" ] || kill $pids 2>/dev/null || true
  attempt=0
  while [ "$attempt" -lt 20 ]; do
    pids="$(dream_main_pids)"
    [ -z "$pids" ] && return 0
    sleep 0.2
    attempt=$((attempt + 1))
  done
  pids="$(dream_main_pids)"
  [ -z "$pids" ] || kill -9 $pids 2>/dev/null || true
  sleep 0.3
}

if ! dream_cdp_ready "$PORT" && [ -z "$PROFILE_PATH" ] && [ -n "$(dream_main_pids)" ]; then
  if [ "$RESTART_EXISTING" -ne 1 ]; then
    dream_die "Codex is already running without Dream Skin debugging on port $PORT. Quit Codex or rerun with --restart-existing."
  fi
  stop_codex_completely
fi

launch_codex() {
  local args=("--remote-debugging-port=$PORT")
  if [ -n "$PROFILE_PATH" ]; then
    mkdir -p "$PROFILE_PATH"
    args+=("--user-data-dir=$PROFILE_PATH")
  fi
  # LaunchServices owns the application lifetime on macOS. Starting the bundle
  # executable directly can create a renderer briefly and then reap the app.
  /usr/bin/open -na "$APP_BUNDLE" --args "${args[@]}"
}

wait_for_cdp() {
  local attempt=0
  while [ "$attempt" -lt 75 ]; do
    dream_cdp_ready "$PORT" && return 0
    sleep 0.4
    attempt=$((attempt + 1))
  done
  return 1
}

if ! dream_cdp_ready "$PORT"; then
  launch_codex
  wait_for_cdp || dream_die "Codex did not expose CDP on 127.0.0.1/[::1]:$PORT within 30 seconds"
fi

if [ -f "$STATE_PATH" ]; then
  OLD_PID="$(dream_read_json_number "$STATE_PATH" injectorPid 2>/dev/null || true)"
  [ -z "$OLD_PID" ] || dream_stop_pid_if_matches "$OLD_PID" "$INJECTOR"
fi

if [ "$FOREGROUND_INJECTOR" -eq 1 ]; then
  exec "$NODE_BIN" "$INJECTOR" --watch --port "$PORT"
fi

nohup "$NODE_BIN" "$INJECTOR" --watch --port "$PORT" >"$STDOUT_PATH" 2>"$STDERR_PATH" &
INJECTOR_PID=$!
"$NODE_BIN" -e '
  const fs = require("fs");
  const [file, port, pid, root, profile, app] = process.argv.slice(1);
  fs.writeFileSync(file, JSON.stringify({
    port: Number(port), injectorPid: Number(pid), startedAt: new Date().toISOString(),
    skillRoot: root, profilePath: profile || null, appPath: app, platform: "darwin"
  }, null, 2) + "\n");
' "$STATE_PATH" "$PORT" "$INJECTOR_PID" "$(cd "$SCRIPT_DIR/.." && pwd)" "$PROFILE_PATH" "$APP_BUNDLE"

VERIFIED=0
for _ in $(seq 1 45); do
  sleep 0.7
  "$NODE_BIN" "$INJECTOR" --verify --port "$PORT" >/dev/null 2>&1 &
  VERIFY_PID=$!
  if wait "$VERIFY_PID"; then
    VERIFIED=1
    VERIFY_PID=""
    break
  fi
  VERIFY_PID=""
done
if [ "$VERIFIED" -ne 1 ]; then
  dream_die "Dream Skin launched but verification failed; see $STDERR_PATH"
fi
START_SUCCEEDED=1
echo "Codex Dream Skin is active on port $PORT."
