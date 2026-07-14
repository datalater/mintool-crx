importScripts(
  "services/bookmarklets/view-grid.global.js",
  "services/bookmarklets/registry.global.js",
  "services/cors-bypass/rules.global.js",
);

const MENU_IDS = {
  PARENT: "mintool-parent",
  BOOKMARKLETS_PARENT: "bookmarklets",
  REMOVE_DOM: "remove-dom",
  HIDE_DOM: "hide-dom",
  COVER_DOM: "cover-dom",
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
  syncCorsBypassFromStorage().catch((error) => {
    console.warn("[background] cors bypass sync onInstalled failed", error);
  });

  chrome.contextMenus.create({
    id: MENU_IDS.PARENT,
    title: "MinTool",
    contexts: ["all"],
  });

  chrome.contextMenus.create({
    id: MENU_IDS.BOOKMARKLETS_PARENT,
    parentId: MENU_IDS.PARENT,
    title: "북마클릿",
    contexts: ["all"],
  });

  MINTOOL_BOOKMARKLETS.forEach((bookmarklet) => {
    chrome.contextMenus.create({
      id: getBookmarkletMenuId(bookmarklet.id),
      parentId: MENU_IDS.BOOKMARKLETS_PARENT,
      title: bookmarklet.title,
      contexts: ["all"],
    });
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
    id: MENU_IDS.COVER_DOM,
    parentId: MENU_IDS.PARENT,
    title: "DOM 가리기 (덮어서 숨김)",
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
  [MENU_IDS.REMOVE_DOM]: "domEraser",
  [MENU_IDS.HIDE_DOM]: "domEraser",
  [MENU_IDS.UNDO_DOM]: "domEraser",
  [MENU_IDS.COVER_DOM]: "domCoverer",
  [MENU_IDS.EDIT_STYLE]: "domStyleEditor",
  [MENU_IDS.VIRTUAL_FULLSCREEN]: "virtualFullscreen",
};

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  const featureKey = MENU_FEATURE_MAP[info.menuItemId];
  if (featureKey) {
    const { features = {} } = await chrome.storage.sync.get("features");
    if (features[featureKey] === false) return;
  }

  if (
    [MENU_IDS.REMOVE_DOM, MENU_IDS.HIDE_DOM, MENU_IDS.UNDO_DOM].includes(
      info.menuItemId,
    )
  ) {
    const action = info.menuItemId.replace("-dom", "");
    const frameUrl = await resolveTopChildFrameUrl(tab.id, info.frameId);
    chrome.tabs.sendMessage(tab.id, { action, frameUrl });
    return;
  }

  if (info.menuItemId === MENU_IDS.COVER_DOM) {
    const frameUrl = await resolveTopChildFrameUrl(tab.id, info.frameId);
    chrome.tabs.sendMessage(tab.id, { action: "cover", frameUrl });
    return;
  }

  if (info.menuItemId === MENU_IDS.EDIT_STYLE) {
    const frameUrl = await resolveTopChildFrameUrl(tab.id, info.frameId);
    chrome.tabs.sendMessage(tab.id, { action: "edit-style", frameUrl });
    return;
  }

  if (info.menuItemId === MENU_IDS.VIRTUAL_FULLSCREEN) {
    const enabled = await getVirtualFullscreenState(tab.id);
    await setVirtualFullscreenEnabled(tab.id, !enabled);
    return;
  }

  const bookmarklet = getBookmarkletByMenuId(info.menuItemId);
  if (bookmarklet) {
    await runBookmarklet(tab, bookmarklet, info.frameId);
  }
});

chrome.runtime.onStartup.addListener(() => {
  syncCorsBypassFromStorage().catch((error) => {
    console.warn("[background] cors bypass sync onStartup failed", error);
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.features) return;

  const enabled = isCorsBypassEnabled(changes.features.newValue || {});
  syncCorsBypassRules(enabled).catch((error) => {
    console.warn("[background] cors bypass sync onChanged failed", error);
  });
});

syncCorsBypassFromStorage().catch((error) => {
  console.warn("[background] cors bypass sync on load failed", error);
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "UPDATE_UNDO_MENU") {
    chrome.contextMenus.update(MENU_IDS.UNDO_DOM, {
      title: message.description
        ? `복원하기 (${message.description})`
        : "복원하기 (없음)",
      enabled: !!message.description,
    });
    return;
  }

  if (message.type === "IFRAME_CONTEXTMENU") {
    notifyTopFrameOfIframeContextmenu(sender);
    return;
  }
});

async function notifyTopFrameOfIframeContextmenu(sender) {
  if (!sender.tab?.id) return;

  const frameUrl = await resolveTopChildFrameUrl(sender.tab.id, sender.frameId);
  if (!frameUrl) return;

  chrome.tabs
    .sendMessage(sender.tab.id, { action: "highlight-frame", frameUrl })
    .catch(() => {});
}

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
    console.warn(
      "[background] virtual fullscreen toggle delivery failed",
      error,
    );
  }
}

async function resolveTopChildFrameUrl(tabId, frameId) {
  if (!frameId) return null;

  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    const frameMap = new Map(frames.map((frame) => [frame.frameId, frame]));
    return findTopChildFrameUrl(frameMap, frameMap.get(frameId));
  } catch (error) {
    console.warn("[background] resolveTopChildFrameUrl failed", error);
    return null;
  }
}

function findTopChildFrameUrl(frameMap, frame) {
  if (!frame) return null;
  if (frame.parentFrameId === 0) return frame.url;
  return findTopChildFrameUrl(frameMap, frameMap.get(frame.parentFrameId));
}

function getBookmarkletMenuId(bookmarkletId) {
  return `bookmarklet:${bookmarkletId}`;
}

function getBookmarkletByMenuId(menuItemId) {
  const bookmarkletId = String(menuItemId).replace(/^bookmarklet:/, "");

  if (bookmarkletId === menuItemId) return null;
  return MINTOOL_BOOKMARKLETS.find(
    (bookmarklet) => bookmarklet.id === bookmarkletId,
  );
}

async function runBookmarklet(tab, bookmarklet, frameId) {
  if (!isSupportedTab(tab)) return;

  // 우클릭한 프레임(iframe 내부 포함)에 직접 주입합니다. frameId가 0이거나
  // 없으면 top frame을 대상으로 합니다.
  const target = { tabId: tab.id };
  if (frameId) target.frameIds = [frameId];

  try {
    await chrome.scripting.executeScript({
      target,
      files: [
        "utils/content-isolated/popup.global.js",
        "services/bookmarklets/view-grid.global.js",
        "services/bookmarklets/registry.global.js",
      ],
    });
    await chrome.scripting.executeScript({
      target,
      args: [bookmarklet.id],
      func: function runBookmarkletById(bookmarkletId) {
        const bookmarklet = MINTOOL_BOOKMARKLETS.find(
          (item) => item.id === bookmarkletId,
        );

        if (bookmarklet) bookmarklet.run();
      },
    });
  } catch (error) {
    console.warn("[background] bookmarklet execution failed", error);
  }
}

function isSupportedTab(tab) {
  if (!tab?.url) return false;
  return /^https?:/i.test(tab.url);
}
