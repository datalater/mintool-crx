const CORS_BYPASS_FEATURE_KEY = "corsBypass";
const CORS_BYPASS_RULE_ID = 900001;
const CORS_BYPASS_BADGE_COLOR = "#e67e22";

const CORS_BYPASS_RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "csp_report",
  "media",
  "websocket",
  "other",
];

function isCorsBypassEnabled(features = {}) {
  return features[CORS_BYPASS_FEATURE_KEY] === true;
}

function buildCorsBypassRules() {
  return [
    {
      id: CORS_BYPASS_RULE_ID,
      priority: 1,
      action: {
        type: "modifyHeaders",
        responseHeaders: [
          {
            header: "Access-Control-Allow-Origin",
            operation: "set",
            value: "*",
          },
          {
            header: "Access-Control-Allow-Methods",
            operation: "set",
            value: "GET, PUT, POST, DELETE, HEAD, OPTIONS, PATCH",
          },
          {
            header: "Access-Control-Allow-Headers",
            operation: "set",
            value: "*",
          },
          {
            header: "Access-Control-Expose-Headers",
            operation: "set",
            value: "*",
          },
        ],
      },
      condition: {
        urlFilter: "|http",
        resourceTypes: CORS_BYPASS_RESOURCE_TYPES,
      },
    },
  ];
}

async function syncCorsBypassRules(enabled) {
  const removeRuleIds = [CORS_BYPASS_RULE_ID];
  const addRules = enabled ? buildCorsBypassRules() : [];

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules,
    });
  } catch (error) {
    console.warn("[cors-bypass] updateDynamicRules failed", error);
    throw error;
  }

  await updateCorsBypassBadge(enabled);
}

async function updateCorsBypassBadge(enabled) {
  try {
    await chrome.action.setBadgeBackgroundColor({
      color: CORS_BYPASS_BADGE_COLOR,
    });
    await chrome.action.setBadgeText({ text: enabled ? "CORS" : "" });
  } catch (error) {
    console.warn("[cors-bypass] badge update failed", error);
  }
}

async function syncCorsBypassFromStorage() {
  const { features = {} } = await chrome.storage.sync.get("features");
  await syncCorsBypassRules(isCorsBypassEnabled(features));
}
