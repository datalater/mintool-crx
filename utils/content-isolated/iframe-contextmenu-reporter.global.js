// cross-origin iframe(예: 광고) 내부의 우클릭은 top document로 버블링되지 않으므로,
// 모든 프레임에서 contextmenu를 감지해 background로 알립니다.
document.addEventListener(
  "contextmenu",
  () => {
    chrome.runtime.sendMessage({ type: "IFRAME_CONTEXTMENU" });
  },
  true,
);
