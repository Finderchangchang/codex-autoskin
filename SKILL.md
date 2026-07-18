---
name: codex-autoskin
version: 3.0.0
description: Apply, launch, verify, theme-switch, repair, update, or restore a full decorative skin for the Windows or macOS Codex desktop app. Use when the user asks for a Codex theme beyond official color settings, wants a custom image turned into a skin theme, needs the skin reapplied after a Codex update, or needs a safe rollback without modifying the official app or app.asar.
---

# Codex AutoSkin

Apply a reversible renderer skin through Chromium DevTools Protocol while launching the official Codex executable. Never replace, patch, re-sign, or take ownership of files in `WindowsApps` or a macOS app bundle.

Themes are data, not code: the injector scans `themes/` and `themes-private/` for folders containing `theme.json` (meta + 28 required tokens + art, plus optional `cards`/`stickers`/`composer` decor fields). To create or adjust a theme, follow `THEME-SPEC.md`; never hardcode theme names into engine files.

## Workflow

1. Install once: Windows uses `scripts/install-dream-skin.ps1`; macOS should prefer the unified `scripts/autoskin-macos.sh install` entry point (or the advanced `scripts/install-dream-skin.sh`). Both set matching base colors and install the auto-recovery watcher. Use `-NoAutoRecover` / `--no-auto-recover` only when the user explicitly does not want normal Codex restarts intercepted. The macOS wrapper automatically uses the Node.js runtime bundled with the official Codex app when no compatible system Node is available, copies a self-contained runtime under the user Application Support directory, and remembers custom port/app choices for later commands.
2. Start with the platform script: `scripts/start-dream-skin.ps1` or `scripts/start-dream-skin.sh`. Add `-RestartExisting` / `--restart-existing` only when the user authorized restarting an already-open Codex app.
3. Verify after launch: Windows uses `scripts/verify-dream-skin.ps1 -ScreenshotPath <absolute-path>`; macOS uses `scripts/verify-dream-skin.sh --screenshot <absolute-path>`. Treat a missing hero, native composer, sidebar skin, or injection marker as failure. The native suggestion count is responsive and may be two to four.
4. Prefer the sidebar **Theme** panel for interactive switching. It is modeless, keeps the real background visible, and supports Codex-original restore plus one-session undo. Layout remains an advanced compatibility option through `node scripts/set-theme.mjs <theme> [banner|fullscreen]` (or `--list`).
5. On macOS, turn a PNG/JPG into a private theme with `scripts/autoskin-macos.sh quick-theme <image> [--name name] [--layout fullscreen|banner]`. It uses built-in `sips`, generates a lightweight preview, reloads the injector, and applies the theme when AutoSkin is active.
6. Inspect the screenshot against `references/qa-inventory.md`. Verify every scanned theme in both home layouts before signing off; `node scripts/injector.mjs --themes` lists what was scanned.
7. Run the platform `restore-dream-skin` script for live removal. Add `-Uninstall -RestoreBaseTheme` on Windows or `--uninstall --restore-base-theme` on macOS for a full uninstall with pre-install colors restored.

## Guardrails

- Preserve the official executable, package signature, user threads, pets, plugins, and authentication state.
- Do not use a reference screenshot as a fake whole-window control overlay. Theme art may only supply a cropped banner, a fullscreen home canvas, a low-contrast chat-art layer, or a decorative polaroid; all controls remain live Codex controls.
- Preserve the two independent home layouts: `banner` keeps the hero on top, while `fullscreen` turns the hero crop into the home canvas. Both keep native suggestions centered and the native project selector/composer at the bottom.
- Themes come exclusively from the manifest scan. Each theme owns its art, crop, wash, copy and accents; per-theme CSS exceptions remain scoped to `html.dream-theme-<name>` and unscoped files are rejected.
- The switcher is neutral runtime chrome. Theme CSS must not restyle or cover `#codex-autoskin-entry` or `#codex-autoskin-panel`; the panel remains non-modal and does not add a dimming scrim.
- Keep chat art faint and subject-focused. It must never reduce message contrast or expose readable fake controls/text from a source screenshot.
- When replacing a theme image, keep geometry unchanged and adjust only that theme's crop/overlay/wash tokens in its `theme.json`.
- Attach the "选择项目" treatment to Codex's real project-selector toolbar and keep the current project button clickable; never draw a disconnected replacement.
- Keep decorative layers `pointer-events: none`. The decorative chrome container stays at a low z-index so real Codex modals cover it.
- Stickers (speech bubble, promo board, corner rose) are strictly opt-in per theme, render fullscreen-home-only inside the chrome layer, and must never overlap a native control. The sidebar "new task" capsule is a marker class on the real native button; the account/profile button is only restyled, never covered or replaced by a fake identity card. The theme composer placeholder rides a CSS var fallback, so restore automatically brings the native text back.
- Inject only the main `app://-/index.html` renderer. Never inject into compact/auxiliary renderers such as `initialRoute=/avatar-overlay`; those windows must retain a fully transparent body for desktop pets.
- On app updates, rerun install and launch; Windows discovers the current Appx package dynamically and macOS resolves the bundle executable from `Info.plist`.
- If port `9335` is occupied, choose another port during macOS unified installation; later unified commands remember it. Direct low-level commands still need the same port explicitly.
- Keep the injection daemon running for navigation/reload resilience. Its state and logs live under `%LOCALAPPDATA%\CodexDreamSkin` on Windows or `~/Library/Application Support/CodexDreamSkin` on macOS.
- Keep the single-instance auto-recovery watcher enabled when restart persistence is expected. It waits for a normally launched Codex window, allows startup grace, then safely relaunches Codex with loopback CDP and the injector. It must remain idle while Codex is closed.

## Resources

- `THEME-SPEC.md`: agent-facing spec for authoring themes (schema, 28 tokens, crop workflow, clean-art vs UI-screenshot decision tree, acceptance checklist).
- `scripts/injector.mjs`: theme scanning/validation, payload generation, CDP injection, auxiliary-window transparency protection, verification (`--verify`), theme report (`--themes`), CDP screenshot on supported builds, and removal. macOS window screenshots use `scripts/macos-capture.mjs` through the verify wrapper.
- `scripts/autoskin-macos.sh`, `Install AutoSkin on macOS.command`, `Uninstall AutoSkin on macOS.command`: simplified macOS command-line and Finder entry points layered over the advanced scripts.
- `scripts/sync-macos-runtime.mjs`: atomically installs a self-contained macOS runtime so LaunchAgent recovery does not depend on the source checkout remaining in place.
- `scripts/generate-quick-theme-macos.mjs`, `scripts/quick-theme-macos.sh`, `Create AutoSkin Theme on macOS.command`: dependency-free macOS image sampling, safe theme generation, live reload, and Finder entry point.
- `scripts/set-theme.mjs`: programmatic theme/layout switching against the running instance.
- `scripts/watch-dream-skin.ps1`, `scripts/watch-dream-skin.sh`: platform single-instance watchers that restore the skin after an ordinary Codex restart and repair a missing injector.
- `styles/dream/style.css`: the original Windows Dream structure layer; consumes tokens only and contains no theme names. `styles/common.css` owns only the neutral switcher.
- `assets/renderer-inject.js`: idempotent DOM integration, atomic appearance state, switcher, and cleanup; fully manifest-driven.
- `themes/<name>/`, `themes-private/<name>/`: theme data folders (`theme.json`, art, optional `extra.css`). `themes-private/` is git-ignored for local-only themes.
- `tools/generate-demo-art.py`: reproducible generator for the bundled demo art.
- `references/qa-inventory.md`: required functional and visual signoff coverage.
- `references/runtime-notes.md`: troubleshooting and update behavior.
- `references/scene-art-swap.md`: worked example of swapping a theme's art for a full-canvas scene image (THEME-SPEC §5.1 preset) with the live-tuning workflow and final tokens.
