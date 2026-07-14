var MINTOOL_VIEW_GRID_BOOKMARKLETS = Object.freeze([
  {
    id: "view-grid",
    title: "view-grid",
    run: function viewGridBookmarklet() {
      const STYLE_ID = "mintool-view-grid-style";
      const CLASS_NAME = "mintool-view-grid";
      const ATTR = "data-mintool-view-grid";
      const PANEL_ATTR = "data-mintool-view-grid-panel";
      const MIN_SIZE = 1;
      const MAX_SIZE = 100;
      const DEFAULT_SIZE = 8;

      let gridSize = DEFAULT_SIZE;

      const CSS_TEXT = `
        .${CLASS_NAME} {
          position: fixed !important;
          inset: 0 !important;
          z-index: 2147483647 !important;
          pointer-events: none !important;
          width: 100% !important;
          height: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
          background-color: transparent !important;
          background-size: var(--mintool-grid-size, 8px) var(--mintool-grid-size, 8px) !important;
          background-image:
            linear-gradient(to right, rgba(240, 240, 240, 0.5) 0.1px, transparent 1px),
            linear-gradient(to bottom, rgba(240, 240, 240, 0.5) 0.1px, transparent 1px) !important;
        }

        @media (prefers-color-scheme: dark) {
          .${CLASS_NAME} {
            background-image:
              linear-gradient(to right, rgba(102, 102, 102, 0.5) 0.1px, transparent 1px),
              linear-gradient(to bottom, rgba(102, 102, 102, 0.5) 0.1px, transparent 1px) !important;
          }
        }
      `;

      function getDoc(root) {
        return root.nodeType === Node.DOCUMENT_NODE ? root : root.ownerDocument;
      }

      function hasStyle(root) {
        if (root.getElementById) return !!root.getElementById(STYLE_ID);
        return !!root.querySelector("#" + STYLE_ID);
      }

      function injectStyle(root) {
        if (hasStyle(root)) return;

        const doc = getDoc(root);
        const style = doc.createElement("style");
        style.id = STYLE_ID;
        style.textContent = CSS_TEXT;

        if (root.nodeType === Node.DOCUMENT_NODE) {
          (root.head || root.documentElement).appendChild(style);
          return;
        }

        root.appendChild(style);
      }

      function injectOverlay(root) {
        if (root.querySelector("[" + ATTR + "]")) return;

        const doc = getDoc(root);
        const el = doc.createElement("div");
        el.className = CLASS_NAME;
        el.setAttribute(ATTR, "");
        el.style.setProperty("--mintool-grid-size", gridSize + "px");

        const mount =
          root.nodeType === Node.DOCUMENT_NODE
            ? root.body || root.documentElement
            : root;

        if (!mount) return;
        mount.appendChild(el);
      }

      function applyToRoot(root) {
        injectStyle(root);
        injectOverlay(root);
      }

      function walkShadows(root, visit) {
        const doc = getDoc(root);
        const base = root.nodeType === Node.DOCUMENT_NODE ? root.body : root;
        if (!base) return;

        const walker = doc.createTreeWalker(base, NodeFilter.SHOW_ELEMENT);
        let el;

        while ((el = walker.nextNode())) {
          if (!el.shadowRoot) continue;
          visit(el.shadowRoot);
          walkShadows(el.shadowRoot, visit);
        }
      }

      function walkIframes(doc, visit) {
        const iframes = doc.querySelectorAll("iframe");

        for (let i = 0; i < iframes.length; i++) {
          let childDoc;

          try {
            childDoc = iframes[i].contentDocument;
          } catch (error) {
            continue;
          }

          if (!childDoc) continue;
          visit(childDoc);
        }
      }

      function forEachRoot(doc, visit) {
        visit(doc);
        walkShadows(doc, function (shadowRoot) {
          visit(shadowRoot);
        });
        walkIframes(doc, function (childDoc) {
          forEachRoot(childDoc, visit);
        });
      }

      function setGridSize(nextSize) {
        const size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, nextSize));
        gridSize = size;

        forEachRoot(document, function (root) {
          const overlays = root.querySelectorAll("[" + ATTR + "]");

          for (let i = 0; i < overlays.length; i++) {
            overlays[i].style.setProperty("--mintool-grid-size", size + "px");
          }
        });

        return size;
      }

      function clearRoot(root) {
        const style = root.getElementById
          ? root.getElementById(STYLE_ID)
          : root.querySelector("#" + STYLE_ID);

        if (style && style.parentNode) style.parentNode.removeChild(style);

        const overlays = root.querySelectorAll("[" + ATTR + "]");

        for (let i = 0; i < overlays.length; i++) {
          const overlay = overlays[i];
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }

        if (root.nodeType === Node.DOCUMENT_NODE) {
          const panels = root.querySelectorAll("[" + PANEL_ATTR + "]");
          for (let i = 0; i < panels.length; i++) {
            removePanel(panels[i]);
          }
        }
      }

      function removePanel(panel) {
        if (panel.__mintoolViewGridCleanup) {
          panel.__mintoolViewGridCleanup();
          panel.__mintoolViewGridCleanup = null;
        }
        panel.remove();
      }

      function clearAll() {
        forEachRoot(document, clearRoot);
      }

      function styleControl(el, css) {
        el.style.cssText = css;
      }

      function clampPanelToVisualViewport(panel) {
        const margin = 16;
        const vv = window.visualViewport;
        const viewLeft = vv ? vv.offsetLeft : 0;
        const viewTop = vv ? vv.offsetTop : 0;
        const viewWidth = vv ? vv.width : window.innerWidth;
        const viewHeight = vv ? vv.height : window.innerHeight;
        const width = panel.offsetWidth;
        const height = panel.offsetHeight;

        // Prefer bottom-right of the visible viewport; clamp if panel is larger.
        const left = Math.max(
          viewLeft + margin,
          viewLeft + viewWidth - width - margin,
        );
        const top = Math.max(
          viewTop + margin,
          viewTop + viewHeight - height - margin,
        );

        panel.style.left = left + "px";
        panel.style.top = top + "px";
        panel.style.right = "auto";
        panel.style.bottom = "auto";
      }

      function ensurePanel() {
        if (document.querySelector("[" + PANEL_ATTR + "]")) return;
        if (!document.body) return;

        const panel = document.createElement("div");
        panel.setAttribute(PANEL_ATTR, "");
        styleControl(
          panel,
          [
            "all: initial",
            "position: fixed",
            "left: 0",
            "top: 0",
            "z-index: 2147483647",
            "display: flex",
            "align-items: center",
            "gap: 4px",
            "padding: 6px 8px",
            "background: rgba(255,255,255,.92)",
            "border: 1px solid #ddd",
            "border-radius: 6px",
            "box-shadow: 0 2px 8px rgba(0,0,0,.12)",
            "font: 12px/1.2 system-ui, sans-serif",
            "color: #333",
            "pointer-events: auto",
          ].join(";"),
        );

        const decBtn = document.createElement("button");
        const input = document.createElement("input");
        const unit = document.createElement("span");
        const incBtn = document.createElement("button");
        const closeBtn = document.createElement("button");

        decBtn.textContent = "−";
        incBtn.textContent = "+";
        closeBtn.textContent = "×";
        unit.textContent = "px";

        input.type = "number";
        input.min = String(MIN_SIZE);
        input.max = String(MAX_SIZE);
        input.value = String(gridSize);

        const btnCss =
          "all: unset; box-sizing: border-box; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; cursor: pointer; color: #333;";
        styleControl(decBtn, btnCss);
        styleControl(incBtn, btnCss);
        styleControl(closeBtn, btnCss + "margin-left: 2px; color: #888;");
        styleControl(
          input,
          "all: unset; box-sizing: border-box; width: 36px; height: 22px; text-align: center; border: 1px solid #ddd; border-radius: 4px; font: 12px/22px system-ui, sans-serif; color: #333; background: #fff;",
        );
        styleControl(
          unit,
          "all: unset; font: 12px/1 system-ui, sans-serif; color: #888;",
        );

        function syncInput(size) {
          input.value = String(size);
        }

        function reposition() {
          clampPanelToVisualViewport(panel);
        }

        decBtn.addEventListener("click", function () {
          syncInput(setGridSize(gridSize - 1));
        });
        incBtn.addEventListener("click", function () {
          syncInput(setGridSize(gridSize + 1));
        });
        input.addEventListener("change", function () {
          syncInput(setGridSize(Number(input.value) || DEFAULT_SIZE));
        });
        closeBtn.addEventListener("click", clearAll);

        if (window.visualViewport) {
          window.visualViewport.addEventListener("resize", reposition);
          window.visualViewport.addEventListener("scroll", reposition);
        }
        window.addEventListener("resize", reposition);

        panel.__mintoolViewGridCleanup = function () {
          if (window.visualViewport) {
            window.visualViewport.removeEventListener("resize", reposition);
            window.visualViewport.removeEventListener("scroll", reposition);
          }
          window.removeEventListener("resize", reposition);
        };

        panel.appendChild(decBtn);
        panel.appendChild(input);
        panel.appendChild(unit);
        panel.appendChild(incBtn);
        panel.appendChild(closeBtn);
        document.body.appendChild(panel);
        reposition();
        requestAnimationFrame(reposition);
      }

      forEachRoot(document, applyToRoot);
      ensurePanel();
    },
  },
  {
    id: "view-grid-clear",
    title: "view-grid-clear",
    run: function viewGridClearBookmarklet() {
      const STYLE_ID = "mintool-view-grid-style";
      const ATTR = "data-mintool-view-grid";
      const PANEL_ATTR = "data-mintool-view-grid-panel";

      function getDoc(root) {
        return root.nodeType === Node.DOCUMENT_NODE ? root : root.ownerDocument;
      }

      function clearRoot(root) {
        const style = root.getElementById
          ? root.getElementById(STYLE_ID)
          : root.querySelector("#" + STYLE_ID);

        if (style && style.parentNode) style.parentNode.removeChild(style);

        const overlays = root.querySelectorAll("[" + ATTR + "]");

        for (let i = 0; i < overlays.length; i++) {
          const overlay = overlays[i];
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }

        if (root.nodeType === Node.DOCUMENT_NODE) {
          const panels = root.querySelectorAll("[" + PANEL_ATTR + "]");
          for (let i = 0; i < panels.length; i++) {
            const panel = panels[i];
            if (panel.__mintoolViewGridCleanup) {
              panel.__mintoolViewGridCleanup();
              panel.__mintoolViewGridCleanup = null;
            }
            panel.remove();
          }
        }
      }

      function walkShadows(root) {
        const doc = getDoc(root);
        const base = root.nodeType === Node.DOCUMENT_NODE ? root.body : root;
        if (!base) return;

        const walker = doc.createTreeWalker(base, NodeFilter.SHOW_ELEMENT);
        let el;

        while ((el = walker.nextNode())) {
          if (!el.shadowRoot) continue;
          clearRoot(el.shadowRoot);
          walkShadows(el.shadowRoot);
        }
      }

      function walkIframes(doc) {
        const iframes = doc.querySelectorAll("iframe");

        for (let i = 0; i < iframes.length; i++) {
          let childDoc;

          try {
            childDoc = iframes[i].contentDocument;
          } catch (error) {
            continue;
          }

          if (!childDoc) continue;
          clearAll(childDoc);
        }
      }

      function clearAll(doc) {
        clearRoot(doc);
        walkShadows(doc);
        walkIframes(doc);
      }

      clearAll(document);
    },
  },
]);
