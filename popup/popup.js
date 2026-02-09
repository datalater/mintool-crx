function initI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const message = chrome.i18n.getMessage(key);
    if (message) el.innerText = message;
  });

  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    const message = chrome.i18n.getMessage(key);
    if (message) el.title = message;
  });
}

document.addEventListener("DOMContentLoaded", initI18n);

document.getElementById("open-popup").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab && tab.url) {
    chrome.windows.create({
      url: tab.url,
      type: "popup",
      width: 1200,
      height: 800,
    });
    // Close the small extension popup after action
    window.close();
  }
});
document
  .getElementById("open-qa-scenario")
  .addEventListener("click", async () => {
    chrome.windows.create({
      url: chrome.runtime.getURL("qa-scenario/index.html"),
      type: "popup",
      width: 1400,
      height: 900,
    });
    window.close();
  });
