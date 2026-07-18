import assert from "node:assert/strict";
import { verifyRuntimeResult } from "../scripts/runtime-verification.mjs";

const healthySkin = {
  installed: true,
  nativeMode: false,
  version: "3.0.0",
  theme: "aurora-veil",
  layout: "fullscreen",
  themes: ["aurora-veil"],
  stylePresent: true,
  chromePresent: true,
  legacyControlsPresent: false,
  switcherEntryPresent: true,
  switcherPanelPresent: true,
  chromePointerEvents: "none",
  homePresent: true,
  suggestionsPresent: true,
  hero: { width: 100, height: 100 },
  cards: [{}, {}],
  composer: { width: 100, height: 40 },
  sidebar: { width: 240, height: 700 },
};

assert.equal(verifyRuntimeResult(healthySkin), true);

const healthyNative = {
  ...healthySkin,
  installed: false,
  nativeMode: true,
  chromePresent: false,
  chromePointerEvents: "auto",
  homePresent: false,
  suggestionsPresent: false,
  hero: null,
  cards: [],
};
assert.equal(verifyRuntimeResult(healthyNative), true,
  "Codex original mode is a healthy injected runtime, not a missing skin");
assert.equal(verifyRuntimeResult({ ...healthyNative, switcherEntryPresent: false }), false);
assert.equal(verifyRuntimeResult({ ...healthyNative, stylePresent: false }), false);
assert.equal(verifyRuntimeResult({ ...healthySkin, chromePresent: false }), false);
assert.equal(verifyRuntimeResult({ ...healthySkin, nativeMode: true }), false);

console.log("Runtime verification tests passed.");
