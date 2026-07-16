#!/bin/bash
set -uo pipefail
PATH=/usr/bin:/bin:/usr/sbin:/sbin

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/lib/mac-common.sh"

PORT=9335
POLL_SECONDS=2
LAUNCH_GRACE_SECONDS=15
MAX_CONSECUTIVE_FAILURES=3
COOLDOWN_MINUTES=30
PROBE_FAILURES_BEFORE_RECOVERY=3
MAX_RESTARTS_PER_WINDOW=2
RESTART_WINDOW_MINUTES=10
APP_PATH=""
NODE_PATH=""
IGNORE_EXISTING_APP=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --poll-seconds) POLL_SECONDS="$2"; shift 2 ;;
    --launch-grace-seconds) LAUNCH_GRACE_SECONDS="$2"; shift 2 ;;
    --max-consecutive-failures) MAX_CONSECUTIVE_FAILURES="$2"; shift 2 ;;
    --cooldown-minutes) COOLDOWN_MINUTES="$2"; shift 2 ;;
    --probe-failures-before-recovery) PROBE_FAILURES_BEFORE_RECOVERY="$2"; shift 2 ;;
    --max-restarts-per-window) MAX_RESTARTS_PER_WINDOW="$2"; shift 2 ;;
    --restart-window-minutes) RESTART_WINDOW_MINUTES="$2"; shift 2 ;;
    --app) APP_PATH="$2"; shift 2 ;;
    --node) NODE_PATH="$2"; shift 2 ;;
    --ignore-existing-app) IGNORE_EXISTING_APP=1; shift ;;
    *) echo "dream-skin watcher: unknown argument: $1" >&2; exit 2 ;;
  esac
done

dream_require_macos
dream_validate_port "$PORT"
dream_resolve_node "$NODE_PATH"
dream_resolve_app "$APP_PATH"

STATE_ROOT="$(dream_state_root)"
STATE_PATH="$STATE_ROOT/state.json"
WATCHER_STATE_PATH="$STATE_ROOT/watcher-state.json"
LOG_PATH="$STATE_ROOT/watcher.log"
LOCK_DIR="$STATE_ROOT/watcher.lock"
START_SCRIPT="$SCRIPT_DIR/start-dream-skin.sh"
mkdir -p "$STATE_ROOT"
RECOVERY_PID=""

write_log() {
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >>"$LOG_PATH" 2>/dev/null || true
}

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  OLD_WATCHER_PID="$(dream_read_json_number "$WATCHER_STATE_PATH" watcherPid 2>/dev/null || true)"
  if [ -n "$OLD_WATCHER_PID" ] && dream_pid_matches "$OLD_WATCHER_PID" "watch-dream-skin.sh"; then
    exit 0
  fi
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR" || exit 1
fi

cleanup() {
  if [ -n "$RECOVERY_PID" ] && dream_process_alive "$RECOVERY_PID"; then
    kill "$RECOVERY_PID" 2>/dev/null || true
    wait "$RECOVERY_PID" 2>/dev/null || true
  fi
  CURRENT_PID="$(dream_read_json_number "$WATCHER_STATE_PATH" watcherPid 2>/dev/null || true)"
  if [ "$CURRENT_PID" = "$$" ]; then rm -f "$WATCHER_STATE_PATH"; fi
  rm -rf "$LOCK_DIR"
  write_log "Watcher stopped (PID $$)."
}
trap cleanup EXIT
trap 'exit 0' INT TERM

"$NODE_BIN" -e '
  const fs = require("fs");
  const [file, pid, port, script, app] = process.argv.slice(1);
  fs.writeFileSync(file, JSON.stringify({ watcherPid: Number(pid), port: Number(port),
    startedAt: new Date().toISOString(), scriptPath: script, appPath: app, platform: "darwin" }, null, 2) + "\n");
' "$WATCHER_STATE_PATH" "$$" "$PORT" "$0" "$APP_BUNDLE"
write_log "Watcher started (PID $$, port $PORT)."

injector_healthy() {
  local pid
  pid="$(dream_read_json_number "$STATE_PATH" injectorPid 2>/dev/null || true)"
  [ -n "$pid" ] && dream_pid_matches "$pid" "$SCRIPT_DIR/injector.mjs"
}

run_start() {
  "$START_SCRIPT" "$@" >>"$LOG_PATH" 2>&1 &
  RECOVERY_PID=$!
  wait "$RECOVERY_PID"
  local status=$?
  RECOVERY_PID=""
  return "$status"
}

CONSECUTIVE_FAILURES=0
SUSPENDED_UNTIL=0
MISSED_PROBES=0
APP_FIRST_SEEN=0
RESTART_TIMES=""

while :; do
  NOW="$(date +%s)"
  DEBUG_READY=0
  dream_cdp_ready "$PORT" && DEBUG_READY=1

  if [ "$DEBUG_READY" -eq 1 ] && injector_healthy; then
    if [ "$CONSECUTIVE_FAILURES" -gt 0 ] || [ "$SUSPENDED_UNTIL" -gt 0 ]; then
      write_log "Dream Skin is healthy again; resuming normal watch."
    fi
    CONSECUTIVE_FAILURES=0
    SUSPENDED_UNTIL=0
    MISSED_PROBES=0
    APP_FIRST_SEEN="$NOW"
    IGNORE_EXISTING_APP=0
    sleep "$POLL_SECONDS"
    continue
  fi

  if [ "$SUSPENDED_UNTIL" -gt 0 ]; then
    if [ "$NOW" -ge "$SUSPENDED_UNTIL" ]; then
      write_log "Cooldown ended; auto-recovery re-armed."
      SUSPENDED_UNTIL=0
      CONSECUTIVE_FAILURES=0
    else
      sleep "$POLL_SECONDS"
      continue
    fi
  fi

  FAILED=0
  FAILURE_REASON=""
  if [ "$DEBUG_READY" -eq 1 ]; then
    write_log "Debug port is available but injector is missing; restarting injector."
    if ! run_start --port "$PORT" --node "$NODE_BIN" --app "$APP_BUNDLE"; then
      FAILED=1
      FAILURE_REASON="injector restart failed"
    fi
  else
    MAIN_PIDS="$(dream_main_pids)"
    if [ -z "$MAIN_PIDS" ]; then
      MISSED_PROBES=0
      APP_FIRST_SEEN=0
      IGNORE_EXISTING_APP=0
      sleep "$POLL_SECONDS"
      continue
    fi

    # A newly installed/login-started LaunchAgent must not kill an app that was
    # already open. Once that app closes (or starts with CDP), normal recovery arms.
    if [ "$IGNORE_EXISTING_APP" -eq 1 ]; then
      sleep "$POLL_SECONDS"
      continue
    fi

    if [ "$APP_FIRST_SEEN" -eq 0 ]; then APP_FIRST_SEEN="$NOW"; fi
    if [ $((NOW - APP_FIRST_SEEN)) -lt "$LAUNCH_GRACE_SECONDS" ]; then
      sleep "$POLL_SECONDS"
      continue
    fi

    MISSED_PROBES=$((MISSED_PROBES + 1))
    if [ "$MISSED_PROBES" -lt "$PROBE_FAILURES_BEFORE_RECOVERY" ]; then
      sleep "$POLL_SECONDS"
      continue
    fi
    MISSED_PROBES=0

    WINDOW_START=$((NOW - RESTART_WINDOW_MINUTES * 60))
    FILTERED=""
    RESTART_COUNT=0
    for timestamp in $RESTART_TIMES; do
      if [ "$timestamp" -ge "$WINDOW_START" ]; then
        FILTERED="$FILTERED $timestamp"
        RESTART_COUNT=$((RESTART_COUNT + 1))
      fi
    done
    RESTART_TIMES="$FILTERED"
    if [ "$RESTART_COUNT" -ge "$MAX_RESTARTS_PER_WINDOW" ]; then
      SUSPENDED_UNTIL=$((NOW + COOLDOWN_MINUTES * 60))
      write_log "Restart rate limit hit ($RESTART_COUNT restarts within $RESTART_WINDOW_MINUTES minutes); auto-recovery suspended for $COOLDOWN_MINUTES minutes. Codex keeps running unskinned."
      sleep "$POLL_SECONDS"
      continue
    fi

    write_log "Detected Codex launched without Dream Skin; restarting it through the skin launcher."
    RESTART_TIMES="$RESTART_TIMES $NOW"
    if ! run_start --port "$PORT" --restart-existing --node "$NODE_BIN" --app "$APP_BUNDLE"; then
      FAILED=1
      FAILURE_REASON="launcher failed"
    elif ! dream_cdp_ready "$PORT"; then
      FAILED=1
      FAILURE_REASON="launcher finished but CDP is unreachable on both loopbacks"
    else
      write_log "Codex restarted with Dream Skin."
      APP_FIRST_SEEN="$(date +%s)"
    fi
  fi

  if [ "$FAILED" -eq 1 ]; then
    CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
    write_log "Recovery failed ($CONSECUTIVE_FAILURES/$MAX_CONSECUTIVE_FAILURES): $FAILURE_REASON"
    if [ "$CONSECUTIVE_FAILURES" -ge "$MAX_CONSECUTIVE_FAILURES" ]; then
      SUSPENDED_UNTIL=$(($(date +%s) + COOLDOWN_MINUTES * 60))
      write_log "Auto-recovery suspended for $COOLDOWN_MINUTES minutes after $CONSECUTIVE_FAILURES consecutive failures. Codex keeps running unskinned."
    else
      sleep $((10 * CONSECUTIVE_FAILURES))
    fi
  else
    CONSECUTIVE_FAILURES=0
  fi
  sleep "$POLL_SECONDS"
done
