const COMMAND = Object.freeze({
  remove: (element) => {
    element.remove();
  },
  displayNone: (element) => {
    element.style.display = "none";
  },
  visibilityHidden: (element) => {
    element.style.visibility = "hidden";
  },
  injectStyle: (styleText) => (element) => {
    injectStylesheetForAdblock(styleText);
  },
});

const BLOCKED_LIST = [
  {
    selectors: [
      // ".google-auto-placed", // tistory.com
      // ".revenue_unit_wrap", // tistory.com
      // ".adsbygoogle", // tistory.com
      // ".kakao_ad_area", // kakao_ad_area
      // '[id*="criteo"]', // criteo ads
      // "[data-gg-moat]", // diffchecker.com
      // "[class*='ad-google']", // diffchecker.com
      // "script[src*='ads']", // general ads script
      // "iframe[src*='ads']", // general ads iframe
      // "[data-google-query-id]", // general google ads
      // "script[src*='ezad']", // ezad script
      // "script[src*='ezoic']", // ezad script
      // "script[src*='ezodn']", // ezad script
      // "iframe[src*='ezoic']", // general ads iframe
      // "[id*='ezoic']", // general ads iframe
    ],
    origin: "",
    command: COMMAND.remove,
  },
  {
    selectors: [".spacing_log_question_page_ad"],
    origin: "https://www.quora.com",
    command: COMMAND.displayNone,
  },
  {
    selectors: [".ceriad", '[id*="google_ads_iframe"]'],
    origin: "https://tetr.io",
    command: COMMAND.remove,
  },
  {
    selectors: [".fuse-slot"],
    origin: "https://tanstack.com",
    command: COMMAND.injectStyle(`
      .fuse-slot {
        display: none !important;
      `),
  },
];

(function main() {
  if (!document.body) return;

  execute();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;

      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "SCRIPT") {
          execute();
          return;
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();

function execute() {
  BLOCKED_LIST.forEach((blocked) => {
    if (blocked.origin && !window.location.origin.startsWith(blocked.origin)) {
      return;
    }

    blocked.selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        blocked.command(element);

        const message = `[MINTOOL] ad-block "${blocked.command}" is executed on "${selector}"`;

        showToast(message, 3_000);
        console.log(`%c${message}`, `color: #ffa07a`);
      });
    });
  });
}

function injectStylesheetForAdblock(text) {
  const uniqueId = `mintool-adblock-${JSON.stringify(text.trim().replace(/\s+/g, ""))}`;
  if (document.getElementById(uniqueId)) {
    return;
  }

  const style = document.createElement("style");
  style.id = uniqueId;
  style.textContent = text;
  document.head.appendChild(style);
}
