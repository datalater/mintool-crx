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
  api.contextRules = (rules, url) => {
    const parsed = new URL(url);
    return rules.filter((rule) => api.isRule(rule) &&
      rule.origin === parsed.origin && (rule.page === null || rule.page === api.pageKey(url)));
  };
  api.rulesForUrl = (rules, url) => api.contextRules(rules, url).filter((rule) => rule.enabled);
  api.sameRule = (a, b) => a.origin === b.origin && a.page === b.page && a.selector === b.selector;
  api.ruleSnapshot = (rules) => JSON.stringify(rules.map((rule) =>
    [rule.id, rule.origin, rule.page, rule.selector, rule.enabled],
  ).sort((a, b) => a[0].localeCompare(b[0])));

  api.mergeEditorRules = (rules, { url, expected, edited }) => {
    const relevant = api.contextRules(rules, url);
    if (!Array.isArray(expected) || !expected.every(api.isRule) ||
        api.ruleSnapshot(expected) !== api.ruleSnapshot(relevant)) {
      throw new Error("저장된 규칙이 다른 곳에서 변경됐습니다. 취소 후 다시 열어주세요.");
    }
    if (!Array.isArray(edited) || edited.some((rule) => !api.isRule(rule)) ||
        api.contextRules(edited, url).length !== edited.length) {
      throw new Error("현재 페이지에 관련된 유효한 규칙만 저장할 수 있습니다.");
    }
    const editingIds = new Set(relevant.map((rule) => rule.id));
    const untouched = rules.filter((rule) => !editingIds.has(rule.id));
    if (new Set([...untouched, ...edited].map((rule) => rule.id)).size !== untouched.length + edited.length ||
        edited.some((rule, index) => edited.slice(0, index).some((other) => api.sameRule(rule, other)))) {
      throw new Error("중복된 규칙입니다. 후보를 확인하세요.");
    }
    if (untouched.length + edited.length > api.config.maxRules) throw new Error("저장 가능한 규칙 수를 초과했습니다.");
    return [...untouched, ...edited.map(({ id, origin, page, selector, enabled }) => ({ id, origin, page, selector, enabled }))];
  };

  api.visibilityCss = (selectors) => selectors.map((selector) => {
    // Removing our rule, rather than forcing visibility:visible, preserves site-owned hidden children.
    const shown = `[${api.config.revealAttribute}]`;
    const exception = `:not(:is(${shown}, ${shown} *))`;
    const target = `:is(${selector}):not(:is(${api.config.protectedSelector}, [${api.config.uiAttribute}]))${exception}`;
    return `${target}, ${target} *${exception} { visibility: hidden !important; }`;
  }).join("\n");
})();
