export function verifyRuntimeResult(result) {
  const stateReady = typeof result.version === "string" && result.version.length > 0 &&
    Array.isArray(result.themes) && result.themes.length > 0 && result.themes.includes(result.theme) &&
    ["banner", "fullscreen"].includes(result.layout);
  const controlsReady = result.stylePresent && !result.legacyControlsPresent &&
    result.switcherEntryPresent && result.switcherPanelPresent &&
    Boolean(result.composer) && Boolean(result.sidebar);
  const nativeReady = result.nativeMode === true && !result.installed && !result.chromePresent;
  const skinReady = result.nativeMode === false && result.installed && result.chromePresent &&
    result.chromePointerEvents === "none" &&
    (!result.homePresent || (Boolean(result.hero) &&
      (!result.suggestionsPresent || (result.cards.length >= 2 && result.cards.length <= 4))));
  return Boolean(stateReady && controlsReady && (nativeReady || skinReady));
}
