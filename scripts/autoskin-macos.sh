#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/lib/mac-common.sh"

usage() {
  cat <<'EOF'
Codex AutoSkin for macOS

Usage:
  scripts/autoskin-macos.sh install [options]
  scripts/autoskin-macos.sh start [start options]
  scripts/autoskin-macos.sh quick-theme <image> [--name NAME] [--layout LAYOUT]
  scripts/autoskin-macos.sh theme <name> [banner|fullscreen] [--port PORT]
  scripts/autoskin-macos.sh verify [verify options]
  scripts/autoskin-macos.sh doctor [--port PORT] [--app PATH]
  scripts/autoskin-macos.sh restore [restore options]
  scripts/autoskin-macos.sh uninstall [--yes] [--port PORT] [--app PATH]

Install options:
  --restart-existing   Restart an already-open Codex after confirmation is skipped.
  --no-auto-recover    Do not install the LaunchAgent watcher.
  --no-start           Install only; do not launch the skin.
  --port PORT          Use a port other than 9335.
  --app PATH           Use a non-standard ChatGPT.app / Codex.app path.

The official macOS Codex app includes a compatible Node.js runtime, so a
separate Node.js installation is normally not required.
EOF
}

COMMAND="${1:-help}"
[ "$#" -eq 0 ] || shift

case "$COMMAND" in
  help|-h|--help)
    usage
    ;;

  install)
    PORT="$(dream_installed_port)"
    APP_PATH=""
    NODE_PATH=""
    RESTART_EXISTING=0
    NO_AUTO_RECOVER=0
    NO_START=0
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --port) [ "$#" -ge 2 ] || dream_die "--port requires a value"; PORT="$2"; shift 2 ;;
        --app) [ "$#" -ge 2 ] || dream_die "--app requires a value"; APP_PATH="$2"; shift 2 ;;
        --node) [ "$#" -ge 2 ] || dream_die "--node requires a value"; NODE_PATH="$2"; shift 2 ;;
        --restart-existing) RESTART_EXISTING=1; shift ;;
        --no-auto-recover) NO_AUTO_RECOVER=1; shift ;;
        --no-start) NO_START=1; shift ;;
        *) dream_die "unknown install option: $1" ;;
      esac
    done

    dream_require_macos
    dream_validate_port "$PORT"
    dream_resolve_app "$APP_PATH"
    dream_resolve_node "$NODE_PATH"

    INSTALL_ARGS=(--port "$PORT" --app "$APP_BUNDLE" --node "$NODE_BIN")
    [ "$NO_AUTO_RECOVER" -ne 1 ] || INSTALL_ARGS+=(--no-auto-recover)
    "$SCRIPT_DIR/install-dream-skin.sh" "${INSTALL_ARGS[@]}"
    INSTALLED_SCRIPT="$(dream_state_root)/runtime/scripts/autoskin-macos.sh"

    if [ "$NO_START" -eq 1 ]; then
      echo "AutoSkin is installed. Run '$INSTALLED_SCRIPT start' when you are ready to launch it."
      exit 0
    fi

    if ! dream_cdp_ready "$PORT" && [ -n "$(dream_main_pids)" ] && [ "$RESTART_EXISTING" -ne 1 ]; then
      if [ -t 0 ]; then
        printf '\nCodex is currently open. Restart it now to enable AutoSkin? [y/N] '
        read -r answer
        case "$answer" in
          y|Y|yes|YES|Yes) RESTART_EXISTING=1 ;;
          *)
            echo "AutoSkin is installed but has not restarted Codex."
            echo "Quit Codex later, then run: $INSTALLED_SCRIPT start"
            exit 0
            ;;
        esac
      else
        echo "AutoSkin is installed, but Codex is already open and was not restarted."
        echo "Quit Codex and run '$INSTALLED_SCRIPT start', or rerun install with --restart-existing."
        exit 0
      fi
    fi

    START_ARGS=(--port "$PORT" --app "$APP_BUNDLE" --node "$NODE_BIN")
    [ "$RESTART_EXISTING" -ne 1 ] || START_ARGS+=(--restart-existing)
    "$(dream_state_root)/runtime/scripts/start-dream-skin.sh" "${START_ARGS[@]}"
    echo "AutoSkin installation is complete."
    ;;

  start)
    exec "$SCRIPT_DIR/start-dream-skin.sh" "$@"
    ;;

  quick-theme|create-theme)
    exec "$SCRIPT_DIR/quick-theme-macos.sh" "$@"
    ;;

  theme)
    APP_PATH=""
    NODE_PATH=""
    THEME_ARGS=()
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --app) [ "$#" -ge 2 ] || dream_die "--app requires a value"; APP_PATH="$2"; shift 2 ;;
        --node) [ "$#" -ge 2 ] || dream_die "--node requires a value"; NODE_PATH="$2"; shift 2 ;;
        *) THEME_ARGS+=("$1"); shift ;;
      esac
    done
    dream_require_macos
    dream_resolve_app "$APP_PATH"
    dream_resolve_node "$NODE_PATH"
    exec "$NODE_BIN" "$SCRIPT_DIR/set-theme.mjs" --port "$(dream_installed_port)" "${THEME_ARGS[@]}"
    ;;

  verify)
    exec "$SCRIPT_DIR/verify-dream-skin.sh" "$@"
    ;;

  restore)
    exec "$SCRIPT_DIR/restore-dream-skin.sh" "$@"
    ;;

  uninstall)
    PORT="$(dream_installed_port)"
    APP_PATH=""
    NODE_PATH=""
    YES=0
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --port) [ "$#" -ge 2 ] || dream_die "--port requires a value"; PORT="$2"; shift 2 ;;
        --app) [ "$#" -ge 2 ] || dream_die "--app requires a value"; APP_PATH="$2"; shift 2 ;;
        --node) [ "$#" -ge 2 ] || dream_die "--node requires a value"; NODE_PATH="$2"; shift 2 ;;
        --yes|-y) YES=1; shift ;;
        *) dream_die "unknown uninstall option: $1" ;;
      esac
    done
    if [ "$YES" -ne 1 ]; then
      if [ ! -t 0 ]; then dream_die "uninstall requires --yes in non-interactive mode"; fi
      printf 'Remove AutoSkin and restore the pre-install Codex colors? [y/N] '
      read -r answer
      case "$answer" in
        y|Y|yes|YES|Yes) ;;
        *) echo "Uninstall cancelled."; exit 0 ;;
      esac
    fi
    RESTORE_ARGS=(--port "$PORT" --uninstall --restore-base-theme)
    [ -z "$APP_PATH" ] || RESTORE_ARGS+=(--app "$APP_PATH")
    [ -z "$NODE_PATH" ] || RESTORE_ARGS+=(--node "$NODE_PATH")
    exec "$SCRIPT_DIR/restore-dream-skin.sh" "${RESTORE_ARGS[@]}"
    ;;

  doctor)
    PORT="$(dream_installed_port)"
    APP_PATH=""
    NODE_PATH=""
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --port) [ "$#" -ge 2 ] || dream_die "--port requires a value"; PORT="$2"; shift 2 ;;
        --app) [ "$#" -ge 2 ] || dream_die "--app requires a value"; APP_PATH="$2"; shift 2 ;;
        --node) [ "$#" -ge 2 ] || dream_die "--node requires a value"; NODE_PATH="$2"; shift 2 ;;
        *) dream_die "unknown doctor option: $1" ;;
      esac
    done
    dream_require_macos
    dream_validate_port "$PORT"
    dream_resolve_app "$APP_PATH"
    dream_resolve_node "$NODE_PATH"
    STATE_ROOT="$(dream_state_root)"
    echo "App:        $APP_BUNDLE"
    echo "Bundle ID:  $APP_BUNDLE_ID"
    echo "Node.js:    $NODE_BIN ($($NODE_BIN --version))"
    echo "Config:     $HOME/.codex/config.toml"
    echo "State:      $STATE_ROOT"
    echo "LaunchAgent: $HOME/Library/LaunchAgents/com.codex-autoskin.watcher.plist"
    if dream_cdp_ready "$PORT"; then echo "CDP port:   $PORT (ready)"; else echo "CDP port:   $PORT (not active)"; fi
    ;;

  *)
    usage >&2
    dream_die "unknown command: $COMMAND"
    ;;
esac
