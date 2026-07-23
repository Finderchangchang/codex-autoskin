<div align="center">

# Codex AutoSkin

**Send one image — your Codex reskins itself.**

![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-0078d4)
![Node](https://img.shields.io/badge/node-%E2%89%A5%2020-339933)
![Release](https://img.shields.io/github/v/release/Finderchangchang/codex-autoskin)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)

Two minutes to first light · No official files touched · One-command restore · Windows & macOS

**English** · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

[Quick start](#-quick-start) · [Features](#-features) · [Roadmap](#-roadmap) · [FAQ](#-faq)

</div>

---

## 🎬 Live demo

Hand your Codex the repo link and one image, and say **"install this skin"**:

![① one sentence](docs/demo-step1-command.png)

Codex clones, installs, and generates a theme from your image on its own:

![② Codex runs it](docs/demo-step2-agent.png)

Done — from a single image to a custom skin, hands-free:

![③ the result](docs/demo-step3-result.png)

> The demo theme was generated from a piece of fan art purely to show the flow; sample art belongs to its respective rights holders. Do not use another person's likeness or copyrighted material to build and **publicly distribute** a theme (keep personal ones in `themes-private/`).

> 📌 **This project only does step one.** Everyone already has Codex — what's missing is turning one image into a usable skin base (background + palette, both layouts). That step we make dead simple. Frames, stickers, card details — those are yours to invent; hand [THEME-SPEC.md](THEME-SPEC.md) to your agent. Tutorials to follow.

### ⚡ Fastest path: copy one sentence

Send this line to your Codex, with an image you like attached (landscape, subject on the right, no text/watermark):

```text
Install this Codex skin engine: https://github.com/Finderchangchang/codex-autoskin , then use the attached image to generate a theme and apply it
```

The rest is automatic. No image? It still lights up with a bundled theme first — add yours anytime. Don't want to use AI? See the manual per-platform steps below.

<details>
<summary><b>📖 Table of contents</b></summary>

- [Features](#-features)
- [Quick start](#-quick-start)
- [Daily use](#-daily-use)
- [Make your own theme](#-make-your-own-theme)
- [How it works & safety](#-how-it-works--safety)
- [Roadmap](#-roadmap)
- [FAQ](#-faq)
- [Contributing](#-contributing)
- [About](#-about)
- [Disclaimer](#%EF%B8%8F-disclaimer)
- [License](#-license)

</details>

## ✨ Features

- 🖼 **One image → a theme** — one command on Windows / double-click-pick on macOS: auto palette extraction, light/dark route detection, generated and applied instantly
- ⚡ **Minimal setup** — Windows: two commands; macOS: double-click, reusing the Node.js bundled with Codex, zero dependencies for regular users
- 📁 **A theme is a folder** — one `theme.json` + one image is a theme; add or remove themes with zero code changes
- 🤖 **Optional AI refinement** — hand the repo to your Codex / Claude and deeply customize crop, copy, and stickers via [THEME-SPEC.md](THEME-SPEC.md)
- 🔒 **Safe & reversible** — CDP injection on loopback only; never touches `WindowsApps`, the app bundle, or `app.asar`; login/session preserved; one command to restore
- 🛡 **Battle-tested guard** — dual-stack port probing, crash debounce + circuit breaker, decoration hit-testing; a Startup watcher on Windows / a LaunchAgent on macOS re-applies the skin after Codex restarts

## 🚀 Quick start

### Windows: two commands

Requires Windows 10/11, Microsoft Store Codex (opened and signed in once), and [Node.js ≥ 20](https://nodejs.org/).

```powershell
git clone https://github.com/Finderchangchang/codex-autoskin.git   # or Download ZIP and extract
cd codex-autoskin

.\quickstart.ps1                              # ① install & launch — Codex lights up with a bundled theme
.\quick-theme.ps1 -Image C:\path\your.png     # ② your image becomes a live theme
```

Don't like the palette? Swap the image and rerun. `-Name yourname` names the theme. "Running scripts is disabled"? See [FAQ](#-faq).

### macOS: three steps, double-click only

Requires the official Codex Mac app (opened and signed in once). **No Node.js install needed** — the scripts reuse the runtime bundled with Codex.

1. **Download & extract** — GitHub → Code → Download ZIP, then open the `codex-autoskin` folder in Finder;
2. **Double-click to install** — open `Install AutoSkin on macOS.command` (it asks before restarting a running Codex);
3. **Pick an image** — open `Create AutoSkin Theme on macOS.command`, choose a PNG/JPG (or drag one onto the file); it auto-extracts colors, generates, and applies.

A normal install uses your existing Codex profile — **it does not wipe projects, tasks, chats, or login**. Gatekeeper blocking a script? See [FAQ](#-faq). Terminal equivalents:

```bash
scripts/autoskin-macos.sh install
scripts/autoskin-macos.sh quick-theme "/path/to/your.png" --name my-theme
```

**Image requirements (both platforms)**: PNG / JPG, landscape ≥ 1600 px wide, subject toward the right (the left carries the title), no text / watermark / UI in the art, and you own the rights to it.

### Built-in themes

AutoSkin ships with a few data-only themes so first-time users can verify the
engine before making their own image theme.

| Theme | Best for | Files |
|---|---|---|
| [Aurora Veil](themes/aurora-veil/theme.json) | Dark-image route demo | `themes/aurora-veil/` |
| [Ember Bloom](themes/ember-bloom/theme.json) | Light-image route demo | `themes/ember-bloom/` |
| [Caishen Readable](themes/caishen-readable/theme.json) | Warm low-strain light workspace | `themes/caishen-readable/` · [source + install guide](https://codex-theme-gallery.howardhua.chatgpt.site/codex-autoskin?utm_source=finderchangchang-autoskin&utm_medium=readme-built-in-table&utm_campaign=caishen-readable-autoskin) |

<details>
<summary><b>🖼 Bundled theme previews (Aurora Veil / Ember Bloom)</b></summary>

| Aurora Veil (dark-image route) | Ember Bloom (light-image route) |
|---|---|
| ![aurora fullscreen](docs/screenshot-aurora-veil-fullscreen.png) | ![ember fullscreen](docs/screenshot-ember-bloom-fullscreen.png) |
| ![aurora banner](docs/screenshot-aurora-veil-banner.png) | ![ember banner](docs/screenshot-ember-bloom-banner.png) |

> Bundled theme art is 100% procedurally generated; no photos of real people in this repo. Screenshot sidebars are blurred and project names are placeholders.

</details>

<details>
<summary><b>🍎 macOS advanced usage (stable entry points / common commands)</b></summary>

Installation atomically syncs a self-contained runtime to `~/Library/Application Support/CodexDreamSkin/runtime`; personal themes live next to it in `themes-private` (runtime updates never overwrite them). After deleting the downloaded repo you can still use the stable entry point:

```bash
"$HOME/Library/Application Support/CodexDreamSkin/runtime/scripts/autoskin-macos.sh" start
"$HOME/Library/Application Support/CodexDreamSkin/runtime/scripts/autoskin-macos.sh" quick-theme "/path/to/image.jpg" --name my-theme
```

Common commands (a custom port / app path chosen at install time is remembered):

```bash
scripts/autoskin-macos.sh doctor                                  # health check: app, bundled Node, state dir, CDP port
scripts/autoskin-macos.sh theme ember-bloom fullscreen            # switch theme
scripts/autoskin-macos.sh verify --screenshot "$PWD/shot.png"     # verify + screenshot by native window id
scripts/autoskin-macos.sh uninstall                               # full uninstall (safe to repeat)
scripts/install-dream-skin.sh --app "$HOME/Apps/ChatGPT.app"      # non-standard install location
scripts/autoskin-macos.sh install --port 19335                    # if the port is taken, set it once
```

Troubleshooting logs live in `~/Library/Application Support/CodexDreamSkin/`: `injector-error.log` (theme scan/injection), `watcher.log` (auto-recovery / breaker), `launch-agent-error.log` (LaunchAgent).

</details>

## 🎨 Daily use

```powershell
node scripts\set-theme.mjs --list                  # list all themes (both platforms)
node scripts\set-theme.mjs aurora-veil fullscreen  # switch theme + layout (banner / fullscreen)
scripts\restore-dream-skin.ps1                     # Windows: restore the official look
```

```bash
scripts/autoskin-macos.sh theme aurora-veil fullscreen   # macOS: switch theme
scripts/restore-dream-skin.sh                            # macOS: restore the official look
```

The choice persists automatically; or just tell your Codex "switch to the aurora theme."

## 🛠 Make your own theme

**Quick**: `quick-theme.ps1` (Windows) / the `quick-theme` command (macOS) — background swap + base palette, both layouts.

**Advanced**: hand the repo and your image to your Codex / Claude and say **"refine theme &lt;name&gt; following THEME-SPEC.md"**. [THEME-SPEC.md](THEME-SPEC.md) is a full spec written for AI agents — 28 color tokens, crop workflows for four art roles, a light/dark decision tree, an acceptance checklist — and an agent can produce a theme and self-verify from it. The bundled [aurora-veil](themes/aurora-veil/theme.json) (dark route) and [ember-bloom](themes/ember-bloom/theme.json) (light route) are two worked examples.

## 🔍 How it works & safety

Stack: PowerShell / POSIX shell + Node.js + Chrome DevTools Protocol, no third-party dependencies.

It launches the official Codex (`ChatGPT.exe` on Windows / `ChatGPT.app` on macOS, via LaunchServices) with `--remote-debugging-port=9335` bound to loopback only, then injects a CSS + JS layer into the main renderer over CDP:

- Never replaces, patches, or re-signs any official file or app bundle; login / session / plugins stay untouched
- The platform `restore-dream-skin` script removes all injected content live; for a full uninstall add `-Uninstall -RestoreBaseTheme` (Windows) or `--uninstall --restore-base-theme` (macOS, safe to repeat)
- All runtime state lives under `%LOCALAPPDATA%\CodexDreamSkin` / `~/Library/Application Support/CodexDreamSkin`; delete it and no trace remains
- A hidden watcher re-applies the skin after a normal Codex restart (debounce + rate limit + failure cooldown, never fighting the app); the macOS LaunchAgent never interrupts a Codex that was already open
- Auxiliary renderers (desktop pets, etc.) are never injected and stay transparent

> The scripts and internal identifiers keep the `dream` prefix — that's the default style-pack name, and a nod to the original.

## 🗺 Roadmap

- [x] Two-command cold start (quickstart / quick-theme)
- [x] One-image auto palette theme generation (light / dark routes)
- [x] AI refinement spec THEME-SPEC.md
- [x] macOS support — ✅ community-contributed, thanks [@keyuchen21](https://github.com/keyuchen21)
- [ ] Demo GIF / video tutorial series
- [ ] Community theme gallery
- [ ] More style packs (currently the built-in `dream` style)

## ❓ FAQ

**Windows says "running scripts is disabled"?**
Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`; for a ZIP download also run `Get-ChildItem -Recurse | Unblock-File`.

**macOS says "developer cannot be verified"?**
Right-click the `.command` file → **Open**, then confirm once. No execute permission? Run `chmod +x ./*.command ./scripts/*.sh` in the repo folder. Still blocked by download quarantine and sure it's from this repo? `xattr -dr com.apple.quarantine "/path/to/codex-autoskin"`.

**macOS screenshot verification fails?**
Grant Screen Recording permission to the terminal (or agent) running the command, then retry — macOS captures by native window id, so it's correct even when another window overlaps.

**The skin vanished after a Codex update?**
Windows: rerun `.\quickstart.ps1`. macOS: rerun `scripts/autoskin-macos.sh install`. Both rediscover the current app dynamically and store no versioned path.

**Port 9335 is taken?**
Windows: `.\quickstart.ps1 -Port 9345`, keep the same port for later scripts. macOS: `scripts/autoskin-macos.sh install --port 19335`, later unified commands remember it.

**Will it affect my Codex account or data?**
No. It never modifies official files, never touches login or sessions, and injection happens on loopback only. It is a decorative community project — see [Disclaimer](#%EF%B8%8F-disclaimer).

**Any performance impact?**
It's a pure CSS/JS decoration layer plus a lightweight guard process — imperceptible in normal use.

**How do I fully uninstall?**
Windows: `scripts\restore-dream-skin.ps1 -Uninstall -RestoreBaseTheme`. macOS: `scripts/autoskin-macos.sh uninstall`. Then launch Codex normally for the pure official state.

**Which platforms are supported?**
Windows (Store Codex) and macOS (official desktop app). Linux is not supported yet — PRs welcome.

## 🤝 Contributing

Three kinds of contributions are most welcome: **new themes** (PR a `themes/` folder + screenshots), **platform support / engine fixes**, and **docs & tutorials**. See [CONTRIBUTING.md](CONTRIBUTING.md).

## 💬 About

The original idea of skinning Codex through CDP injection — then called **Dream Skin** — is mine, and it's been a joy to watch it spread through the community. AutoSkin is a full rewrite: v1 answered "can Codex be skinned?"; this one answers "how does anyone get their own skin from a single image?"

The whole 2.0 was pair-programmed with AI — the full decision log, including every faceplant, is public in [DEVLOG.md](DEVLOG.md), a transparent cyber-development experiment that keeps updating. macOS support was contributed by [@keyuchen21](https://github.com/keyuchen21), landing the day after launch — open source working as intended.

## ⚠️ Disclaimer

- A decorative community project, **not affiliated with OpenAI**; Codex and related marks belong to their respective owners.
- Codex desktop updates may change internal structure and require re-adaptation (the engine targets semantic selectors, so minor updates are usually seamless).
- You are responsible for the copyright and likeness rights of art in your own themes; never use another person's likeness to build and publicly distribute a theme — keep private themes in the git-ignored `themes-private/`.

## 📄 License

[MIT](LICENSE) © Vikicc
