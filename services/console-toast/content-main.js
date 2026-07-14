(function () {
  const EVENT_SET_ENABLED = "mintool:console-toast:set-enabled";
  const ENABLED_ATTR = "data-mintool-console-toast";
  const MAX_REPLAY_TOASTS = 5;

  const originals = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: typeof console.debug === "function" ? console.debug.bind(console) : null,
  };

  const state = {
    enabled: false,
    ready: false,
    busy: false,
  };

  init();

  function init() {
    bindCopyHelper();
    patchConsole();
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener(EVENT_SET_ENABLED, (event) => {
      setEnabled(Boolean(event.detail?.enabled));
    });
    syncEnabledFromAttr();
    observeEnabledAttr();
  }

  function bindCopyHelper() {
    const ui = globalThis.mintoolConsoleToastUi;
    if (!ui) return;
    ui.copyText = copyMessage;
  }

  function setEnabled(enabled) {
    const next = Boolean(enabled);
    const becameEnabled = next && !state.enabled;
    state.enabled = next;
    state.ready = true;

    const ui = globalThis.mintoolConsoleToastUi;
    ui?.setShellVisible(next);
    ui?.updateDockCount();

    if (becameEnabled) replayRecentToasts();
  }

  function syncEnabledFromAttr() {
    setEnabled(document.documentElement.getAttribute(ENABLED_ATTR) === "true");
  }

  function observeEnabledAttr() {
    const observer = new MutationObserver(syncEnabledFromAttr);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [ENABLED_ATTR],
    });
  }

  function patchConsole() {
    ["log", "info", "warn", "error", "debug"].forEach((level) => {
      if (!originals[level]) return;
      console[level] = (...args) => {
        originals[level](...args);
        if (state.busy) return;
        capture(level, formatArgs(args), getCallerPlace());
      };
    });
  }

  function onWindowError(event) {
    if (state.busy) return;
    if (
      isExtensionSource(event.filename) ||
      isExtensionSource(event.error?.stack)
    ) {
      return;
    }
    const place =
      shortPlace(event.filename, event.lineno) ||
      parseCallerPlace(event.error?.stack);
    capture("error", event.message || "Script error", place);
  }

  function onUnhandledRejection(event) {
    if (state.busy) return;
    const reason = event.reason;
    if (reason instanceof Error && isExtensionSource(reason.stack)) return;
    const message =
      reason instanceof Error
        ? reason.message || String(reason)
        : formatValue(reason);
    const place =
      (reason instanceof Error && parseCallerPlace(reason.stack)) || "";
    capture("error", `Unhandled rejection: ${message}`, place);
  }

  function shouldCapture() {
    if (!state.ready) return true;
    return state.enabled;
  }

  function capture(level, message, place = "") {
    if (!message || !shouldCapture()) return;

    const store = globalThis.mintoolConsoleToastStore;
    const ui = globalThis.mintoolConsoleToastUi;
    if (!store || !ui) return;

    const entry = store.append(level, message, place);
    ui.updateDockCount();
    ui.refreshHistoryPanel();

    // While history panel is open, only update the panel — no floating toasts.
    if (state.enabled && !ui.isPanelOpen?.()) safeShowToast(entry);
  }

  function replayRecentToasts() {
    const store = globalThis.mintoolConsoleToastStore;
    const ui = globalThis.mintoolConsoleToastUi;
    if (!store || !ui) return;

    ui.clearVisibleToasts();
    const recent = store.recent(MAX_REPLAY_TOASTS);
    for (const entry of recent) safeShowToast(entry);
    ui.refreshHistoryPanel();
  }

  function safeShowToast(entry) {
    const ui = globalThis.mintoolConsoleToastUi;
    if (!ui || state.busy) return;
    state.busy = true;
    try {
      ui.showToast(entry);
    } catch (_error) {
      // Swallow toast UI failures.
    } finally {
      state.busy = false;
    }
  }

  function isExtensionSource(value) {
    if (!value) return false;
    const text = String(value);
    return (
      text.includes("chrome-extension://") ||
      text.includes("moz-extension://") ||
      text.includes("console-toast")
    );
  }

  function getCallerPlace() {
    try {
      return parseCallerPlace(new Error().stack);
    } catch (_error) {
      return "";
    }
  }

  function parseCallerPlace(stack) {
    if (!stack) return "";
    for (const line of String(stack).split("\n")) {
      if (shouldSkipStackLine(line)) continue;
      const parsed = parseStackLine(line);
      if (!parsed) continue;
      const place = shortPlace(parsed.url, parsed.line);
      if (place) return place;
    }
    return "";
  }

  function shouldSkipStackLine(line) {
    const trimmed = line.trim();
    return (
      !trimmed ||
      /^error$/i.test(trimmed) ||
      trimmed.includes("chrome-extension://") ||
      trimmed.includes("moz-extension://") ||
      trimmed.includes("console-toast") ||
      trimmed.includes("getCallerPlace") ||
      trimmed.includes("parseCallerPlace") ||
      /\bat\s+console\./.test(trimmed)
    );
  }

  function parseStackLine(line) {
    let match = line.match(/\((.+?):(\d+)(?::\d+)?\)\s*$/);
    if (match) return { url: match[1], line: Number(match[2]) };
    match = line.match(/^\s*at\s+(.+?):(\d+)(?::\d+)?\s*$/);
    if (match) return { url: match[1], line: Number(match[2]) };
    match = line.match(/@(.+?):(\d+)(?::\d+)?\s*$/);
    if (match) return { url: match[1], line: Number(match[2]) };
    return null;
  }

  function shortPlace(url, line) {
    if (!url) return "";
    const clean = String(url).split("#")[0].split("?")[0];
    const name = clean.split("/").pop() || clean;
    if (!name || name === "(anonymous)" || name === "<anonymous>") return "";
    return Number.isFinite(line) ? `${name}:${line}` : name;
  }

  function formatArgs(args) {
    return args.map(formatValue).join(" ");
  }

  function formatValue(value) {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.stack || value.message;
    if (typeof value === "undefined") return "undefined";
    if (typeof value === "symbol") return value.toString();
    if (typeof value === "function") {
      return value.name ? `[Function ${value.name}]` : "[Function]";
    }
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return Object.prototype.toString.call(value);
    }
  }

  async function copyMessage(text, button) {
    state.busy = true;
    try {
      await writeClipboard(text);
      if (button) {
        button.textContent = "복사됨";
        button.classList.add("is-done");
        window.setTimeout(() => {
          button.textContent = "복사";
          button.classList.remove("is-done");
        }, 1200);
      }
    } catch (_error) {
      if (button) {
        button.textContent = "실패";
        button.classList.add("is-done");
        window.setTimeout(() => {
          button.textContent = "복사";
          button.classList.remove("is-done");
        }, 1200);
      }
    } finally {
      state.busy = false;
    }
  }

  async function writeClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    if (!ok) throw new Error("copy failed");
  }
})();
