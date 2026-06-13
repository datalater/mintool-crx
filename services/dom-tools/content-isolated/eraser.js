(async function () {
  if (!(await isFeatureEnabled("domEraser"))) return;

  let lastRightClickedElement = null;
  let undoStack = [];
  let highlightTimeout = null;

  document.addEventListener(
    "contextmenu",
    (event) => {
      setHighlightedElement(event.target, HIGHLIGHT_COLOR);
    },
    true,
  );

  const HIGHLIGHT_PREVIEW_MS = 300;
  const HIGHLIGHT_COLOR = "#5477f5";
  const IFRAME_HIGHLIGHT_COLOR = "#10b981";

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "remove" || message.action === "hide") {
      performEraseAction(message);
    } else if (message.action === "undo") {
      undoLastAction();
    } else if (message.action === "highlight-frame") {
      highlightCrossFrameTarget(message.frameUrl);
    } else if (
      message.action === "edit-style" &&
      window.mintoolOpenStyleEditor
    ) {
      window.mintoolOpenStyleEditor(resolveActionTarget(message).target);
    }
  });

  // 우클릭 시점에 background가 알려준 cross-frame(iframe) 타겟을 즉시
  // 하이라이트합니다. (DOM 동작 선택 없이도 우클릭만으로 하이라이트되도록)
  function highlightCrossFrameTarget(frameUrl) {
    const target = resolveCrossFrameTarget(frameUrl, lastRightClickedElement);
    if (!target) return;
    setHighlightedElement(target, IFRAME_HIGHLIGHT_COLOR);
  }

  // 새로 하이라이트된(iframe 등 cross-frame) 타겟은 사용자가 인지할 시간을
  // 주기 위해 약간의 지연 후 실제 동작을 수행합니다.
  function performEraseAction(message) {
    const { target, isFreshTarget } = resolveActionTarget(message);
    if (!target) return;
    const delay = isFreshTarget ? HIGHLIGHT_PREVIEW_MS : 0;
    setTimeout(() => performAction(message.action, target), delay);
  }

  // 우클릭이 cross-origin iframe(예: 광고) 내부에서 일어나면 contextmenu가
  // 버블링되지 않아 lastRightClickedElement가 갱신되지 않으므로,
  // background가 알려준 frameUrl로 top document의 <iframe>을 찾아 대체합니다.
  function resolveActionTarget(message) {
    const target = resolveCrossFrameTarget(
      message.frameUrl,
      lastRightClickedElement,
    );
    const isFreshTarget = !!target && target !== lastRightClickedElement;
    if (isFreshTarget) setHighlightedElement(target, IFRAME_HIGHLIGHT_COLOR);
    return { target, isFreshTarget };
  }

  // 이전에 하이라이트된 엘리먼트를 먼저 복원해야, highlightTimeout이
  // 새 엘리먼트로 교체되며 이전 엘리먼트의 box-shadow가 영구히 남는 것을 방지함
  function setHighlightedElement(target, color) {
    if (lastRightClickedElement) removeHighlight(lastRightClickedElement);
    lastRightClickedElement = target;
    applyHighlight(target, color);
  }

  function applyHighlight(el, color = HIGHLIGHT_COLOR) {
    if (!el) return;

    // Save original styles if not already saved
    el.dataset.oldBoxShadow = el.style.boxShadow;
    el.dataset.oldTransition = el.style.transition;

    // 안팎 glow (inset) — 부모 overflow에 잘리지 않음
    el.style.setProperty(
      "box-shadow",
      [
        `inset 0 0 0 1px ${color}`, // 안쪽 얇은 라인
        `inset 0 0 8px ${color}`, // 안쪽 blur/glow
        `0 0 1px 0.5px ${color}`, // 바깥쪽 아주 얇은 라인
      ].join(", "),
      "important",
    );
    el.style.setProperty("transition", "box-shadow 0.2s", "important");

    if (highlightTimeout) clearTimeout(highlightTimeout);
    highlightTimeout = setTimeout(() => {
      removeHighlight(el);
    }, 2000);
  }

  function removeHighlight(el) {
    if (!el) return;
    el.style.boxShadow = el.dataset.oldBoxShadow || "";
    el.style.transition = el.dataset.oldTransition || "";
  }

  function performAction(action, element) {
    if (!element) return;

    // Remove highlight immediately before action
    removeHighlight(element);

    const description = getElementDescription(element);
    const state = {
      action,
      element,
      parent: element.parentElement,
      nextSibling: element.nextSibling,
      originalDisplay: window.getComputedStyle(element).display,
      description: description,
    };

    undoStack.push(state);

    if (action === "remove") {
      element.remove();
    } else {
      element.style.setProperty("display", "none", "important");
    }

    updateUndoMenu(state.description.full);
    showToast(state);
  }

  function undoLastAction() {
    const state = undoStack.pop();
    if (!state) return;

    if (state.action === "remove") {
      state.parent.insertBefore(state.element, state.nextSibling);
    } else {
      state.element.style.display =
        state.originalDisplay === "none" ? "" : state.originalDisplay;
    }

    const nextState = undoStack[undoStack.length - 1];
    updateUndoMenu(nextState ? nextState.description.full : null);
  }

  function getElementDescription(el) {
    let full = el.tagName.toLowerCase();
    if (el.id) full += `#${el.id}`;
    if (el.className && typeof el.className === "string") {
      const classes = el.className.trim().split(/\s+/).join(".");
      if (classes) full += `.${classes}`;
    }
    const short = full.length > 20 ? full.substring(0, 17) + "..." : full;
    return { short, full };
  }

  function updateUndoMenu(description) {
    chrome.runtime.sendMessage({
      type: "UPDATE_UNDO_MENU",
      description: description,
    });
  }

  function showToast(state) {
    const actionText = state.action === "remove" ? "삭제됨" : "숨겨짐";
    const text = `DOM이 ${actionText}: ${state.description.short}`;

    if (window.toastify) {
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
        node: createUndoToastNode(text, state.description.full),
      });
    }
  }

  function createUndoToastNode(text, fullDescription) {
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.gap = "8px";
    container.title = fullDescription;

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

    undoBtn.onclick = (e) => {
      e.stopPropagation();
      undoLastAction();
    };

    container.appendChild(undoBtn);
    return container;
  }
})();
