#!/bin/bash

# Shared macOS helpers for the Dream Skin launcher and watcher.

dream_die() {
  echo "dream-skin: $*" >&2
  exit 1
}

dream_require_macos() {
  [ "$(uname -s)" = "Darwin" ] || dream_die "this script only supports macOS"
}

dream_validate_port() {
  case "$1" in
    ''|*[!0-9]*) dream_die "invalid port: $1" ;;
  esac
  [ "$1" -ge 1024 ] && [ "$1" -le 65535 ] || dream_die "invalid port: $1"
}

dream_resolve_node() {
  local requested="${1:-}"
  if [ -n "$requested" ]; then
    [ -x "$requested" ] || dream_die "Node.js executable not found: $requested"
    local requested_major
    requested_major="$($requested -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || true)"
    case "$requested_major" in
      ''|*[!0-9]*) dream_die "could not determine Node.js version from $requested" ;;
    esac
    [ "$requested_major" -ge 20 ] || dream_die "Node.js >= 20 is required (found $($requested --version))"
    NODE_BIN="$requested"
    export NODE_BIN
    return
  fi

  local system_node="" candidate major
  system_node="$(command -v node 2>/dev/null || true)"
  local candidates=("$system_node")
  if [ -n "${APP_BUNDLE:-}" ]; then
    candidates+=("$APP_BUNDLE/Contents/Resources/cua_node/bin/node")
  fi
  candidates+=(
    "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node"
    "$HOME/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node"
    "/Applications/Codex.app/Contents/Resources/cua_node/bin/node"
    "$HOME/Applications/Codex.app/Contents/Resources/cua_node/bin/node"
  )

  for candidate in "${candidates[@]}"; do
    [ -n "$candidate" ] && [ -x "$candidate" ] || continue
    major="$($candidate -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || true)"
    case "$major" in
      ''|*[!0-9]*) continue ;;
    esac
    if [ "$major" -ge 20 ]; then
      NODE_BIN="$candidate"
      export NODE_BIN
      return
    fi
  done

  dream_die "Node.js >= 20 was not found. Install Node.js or update the official Codex app."
}

dream_resolve_app() {
  local requested="${1:-}"
  local candidate=""
  if [ -n "$requested" ]; then
    candidate="${requested%/}"
  else
    local path candidate_id
    for path in \
      "/Applications/ChatGPT.app" \
      "$HOME/Applications/ChatGPT.app" \
      "/Applications/Codex.app" \
      "$HOME/Applications/Codex.app"; do
      if [ -d "$path" ]; then
        candidate_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$path/Contents/Info.plist" 2>/dev/null || true)"
        case "$candidate_id" in
          com.openai.codex|*codex*) candidate="$path"; break ;;
        esac
      fi
    done
  fi

  [ -n "$candidate" ] || dream_die "Codex desktop app not found; install it or pass --app /path/to/ChatGPT.app"
  [ -d "$candidate/Contents" ] || dream_die "not a macOS app bundle: $candidate"

  local plist="$candidate/Contents/Info.plist"
  [ -f "$plist" ] || dream_die "app bundle has no Info.plist: $candidate"
  local executable bundle_id
  executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$plist" 2>/dev/null || true)"
  bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist" 2>/dev/null || true)"
  [ -n "$executable" ] || dream_die "CFBundleExecutable is missing from $plist"
  [ -x "$candidate/Contents/MacOS/$executable" ] || dream_die "Codex executable not found: $candidate/Contents/MacOS/$executable"

  APP_BUNDLE="$candidate"
  APP_EXECUTABLE="$candidate/Contents/MacOS/$executable"
  APP_BUNDLE_ID="$bundle_id"
  export APP_BUNDLE APP_EXECUTABLE APP_BUNDLE_ID
}

dream_state_root() {
  printf '%s\n' "$HOME/Library/Application Support/CodexDreamSkin"
}

dream_cdp_ready() {
  local port="$1" host payload
  for host in "127.0.0.1" "[::1]"; do
    payload="$(curl --globoff -fsS --max-time 2 "http://$host:$port/json/list" 2>/dev/null || true)"
    if printf '%s' "$payload" | grep -Eq '"url"[[:space:]]*:[[:space:]]*"app://-/index\.html'; then
      return 0
    fi
  done
  return 1
}

dream_main_pids() {
  ps -axo pid=,command= | while read -r pid command; do
    case "$command" in
      "$APP_EXECUTABLE"|"$APP_EXECUTABLE "*) printf '%s\n' "$pid" ;;
    esac
  done
}

dream_process_alive() {
  [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null
}

dream_read_json_number() {
  local file="$1" key="$2"
  [ -f "$file" ] || return 1
  "$NODE_BIN" -e '
    const fs = require("fs");
    try {
      const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))[process.argv[2]];
      if (!Number.isInteger(value)) process.exit(1);
      process.stdout.write(String(value));
    } catch { process.exit(1); }
  ' "$file" "$key"
}

dream_pid_matches() {
  local pid="$1" needle="$2" command
  dream_process_alive "$pid" || return 1
  command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  case "$command" in
    *"$needle"*) return 0 ;;
    *) return 1 ;;
  esac
}

dream_stop_pid_if_matches() {
  local pid="$1" needle="$2"
  if dream_pid_matches "$pid" "$needle"; then
    kill "$pid" 2>/dev/null || true
    local attempt=0
    while dream_process_alive "$pid" && [ "$attempt" -lt 20 ]; do
      sleep 0.1
      attempt=$((attempt + 1))
    done
    dream_process_alive "$pid" && kill -9 "$pid" 2>/dev/null || true
  fi
}
