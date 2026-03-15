(function () {
  const ENABLED_ATTR = "data-mintool-virtual-fullscreen-enabled";
  const TARGET_ATTR = "data-mintool-virtual-fullscreen-target";
  const ACTIVE_ATTR = "data-mintool-virtual-fullscreen-active";
  const HIGHLIGHT_ATTR = "data-mintool-virtual-fullscreen-highlight";
  const EVENT_SET_ENABLED = "mintool:virtual-fullscreen:set-enabled";
  const EVENT_STATE_CHANGED = "mintool:virtual-fullscreen:state-changed";
  const Z_INDEX_MAX = 2147483647;
  const BUTTON_WIDTH = 140;
  const BUTTON_HEIGHT = 40;
  const BUTTON_CLOSE_SIZE = 28;
  const BUTTON_MARGIN = 12;
  const STYLE_ID = "mintool-virtual-fullscreen-style";

  const state = {
    enabled: false,
    activeTarget: null,
    button: null,
    styleElement: null,
    isHoveringTarget: false,
    isHoveringButton: false,
    isButtonDismissed: false,
  };

  const originals = {
    requestFullscreen: Element.prototype.requestFullscreen,
    exitFullscreen: Document.prototype.exitFullscreen,
    fullScreenGetter: Object.getOwnPropertyDescriptor(Document.prototype, "fullscreenElement"),
    enabledGetter: Object.getOwnPropertyDescriptor(Document.prototype, "fullscreenEnabled"),
    webkitRequestFullscreen: Element.prototype.webkitRequestFullscreen,
    webkitRequestFullScreen: Element.prototype.webkitRequestFullScreen,
    webkitExitFullscreen: Document.prototype.webkitExitFullscreen,
    webkitCancelFullScreen: Document.prototype.webkitCancelFullScreen,
    webkitFullscreenElementGetter: Object.getOwnPropertyDescriptor(Document.prototype, "webkitFullscreenElement"),
    webkitFullscreenEnabledGetter: Object.getOwnPropertyDescriptor(Document.prototype, "webkitFullscreenEnabled"),
    webkitEnterFullscreen: HTMLVideoElement.prototype.webkitEnterFullscreen,
    webkitExitVideoFullscreen: HTMLVideoElement.prototype.webkitExitFullscreen,
  };

  window.mintoolVirtualFullscreen = {
    get enabled() {
      return state.enabled;
    },
    get activeTarget() {
      return state.activeTarget;
    },
  };

  init();

  function init() {
    overrideFullscreenApi();
    installEventListeners();
    setEnabled(false);
  }

  function overrideFullscreenApi() {
    if (typeof originals.requestFullscreen === "function") {
      Element.prototype.requestFullscreen = function (...args) {
        if (!state.enabled) {
          return originals.requestFullscreen.apply(this, args);
        }

        return enterVirtualFullscreen(this, "element.requestFullscreen");
      };
    }

    if (typeof originals.exitFullscreen === "function") {
      Document.prototype.exitFullscreen = function (...args) {
        if (state.activeTarget) {
          return exitVirtualFullscreen("document.exitFullscreen");
        }

        return originals.exitFullscreen.apply(this, args);
      };
    }

    if (typeof originals.webkitRequestFullscreen === "function") {
      Element.prototype.webkitRequestFullscreen = function (...args) {
        if (!state.enabled) {
          return originals.webkitRequestFullscreen.apply(this, args);
        }

        return enterVirtualFullscreen(this, "element.webkitRequestFullscreen");
      };
    }

    if (typeof originals.webkitRequestFullScreen === "function") {
      Element.prototype.webkitRequestFullScreen = function (...args) {
        if (!state.enabled) {
          return originals.webkitRequestFullScreen.apply(this, args);
        }

        return enterVirtualFullscreen(this, "element.webkitRequestFullScreen");
      };
    }

    if (typeof originals.webkitExitFullscreen === "function") {
      Document.prototype.webkitExitFullscreen = function (...args) {
        if (state.activeTarget) {
          return exitVirtualFullscreen("document.webkitExitFullscreen");
        }

        return originals.webkitExitFullscreen.apply(this, args);
      };
    }

    if (typeof originals.webkitCancelFullScreen === "function") {
      Document.prototype.webkitCancelFullScreen = function (...args) {
        if (state.activeTarget) {
          return exitVirtualFullscreen("document.webkitCancelFullScreen");
        }

        return originals.webkitCancelFullScreen.apply(this, args);
      };
    }

    if (typeof originals.webkitEnterFullscreen === "function") {
      HTMLVideoElement.prototype.webkitEnterFullscreen = function (...args) {
        if (!state.enabled) {
          return originals.webkitEnterFullscreen.apply(this, args);
        }

        return enterVirtualFullscreen(this, "video.webkitEnterFullscreen");
      };
    }

    if (typeof originals.webkitExitVideoFullscreen === "function") {
      HTMLVideoElement.prototype.webkitExitFullscreen = function (...args) {
        if (state.activeTarget) {
          return exitVirtualFullscreen("video.webkitExitFullscreen");
        }

        return originals.webkitExitVideoFullscreen.apply(this, args);
      };
    }

    overrideGetter(Document.prototype, "fullscreenElement", originals.fullScreenGetter, () => {
      return state.activeTarget || callOriginalGetter(originals.fullScreenGetter, document);
    });

    overrideGetter(Document.prototype, "fullscreenEnabled", originals.enabledGetter, () => {
      return callOriginalGetter(originals.enabledGetter, document) ?? true;
    });

    if (originals.webkitFullscreenElementGetter || "webkitFullscreenElement" in document) {
      overrideGetter(Document.prototype, "webkitFullscreenElement", originals.webkitFullscreenElementGetter, () => {
        return state.activeTarget || callOriginalGetter(originals.webkitFullscreenElementGetter, document);
      });
    }

    if (originals.webkitFullscreenEnabledGetter || "webkitFullscreenEnabled" in document) {
      overrideGetter(Document.prototype, "webkitFullscreenEnabled", originals.webkitFullscreenEnabledGetter, () => {
        return callOriginalGetter(originals.webkitFullscreenEnabledGetter, document) ?? true;
      });
    }
  }

  function installEventListeners() {
    window.addEventListener(EVENT_SET_ENABLED, (event) => {
      setEnabled(Boolean(event.detail?.enabled));
    });

    document.addEventListener("pointermove", (event) => {
      syncHoverState(getPrimaryTarget(event));
    }, true);

    document.addEventListener("mouseout", (event) => {
      if (event.relatedTarget) return;
      clearHoverState();
    }, true);

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!state.activeTarget) return;

      event.preventDefault();
      exitVirtualFullscreen("escape");
    }, true);

    window.addEventListener("resize", () => {
      updateButtonPosition();
    }, true);

    window.addEventListener("scroll", () => {
      updateButtonPosition();
    }, true);

    window.addEventListener("blur", () => {
      clearHoverState();
    }, true);
  }

  function setEnabled(enabled) {
    state.enabled = Boolean(enabled);
    document.documentElement.setAttribute(ENABLED_ATTR, String(state.enabled));
    emitStateChanged("main");

    if (!state.enabled) {
      exitVirtualFullscreen("disable");
    }
  }

  function enterVirtualFullscreen(target, source) {
    if (!(target instanceof Element)) return Promise.resolve();

    ensureStyleElement();
    ensureButton();

    if (state.activeTarget && state.activeTarget !== target) {
      clearTargetState();
    }

    state.activeTarget = target;
    state.isHoveringTarget = false;
    state.isHoveringButton = false;
    state.isButtonDismissed = false;
    applyTargetState(target);
    updateButtonPosition();
    dispatchFullscreenChange(target, source, true);
    return Promise.resolve();
  }

  function exitVirtualFullscreen(source) {
    const target = state.activeTarget;
    if (!(target instanceof Element)) {
      updateButtonVisibility();
      return Promise.resolve();
    }

    clearTargetState();
    state.activeTarget = null;
    state.isHoveringTarget = false;
    state.isHoveringButton = false;
    state.isButtonDismissed = false;
    updateButtonVisibility();
    dispatchFullscreenChange(target, source, false);
    return Promise.resolve();
  }

  function applyTargetState(target) {
    clearTargetState();
    document.documentElement.setAttribute(ACTIVE_ATTR, "");
    document.body?.setAttribute(ACTIVE_ATTR, "");

    if (isRootFullscreenTarget(target)) {
      return;
    }

    target.setAttribute(TARGET_ATTR, "");
    target.setAttribute(HIGHLIGHT_ATTR, "");
  }

  function clearTargetState() {
    document.documentElement.removeAttribute(ACTIVE_ATTR);
    document.body?.removeAttribute(ACTIVE_ATTR);

    if (!(state.activeTarget instanceof Element)) return;

    state.activeTarget.removeAttribute(TARGET_ATTR);
    state.activeTarget.removeAttribute(HIGHLIGHT_ATTR);
  }

  function dispatchFullscreenChange(target, source, entering) {
    queueMicrotask(() => {
      const fullscreenEvent = new Event("fullscreenchange", { bubbles: true, composed: true });

      if (target instanceof Element && target.isConnected) {
        target.dispatchEvent(fullscreenEvent);
      } else {
        document.dispatchEvent(fullscreenEvent);
      }

      if (target instanceof HTMLVideoElement) {
        const webkitEventName = entering ? "webkitbeginfullscreen" : "webkitendfullscreen";
        target.dispatchEvent(new Event(webkitEventName, { bubbles: false, composed: true }));
      }

      console.log("[mintool] virtual fullscreen", source, getSelectorSummary(target));
    });
  }

  function ensureStyleElement() {
    if (state.styleElement?.isConnected) return state.styleElement;

    const existing = document.getElementById(STYLE_ID);
    if (existing) {
      state.styleElement = existing;
      return existing;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      html[${ACTIVE_ATTR}],
      body[${ACTIVE_ATTR}] {
        overflow: hidden !important;
      }

      [${TARGET_ATTR}] {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        max-width: 100vw !important;
        max-height: 100vh !important;
        margin: 0 !important;
        box-sizing: border-box !important;
        z-index: ${Z_INDEX_MAX - 1} !important;
        background: #000 !important;
      }

      [${TARGET_ATTR}] video,
      [${TARGET_ATTR}] iframe {
        max-width: 100% !important;
        max-height: 100% !important;
      }

      [${HIGHLIGHT_ATTR}] {
        outline: 3px solid rgba(74, 222, 128, 0.95) !important;
        outline-offset: -2px !important;
      }
    `;
    document.documentElement.appendChild(style);
    state.styleElement = style;
    return style;
  }

  function ensureButton() {
    if (state.button?.isConnected) return state.button;

    const container = document.createElement("div");
    container.style.cssText = [
      "position:fixed",
      `z-index:${Z_INDEX_MAX}`,
      `height:${BUTTON_HEIGHT}px`,
      "display:none",
      "align-items:center",
      "border-radius:18px",
      "overflow:hidden",
      "background:rgba(15, 15, 15, 0.9)",
      "border:1px solid rgba(255, 255, 255, 0.1)",
      "box-shadow:0 10px 24px rgba(0, 0, 0, 0.28)",
    ].join(";");

    const exitButton = document.createElement("button");
    exitButton.type = "button";
    exitButton.textContent = "Exit Window Fit";
    exitButton.style.cssText = [
      `width:${BUTTON_WIDTH}px`,
      `height:${BUTTON_HEIGHT}px`,
      "border:none",
      "background:transparent",
      "color:rgba(255, 255, 255, 0.92)",
      "font:500 13px/1 -apple-system, BlinkMacSystemFont, sans-serif",
      "letter-spacing:0.15px",
      "text-align:center",
      "cursor:pointer",
      "padding:0 10px 0 14px",
      "transition:background-color 120ms ease, color 120ms ease",
    ].join(";");
    exitButton.addEventListener("click", () => {
      setEnabled(false);
    });
    exitButton.addEventListener("pointerenter", () => {
      exitButton.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
      exitButton.style.color = "#ffffff";
    });
    exitButton.addEventListener("pointerleave", () => {
      exitButton.style.backgroundColor = "transparent";
      exitButton.style.color = "rgba(255, 255, 255, 0.92)";
    });

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "X";
    closeButton.setAttribute("aria-label", "Dismiss Exit Window Fit button");
    closeButton.style.cssText = [
      `width:${BUTTON_CLOSE_SIZE}px`,
      `height:${BUTTON_HEIGHT}px`,
      "border:none",
      "border-left:1px solid rgba(255, 255, 255, 0.12)",
      "background:transparent",
      "color:rgba(255, 255, 255, 0.72)",
      "font:700 11px/1 -apple-system, BlinkMacSystemFont, sans-serif",
      "text-align:center",
      "cursor:pointer",
      "padding:0",
      "transition:background-color 120ms ease, color 120ms ease",
    ].join(";");
    closeButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.isButtonDismissed = true;
      clearHoverState();
    });
    closeButton.addEventListener("pointerenter", () => {
      closeButton.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
      closeButton.style.color = "#ffffff";
    });
    closeButton.addEventListener("pointerleave", () => {
      closeButton.style.backgroundColor = "transparent";
      closeButton.style.color = "rgba(255, 255, 255, 0.72)";
    });

    container.appendChild(exitButton);
    container.appendChild(closeButton);

    container.addEventListener("pointerenter", () => {
      state.isHoveringButton = true;
      updateButtonVisibility();
    });
    container.addEventListener("pointerleave", () => {
      state.isHoveringButton = false;
      updateButtonVisibility();
    });

    document.body.appendChild(container);
    state.button = container;
    return container;
  }

  function syncHoverState(target) {
    const activeTarget = state.activeTarget;
    const button = state.button;

    state.isHoveringTarget = Boolean(
      activeTarget instanceof Element &&
        activeTarget.isConnected &&
        target instanceof Element &&
        (target === activeTarget || activeTarget.contains(target)),
    );
    state.isHoveringButton = Boolean(
      button && target instanceof Element && (target === button || button.contains(target)),
    );
    updateButtonVisibility();
  }

  function clearHoverState() {
    state.isHoveringTarget = false;
    state.isHoveringButton = false;
    updateButtonVisibility();
  }

  function updateButtonVisibility() {
    if (!state.button) return;
    state.button.style.display = shouldShowButton() ? "block" : "none";
  }

  function shouldShowButton() {
    if (!(state.activeTarget instanceof Element) || !state.button) return false;
    if (state.isButtonDismissed) return false;
    return state.isHoveringTarget || state.isHoveringButton;
  }

  function updateButtonPosition() {
    const button = ensureButton();
    const target = state.activeTarget;

    if (!(target instanceof Element) || !target.isConnected) {
      button.style.display = "none";
      return;
    }

    const rect = target.getBoundingClientRect();
    const totalWidth = BUTTON_WIDTH + BUTTON_CLOSE_SIZE;
    const left = clamp(rect.right - totalWidth, BUTTON_MARGIN, window.innerWidth - totalWidth - BUTTON_MARGIN);
    const top = clamp(rect.top + BUTTON_MARGIN, BUTTON_MARGIN, window.innerHeight - BUTTON_HEIGHT - BUTTON_MARGIN);

    button.style.left = `${Math.round(left)}px`;
    button.style.top = `${Math.round(top)}px`;
    updateButtonVisibility();
  }

  function overrideGetter(proto, property, originalDescriptor, getter) {
    Object.defineProperty(proto, property, {
      configurable: true,
      enumerable: originalDescriptor?.enumerable ?? true,
      get: getter,
    });
  }

  function callOriginalGetter(descriptor, receiver) {
    if (typeof descriptor?.get !== "function") return null;
    return descriptor.get.call(receiver);
  }

  function getPrimaryTarget(event) {
    return event.composedPath?.()[0] || event.target;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getSelectorSummary(node) {
    if (!(node instanceof Element)) return "";

    const tag = node.tagName.toLowerCase();
    const id = node.id ? `#${node.id}` : "";
    const classes =
      typeof node.className === "string"
        ? "." + node.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".")
        : "";

    return `${tag}${id}${classes}`;
  }

  function isRootFullscreenTarget(target) {
    return target === document.documentElement || target === document.body;
  }

  function emitStateChanged(source) {
    window.dispatchEvent(
      new CustomEvent(EVENT_STATE_CHANGED, {
        detail: {
          enabled: state.enabled,
          source,
        },
      }),
    );
  }
})();
