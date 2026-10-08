(() => {
  const api = mintoolDomHider;
  const config = api.config;
  const persisted = api.createHideSheet("saved");
  const markers = api.createMarkers();
  let editor = null;
  let starting = false;
  let revision = 0;

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.action === config.startAction) {
      start().then(() => respond({ ok: true }), (error) => respond({ ok: false, error: error.message }));
      return true;
    }
    if (message.action === config.navigationAction) {
      editor?.close();
      refresh().catch(report);
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area === "local" && changes[config.storageKey]) || (area === "sync" && changes.features)) refresh().catch(report);
  });
  window.addEventListener("popstate", () => { editor?.close(); refresh().catch(report); });
  refresh().catch(report);

  async function start() {
    if (editor || starting) return;
    starting = true;
    try {
      const [stored, { features = {} }] = await Promise.all([
        chrome.storage.local.get(config.storageKey), chrome.storage.sync.get("features"),
      ]);
      if (features[config.featureKey] === false) throw new Error("설정에서 DOM 숨김 규칙을 켜주세요.");
      const rules = Array.isArray(stored[config.storageKey]) ? stored[config.storageKey] : [];
      persisted.element.disabled = true;
      markers.suspend(true);
      editor = api.startPicker({
        rules, storageSnapshot: stored, onSaved: refresh,
        onClose: () => { editor = null; persisted.element.disabled = false; markers.suspend(false); },
      });
    } catch (error) {
      persisted.element.disabled = false;
      markers.suspend(false);
      throw error;
    } finally { starting = false; }
  }

  async function refresh() {
    const version = ++revision;
    const [stored, { features = {} }] = await Promise.all([
      chrome.storage.local.get(config.storageKey), chrome.storage.sync.get("features"),
    ]);
    if (version !== revision) return;
    editor?.updateStorage(stored);
    if (features[config.featureKey] === false) {
      editor?.close(); persisted.set([]); markers.setRules([]); return;
    }
    const rules = Array.isArray(stored[config.storageKey]) ? stored[config.storageKey] : [];
    const active = api.rulesForUrl(rules, location.href);
    persisted.set(active.map((rule) => rule.selector));
    markers.setRules(active);
    // Editing owns the visual draft. Saved CSS resumes only on save/cancel.
    persisted.element.disabled = !!editor;
  }

  function report(error) {
    console.warn("[MinTool] 숨김 규칙을 적용하지 못했습니다", error);
  }
})();
