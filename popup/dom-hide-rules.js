(() => {
  const api = mintoolDomHider;
  const section = document.getElementById("hide-rules");
  const status = document.getElementById("hide-rules-status");
  const list = document.getElementById("hide-rules-list");
  let tab = null;
  let revision = 0;
  let canDisableSite = false;

  document.getElementById("start-hide-mode").addEventListener("click", async () => {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: api.config.startAction }, { frameId: 0 });
      if (!response?.ok) throw new Error(response?.error || "숨기기 모드를 시작하지 못했습니다.");
      window.close();
    } catch (error) {
      status.textContent = `${error.message} 페이지 새로고침 후 다시 시도하세요.`;
    }
  });
  document.getElementById("disable-site-hiding").addEventListener("click", () => mutate(api.config.operations.disableSite));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[api.config.storageKey]) refresh().catch(showError);
  });
  init().catch(showError);

  async function init() {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !/^https?:/.test(tab.url)) {
      section.querySelectorAll("button").forEach((button) => { button.disabled = true; });
      status.textContent = "HTTP(S) 페이지에서 사용할 수 있습니다.";
      return;
    }
    await refresh();
  }

  async function request(operation, id) {
    const response = await chrome.runtime.sendMessage({ type: api.config.messageType, operation, url: tab.url, id });
    if (!response?.ok) throw new Error(response?.error || "규칙을 읽지 못했습니다.");
    return response.rules;
  }

  async function refresh() {
    if (!tab?.url) return;
    const version = ++revision;
    const rules = await request(api.config.operations.list);
    if (version !== revision) return;
    list.replaceChildren(...rules.map((rule) => {
      const item = document.createElement("li");
      const label = document.createElement("code");
      label.textContent = rule.selector;
      const scope = document.createElement("small");
      scope.textContent = rule.page === null ? "사이트 전체" : rule.page;
      const toggle = document.createElement("button");
      toggle.textContent = rule.enabled ? "해제" : "다시 적용";
      toggle.addEventListener("click", () => mutate(api.config.operations.toggle, rule.id));
      const remove = document.createElement("button");
      remove.textContent = "삭제";
      remove.addEventListener("click", () => mutate(api.config.operations.remove, rule.id));
      item.append(label, scope, toggle, remove);
      return item;
    }));
    status.textContent = `${new URL(tab.url).hostname} · 저장된 규칙 ${rules.length}개`;
    canDisableSite = rules.some((rule) => rule.enabled);
    document.getElementById("disable-site-hiding").disabled = !canDisableSite;
    document.getElementById("start-hide-mode").disabled = false;
  }

  async function mutate(operation, id) {
    section.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    try {
      await request(operation, id);
      await refresh();
    } catch (error) {
      showError(error);
    } finally {
      // Fresh rows get fresh handlers; never optimistically remove a rule on a failed write.
      document.getElementById("start-hide-mode").disabled = false;
      document.getElementById("disable-site-hiding").disabled = !canDisableSite;
      list.querySelectorAll("button").forEach((button) => { button.disabled = false; });
    }
  }

  function showError(error) {
    status.textContent = error.message;
  }
})();
