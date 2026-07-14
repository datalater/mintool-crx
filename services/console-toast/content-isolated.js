(function () {
  if (globalThis.__mintoolConsoleToastIsolated__) return;
  globalThis.__mintoolConsoleToastIsolated__ = true;

  const FEATURE_KEY = "consoleToast";
  const EVENT_SET_ENABLED = "mintool:console-toast:set-enabled";
  const EVENT_REQUEST_DISABLE = "mintool:console-toast:request-disable";
  const ENABLED_ATTR = "data-mintool-console-toast";

  init();

  async function init() {
    await syncFromStorage();

    window.addEventListener(EVENT_REQUEST_DISABLE, () => {
      disableFeature();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync" || !changes.features) return;
      applyEnabled(changes.features.newValue?.[FEATURE_KEY] === true);
    });
  }

  async function syncFromStorage() {
    try {
      const { features = {} } = await chrome.storage.sync.get("features");
      applyEnabled(features[FEATURE_KEY] === true);
    } catch (_error) {
      // Ignore storage failures.
    }
  }

  async function disableFeature() {
    try {
      const { features = {} } = await chrome.storage.sync.get("features");
      features[FEATURE_KEY] = false;
      await chrome.storage.sync.set({ features });
      applyEnabled(false);
    } catch (_error) {
      // Ignore storage failures.
    }
  }

  function applyEnabled(enabled) {
    const next = Boolean(enabled);
    document.documentElement.setAttribute(ENABLED_ATTR, String(next));
    window.dispatchEvent(
      new CustomEvent(EVENT_SET_ENABLED, {
        detail: { enabled: next },
      }),
    );
  }
})();

