(function () {
  const MAX_VISIBLE_TOASTS = 5;
  const LEVEL_DURATION = {
    log: 6000,
    info: 6000,
    debug: 5000,
    warn: 8000,
    error: 12000,
  };

  const ui = {
    root: null,
    list: null,
    dock: null,
    panel: null,
    panelList: null,
    searchInput: null,
    dockCountsEl: null,
    panelCountsEl: null,
    panelOpen: false,
    query: "",
    levelFilter: "",
  };

  globalThis.mintoolConsoleToastUi = {
    ensureShell,
    showToast,
    clearVisibleToasts,
    setShellVisible,
    refreshHistoryPanel,
    updateDockCount,
    isPanelOpen: () => ui.panelOpen,
  };

  function ensureShell() {
    if (ui.root && document.documentElement.contains(ui.root)) return ui;

    globalThis.mintoolConsoleToastInjectStyles?.();

    const root = document.createElement("div");
    root.id = "mintool-console-toast-host";
    root.setAttribute("data-mintool", "console-toast");

    const panel = buildPanel();
    const list = document.createElement("div");
    list.className = "mintool-ct-list";
    const dock = buildDock();

    root.append(panel, list, dock);
    (document.documentElement || document.body).appendChild(root);

    ui.root = root;
    ui.list = list;
    ui.dock = dock;
    ui.panel = panel;
    return ui;
  }

  function buildDock() {
    const dock = document.createElement("div");
    dock.className = "mintool-ct-dock";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "mintool-ct-dock-btn";

    const label = document.createElement("span");
    label.className = "mintool-ct-dock-label";
    label.textContent = "로그";

    const counts = document.createElement("span");
    counts.className = "mintool-ct-level-counts";
    ui.dockCountsEl = counts;

    button.append(label, counts);
    button.addEventListener("click", () => {
      ui.panelOpen = !ui.panelOpen;
      syncPanelOpen();
      if (ui.panelOpen) {
        clearVisibleToasts();
        refreshHistoryPanel();
      }
    });

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "mintool-ct-dock-close";
    closeBtn.setAttribute("aria-label", "Console Toast 끄기");
    closeBtn.title = "끄기";
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      requestDisable();
    });

    dock.append(button, closeBtn);
    return dock;
  }

  function requestDisable() {
    window.dispatchEvent(
      new CustomEvent("mintool:console-toast:request-disable"),
    );
  }

  function buildPanel() {
    const panel = document.createElement("div");
    panel.className = "mintool-ct-panel";
    panel.hidden = true;

    const header = document.createElement("div");
    header.className = "mintool-ct-panel-header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "mintool-ct-panel-title-wrap";

    const title = document.createElement("div");
    title.className = "mintool-ct-panel-title";
    title.textContent = "Console logs";

    const panelCounts = document.createElement("div");
    panelCounts.className = "mintool-ct-level-counts is-interactive";
    ui.panelCountsEl = panelCounts;
    titleWrap.append(title, panelCounts);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "mintool-ct-icon-btn";
    closeBtn.setAttribute("aria-label", "패널 닫기");
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", () => {
      ui.panelOpen = false;
      syncPanelOpen();
    });

    header.append(titleWrap, closeBtn);

    const search = document.createElement("input");
    search.type = "search";
    search.className = "mintool-ct-search";
    search.placeholder = "메시지·위치 검색";
    search.setAttribute("aria-label", "메시지·위치 검색");
    search.addEventListener("input", () => {
      ui.query = search.value.trim().toLowerCase();
      refreshHistoryPanel();
    });
    ui.searchInput = search;

    const list = document.createElement("div");
    list.className = "mintool-ct-panel-list";
    ui.panelList = list;

    const footer = document.createElement("div");
    footer.className = "mintool-ct-panel-footer";

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "mintool-ct-text-btn";
    clearBtn.textContent = "기록 비우기";
    clearBtn.addEventListener("click", () => {
      const store = globalThis.mintoolConsoleToastStore;
      store?.clear();
      refreshHistoryPanel();
      updateDockCount();
    });
    footer.appendChild(clearBtn);

    panel.append(header, search, list, footer);
    return panel;
  }

  function syncPanelOpen() {
    if (!ui.panel) return;
    ui.panel.hidden = !ui.panelOpen;
    ui.root?.classList.toggle("is-panel-open", ui.panelOpen);
    if (ui.panelOpen) clearVisibleToasts();
  }

  function setShellVisible(visible) {
    ensureShell();
    ui.root.style.display = visible ? "" : "none";
    if (!visible) {
      ui.panelOpen = false;
      ui.levelFilter = "";
      syncPanelOpen();
      clearVisibleToasts();
    }
  }

  function updateDockCount() {
    ensureShell();
    const counts = globalThis.mintoolConsoleToastStore?.counts?.() || {
      error: 0,
      warn: 0,
      info: 0,
      log: 0,
    };
    renderLevelCounts(ui.dockCountsEl, counts, { interactive: false });
    renderLevelCounts(ui.panelCountsEl, counts, { interactive: true });
  }

  function renderLevelCounts(container, counts, options = {}) {
    if (!container) return;
    const interactive = Boolean(options.interactive);
    container.replaceChildren();

    const levels = [
      ["error", counts.error],
      ["warn", counts.warn],
      ["info", counts.info],
      ["log", counts.log],
    ];

    let hasAny = false;
    for (const [level, count] of levels) {
      if (!count) continue;
      hasAny = true;
      const chip = document.createElement(interactive ? "button" : "span");
      if (interactive) chip.type = "button";
      chip.className = "mintool-ct-level-count";
      chip.dataset.level = level;
      chip.textContent = `${level} ${count}`;
      if (interactive && ui.levelFilter === level) {
        chip.classList.add("is-active");
      }
      if (interactive) {
        chip.setAttribute("aria-pressed", ui.levelFilter === level ? "true" : "false");
        chip.addEventListener("click", () => {
          ui.levelFilter = ui.levelFilter === level ? "" : level;
          updateDockCount();
          refreshHistoryPanel();
        });
      }
      container.appendChild(chip);
    }

    if (!hasAny) {
      const empty = document.createElement("span");
      empty.className = "mintool-ct-level-count is-empty";
      empty.textContent = "0";
      container.appendChild(empty);
    }
  }

  function refreshHistoryPanel() {
    ensureShell();
    if (!ui.panelOpen || !ui.panelList) return;

    const store = globalThis.mintoolConsoleToastStore;
    const items = store ? store.list(ui.query, ui.levelFilter) : [];
    ui.panelList.replaceChildren();

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "mintool-ct-empty";
      const filtered = Boolean(ui.query || ui.levelFilter);
      empty.textContent = filtered
        ? "검색 결과가 없습니다"
        : "아직 기록이 없습니다";
      ui.panelList.appendChild(empty);
      return;
    }

    for (let i = items.length - 1; i >= 0; i -= 1) {
      ui.panelList.appendChild(buildHistoryRow(items[i]));
    }
  }

  function buildHistoryRow(entry) {
    const row = document.createElement("div");
    row.className = "mintool-ct-row";
    row.dataset.level = entry.level;

    const meta = document.createElement("div");
    meta.className = "mintool-ct-row-meta";

    const topline = document.createElement("div");
    topline.className = "mintool-ct-topline";

    const level = document.createElement("span");
    level.className = "mintool-ct-level";
    level.textContent = entry.level;

    const time = document.createElement("span");
    time.className = "mintool-ct-time";
    time.textContent = formatTime(entry.ts);

    topline.append(level, time);
    if (entry.place) {
      const place = document.createElement("span");
      place.className = "mintool-ct-place";
      place.textContent = entry.place;
      place.title = entry.place;
      topline.appendChild(place);
    }

    const message = document.createElement("div");
    message.className = "mintool-ct-message";
    message.textContent = entry.message;

    meta.append(topline, message);

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "mintool-ct-action";
    copyBtn.textContent = "복사";
    copyBtn.addEventListener("click", () => {
      const text = entry.place
        ? `${entry.message}\n${entry.place}`
        : entry.message;
      globalThis.mintoolConsoleToastUi.copyText?.(text, copyBtn);
    });

    row.append(meta, copyBtn);
    return row;
  }

  function showToast(entry) {
    ensureShell();
    const list = ui.list;
    while (list.children.length >= MAX_VISIBLE_TOASTS) {
      const oldest = list.lastElementChild;
      if (oldest) dismissToast(oldest, true);
      else break;
    }

    const toast = document.createElement("div");
    toast.className = "mintool-ct-toast";
    toast.dataset.level = entry.level;
    toast._mintoolEntryId = entry.id;

    const meta = document.createElement("div");
    meta.className = "mintool-ct-toast-meta";

    const topline = document.createElement("div");
    topline.className = "mintool-ct-topline";

    const level = document.createElement("span");
    level.className = "mintool-ct-level";
    level.textContent = entry.level;
    topline.appendChild(level);

    if (entry.place) {
      const place = document.createElement("span");
      place.className = "mintool-ct-place";
      place.textContent = entry.place;
      place.title = entry.place;
      topline.appendChild(place);
    }

    const message = document.createElement("div");
    message.className = "mintool-ct-message";
    message.textContent = entry.message;
    meta.append(topline, message);

    const actions = document.createElement("div");
    actions.className = "mintool-ct-toast-actions";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "mintool-ct-action";
    copyBtn.textContent = "복사";
    const copyText = entry.place
      ? `${entry.message}\n${entry.place}`
      : entry.message;
    copyBtn.addEventListener("click", () => {
      globalThis.mintoolConsoleToastUi.copyText?.(copyText, copyBtn);
    });

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "mintool-ct-icon-btn";
    closeBtn.setAttribute("aria-label", "닫기");
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", () => dismissToast(toast, true));

    actions.append(copyBtn, closeBtn);
    toast.append(meta, actions);
    list.prepend(toast);
    requestAnimationFrame(() => toast.classList.add("is-visible"));

    const duration = LEVEL_DURATION[entry.level] || LEVEL_DURATION.log;
    scheduleDismiss(toast, duration);
  }

  function scheduleDismiss(toast, duration) {
    clearToastTimer(toast);
    toast._mintoolDuration = duration;
    toast._mintoolTimer = window.setTimeout(() => {
      if (toast._mintoolPaused) return;
      dismissToast(toast);
    }, duration);

    if (toast._mintoolHoverBound) return;
    toast._mintoolHoverBound = true;
    toast.addEventListener("mouseenter", () => {
      toast._mintoolPaused = true;
      clearToastTimer(toast);
    });
    toast.addEventListener("mouseleave", () => {
      toast._mintoolPaused = false;
      scheduleDismiss(toast, toast._mintoolDuration || LEVEL_DURATION.log);
    });
  }

  function clearToastTimer(toast) {
    if (toast._mintoolTimer) {
      window.clearTimeout(toast._mintoolTimer);
      toast._mintoolTimer = null;
    }
  }

  function dismissToast(toast, immediate = false) {
    clearToastTimer(toast);
    if (immediate) {
      toast.remove();
      return;
    }
    toast.classList.remove("is-visible");
    window.setTimeout(() => toast.remove(), 200);
  }

  function clearVisibleToasts() {
    if (!ui.list) return;
    ui.list.replaceChildren();
  }

  function formatTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch (error) {
      return "";
    }
  }
})();
