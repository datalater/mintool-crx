(() => {
  const api = mintoolDomHider;
  const config = api.config;
  api.selectable = (element) => element instanceof HTMLElement && element.isConnected &&
    element.getRootNode() === document && !element.matches(config.protectedSelector) &&
    !element.closest(`#${config.hostId}`) && !element.contains(document.getElementById(config.hostId));

  api.resolveSelector = (selector) => {
    if (typeof selector !== "string" || selector.length > config.maxSelectorLength) return null;
    try {
      const elements = [...document.querySelectorAll(selector)];
      return elements.every(api.selectable) ? elements : null;
    } catch {
      return null;
    }
  };

  api.selectionOptions = (target) => {
    if (!api.selectable(target)) return [];
    const single = uniqueSelector(target);
    if (!single) return [];
    const options = [{ selector: single, count: 1, label: "이 요소만" }];
    const tag = target.localName;
    const classes = [...target.classList].filter((name) => !name.startsWith("mintool-"));
    const candidates = [];
    for (const name of config.groupAttributes) {
      const value = target.getAttribute(name);
      if (value && value.length <= config.maxAttributeLength) {
        candidates.push(`${tag}[${name}="${CSS.escape(value)}"]`);
      }
    }
    if (classes.length) candidates.push(tag + classes.map((name) => `.${CSS.escape(name)}`).join(""));
    candidates.push(...classes.map((name) => `${tag}.${CSS.escape(name)}`));
    for (const selector of new Set(candidates)) {
      if (options.length >= config.maxSuggestions) break;
      const matches = api.resolveSelector(selector);
      if (matches?.length > 1 && matches.includes(target)) {
        options.push({ selector, count: matches.length, label: `같은 속성/클래스 ${matches.length}개` });
      }
    }
    return options;
  };

  function uniqueSelector(target) {
    const parts = [];
    let node = target;
    while (node && parts.length < config.pathDepth) {
      if (node.id) {
        const id = `#${CSS.escape(node.id)}`;
        if (document.querySelectorAll(id).length === 1) {
          const selector = [id, ...parts].join(" > ");
          if (api.resolveSelector(selector)?.[0] === target) return selector;
        }
      }
      if (node === document.documentElement) {
        const selector = [":root", ...parts].join(" > ");
        const matches = api.resolveSelector(selector);
        return matches?.length === 1 && matches[0] === target ? selector : null;
      }
      if (!node.parentElement) break;
      const peers = [...node.parentElement.children].filter((child) => child.localName === node.localName);
      // Anchor single-element paths; a currently unique unanchored suffix could later match a group.
      parts.unshift(`${node.localName}:nth-of-type(${peers.indexOf(node) + 1})`);
      node = node.parentElement;
    }
    return null;
  }
})();
