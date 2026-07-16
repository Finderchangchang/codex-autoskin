---
name: codex-dream-skin
description: Apply, launch, verify, theme-switch, repair, update, or restore a full decorative skin for the Windows Codex desktop app. Use when the user asks for a Codex theme beyond official color settings, wants a custom image turned into a skin theme, needs the skin reapplied after a Codex update, or needs a safe rollback without modifying WindowsApps or app.asar.
---

# Codex Dream Skin

Apply a reversible renderer skin through Chromium DevTools Protocol while launching the official Store-installed Codex executable. Never replace or take ownership of files under `WindowsApps`.

Themes are data, not code: the injector scans `themes/` and `themes-private/` for folders containing `theme.json` (meta + 28 required tokens + art, plus optional v1.1 `cards`/`stickers`/`composer` decor fields) and generates the payload at start. To create or adjust a theme, follow `THEME-SPEC.md` at the repo root — never hardcode theme names into engine files.

## Workflow

1. Run `scripts/install-dream-skin.ps1` once to set the matching official base colors, create launch/restore shortcuts, and install the hidden auto-recovery watcher. Use `-NoAutoRecover` only when the user explicitly does not want normal Codex restarts intercepted.
2. Run `scripts/start-dream-skin.ps1`. Add `-RestartExisting` only when the user authorized restarting an already-open Codex app.
3. Run `scripts/verify-dream-skin.ps1 -ScreenshotPath <absolute-path>` after launch. Treat a missing hero, native composer, sidebar skin, or injection marker as failure. The native suggestion count is responsive and may be two to four.
4. Switch themes/layouts programmatically: `node scripts/set-theme.mjs <theme> [banner|fullscreen]` (or `--list`). There is intentionally no on-screen switch UI; the choice persists via localStorage and survives reloads and watcher-recovered restarts.
5. Inspect the screenshot against `references/qa-inventory.md`. Verify every scanned theme in both home layouts before signing off; `node scripts/injector.mjs --themes` lists what was scanned.
6. Run `scripts/restore-dream-skin.ps1` for live removal. Add `-Uninstall` to delete shortcuts; add `-RestoreBaseTheme` when the user also wants the pre-install config backup restored.

## Guardrails

- Preserve the official executable, package signature, user threads, pets, plugins, and authentication state.
- Do not use a reference screenshot as a fake whole-window control overlay. Theme art may only supply a cropped banner, a fullscreen home canvas, a low-contrast chat-art layer, or a decorative polaroid; all controls remain live Codex controls.
- Preserve the two independent home layouts: `banner` keeps the hero on top, while `fullscreen` turns the hero crop into the home canvas. Both keep native suggestions centered and the native project selector/composer at the bottom.
- Themes come exclusively from the manifest scan. Each theme owns separate home-art and chat-art roles, crop tokens, wash strength, copy, and accents in its `theme.json`; per-theme CSS exceptions live in that theme's `extra.css`, which must stay scoped to `html.dream-theme-<name>` (the injector rejects unscoped files).
- Keep chat art faint and subject-focused. It must never reduce message contrast or expose readable fake controls/text from a source screenshot.
- When replacing a theme image, keep geometry unchanged and adjust only that theme's crop/overlay/wash tokens in its `theme.json`.
- Attach the "选择项目" treatment to Codex's real project-selector toolbar and keep the current project button clickable; never draw a disconnected replacement.
- Keep decorative layers `pointer-events: none`. The decorative chrome container stays at a low z-index so real Codex modals cover it.
- Stickers (speech bubble, promo board, corner rose) are strictly opt-in per theme, render fullscreen-home-only inside the chrome layer, and must never overlap a native control. The sidebar "new task" capsule is a marker class on the real native button; the account/profile button is only restyled, never covered or replaced by a fake identity card. The theme composer placeholder rides a CSS var fallback, so restore automatically brings the native text back.
- Inject only the main `app://-/index.html` renderer. Never inject into compact/auxiliary renderers such as `initialRoute=/avatar-overlay`; those windows must retain a fully transparent body for desktop pets.
- On app updates, rerun install and launch; the scripts discover the current Appx package dynamically.
- If port `9335` is occupied, choose another port consistently for start, verify, set-theme, and restore.
- Keep the injection daemon running for navigation/reload resilience. Its state and logs live under `%LOCALAPPDATA%\CodexDreamSkin`.
- Keep the single-instance auto-recovery watcher enabled when restart persistence is expected. It waits for a normally launched Codex window, allows startup grace, then safely relaunches Codex with loopback CDP and the injector. It must remain idle while Codex is closed.

## Resources

- `THEME-SPEC.md`: agent-facing spec for authoring themes (schema, 28 tokens, crop workflow, clean-art vs UI-screenshot decision tree, acceptance checklist).
- `scripts/injector.mjs`: theme scanning/validation, payload generation, CDP injection, auxiliary-window transparency protection, verification (`--verify`), theme report (`--themes`), screenshot, and removal.
- `scripts/set-theme.mjs`: programmatic theme/layout switching against the running instance.
- `scripts/watch-dream-skin.ps1`: hidden single-instance watcher that restores the skin after an ordinary Codex restart and repairs a missing injector.
- `styles/dream/style.css`: structure layer; consumes tokens only, contains no theme names.
- `assets/renderer-inject.js`: idempotent DOM integration and cleanup; fully manifest-driven.
- `themes/<name>/`, `themes-private/<name>/`: theme data folders (`theme.json`, art, optional `extra.css`). `themes-private/` is git-ignored for local-only themes.
- `tools/generate-demo-art.py`: reproducible generator for the bundled demo art.
- `references/qa-inventory.md`: required functional and visual signoff coverage.
- `references/runtime-notes.md`: troubleshooting and update behavior.
