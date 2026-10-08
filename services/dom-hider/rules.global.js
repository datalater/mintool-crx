// Shared rule semantics for the worker, content script and recovery popup.
(() => {
  const api = mintoolDomHider;
  api.pageKey = (url) => {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  };
  api.isRule = (rule) => {
    if (!rule || typeof rule.id !== "string" || typeof rule.enabled !== "boolean") return false;
    if (typeof rule.selector !== "string" || !rule.selector.trim() ||
        rule.selector.length > api.config.maxSelectorLength) return false;
    try {
      const url = new URL(rule.origin);
      return /^https?:$/.test(url.protocol) && url.origin === rule.origin &&
        (rule.page === null || (typeof rule.page === "string" && rule.page.startsWith("/")));
    } catch {
      return false;
    }
  };
  api.rulesForUrl = (rules, url) => {
    const parsed = new URL(url);
    return rules.filter((rule) => api.isRule(rule) && rule.enabled &&
      rule.origin === parsed.origin && (rule.page === null || rule.page === api.pageKey(url)));
  };
  api.sameRule = (a, b) => a.origin === b.origin && a.page === b.page && a.selector === b.selector;
  api.visibilityCss = (selectors) => selectors.map((selector) => {
    // Keep protected roots out even if a matching element appears after installation.
    const target = `:is(${selector}):not(:is(${api.config.protectedSelector}, #${api.config.hostId}))`;
    return `${target}, ${target} * { visibility: hidden !important; }`;
  }).join("\n");
})();
