(function () {
  const ENABLED_ATTR = "data-mintool-virtual-fullscreen-enabled";
  const ACTION_GET_STATE = "virtual-fullscreen-get-state";
  const ACTION_SET_ENABLED = "virtual-fullscreen-set-enabled";
  const EVENT_SET_ENABLED = "mintool:virtual-fullscreen:set-enabled";
  const EVENT_STATE_CHANGED = "mintool:virtual-fullscreen:state-changed";

  const state = {
    enabled: false,
  };

  window.addEventListener(EVENT_SET_ENABLED, (event) => {
    applyEnabled(Boolean(event.detail?.enabled), {
      source: event.detail?.source || "bridge",
      silent: true,
    });
  });

  window.addEventListener(EVENT_STATE_CHANGED, (event) => {
    applyEnabled(Boolean(event.detail?.enabled), {
      source: event.detail?.source || "main",
      silent: true,
    });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action === ACTION_GET_STATE) {
      sendResponse({ enabled: state.enabled });
      return;
    }

    if (message?.action === ACTION_SET_ENABLED) {
      const enabled = Boolean(message.enabled);
      const previousEnabled = state.enabled;

      applyEnabled(enabled, {
        source: "menu",
        silent: false,
      });

      if (previousEnabled !== enabled) {
        showToast({
          enabled,
          previousEnabled,
        });
      }

      sendResponse({ enabled: state.enabled });
    }
  });

  function dispatchSetEnabled(enabled, source = "bridge") {
    window.dispatchEvent(
      new CustomEvent(EVENT_SET_ENABLED, {
        detail: { enabled, source },
      }),
    );
  }

  function setEnabledAttr(enabled) {
    document.documentElement.setAttribute(ENABLED_ATTR, String(enabled));
  }

  function applyEnabled(enabled, options = {}) {
    const { source = "bridge", silent = false } = options;

    state.enabled = Boolean(enabled);
    setEnabledAttr(state.enabled);

    if (!silent) {
      dispatchSetEnabled(state.enabled, source);
    }
  }

  function showToast(toastState) {
    const text = toastState.enabled
      ? "전체 화면을 창 내부로 제한하기가 켜짐"
      : "전체 화면을 창 내부로 제한하기가 꺼짐";

    if (!window.toastify) return;

    window.toastify.showToast({
      text,
      duration: 5000,
      close: true,
      gravity: "bottom",
      position: "right",
      style: {
        background: "linear-gradient(135deg, #73a5ff, #5477f5)",
        fontSize: "12px",
        display: "flex",
        alignItems: "center",
        flexDirection: "row-reverse",
        paddingLeft: "12px",
        gap: "8px",
      },
      node: createUndoToastNode(text, toastState),
    });
  }

  function createUndoToastNode(text, toastState) {
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.gap = "8px";
    container.title = text;

    const span = document.createElement("span");
    span.innerText = text;
    span.style.whiteSpace = "nowrap";
    container.appendChild(span);

    const undoBtn = document.createElement("button");
    undoBtn.innerText = "Undo";
    undoBtn.style.background = "rgba(255, 255, 255, 0.2)";
    undoBtn.style.color = "white";
    undoBtn.style.border = "1px solid rgba(255, 255, 255, 0.4)";
    undoBtn.style.padding = "2px 6px";
    undoBtn.style.borderRadius = "3px";
    undoBtn.style.cursor = "pointer";
    undoBtn.style.fontSize = "11px";
    undoBtn.style.fontWeight = "bold";
    undoBtn.onclick = (event) => {
      event.stopPropagation();
      applyEnabled(Boolean(toastState.previousEnabled), {
        source: "undo",
        silent: false,
      });
    };

    container.appendChild(undoBtn);
    return container;
  }
})();
