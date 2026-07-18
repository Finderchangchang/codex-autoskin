#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/codex-autoskin-model.XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT

fail() { echo "model test failed: $*" >&2; exit 1; }

FIXTURE="$TMP_ROOT/repo"
mkdir -p "$FIXTURE/scripts" "$FIXTURE/assets" "$FIXTURE/styles/dream" "$FIXTURE/themes-private"
cp "$ROOT/scripts/injector.mjs" "$ROOT/scripts/runtime-verification.mjs" "$FIXTURE/scripts/"
cp "$ROOT/assets/renderer-inject.js" "$FIXTURE/assets/"
cp "$ROOT/styles/common.css" "$FIXTURE/styles/"
cp "$ROOT/styles/dream/style.css" "$FIXTURE/styles/dream/"
cp -R "$ROOT/themes" "$FIXTURE/themes"

echo "Checking original Dream payload plus the theme-only switcher..."
"$NODE_BIN" "$ROOT/tests/test-verification.mjs"
"$NODE_BIN" "$FIXTURE/scripts/injector.mjs" --payload-file "$TMP_ROOT/payload.js" >/dev/null
"$NODE_BIN" --check "$TMP_ROOT/payload.js"
grep -q 'styles/dream' "$ROOT/THEME-SPEC.md" || fail "theme spec no longer points at the Dream structure layer"
grep -q 'codex-autoskin-panel' "$TMP_ROOT/payload.js" || fail "theme picker is missing from payload"
grep -q 'Codex Original' "$TMP_ROOT/payload.js" || fail "native restore action is missing"
if grep -q 'themeTemplates\|templateOrder\|TEMPLATE_META' "$TMP_ROOT/payload.js"; then fail "template architecture leaked into payload"; fi
if grep -q 'data-group=.layout' "$TMP_ROOT/payload.js"; then fail "layout control leaked into picker"; fi
if grep -q '__DREAM_.*_JSON__' "$TMP_ROOT/payload.js"; then fail "payload placeholders were not replaced"; fi
grep -q 'state.setAppearance' "$ROOT/scripts/set-theme.mjs" || fail "CLI does not share the appearance API"

# Outside the fallback token block, structure CSS must be color-agnostic. Any
# chromatic literal here would freeze a region to one palette and break future
# quick-theme uploads; neutral white/gray/black literals remain valid materials.
"$NODE_BIN" -e '
  const fs = require("fs");
  const css = fs.readFileSync(process.argv[1], "utf8");
  const marker = "html.codex-dream-skin body";
  const structure = css.slice(css.indexOf(marker));
  const offenders = [];
  const add = (literal, r, g, b) => { if (r !== g || g !== b) offenders.push(literal); };
  for (const match of structure.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi)) {
    const hex = match[1].length === 3 ? [...match[1]].map((v) => v + v).join("") : match[1].slice(0, 6);
    add(match[0], parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
  }
  for (const match of structure.matchAll(/rgba?\(\s*(\d+)(?:\s*,\s*|\s+)(\d+)(?:\s*,\s*|\s+)(\d+)/gi)) {
    add(match[0], Number(match[1]), Number(match[2]), Number(match[3]));
  }
  if (offenders.length) throw new Error("chromatic literals leaked outside theme tokens: " + [...new Set(offenders)].join(", "));
' "$ROOT/styles/dream/style.css"

echo "Checking theme validation and isolation..."
cp -R "$FIXTURE/themes/aurora-veil" "$FIXTURE/themes/missing-token"
"$NODE_BIN" -e '
  const fs = require("fs");
  const file = process.argv[1];
  const data = JSON.parse(fs.readFileSync(file));
  data.name = "missing-token";
  delete data.tokens["--dream-ink"];
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
' "$FIXTURE/themes/missing-token/theme.json"
cp -R "$FIXTURE/themes/aurora-veil" "$FIXTURE/themes/missing-art"
"$NODE_BIN" -e '
  const fs = require("fs");
  const file = process.argv[1];
  const data = JSON.parse(fs.readFileSync(file));
  data.name = "missing-art";
  data.art.home = "absent.webp";
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
' "$FIXTURE/themes/missing-art/theme.json"
printf '%s\n' 'body { color: red; }' >"$FIXTURE/themes/ember-bloom/extra.css"
"$NODE_BIN" "$FIXTURE/scripts/injector.mjs" --themes >"$TMP_ROOT/themes.json" 2>"$TMP_ROOT/themes.err"
"$NODE_BIN" -e '
  const report = require(process.argv[1]);
  if (report.themes.some((theme) => ["missing-token", "missing-art"].includes(theme.name))) throw new Error("invalid theme was loaded");
  const ember = report.themes.find((theme) => theme.name === "ember-bloom");
  if (!ember || ember.extraCss) throw new Error("unscoped extra.css was not rejected independently");
  if (!report.themes.every((theme) => theme.preview)) throw new Error("theme preview is missing");
' "$TMP_ROOT/themes.json"
grep -q 'missing required token' "$TMP_ROOT/themes.err" || fail "missing-token warning is unclear"
grep -q 'art file not found' "$TMP_ROOT/themes.err" || fail "missing-art warning is unclear"
grep -q 'extra.css REJECTED' "$TMP_ROOT/themes.err" || fail "extra.css scope rejection is missing"

echo "Checking duplicate precedence..."
cp -R "$FIXTURE/themes/aurora-veil" "$FIXTURE/themes-private/aurora-veil"
"$NODE_BIN" "$FIXTURE/scripts/injector.mjs" --themes >"$TMP_ROOT/duplicates.json" 2>"$TMP_ROOT/duplicates.err"
"$NODE_BIN" -e '
  const report = require(process.argv[1]);
  const matches = report.themes.filter((theme) => theme.name === "aurora-veil");
  if (matches.length !== 1 || matches[0].source !== "themes") throw new Error("public theme must win duplicate resolution");
' "$TMP_ROOT/duplicates.json"

echo "All model tests passed."
