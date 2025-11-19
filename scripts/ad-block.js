const COMMAND = Object.freeze({
  remove: "remove",
  "display: none": "display: none",
});

const BLOCKED_LIST = [
  {
    selectors: [
      ".google-auto-placed", // tistory.com
      ".revenue_unit_wrap", // tistory.com
      ".adsbygoogle", // tistory.com
      ".kakao_ad_area", // kakao_ad_area
      '[id*="criteo"]', // criteo ads
      // "[data-gg-moat]", // diffchecker.com
      // "[class*='ad-google']", // diffchecker.com
      "[data-google-query-id]", // general google ads
      "script[src*='ezad']", // ezad script
      "script[src*='ezoic']", // ezad script
      "script[src*='ezodn']", // ezad script
      "script[src*='ads']", // general ads script
      "script[src*='anyflip']", // general ads script
      "iframe[src*='ads']", // general ads iframe
      "iframe[src*='ezoic']", // general ads iframe
      "[id*='ezoic']", // general ads iframe
    ],
    origin: "",
    command: COMMAND.remove,
  },
  {
    selectors: [".spacing_log_question_page_ad"],
    origin: "https://www.quora.com",
    command: COMMAND["display: none"],
  },
  {
    selectors: [".ceriad", '[id*="google_ads_iframe"]'],
    origin: "https://tetr.io",
    command: COMMAND.remove,
  },
];

const COMMANDS = {
  [COMMAND["display: none"]]: (element) => {
    element.style.display = "none";
  },
  [COMMAND.remove]: (element) => {
    element.remove();
  },
};

(function main() {
  if (!document.body) return;

  execute();

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "childList") {
        execute();
      }
    });
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
        COMMANDS[blocked.command](element);
        showToast(
          `[MINTOOL] "${blocked.command}" is executed on "${selector}"`,
          3_000
        );
      });
    });
  });
}
