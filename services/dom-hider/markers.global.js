(() => {
  const api = mintoolDomHider;
  api.createMarkers = () => {
    const config = api.config;
    const entries = new Map();
    const mutations = new MutationObserver((records) => {
      if (records.some((record) => record.attributeName !== config.revealAttribute && !internal(record.target) &&
          !(record.type === "childList" && [...record.addedNodes, ...record.removedNodes].every(internal)))) schedule(true);
    });
    const sizes = new ResizeObserver(() => schedule(false));
    const intersections = new IntersectionObserver((changes) => {
      for (const change of changes) {
        const entry = entries.get(change.target);
        if (entry) entry.intersecting = change.isIntersecting;
      }
      schedule(false);
    });
    let rules = [];
    let host = null;
    let root = null;
    let tooltip = null;
    let active = null;
    let events = null;
    let pending = null;
    let scanNeeded = false;
    let suspended = false;

    return {
      setRules(next) {
        rules = next;
        if (!rules.length) { stop(); return; }
        if (!host) start();
        schedule(true);
      },
      suspend(value) {
        suspended = value;
        hideTooltip();
        if (value && pending !== null) { cancelAnimationFrame(pending); pending = null; }
        if (host) host.style.display = value ? "none" : "block";
        if (!value) schedule(true);
      },
      destroy: stop,
    };

    function start() {
      host = document.createElement("div");
      host.id = config.markersHostId;
      host.setAttribute(config.uiAttribute, "markers");
      host.style.cssText = `all:initial;position:fixed;inset:0;pointer-events:none;z-index:${config.panelZIndex - 1};display:${suspended ? "none" : "block"}`;
      root = host.attachShadow({ mode: "open" });
      root.innerHTML = `<style>
        [hidden] { display:none!important; }
        button { all:initial;box-sizing:border-box;position:fixed;width:${config.markerSize}px;height:${config.markerSize}px;
          display:grid;place-items:center;cursor:pointer;pointer-events:auto;border-radius:5px; }
        button::before { content:"";width:4px;height:4px;background:#9ca3af;border-radius:50%;opacity:.55; }
        button:hover::before,button:focus-visible::before { opacity:1; }
        button:focus-visible { outline:1px solid #6b7280;outline-offset:-2px; }
        button[aria-pressed=true]::before { background:transparent;border:1px solid #9ca3af; }
        [role=tooltip] { position:fixed;pointer-events:none;white-space:nowrap;box-sizing:border-box;
          font:11px/24px system-ui,sans-serif;color:#596273;background:#fafafa;border:1px solid #dce0e7;
          border-radius:4px;padding:0 7px;max-width:calc(100vw - 16px); }
        @media(prefers-color-scheme:dark) { [role=tooltip] { color:#d1d5db;background:#252525;border-color:#444; } }
      </style><div id="mintool-hide-tooltip" role="tooltip" hidden></div>`;
      tooltip = root.getElementById("mintool-hide-tooltip");
      document.documentElement.append(host);
      events = new AbortController();
      window.addEventListener("scroll", () => schedule(false), { capture: true, passive: true, signal: events.signal });
      window.addEventListener("resize", () => schedule(false), { signal: events.signal });
      document.addEventListener("keydown", (event) => { if (event.key === "Escape") hideTooltip(); }, { signal: events.signal });
      mutations.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
      sizes.observe(document.documentElement);
      if (document.body) sizes.observe(document.body);
    }

    function schedule(scan) {
      scanNeeded ||= scan;
      if (!host || suspended || pending !== null) return;
      pending = requestAnimationFrame(() => {
        pending = null;
        if (scanNeeded) { scanNeeded = false; syncTargets(); }
        position();
      });
    }

    function syncTargets() {
      const matches = new Map();
      for (const rule of rules) {
        for (const element of api.resolveSelector(rule.selector) || []) if (!matches.has(element)) matches.set(element, rule);
      }
      // One dot per outer hidden region. Nested matching rules must not leave orphan inner dots.
      const outer = new Map([...matches].filter(([element]) => {
        for (let parent = element.parentElement; parent; parent = parent.parentElement) if (matches.has(parent)) return false;
        return true;
      }));
      for (const [element, entry] of entries) if (!outer.has(element)) { removeEntry(element, entry); entries.delete(element); }
      for (const [element, rule] of outer) {
        if (!entries.has(element)) addEntry(element);
        const button = entries.get(element).button;
        button.dataset.ruleId = rule.id;
        button.dataset.selector = rule.selector;
      }
    }

    function addEntry(element) {
      const button = document.createElement("button");
      button.type = "button";
      const entry = { element, button, revealed: false, intersecting: true, original: element.getAttribute(config.revealAttribute), events: new AbortController() };
      entries.set(element, entry);
      updateButton(entry);
      root.append(button);
      sizes.observe(element);
      intersections.observe(element);
      const listen = (type, handler) => button.addEventListener(type, handler, { signal: entry.events.signal });
      listen("click", (event) => {
        event.preventDefault(); event.stopPropagation();
        entry.revealed = !entry.revealed;
        if (entry.revealed) element.setAttribute(config.revealAttribute, "");
        else restoreAttribute(entry);
        updateButton(entry); showTooltip(entry);
      });
      listen("pointerenter", () => showTooltip(entry));
      listen("pointerleave", () => { if (!button.matches(":focus-visible")) hideTooltip(); });
      listen("focus", () => showTooltip(entry));
      listen("blur", () => { if (!button.matches(":hover")) hideTooltip(); });
    }

    function updateButton(entry) {
      entry.button.setAttribute("aria-pressed", String(entry.revealed));
      entry.button.setAttribute("aria-label", entry.revealed ? "영역 다시 숨기기" : "숨긴 영역 보기");
    }

    function position() {
      if (!host || suspended) return;
      const width = document.documentElement.clientWidth;
      const height = window.innerHeight;
      for (const [element, entry] of entries) {
        const rect = element.getBoundingClientRect();
        entry.button.hidden = !entry.intersecting || !element.isConnected || !rect.width || !rect.height ||
          rect.bottom <= 0 || rect.top >= height || rect.right <= 0 || rect.left >= width;
        if (entry.button.hidden) { if (active === entry) hideTooltip(); continue; }
        entry.button.style.left = `${Math.max(0, Math.min(rect.right - config.markerSize, width - config.markerSize))}px`;
        entry.button.style.top = `${Math.max(0, Math.min(rect.top, height - config.markerSize))}px`;
      }
      positionTooltip();
    }

    function showTooltip(entry) {
      if (suspended || entry.button.hidden) return;
      active?.button.removeAttribute("aria-describedby");
      active = entry;
      tooltip.textContent = entry.revealed ? "Hide" : "Show";
      tooltip.hidden = false;
      entry.button.setAttribute("aria-describedby", tooltip.id);
      positionTooltip();
    }

    function positionTooltip() {
      if (!active || !tooltip || tooltip.hidden) return;
      const anchor = active.button.getBoundingClientRect(), rect = tooltip.getBoundingClientRect();
      const width = document.documentElement.clientWidth, height = window.innerHeight;
      const margin = config.viewportMargin;
      let left = anchor.left - rect.width - config.tooltipGap;
      if (left < margin) left = anchor.right + config.tooltipGap;
      tooltip.style.left = `${Math.max(margin, Math.min(left, width - rect.width - margin))}px`;
      tooltip.style.top = `${Math.max(margin, Math.min(anchor.top + (anchor.height - rect.height) / 2, height - rect.height - margin))}px`;
    }

    function hideTooltip() {
      active?.button.removeAttribute("aria-describedby"); active = null;
      if (tooltip) tooltip.hidden = true;
    }

    function restoreAttribute(entry) {
      if (entry.original === null) entry.element.removeAttribute(config.revealAttribute);
      else entry.element.setAttribute(config.revealAttribute, entry.original);
    }

    function removeEntry(element, entry) {
      if (active === entry) hideTooltip();
      entry.events.abort(); sizes.unobserve(element); intersections.unobserve(element); entry.button.remove(); restoreAttribute(entry);
    }

    function internal(node) {
      const element = node instanceof Element ? node : node.parentElement;
      return !!element?.closest(`[${config.uiAttribute}], style[${config.sheetAttribute}]`);
    }

    function stop() {
      mutations.disconnect(); sizes.disconnect(); intersections.disconnect(); events?.abort();
      if (pending !== null) cancelAnimationFrame(pending);
      pending = null; scanNeeded = false; hideTooltip();
      for (const [element, entry] of entries) removeEntry(element, entry);
      entries.clear(); host?.remove(); host = null; root = null; tooltip = null;
    }
  };
})();
