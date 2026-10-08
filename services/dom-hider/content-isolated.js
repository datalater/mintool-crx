(() => {
  const api = mintoolDomHider;
  const config = api.config;
  const persisted = api.createHideSheet("saved");
  let closePicker = null;
  let revision = 0;

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.action === config.startAction) {
      start().then(() => respond({ ok: true }), (error) => respond({ ok: false, error: error.message }));
      return true;
    }
    if (message.action === config.navigationAction) {
      closePicker?.();
      refresh().catch(report);
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area === "local" && changes[config.storageKey]) || (area === "sync" && changes.features)) {
      refresh().catch(report);
    }
  });
  window.addEventListener("popstate", () => { closePicker?.(); refresh().catch(report); });
  refresh().catch(report);

  async function start() {
    const { features = {} } = await chrome.storage.sync.get("features");
    if (features[config.featureKey] === false) throw new Error("설정에서 DOM 숨김 규칙을 켜주세요.");
    if (closePicker) return;
    closePicker = api.startPicker({ onClose: () => { closePicker = null; }, onSaved: refresh });
  }

  async function refresh() {
    const version = ++revision;
    const [stored, { features = {} }] = await Promise.all([
      chrome.storage.local.get(config.storageKey), chrome.storage.sync.get("features"),
    ]);
    if (version !== revision) return;
    if (features[config.featureKey] === false) {
      closePicker?.();
      persisted.set([]);
      return;
    }
    const rules = Array.isArray(stored[config.storageKey]) ? stored[config.storageKey] : [];
    persisted.set(api.rulesForUrl(rules, location.href).map((rule) => rule.selector));
  }

  function report(error) {
    console.warn("[MinTool] 숨김 규칙을 적용하지 못했습니다", error);
  }
})();
