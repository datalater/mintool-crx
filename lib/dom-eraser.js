(function () {
  let lastRightClickedElement = null;
  let undoStack = [];
  let highlightTimeout = null;

  document.addEventListener(
    "contextmenu",
    (event) => {
      // Remove highlight from previous element if it exists
      if (lastRightClickedElement) {
        removeHighlight(lastRightClickedElement);
      }

      lastRightClickedElement = event.target;
      applyHighlight(lastRightClickedElement);
    },
    true,
  );

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "remove") {
      performAction("remove", lastRightClickedElement);
    } else if (message.action === "hide") {
      performAction("hide", lastRightClickedElement);
    } else if (message.action === "undo") {
      undoLastAction();
    }
  });

  function applyHighlight(el) {
    if (!el) return;

    // Save original styles if not already saved
    el.dataset.oldOutline = el.style.outline;
    el.dataset.oldBoxShadow = el.style.boxShadow;
    el.dataset.oldTransition = el.style.transition;

    // Apply glow effect
    el.style.setProperty("outline", "2px solid #5477f5", "important");
    el.style.setProperty("box-shadow", "0 0 15px #5477f5", "important");
    el.style.setProperty(
      "transition",
      "outline 0.2s, box-shadow 0.2s",
      "important",
    );

    if (highlightTimeout) clearTimeout(highlightTimeout);
    highlightTimeout = setTimeout(() => {
      removeHighlight(el);
    }, 2000);
  }

  function removeHighlight(el) {
    if (!el) return;
    el.style.outline = el.dataset.oldOutline || "";
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
