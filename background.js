chrome.action.onClicked.addListener((tab) => {
  if (tab.url) {
    chrome.windows.create({
      url: tab.url,
      type: "popup",
      width: 1200,
      height: 800,
    });
  }
});
