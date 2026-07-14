const FEATURES = [
  {
    key: "corsBypass",
    toggleId: "cors-toggle",
    statusId: "cors-status",
    onText: "켜짐 — 전역 CORS 헤더 주입 중",
  },
  {
    key: "consoleToast",
    toggleId: "console-toast-toggle",
    statusId: "console-toast-status",
    onText: "켜짐 — 페이지에 콘솔 토스트 표시",
  },
];

function renderFeature(feature, enabled) {
  const toggle = document.getElementById(feature.toggleId);
  const status = document.getElementById(feature.statusId);
  toggle.checked = enabled;
  status.textContent = enabled ? feature.onText : "꺼짐";
  status.classList.toggle("is-on", enabled);
}

async function readFeatures() {
  const { features = {} } = await chrome.storage.sync.get("features");
  return features;
}

async function writeFeature(key, enabled) {
  const features = await readFeatures();
  features[key] = enabled;
  await chrome.storage.sync.set({ features });
}

function isEnabled(features, key) {
  return features[key] === true;
}

async function init() {
  const features = await readFeatures();

  for (const feature of FEATURES) {
    renderFeature(feature, isEnabled(features, feature.key));

    document
      .getElementById(feature.toggleId)
      .addEventListener("change", async (event) => {
        const enabled = event.target.checked;
        renderFeature(feature, enabled);
        try {
          await writeFeature(feature.key, enabled);
        } catch (error) {
          console.warn("[devtools panel] save failed", feature.key, error);
          const latest = await readFeatures();
          renderFeature(feature, isEnabled(latest, feature.key));
        }
      });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.features) return;
    const next = changes.features.newValue || {};
    for (const feature of FEATURES) {
      renderFeature(feature, isEnabled(next, feature.key));
    }
  });
}

init();
