const JIRA_TICKET_ATTRIBUTE = {
  name: "data-testid",
  value:
    "native-issue-table.common.ui.issue-cells.issue-summary.issue-summary-cell",
};

const COPY_CONTROLS_ID = "jiraTicketCopyControls";
const COPY_CONTROLS_VERTICAL_OFFSET = 8;
const COPY_CONTROLS_HIDE_DELAY_MS = 150;
const COPY_SUCCESS_TOAST_ID = "jiraCopySuccessToast";
const COPY_SUCCESS_TOAST_DISPLAY_DURATION_MS = 2000;

let activeJiraTicketLinkElement = null;
let hideCopyControlsTimeoutId = null;
const jiraCopyControlsElement = createCopyControlsElement();
const jiraCopySuccessToastElement = createCopySuccessToastElement();
let hideCopySuccessToastTimeoutId = null;

document.addEventListener("mousemove", handleDocumentMouseMove);

function handleDocumentMouseMove(mouseEvent) {
  const eventTargetElement = mouseEvent.target;
  const hoveredJiraTicketLinkElement =
    findJiraTicketLinkElement(eventTargetElement);
  const isHoveringCopyControlsElement =
    jiraCopyControlsElement.contains(eventTargetElement);

  if (hoveredJiraTicketLinkElement) {
    clearScheduledHideCopyControlsElement();
    activeJiraTicketLinkElement = hoveredJiraTicketLinkElement;
    positionCopyControlsElement(activeJiraTicketLinkElement);
    showCopyControlsElement();
    return;
  }

  if (isHoveringCopyControlsElement) {
    clearScheduledHideCopyControlsElement();
    return;
  }

  scheduleHideCopyControlsElement();
}

function findJiraTicketLinkElement(startElement) {
  if (!(startElement instanceof Element)) {
    return null;
  }

  const jiraTicketSelector = `[${JIRA_TICKET_ATTRIBUTE.name}="${JIRA_TICKET_ATTRIBUTE.value}"]`;
  return startElement.closest(jiraTicketSelector);
}

function createCopyControlsElement() {
  const copyControlsElement = document.createElement("div");
  copyControlsElement.id = COPY_CONTROLS_ID;
  copyControlsElement.style.position = "absolute";
  copyControlsElement.style.display = "flex";
  copyControlsElement.style.gap = "4px";
  copyControlsElement.style.padding = "4px 8px";
  copyControlsElement.style.backgroundColor = "#172b4d";
  copyControlsElement.style.color = "#ffffff";
  copyControlsElement.style.borderRadius = "4px";
  copyControlsElement.style.fontSize = "12px";
  copyControlsElement.style.fontFamily = "inherit";
  copyControlsElement.style.boxShadow = "0 2px 6px rgba(9, 30, 66, 0.3)";
  copyControlsElement.style.visibility = "hidden";
  copyControlsElement.style.pointerEvents = "none";
  copyControlsElement.style.zIndex = "2147483647";

  const copyLinkButtonElement = createCopyButtonElement(
    "copy link",
    () => activeJiraTicketLinkElement?.href ?? "",
    "Link copied"
  );
  const copyTextButtonElement = createCopyButtonElement(
    "copy text",
    () => (activeJiraTicketLinkElement?.textContent ?? "").trim(),
    "Text copied"
  );

  copyControlsElement.append(copyLinkButtonElement, copyTextButtonElement);

  if (document.body) {
    document.body.appendChild(copyControlsElement);
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      if (!copyControlsElement.isConnected) {
        document.body.appendChild(copyControlsElement);
      }
    });
  }

  return copyControlsElement;
}

function createCopyButtonElement(
  buttonLabel,
  resolveCopyValue,
  copySuccessMessage
) {
  const copyButtonElement = document.createElement("button");
  copyButtonElement.type = "button";
  copyButtonElement.textContent = buttonLabel;
  copyButtonElement.style.backgroundColor = "transparent";
  copyButtonElement.style.border = "none";
  copyButtonElement.style.color = "inherit";
  copyButtonElement.style.cursor = "pointer";
  copyButtonElement.style.font = "inherit";
  copyButtonElement.style.padding = "2px 6px";
  copyButtonElement.style.borderRadius = "3px";

  copyButtonElement.addEventListener("mouseenter", () => {
    copyButtonElement.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
  });

  copyButtonElement.addEventListener("mouseleave", () => {
    copyButtonElement.style.backgroundColor = "transparent";
  });

  copyButtonElement.addEventListener("click", async () => {
    const copyValue = resolveCopyValue();
    if (!copyValue) {
      return;
    }

    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      console.error("Clipboard API unavailable for copy action");
      return;
    }

    try {
      await navigator.clipboard.writeText(copyValue);
      displayCopySuccessToast(copySuccessMessage);
    } catch (clipboardError) {
      console.error(`Failed to copy ${buttonLabel}`, clipboardError);
    }
  });

  return copyButtonElement;
}

function createCopySuccessToastElement() {
  const copySuccessToastElement = document.createElement("div");
  copySuccessToastElement.id = COPY_SUCCESS_TOAST_ID;
  copySuccessToastElement.style.position = "fixed";
  copySuccessToastElement.style.bottom = "24px";
  copySuccessToastElement.style.right = "24px";
  copySuccessToastElement.style.padding = "8px 16px";
  copySuccessToastElement.style.backgroundColor = "#172b4d";
  copySuccessToastElement.style.color = "#ffffff";
  copySuccessToastElement.style.borderRadius = "4px";
  copySuccessToastElement.style.fontSize = "12px";
  copySuccessToastElement.style.fontFamily = "inherit";
  copySuccessToastElement.style.boxShadow = "0 2px 6px rgba(9, 30, 66, 0.3)";
  copySuccessToastElement.style.opacity = "0";
  copySuccessToastElement.style.pointerEvents = "none";
  copySuccessToastElement.style.transition = "opacity 120ms ease";

  if (document.body) {
    document.body.appendChild(copySuccessToastElement);
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      if (!copySuccessToastElement.isConnected) {
        document.body.appendChild(copySuccessToastElement);
      }
    });
  }

  return copySuccessToastElement;
}

function positionCopyControlsElement(jiraTicketLinkElement) {
  if (!jiraTicketLinkElement) {
    return;
  }

  const jiraTicketLinkRect = jiraTicketLinkElement.getBoundingClientRect();
  const copyControlsHeight = jiraCopyControlsElement.offsetHeight || 0;
  const copyControlsTopPosition =
    window.scrollY +
    Math.max(
      4,
      jiraTicketLinkRect.top -
        copyControlsHeight -
        COPY_CONTROLS_VERTICAL_OFFSET
    );
  const copyControlsLeftPosition = window.scrollX + jiraTicketLinkRect.left;

  jiraCopyControlsElement.style.top = `${copyControlsTopPosition}px`;
  jiraCopyControlsElement.style.left = `${copyControlsLeftPosition}px`;
}

function showCopyControlsElement() {
  jiraCopyControlsElement.style.visibility = "visible";
  jiraCopyControlsElement.style.pointerEvents = "auto";
}

function hideCopyControlsElement() {
  jiraCopyControlsElement.style.visibility = "hidden";
  jiraCopyControlsElement.style.pointerEvents = "none";
  activeJiraTicketLinkElement = null;
}

function scheduleHideCopyControlsElement() {
  if (hideCopyControlsTimeoutId !== null) {
    return;
  }

  hideCopyControlsTimeoutId = window.setTimeout(() => {
    hideCopyControlsTimeoutId = null;
    hideCopyControlsElement();
  }, COPY_CONTROLS_HIDE_DELAY_MS);
}

function clearScheduledHideCopyControlsElement() {
  if (hideCopyControlsTimeoutId === null) {
    return;
  }

  window.clearTimeout(hideCopyControlsTimeoutId);
  hideCopyControlsTimeoutId = null;
}

function displayCopySuccessToast(toastMessage) {
  if (!toastMessage) {
    return;
  }

  jiraCopySuccessToastElement.textContent = toastMessage;
  jiraCopySuccessToastElement.style.opacity = "1";

  if (hideCopySuccessToastTimeoutId !== null) {
    window.clearTimeout(hideCopySuccessToastTimeoutId);
  }

  hideCopySuccessToastTimeoutId = window.setTimeout(() => {
    jiraCopySuccessToastElement.style.opacity = "0";
    hideCopySuccessToastTimeoutId = null;
  }, COPY_SUCCESS_TOAST_DISPLAY_DURATION_MS);
}
