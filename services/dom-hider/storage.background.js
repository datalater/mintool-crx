(() => {
  const api = mintoolDomHider;
  const config = api.config;
  let writes = Promise.resolve();

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type !== config.messageType || sender.id !== chrome.runtime.id) return;
    // All mutations go through the worker so two tabs cannot overwrite each other's rules.
    const work = writes.then(() => handle(message, sender));
    writes = work.catch(() => {});
    work.then((rules) => respond({ ok: true, rules }), (error) => respond({ ok: false, error: error.message }));
    return true;
  });

  async function handle(message, sender) {
    const url = new URL(message.url);
    if (!/^https?:$/.test(url.protocol)) throw new Error("HTTP(S) 페이지에서만 사용할 수 있습니다.");
    const fromExtensionPage = sender.url?.startsWith(chrome.runtime.getURL("/"));
    if (sender.tab && !fromExtensionPage && new URL(sender.url).origin !== url.origin) {
      throw new Error("요청 사이트가 일치하지 않습니다.");
    }
    const stored = await chrome.storage.local.get(config.storageKey);
    let rules = Array.isArray(stored[config.storageKey]) ? stored[config.storageKey].filter(api.isRule) : [];
    switch (message.operation) {
      case config.operations.list:
        return rules.filter((rule) => rule.origin === url.origin);
      case config.operations.add: {
        if (!["page", "site"].includes(message.scope) || !Array.isArray(message.selectors) || !message.selectors.length) {
          throw new Error("저장할 범위와 규칙을 확인하세요.");
        }
        const additions = [...new Set(message.selectors)].map((selector) => ({
          id: crypto.randomUUID(), origin: url.origin,
          page: message.scope === "site" ? null : api.pageKey(url.href),
          selector, enabled: true,
        }));
        if (!additions.every(api.isRule)) throw new Error("유효하지 않은 숨김 규칙입니다.");
        for (const rule of additions) {
          const existing = rules.find((other) => api.sameRule(rule, other));
          if (existing) existing.enabled = true;
          else rules.push(rule);
        }
        if (rules.length > config.maxRules) throw new Error(`규칙은 최대 ${config.maxRules}개까지 저장할 수 있습니다.`);
        break;
      }
      case config.operations.remove:
        rules = rules.filter((rule) => !(rule.origin === url.origin && rule.id === message.id));
        break;
      case config.operations.toggle:
        rules = rules.map((rule) => rule.origin === url.origin && rule.id === message.id
          ? { ...rule, enabled: !rule.enabled } : rule);
        break;
      case config.operations.disableSite:
        rules = rules.map((rule) => rule.origin === url.origin ? { ...rule, enabled: false } : rule);
        break;
      default:
        throw new Error("알 수 없는 규칙 작업입니다.");
    }
    await chrome.storage.local.set({ [config.storageKey]: rules });
    return rules.filter((rule) => rule.origin === url.origin);
  }

  function routeChanged(details) {
    if (details.frameId !== 0) return;
    chrome.tabs.sendMessage(details.tabId, { action: config.navigationAction }, { frameId: 0 }).catch(() => {});
  }
  chrome.webNavigation.onHistoryStateUpdated.addListener(routeChanged);
  chrome.webNavigation.onReferenceFragmentUpdated.addListener(routeChanged);
})();
