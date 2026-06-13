var MINTOOL_CONTENT_POPUP = Object.freeze({
  show: function show(text) {
    const existingPopup = document.querySelector("[data-copyable-popup]");
    if (existingPopup) existingPopup.remove();

    const popup = document.createElement("div");
    popup.dataset.copyablePopup = "true";
    popup.style.position = "fixed";
    popup.style.top = "24px";
    popup.style.right = "24px";
    popup.style.zIndex = "999999";
    popup.style.width = "520px";
    popup.style.maxWidth = "calc(100vw - 48px)";
    popup.style.maxHeight = "calc(100vh - 48px)";
    popup.style.padding = "12px";
    popup.style.background = "white";
    popup.style.border = "1px solid #ddd";
    popup.style.borderRadius = "8px";
    popup.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.18)";

    const closeButton = document.createElement("button");
    closeButton.textContent = "Close";
    closeButton.style.all = "revert";
    closeButton.style.marginBottom = "8px";
    closeButton.addEventListener("click", () => {
      popup.remove();
    });

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.readOnly = true;
    textarea.style.width = "100%";
    textarea.style.overflow = "auto";
    textarea.style.height = "320px";
    textarea.style.boxSizing = "border-box";
    textarea.style.resize = "none";
    textarea.style.fontFamily = "monospace";
    textarea.style.fontSize = "13px";
    textarea.style.lineHeight = "1.5";

    popup.appendChild(closeButton);
    popup.appendChild(textarea);
    document.body.appendChild(popup);
    textarea.focus();
    textarea.select();
  },
});
