(() => {
  const api = mintoolDomHider;
  // Preview paints above the page; it never changes the target's opacity, visibility or layout.
  api.createPreviewLayer = (root) => {
    const layer = document.createElement("div");
    layer.className = "preview-layer";
    layer.setAttribute("aria-hidden", "true");
    const style = document.createElement("style");
    style.textContent = `
      .preview-veil { position:fixed;pointer-events:none;box-sizing:border-box;overflow:hidden;
        background:rgba(255,255,255,${api.config.previewOpacity});border:1px solid #8192b34d; }
      .preview-label { position:absolute;left:0;top:0;padding:0 3px;background:#ffffffe8;
        color:#536a98;font:600 10px/15px system-ui,sans-serif; }
    `;
    layer.append(style);
    root.insertBefore(layer, root.querySelector(".outline"));
    const boxes = new Map();
    const events = new AbortController();
    let rules = [];
    let pending = null;
    let needsScan = false;
    let disposed = false;
    const intersections = new IntersectionObserver((changes) => {
      for (const change of changes) {
        const entry = boxes.get(change.target);
        if (!entry) continue;
        const rect = change.intersectionRect;
        entry.box.hidden = !change.isIntersecting || !rect.width || !rect.height;
        Object.assign(entry.box.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      }
    });
    const sizes = new ResizeObserver(() => schedule(false));
    const mutations = new MutationObserver((records) => {
      if (records.some((record) => !api.isOwnNode(record.target) &&
          !(record.type === "childList" && [...record.addedNodes, ...record.removedNodes].every(api.isOwnNode)))) schedule(true);
    });
    mutations.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
    sizes.observe(document.documentElement);
    if (document.body) sizes.observe(document.body);
    window.addEventListener("scroll", () => schedule(false), { capture: true, passive: true, signal: events.signal });
    window.addEventListener("resize", () => schedule(false), { signal: events.signal });
    return {
      set(next) { rules = next; schedule(true); },
      remove() {
        disposed = true; events.abort(); mutations.disconnect(); sizes.disconnect(); intersections.disconnect();
        if (pending !== null) cancelAnimationFrame(pending);
        boxes.clear(); layer.remove();
      },
    };

    function schedule(scan) {
      needsScan ||= scan;
      if (disposed || pending !== null) return;
      pending = requestAnimationFrame(() => {
        pending = null;
        if (needsScan) { needsScan = false; sync(); }
        // Refresh browser-computed clipping even when scrolling keeps the same intersection ratio.
        // This runs only after edits/layout events, not in an everlasting per-element animation loop.
        for (const element of boxes.keys()) { intersections.unobserve(element); intersections.observe(element); }
      });
    }

    function sync() {
      const targets = api.outermostRuleTargets(rules);
      for (const [element, entry] of boxes) {
        if (targets.has(element)) continue;
        entry.box.remove(); boxes.delete(element); sizes.unobserve(element); intersections.unobserve(element);
      }
      for (const [element, rule] of targets) {
        if (!boxes.has(element)) {
          const box = document.createElement("div"); box.className = "preview-veil"; box.hidden = true;
          const label = document.createElement("span"); label.className = "preview-label"; box.append(label);
          layer.append(box); boxes.set(element, { box, label }); sizes.observe(element);
        }
        const entry = boxes.get(element);
        entry.box.dataset.selector = rule.selector;
        entry.label.textContent = rule.number ? `#${rule.number}` : "";
        entry.label.hidden = !rule.number;
      }
    }
  };
})();
