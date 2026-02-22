/**
 * DOM 스타일 편집기: 우클릭한 요소의 computed 스타일을 보여주고,
 * 편집한 값을 최우선(!important)으로 적용합니다.
 * media query 등으로 제한된 width 등도 덮어쓸 수 있습니다.
 */
(function () {
  const PANEL_ID = "mintool-style-editor-panel";
  const Z_INDEX = 2147483646;
  const PRIMARY_COLOR = "#5477f5";
  const HOVER_COLOR = "#f59e0b";
  // Chrome DevTools 선택 느낌에 가까운 파란 오버레이 톤
  const HIGHLIGHT_FILL = "rgba(66, 133, 244, 0.32)";
  /** 편집 창이 열려 있는 동안 glow를 켜 둔 요소 (닫을 때 복원) */
  let highlightedElement = null;
  /** DOM map hover 시 주황 glow를 켜 둔 요소 */
  let hoveredElement = null;
  /** 편집 도구로 override된 요소의 "최초" inline style 스냅샷 (패널 재오픈 이후에도 유지) */
  const originalInlineStyleMap = new Map();
  /** 요소별 custom CSS로 마지막에 적용한 속성 목록 */
  const appliedCustomPropsMap = new Map();

  /** 요소에 적용된 computed 스타일을 DevTools 스타일처럼 "prop: value" 한 줄씩 텍스트로 반환 */
  function getComputedStyleAsText(element) {
    const computed = window.getComputedStyle(element);
    const lines = [];
    for (let i = 0; i < computed.length; i++) {
      const prop = computed[i];
      const value = computed.getPropertyValue(prop);
      lines.push(prop + ": " + value);
    }
    return lines.join("\n");
  }

  function applyToElement(element, prop, value) {
    const trimmed = String(value).trim();
    if (!trimmed) {
      element.style.removeProperty(prop);
      return;
    }
    element.style.setProperty(prop, trimmed, "important");
  }

  /** 텍스트 영역 내용(prop: value 줄 단위)을 파싱해 요소에 !important로 적용 */
  function applyStylesFromText(element, text) {
    const trimmed = String(text).trim();
    if (!trimmed) return;
    trimmed.split("\n").forEach((line) => {
      const colon = line.indexOf(":");
      if (colon > 0) {
        const prop = line.slice(0, colon).trim();
        const value = line.slice(colon + 1).trim();
        if (prop) applyToElement(element, prop, value);
      }
    });
  }

  function getElementSelector(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    if (el.className && typeof el.className === "string") {
      const classes = el.className.trim().split(/\s+/).filter(Boolean).slice(0, 5);
      if (classes.length) s += "." + classes.join(".");
    }
    return s;
  }

  function applyGlow(el) {
    if (!el) return;
    el.dataset.mintoolHighlightBoxShadow = el.style.boxShadow;
    el.style.setProperty(
      "box-shadow",
      `inset 0 0 0 9999px ${HIGHLIGHT_FILL}, inset 0 0 0 2px ${PRIMARY_COLOR}, 0 0 0 1px rgba(66, 133, 244, 0.45)`,
      "important",
    );
  }

  function removeGlow(el) {
    if (!el) return;
    el.style.boxShadow = el.dataset.mintoolHighlightBoxShadow || "";
    delete el.dataset.mintoolHighlightBoxShadow;
  }

  function applyHoverGlow(el) {
    if (!el || el === highlightedElement) return;
    hoveredElement = el;
    el.dataset.mintoolHoverBoxShadow = el.style.boxShadow;
    el.style.setProperty(
      "box-shadow",
      `inset 0 0 0 9999px ${HIGHLIGHT_FILL}, inset 0 0 0 2px ${HOVER_COLOR}, 0 0 0 1px rgba(245, 158, 11, 0.45)`,
      "important",
    );
  }

  function clearHoverGlow() {
    if (!hoveredElement) return;
    hoveredElement.style.boxShadow = hoveredElement.dataset.mintoolHoverBoxShadow || "";
    delete hoveredElement.dataset.mintoolHoverBoxShadow;
    hoveredElement = null;
  }

  function closePanel() {
    clearHoverGlow();
    if (highlightedElement) {
      removeGlow(highlightedElement);
      highlightedElement = null;
    }
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.remove();
  }

  function openStyleEditor(element) {
    if (!element || !element.getBoundingClientRect) return;

    closePanel();

    function getOriginalInlineStyleFor(targetEl) {
      if (!originalInlineStyleMap.has(targetEl)) {
        originalInlineStyleMap.set(targetEl, targetEl.getAttribute("style") || "");
      }
      return originalInlineStyleMap.get(targetEl);
    }

    const state = {
      element,
      originalInlineStyle: getOriginalInlineStyleFor(element),
      originalComputedText: getComputedStyleAsText(element),
      originalCustomText: "",
    };
    applyGlow(state.element);
    highlightedElement = state.element;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.className = "mintool-island mintool-style-editor";
    Object.assign(panel.style, {
      position: "fixed",
      right: "20px",
      bottom: "20px",
      left: "auto",
      top: "auto",
      transform: "none",
      width: "min(420px, calc(100vw - 40px))",
      maxHeight: "85vh",
      overflow: "hidden",
      zIndex: Z_INDEX,
      padding: "0",
      backgroundColor: "rgba(30, 30, 32, 0.98)",
      color: "#e6e6e6",
      borderRadius: "8px",
      fontSize: "13px",
      fontFamily: "system-ui, sans-serif",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      textAlign: "left",
      display: "flex",
      flexDirection: "column",
      resize: "vertical",
      minHeight: "360px",
    });

    const header = document.createElement("div");
    header.className = "mintool-style-editor-header";
    header.style.cssText =
      "display:flex; align-items:center; justify-content:space-between; gap:12px; font-weight:600; padding:12px 16px; border-bottom:1px solid #444; cursor:grab; user-select:none;";
    const headerTitle = document.createElement("span");
    headerTitle.textContent = "DOM 스타일 편집";
    header.appendChild(headerTitle);
    const headerRight = document.createElement("div");
    headerRight.setAttribute("data-no-drag", "");
    headerRight.style.cssText = "display:flex; align-items:center; gap:10px; flex-shrink:0; cursor:default;";
    const checkboxStyle = document.createElement("style");
    checkboxStyle.textContent = `
      #mintool-custom-style-checkbox { appearance: none; -webkit-appearance: none; width: 18px; height: 18px; border: 2px solid #888; background: #2a2a2c; border-radius: 4px; cursor: pointer; flex-shrink: 0; }
      #mintool-custom-style-checkbox:checked { background: #5477f5; border-color: #5477f5; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath fill='none' stroke='%23fff' stroke-width='2' d='M2 6l3 3 5-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: center; background-size: 12px; }
      .mintool-style-editor * { scrollbar-width: thin; scrollbar-color: #4b5563 #111418; }
      .mintool-style-editor *::-webkit-scrollbar { width: 6px; height: 6px; }
      .mintool-style-editor *::-webkit-scrollbar-track { background: #111418; border-radius: 8px; }
      .mintool-style-editor *::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 8px; border: 1px solid #111418; }
      .mintool-style-editor *::-webkit-scrollbar-thumb:hover { background: #6b7280; }
      .mintool-style-editor *::-webkit-scrollbar-corner { background: #111418; }
    `;
    panel.appendChild(checkboxStyle);
    const customCheckbox = document.createElement("input");
    customCheckbox.type = "checkbox";
    customCheckbox.id = "mintool-custom-style-checkbox";
    customCheckbox.checked = true;
    customCheckbox.style.cssText = "cursor:pointer;";
    const customCheckboxLabel = document.createElement("label");
    customCheckboxLabel.htmlFor = customCheckbox.id;
    customCheckboxLabel.textContent = "custom style 적용";
    customCheckboxLabel.style.cssText = "cursor:pointer; color:#e6e6e6; font-size:12px; font-weight:normal; white-space:nowrap;";
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "닫기";
    closeBtn.style.cssText =
      "padding:4px 10px; background:#444; color:#e6e6e6; border:none; border-radius:4px; cursor:pointer; font-size:12px;";
    closeBtn.onclick = closePanel;
    const restoreBtn = document.createElement("button");
    restoreBtn.textContent = "복원";
    restoreBtn.style.cssText =
      "padding:4px 10px; background:#8b4513; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px; font-weight:500;";
    restoreBtn.title = "이번 편집에서 override된 모든 요소를 원복합니다";
    restoreBtn.onclick = restoreOriginal;
    headerRight.appendChild(customCheckbox);
    headerRight.appendChild(customCheckboxLabel);
    headerRight.appendChild(restoreBtn);
    headerRight.appendChild(closeBtn);
    header.appendChild(headerRight);
    panel.appendChild(header);

    const selectorEl = document.createElement("div");
    selectorEl.className = "mintool-style-editor-selector";
    selectorEl.style.cssText =
      `padding:4px 16px 6px; font-size:11px; color:${PRIMARY_COLOR}; word-break:break-all;`;
    function updateSelectorDisplay() {
      const full = getElementSelector(state.element);
      selectorEl.textContent = full.length > 60 ? full.slice(0, 57) + "..." : full;
      selectorEl.title = full;
    }
    updateSelectorDisplay();
    panel.appendChild(selectorEl);

    /** node가 현재 선택 요소의 조상(또는 자기 자신)인지 */
    function isInCurrentPath(node) {
      let n = state.element;
      while (n) {
        if (n === node) return true;
        n = n.parentElement;
      }
      return false;
    }

    function switchToElement(newEl) {
      if (!newEl || newEl === state.element) return;
      clearHoverGlow();
      removeGlow(state.element);
      state.element = newEl;
      state.originalInlineStyle = getOriginalInlineStyleFor(newEl);
      state.originalComputedText = getComputedStyleAsText(newEl);
      state.originalCustomText = "";
      applyGlow(state.element);
      highlightedElement = state.element;
      updateSelectorDisplay();
      updateDomMap();
      applyCustomIfChecked();
      updateComputedTextarea();
      updateRestoreButtonVisibility();
    }

    const domMapContainer = document.createElement("div");
    domMapContainer.className = "mintool-style-editor-dommap";
    domMapContainer.style.cssText =
      "padding:6px 16px 10px; font-size:11px; border-bottom:1px solid #333; background:rgba(0,0,0,0.2);";
    // DOM map에서 사용자가 수동으로 연/닫은 상태를 요소별로 기억
    const detailsOpenState = new WeakMap();
    const domMapHeader = document.createElement("div");
    domMapHeader.style.cssText =
      "display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px;";
    const domMapLabel = document.createElement("div");
    domMapLabel.textContent = "DOM map (클릭하여 선택)";
    domMapLabel.style.cssText = "color:#888;";
    domMapHeader.appendChild(domMapLabel);
    const domMapActions = document.createElement("div");
    domMapActions.style.cssText = "display:flex; align-items:center; gap:6px;";
    const currentDomBtn = document.createElement("button");
    currentDomBtn.type = "button";
    currentDomBtn.textContent = "현재 요소";
    currentDomBtn.style.cssText =
      "padding:2px 8px; border:1px solid #555; border-radius:4px; background:#2b2b2d; color:#ddd; font-size:11px; cursor:pointer;";
    domMapActions.appendChild(currentDomBtn);
    const toggleDomMapBtn = document.createElement("button");
    toggleDomMapBtn.type = "button";
    toggleDomMapBtn.textContent = "전체 토글";
    toggleDomMapBtn.style.cssText =
      "padding:2px 8px; border:1px solid #555; border-radius:4px; background:#2b2b2d; color:#ddd; font-size:11px; cursor:pointer;";
    domMapActions.appendChild(toggleDomMapBtn);
    domMapHeader.appendChild(domMapActions);
    domMapContainer.appendChild(domMapHeader);
    const domMapSearchInput = document.createElement("input");
    domMapSearchInput.type = "text";
    domMapSearchInput.placeholder = "DOM 검색 (예: video, data-testid, aspect-ratio)";
    domMapSearchInput.style.cssText =
      "width:100%; box-sizing:border-box; margin-bottom:6px; padding:4px 8px; background:#1c1c1e; border:1px solid #444; border-radius:4px; color:#e6e6e6; font-size:11px;";
    domMapContainer.appendChild(domMapSearchInput);
    const domMapScroll = document.createElement("div");
    domMapScroll.className = "mintool-style-editor-dommap-tree";
    domMapScroll.style.cssText =
      "max-height:200px; overflow-y:auto; overflow-x:auto; font-family:monospace; font-size:11px;";
    domMapContainer.appendChild(domMapScroll);
    panel.appendChild(domMapContainer);

    function applySelectedRowStyle(target, isSelected) {
      if (isSelected) {
        target.style.color = PRIMARY_COLOR;
        target.style.fontWeight = "600";
        target.style.backgroundColor = "rgba(84, 119, 245, 0.18)";
      } else {
        target.style.color = "#aaa";
        target.style.fontWeight = "400";
        target.style.backgroundColor = "transparent";
      }
    }

    function applyPathConnectedStyle(target, node) {
      const isConnected = isInCurrentPath(node);
      const isCurrent = node === state.element;

      if (!isConnected) {
        target.style.borderTop = "none";
        target.style.borderBottom = "none";
        return;
      }

      if (isCurrent) {
        target.style.borderTop = "1px solid rgba(84, 119, 245, 0.65)";
        target.style.borderBottom = "1px solid rgba(84, 119, 245, 0.65)";
      } else {
        target.style.borderTop = "1px solid rgba(84, 119, 245, 0.28)";
        target.style.borderBottom = "1px solid rgba(84, 119, 245, 0.28)";
      }
    }

    function updateDomMap() {
      clearHoverGlow();
      domMapScroll.innerHTML = "";
      const root = document.body || document.documentElement;
      if (!root) return;
      const query = domMapSearchInput.value.trim().toLowerCase();
      const visibilityCache = new WeakMap();
      const cssPropertyLike = /^[a-z-]+$/.test(query);

      function nodeMatchesQuery(node) {
        if (!query) return true;

        const selector = getElementSelector(node).toLowerCase();
        if (selector.includes(query)) return true;

        const attrNames = node.getAttributeNames ? node.getAttributeNames() : [];
        for (let i = 0; i < attrNames.length; i++) {
          const name = attrNames[i];
          const value = node.getAttribute(name) || "";
          if (
            name.toLowerCase().includes(query) ||
            value.toLowerCase().includes(query)
          ) {
            return true;
          }
        }

        if (cssPropertyLike) {
          const cssValue = window
            .getComputedStyle(node)
            .getPropertyValue(query)
            .trim()
            .toLowerCase();
          if (
            cssValue &&
            !["auto", "none", "normal", "initial", "inherit", "unset", "0", "0px"].includes(cssValue)
          ) {
            return true;
          }
        }

        return false;
      }

      function shouldRenderNode(node) {
        if (!query) return true;
        if (visibilityCache.has(node)) {
          return visibilityCache.get(node);
        }

        let visible = nodeMatchesQuery(node);
        if (!visible) {
          const children = Array.from(node.children);
          for (let i = 0; i < children.length; i++) {
            if (shouldRenderNode(children[i])) {
              visible = true;
              break;
            }
          }
        }

        visibilityCache.set(node, visible);
        return visible;
      }

      function renderTreeNode(node, depth) {
        if (!shouldRenderNode(node)) return null;

        const childElements = Array.from(node.children).filter((child) =>
          shouldRenderNode(child)
        );
        const hasChildren = childElements.length > 0;
        const isSelected = node === state.element;
        const label = getElementSelector(node);

        if (!hasChildren) {
          const row = document.createElement("div");
          row.style.cssText =
            "padding:2px 6px; cursor:pointer; white-space:nowrap; border-radius:2px;";
          applySelectedRowStyle(row, isSelected);
          applyPathConnectedStyle(row, node);
          if (isSelected) {
            row.setAttribute("data-current-dom", "true");
          }
          row.textContent = label;
          row.title = label;
          row.addEventListener("mouseenter", () => applyHoverGlow(node));
          row.addEventListener("mouseleave", () => clearHoverGlow());
          row.addEventListener("click", () => switchToElement(node));
          return row;
        }

        const details = document.createElement("details");
        const rememberedOpen = detailsOpenState.get(node);
        details.open =
          !!query ||
          (rememberedOpen !== undefined
            ? rememberedOpen
            : depth === 0 || isInCurrentPath(node));
        details.style.cssText = "margin-left:0;";
        details.addEventListener("toggle", () => {
          detailsOpenState.set(node, details.open);
        });

        const summary = document.createElement("summary");
        summary.style.cssText =
          "list-style-position:inside; cursor:pointer; white-space:nowrap; border-radius:2px; padding:2px 6px;";
        applySelectedRowStyle(summary, isSelected);
        applyPathConnectedStyle(summary, node);
        if (isSelected) {
          summary.setAttribute("data-current-dom", "true");
        }
        summary.textContent = label;
        summary.title = label;
        summary.addEventListener("mouseenter", () => applyHoverGlow(node));
        summary.addEventListener("mouseleave", () => clearHoverGlow());
        summary.addEventListener("click", () => switchToElement(node));
        details.appendChild(summary);

        const childrenContainer = document.createElement("div");
        const isConnectedToCurrent = isInCurrentPath(node);
        const lineColor = isConnectedToCurrent
          ? "rgba(84, 119, 245, 0.55)"
          : "rgba(139, 148, 158, 0.25)";
        childrenContainer.style.cssText =
          "margin-left:0; padding-left:6px; border-left:1px solid " + lineColor + ";";
        if (isConnectedToCurrent) {
          childrenContainer.style.borderTop = "1px solid rgba(84, 119, 245, 0.28)";
          if (node === state.element) {
            childrenContainer.style.borderBottom = "1px solid rgba(84, 119, 245, 0.55)";
          }
        }
        childElements.forEach((child) => {
          const childTree = renderTreeNode(child, depth + 1);
          if (childTree) childrenContainer.appendChild(childTree);
        });
        details.appendChild(childrenContainer);
        return details;
      }

      const tree = renderTreeNode(root, 0);
      if (tree) domMapScroll.appendChild(tree);
    }
    toggleDomMapBtn.addEventListener("click", () => {
      const detailsNodes = Array.from(domMapScroll.querySelectorAll("details"));
      if (detailsNodes.length === 0) return;
      const hasClosed = detailsNodes.some((details) => !details.open);
      detailsNodes.forEach((details) => {
        details.open = hasClosed;
      });
    });
    function scrollToCurrentDomInMap() {
      const currentNode = domMapScroll.querySelector('[data-current-dom="true"]');
      if (currentNode) {
        currentNode.scrollIntoView({ block: "center", inline: "nearest" });
      }
    }
    currentDomBtn.addEventListener("click", () => {
      scrollToCurrentDomInMap();
    });
    domMapSearchInput.addEventListener("input", () => {
      updateDomMap();
    });
    updateDomMap();
    requestAnimationFrame(scrollToCurrentDomInMap);

    const content = document.createElement("div");
    content.className = "mintool-style-editor-content";
    content.style.cssText = "padding:12px 16px 16px; display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden;";
    panel.appendChild(content);

    const stylesLabel = document.createElement("div");
    stylesLabel.textContent = "적용된 스타일 (computed, readonly)";
    stylesLabel.style.cssText = "margin-bottom:6px; color:#888; font-size:11px;";
    content.appendChild(stylesLabel);

    const stylesFilterInput = document.createElement("input");
    stylesFilterInput.type = "text";
    stylesFilterInput.placeholder = "필터 (예: width, display)";
    stylesFilterInput.style.cssText =
      "width:100%; box-sizing:border-box; margin-bottom:6px; padding:6px 8px; background:#1c1c1e; border:1px solid #444; border-radius:4px; color:#e6e6e6; font-size:12px;";
    content.appendChild(stylesFilterInput);

    const stylesView = document.createElement("div");
    stylesView.style.cssText =
      "height:8.8em; min-height:8.8em; max-height:8.8em; width:100%; box-sizing:border-box; padding:8px; background:#171719; border:1px solid #444; border-radius:4px; color:#cfcfcf; font-size:12px; line-height:1.1; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; overflow:auto; white-space:pre;";
    content.appendChild(stylesView);

    function updateComputedTextarea() {
      const fullComputed = getComputedStyleAsText(state.element);
      const keyword = stylesFilterInput.value.trim().toLowerCase();

      const lines = fullComputed
        .split("\n")
        .filter((line) => !keyword || line.toLowerCase().includes(keyword));

      stylesView.innerHTML = "";

      lines.forEach((line) => {
        const row = document.createElement("div");
        row.style.whiteSpace = "pre";

        const colonIndex = line.indexOf(":");
        if (colonIndex <= 0) {
          row.textContent = line;
          stylesView.appendChild(row);
          return;
        }

        const key = line.slice(0, colonIndex);
        const value = line.slice(colonIndex + 1).trimStart();

        const keySpan = document.createElement("span");
        // GitHub Dark 스타일 톤
        keySpan.style.color = "#79c0ff";
        keySpan.textContent = key;

        const sepSpan = document.createElement("span");
        sepSpan.style.color = "#8b949e";
        sepSpan.textContent = ": ";

        const valueSpan = document.createElement("span");
        valueSpan.style.color = "#a5d6ff";
        valueSpan.textContent = value;

        row.appendChild(keySpan);
        row.appendChild(sepSpan);
        row.appendChild(valueSpan);
        stylesView.appendChild(row);
      });
    }

    stylesFilterInput.addEventListener("input", () => {
      updateComputedTextarea();
    });

    const customHeader = document.createElement("div");
    customHeader.style.cssText =
      "display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:12px; margin-bottom:4px;";
    const customLabel = document.createElement("div");
    customLabel.textContent = "커스텀 CSS (!important 자동적용)";
    customLabel.style.cssText = "color:#888; font-size:11px;";
    customHeader.appendChild(customLabel);
    const fullWindowPresetBtn = document.createElement("button");
    fullWindowPresetBtn.type = "button";
    fullWindowPresetBtn.textContent = "Full window";
    fullWindowPresetBtn.style.cssText =
      "padding:2px 8px; border:1px solid #555; border-radius:4px; background:#2b2b2d; color:#ddd; font-size:11px; cursor:pointer;";
    customHeader.appendChild(fullWindowPresetBtn);
    content.appendChild(customHeader);
    const customTextarea = document.createElement("textarea");
    customTextarea.rows = 5;
    customTextarea.placeholder = "예:\nwidth: 100%\nmax-width: none";
    customTextarea.style.cssText =
      "width:100%; min-height:7.5em; box-sizing:border-box; padding:6px 8px; background:#1c1c1e; border:1px solid #444; border-radius:4px; color:#e6e6e6; font-size:12px; font-family:monospace; resize:vertical;";
    content.appendChild(customTextarea);
    let customDebounce = null;

    function parseCssTextToMap(text) {
      const map = new Map();
      String(text)
        .split("\n")
        .forEach((line) => {
          const colon = line.indexOf(":");
          if (colon <= 0) return;
          const prop = line.slice(0, colon).trim();
          const value = line.slice(colon + 1).trim();
          if (!prop || !value) return;
          map.set(prop, value);
        });
      return map;
    }

    function stringifyCssMap(cssMap) {
      return Array.from(cssMap.entries())
        .map(([prop, value]) => `${prop}: ${value}`)
        .join("\n");
    }

    function mergeCssText(baseText, overrideText) {
      const merged = parseCssTextToMap(baseText);
      const overrides = parseCssTextToMap(overrideText);
      overrides.forEach((value, prop) => {
        merged.set(prop, value);
      });
      return stringifyCssMap(merged);
    }

    function syncCustomStylesForElement(targetEl, customCssText) {
      getOriginalInlineStyleFor(targetEl);
      const nextCssMap = parseCssTextToMap(customCssText);
      const prevProps = appliedCustomPropsMap.get(targetEl) || new Set();

      // 텍스트에서 제거된 속성은 실제 DOM에서도 제거
      prevProps.forEach((prop) => {
        if (!nextCssMap.has(prop)) {
          targetEl.style.removeProperty(prop);
        }
      });

      // 현재 텍스트에 있는 속성은 재적용
      nextCssMap.forEach((value, prop) => {
        applyToElement(targetEl, prop, value);
      });

      appliedCustomPropsMap.set(targetEl, new Set(nextCssMap.keys()));
    }

    function applyCustomIfChecked() {
      if (!customCheckbox.checked) return;
      syncCustomStylesForElement(state.element, customTextarea.value);
    }

    customTextarea.addEventListener("input", () => {
      if (customDebounce) clearTimeout(customDebounce);
      customDebounce = setTimeout(() => {
        customDebounce = null;
        if (customCheckbox.checked) {
          applyCustomIfChecked();
        }
        updateComputedTextarea();
        updateRestoreButtonVisibility();
      }, 300);
    });
    fullWindowPresetBtn.addEventListener("click", () => {
      const fullWindowPreset = [
        "position: fixed",
        "z-index: 2147483645",
        "width: 100vw",
        "height: 100vh",
        "max-width: none",
        "max-height: none",
        "left: 0",
        "top: 0",
      ].join("\n");
      customTextarea.value = mergeCssText(customTextarea.value, fullWindowPreset);
      applyCustomIfChecked();
      updateComputedTextarea();
      updateRestoreButtonVisibility();
    });
    customCheckbox.addEventListener("change", () => {
      if (customCheckbox.checked) {
        applyCustomIfChecked();
      } else {
        restoreOriginal();
      }
      updateComputedTextarea();
    });

    function hasChanges() {
      for (const [el, originalInline] of originalInlineStyleMap.entries()) {
        if ((el.getAttribute("style") || "") !== originalInline) {
          return true;
        }
      }
      return false;
    }

    function updateRestoreButtonVisibility() {
      restoreBtn.style.opacity = hasChanges() ? "1" : "0.5";
    }

    function restoreOriginal() {
      customCheckbox.checked = false;
      for (const [el, originalInline] of originalInlineStyleMap.entries()) {
        el.setAttribute("style", originalInline);
      }
      originalInlineStyleMap.clear();
      appliedCustomPropsMap.clear();
      state.originalInlineStyle = state.element.getAttribute("style") || "";
      applyGlow(state.element);
      updateComputedTextarea();
      updateRestoreButtonVisibility();
    }
    updateComputedTextarea();
    updateRestoreButtonVisibility();

    document.body.appendChild(panel);
    // 초기 렌더 높이를 고정해 두어 세로 리사이즈가 자연스럽게 동작하도록 함
    panel.style.height = panel.offsetHeight + "px";

    if (typeof window.makeDraggable === "function") {
      window.makeDraggable(panel, { handle: header });
    }
  }

  if (typeof globalThis !== "undefined") {
    globalThis.mintoolOpenStyleEditor = openStyleEditor;
  }
  if (typeof window !== "undefined") {
    window.mintoolOpenStyleEditor = openStyleEditor;
  }
})();
