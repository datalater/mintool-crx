const FEATURE_KEY = "corsBypass";

const toggle = document.getElementById("cors-toggle");
const statusText = document.getElementById("status-text");

function render(enabled) {
  toggle.checked = enabled;
  statusText.textContent = enabled ? "켜짐 — 전역 CORS 헤더 주입 중" : "꺼짐";
  statusText.classList.toggle("is-on", enabled);
}

async function readEnabled() {
  const { features = {} } = await chrome.storage.sync.get("features");
  return features[FEATURE_KEY] === true;
}

async function writeEnabled(enabled) {
  const { features = {} } = await chrome.storage.sync.get("features");
  features[FEATURE_KEY] = enabled;
  await chrome.storage.sync.set({ features });
}

async function init() {
  render(await readEnabled());

  toggle.addEventListener("change", async () => {
    const enabled = toggle.checked;
    render(enabled);
    try {
      await writeEnabled(enabled);
    } catch (error) {
      console.warn("[cors-bypass panel] save failed", error);
      render(await readEnabled());
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.features) return;
    const next = changes.features.newValue || {};
    render(next[FEATURE_KEY] === true);
  });
}

init();
