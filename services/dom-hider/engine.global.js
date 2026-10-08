(() => {
  const api = mintoolDomHider;
  api.createHideSheet = (name) => {
    const style = document.createElement("style");
    style.setAttribute(api.config.sheetAttribute, name);
    document.documentElement.append(style);
    return {
      element: style,
      set(selectors) {
        // Re-check stored selectors on every page; never apply a root/UI-hiding rule.
        const valid = [...new Set(selectors)].filter((selector) => api.resolveSelector(selector) !== null);
        style.textContent = api.visibilityCss(valid);
      },
      remove() { style.remove(); },
    };
  };
})();
