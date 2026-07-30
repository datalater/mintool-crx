const colors = {
  default: "#aaa",
  primary: "#007bff",
  green: "#4CAF50",
};

const VERSION = chrome.runtime.getManifest().version;

function log(msg) {
  console.log(
    `%c[MINTOOL v${VERSION}] ${JSON.stringify(msg, null, 2)}`,
    `color: ${colors.green}`
  );
}

log("Content script loaded");
