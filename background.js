chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "mintool-parent",
    title: "MinTool",
    contexts: ["all"],
  });

  chrome.contextMenus.create({
    id: "remove-dom",
    parentId: "mintool-parent",
    title: "DOM 제거하기",
    contexts: ["all"],
  });

  chrome.contextMenus.create({
    id: "hide-dom",
    parentId: "mintool-parent",
    title: "DOM 숨기기",
    contexts: ["all"],
  });

  chrome.contextMenus.create({
    id: "undo-dom",
    parentId: "mintool-parent",
    title: "복원하기 (없음)",
    contexts: ["all"],
    enabled: false,
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (["remove-dom", "hide-dom", "undo-dom"].includes(info.menuItemId)) {
    const action = info.menuItemId.replace("-dom", "");
    chrome.tabs.sendMessage(tab.id, { action });
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "UPDATE_UNDO_MENU") {
    chrome.contextMenus.update("undo-dom", {
      title: message.description
        ? `복원하기 (${message.description})`
        : "복원하기 (없음)",
      enabled: !!message.description,
    });
  }
});
