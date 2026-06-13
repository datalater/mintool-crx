(async function () {
  if (!(await isFeatureEnabled("domCoverer"))) return;

  const COVER_CLASS = "mintool-cover-overlay";
  const Z_INDEX = 2147483647;

  let lastRightClickedElement = null;
  let syncLoopRunning = false;
  const covers = new Map(); // overlay -> covered target element

  document.addEventListener(
    "contextmenu",
    (event) => {
      lastRightClickedElement = event.target;
    },
    true,
  );

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "cover") {
      handleCoverMessage(message);
    }
  });

  function handleCoverMessage(message) {
    const target = resolveCoverTarget(message.frameUrl);
    if (!target) {
      showNotFoundToast();
      return;
    }
    toggleCover(target);
  }

  function resolveCoverTarget(frameUrl) {
    if (!frameUrl) return lastRightClickedElement;
    return findIframeByUrl(frameUrl);
  }

  function toggleCover(element) {
    const existingOverlay =
      element.closest(`.${COVER_CLASS}`) || findCoverForTarget(element);
    if (existingOverlay) {
      removeCover(existingOverlay);
    } else {
      addCover(element);
    }
  }

  function findCoverForTarget(target) {
    for (const [overlay, covered] of covers) {
      if (covered === target) return overlay;
    }
    return null;
  }

  function addCover(target) {
    const overlay = createOverlay(target);
    document.body.appendChild(overlay);
    covers.set(overlay, target);
    syncOverlayRect(overlay, target);
    ensureSyncLoop();
    showCoverToast(overlay);
  }

  function removeCover(overlay) {
    covers.delete(overlay);
    overlay.remove();
  }

  function createOverlay(target) {
    const overlay = document.createElement("div");
    overlay.className = COVER_CLASS;
    overlay.style.cssText = [
      "position:fixed",
      `z-index:${Z_INDEX}`,
      `background:${getCoverBackground(target)}`,
    ].join(";");
    overlay.style.setProperty(
      "box-shadow",
      "inset 0 0 0 2px #f5c254, inset 0 0 15px #f5c254",
      "important",
    );
    return overlay;
  }

  function getCoverBackground(target) {
    const parentBg = window.getComputedStyle(
      target.parentElement || document.body,
    ).backgroundColor;
    return isTransparent(parentBg) ? "#ffffff" : parentBg;
  }

  function isTransparent(color) {
    return !color || color === "transparent" || color === "rgba(0, 0, 0, 0)";
  }

  function syncOverlayRect(overlay, target) {
    const rect = target.getBoundingClientRect();
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  }

  function ensureSyncLoop() {
    if (syncLoopRunning) return;
    syncLoopRunning = true;
    requestAnimationFrame(syncLoop);
  }

  function syncLoop() {
    if (covers.size === 0) {
      syncLoopRunning = false;
      return;
    }

    covers.forEach((target, overlay) => {
      if (!target.isConnected) {
        removeCover(overlay);
        return;
      }
      syncOverlayRect(overlay, target);
    });

    requestAnimationFrame(syncLoop);
  }

  function showNotFoundToast() {
    if (!window.toastify) return;

    window.toastify.showToast({
      text: "가릴 요소를 찾지 못했습니다",
      duration: 3000,
      close: true,
      gravity: "bottom",
      position: "right",
    });
  }

  function showCoverToast(overlay) {
    if (!window.toastify) return;

    const text = "요소를 가렸습니다";
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
      node: createUncoverToastNode(text, overlay),
    });
  }

  function createUncoverToastNode(text, overlay) {
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
    undoBtn.innerText = "해제";
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
      removeCover(overlay);
    };

    container.appendChild(undoBtn);
    return container;
  }
})();
