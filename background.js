const MENU_IDS = {
  PARENT: "mintool-parent",
  REMOVE_DOM: "remove-dom",
  HIDE_DOM: "hide-dom",
  EDIT_STYLE: "edit-style",
  VIRTUAL_FULLSCREEN: "virtual-fullscreen",
  UNDO_DOM: "undo-dom",
};

const VIRTUAL_FULLSCREEN_ACTIONS = {
  GET_STATE: "virtual-fullscreen-get-state",
  SET_ENABLED: "virtual-fullscreen-set-enabled",
};

const VIRTUAL_FULLSCREEN_MENU_TITLE = "전체 화면을 창 내부로 제한하기 토글";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_IDS.PARENT,
    title: "MinTool",
    contexts: ["all"],
  });

  chrome.contextMenus.create({
    id: MENU_IDS.REMOVE_DOM,
    parentId: MENU_IDS.PARENT,
    title: "DOM 제거하기",
    contexts: ["all"],
  });

  chrome.contextMenus.create({
    id: MENU_IDS.HIDE_DOM,
    parentId: MENU_IDS.PARENT,
    title: "DOM 숨기기",
    contexts: ["all"],
  });

  chrome.contextMenus.create({
    id: MENU_IDS.EDIT_STYLE,
    parentId: MENU_IDS.PARENT,
    title: "DOM 스타일 편집하기",
    contexts: ["all"],
  });

  chrome.contextMenus.create({
    id: MENU_IDS.VIRTUAL_FULLSCREEN,
    parentId: MENU_IDS.PARENT,
    title: VIRTUAL_FULLSCREEN_MENU_TITLE,
    contexts: ["all"],
  });

  chrome.contextMenus.create({
    id: MENU_IDS.UNDO_DOM,
    parentId: MENU_IDS.PARENT,
    title: "복원하기 (없음)",
    contexts: ["all"],
    enabled: false,
  });
});

const MENU_FEATURE_MAP = {
  [MENU_IDS.REMOVE_DOM]: 'domEraser',
  [MENU_IDS.HIDE_DOM]: 'domEraser',
  [MENU_IDS.UNDO_DOM]: 'domEraser',
  [MENU_IDS.EDIT_STYLE]: 'domStyleEditor',
  [MENU_IDS.VIRTUAL_FULLSCREEN]: 'virtualFullscreen',
};

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  const featureKey = MENU_FEATURE_MAP[info.menuItemId];
  if (featureKey) {
    const { features = {} } = await chrome.storage.sync.get('features');
    if (features[featureKey] === false) return;
  }

  if ([MENU_IDS.REMOVE_DOM, MENU_IDS.HIDE_DOM, MENU_IDS.UNDO_DOM].includes(info.menuItemId)) {
    const action = info.menuItemId.replace("-dom", "");
    chrome.tabs.sendMessage(tab.id, { action });
    return;
  }

  if (info.menuItemId === MENU_IDS.EDIT_STYLE) {
    chrome.tabs.sendMessage(tab.id, { action: "edit-style" });
    return;
  }

  if (info.menuItemId === MENU_IDS.VIRTUAL_FULLSCREEN) {
    const enabled = await getVirtualFullscreenState(tab.id);
    await setVirtualFullscreenEnabled(tab.id, !enabled);
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "UPDATE_UNDO_MENU") {
    chrome.contextMenus.update(MENU_IDS.UNDO_DOM, {
      title: message.description
        ? `복원하기 (${message.description})`
        : "복원하기 (없음)",
      enabled: !!message.description,
    });
    return;
  }
});

async function getVirtualFullscreenState(tabId) {
  if (!Number.isInteger(tabId)) return false;

  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      action: VIRTUAL_FULLSCREEN_ACTIONS.GET_STATE,
    });
    return Boolean(response?.enabled);
  } catch (error) {
    return false;
  }
}

async function setVirtualFullscreenEnabled(tabId, enabled) {
  if (!Number.isInteger(tabId)) return;

  try {
    await chrome.tabs.sendMessage(tabId, {
      action: VIRTUAL_FULLSCREEN_ACTIONS.SET_ENABLED,
      enabled: Boolean(enabled),
    });
  } catch (error) {
    console.warn("[background] virtual fullscreen toggle delivery failed", error);
  }
}

function isSupportedTab(tab) {
  if (!tab?.url) return false;
  return /^https?:/i.test(tab.url);
}
