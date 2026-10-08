(() => {
  const api = mintoolDomHider;
  const config = api.config;
  const open = document.getElementById("start-hide-mode");
  const more = document.getElementById("hide-rules-toggle");
  const submenu = document.getElementById("hide-rules-more");
  const disable = document.getElementById("disable-site-hiding");
  const indicator = document.getElementById("hide-state-dot");
  const stateLabel = document.getElementById("hide-rules-state");
  const message = document.getElementById("hide-rules-status");
  let tab = null;
  let revision = 0;
  let busy = false;
  let ready = false;
  let featureEnabled = false;
  let siteHasEnabledRules = false;

  open.addEventListener("click", openPanel);
  more.addEventListener("click", () => showMore(submenu.hidden));
  disable.addEventListener("click", disableSite);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || submenu.hidden) return;
    event.preventDefault(); event.stopPropagation();
    showMore(false); more.focus();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area === "local" && changes[config.storageKey]) || (area === "sync" && changes.features)) refresh();
  });
  chrome.tabs.onUpdated.addListener((tabId, changes, updated) => {
    if (tabId !== tab?.id || !changes.url) return;
    tab = { ...updated, url: changes.url };
    showMore(false); showMessage(""); refresh();
  });
  init();

  async function init() {
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await refresh();
    } catch (error) {
      setIndicator(false, "상태를 확인하지 못했습니다.");
      showMessage(error.message, true);
    }
  }

  async function openPanel() {
    if (open.disabled || busy) return;
    busy = true; updateControls(); showMessage("");
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: config.startAction }, { frameId: 0 });
      if (!response?.ok) throw new Error(response?.error || "패널을 열지 못했습니다.");
      window.close();
    } catch (error) {
      showMessage(`${error.message} 페이지 새로고침 후 다시 시도하세요.`, true);
    } finally {
      busy = false; updateControls();
    }
  }

  async function disableSite() {
    if (disable.disabled || busy) return;
    const url = tab.url;
    busy = true; updateControls(); showMessage("");
    try {
      await request(config.operations.disableSite, url);
      const loaded = await refresh();
      showMessage(loaded === false
        ? "해제는 저장됐습니다. 상태를 확인하려면 팝업을 다시 열어주세요."
        : `${new URL(url).hostname} 규칙을 모두 껐습니다.`, loaded === false);
    } catch (error) {
      showMessage(`전체 해제에 실패했습니다: ${error.message}`, true);
    } finally {
      busy = false; updateControls();
    }
  }

  async function refresh() {
    const version = ++revision;
    const url = tab?.url;
    ready = false; updateControls();
    if (!/^https?:/.test(url || "")) {
      setIndicator(false, "HTTP(S) 페이지에서 사용할 수 있습니다.");
      showMore(false);
      return false;
    }
    try {
      const [rules, { features = {} }] = await Promise.all([
        request(config.operations.list, url), chrome.storage.sync.get("features"),
      ]);
      if (version !== revision) return null;
      featureEnabled = features?.[config.featureKey] !== false;
      siteHasEnabledRules = rules.some((rule) => rule.enabled);
      // The dot represents configured rules for this URL, not a count of hidden DOM nodes.
      const count = featureEnabled ? api.rulesForUrl(rules, url).length : 0;
      setIndicator(count > 0, !featureEnabled
        ? "DOM 숨김 규칙 기능이 꺼져 있습니다. 설정에서 켜주세요."
        : count ? `이 페이지에 활성 규칙 ${count}개 (설정 기준)` : "이 페이지에 활성 규칙 없음");
      ready = true; updateControls();
      return true;
    } catch (error) {
      if (version !== revision) return null;
      setIndicator(false, "규칙 상태를 확인하지 못했습니다.");
      showMessage(error.message, true);
      updateControls();
      return false;
    }
  }

  async function request(operation, url) {
    const response = await chrome.runtime.sendMessage({ type: config.messageType, operation, url });
    if (!response?.ok || !Array.isArray(response.rules)) throw new Error(response?.error || "규칙을 읽지 못했습니다.");
    return response.rules;
  }

  function setIndicator(active, label) {
    indicator.dataset.active = String(active);
    indicator.title = label;
    stateLabel.textContent = label;
    open.title = label;
  }

  function updateControls() {
    open.disabled = busy || !ready || !featureEnabled;
    more.disabled = busy || !ready;
    disable.disabled = busy || !ready || !siteHasEnabledRules;
  }

  function showMore(expanded) {
    submenu.hidden = !expanded;
    more.setAttribute("aria-expanded", String(expanded));
  }

  function showMessage(text, error = false) {
    message.hidden = !text;
    message.textContent = text;
    message.dataset.error = String(error);
  }
})();
