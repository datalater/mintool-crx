const BLOCKED_LIST = [
  {
    selectors: [
      ".google-auto-placed", // tistory.com
      ".revenue_unit_wrap", // tistory.com
      ".adsbygoogle", // tistory.com
      "[data-gg-moat]", // diffchecker.com
      "[class*='ad-google']", // diffchecker.com
    ],
    origin: "",
    command: "remove",
  },
  {
    selectors: [".spacing_log_question_page_ad"],
    origin: "https://www.quora.com",
    command: "display: none",
  },
  {
    selectors: [".ceriad", '[id*="google_ads_iframe"]'],
    origin: "https://tetr.io",
    command: "remove",
  },
];

const COMMANDS = {
  "display: none": (element) => {
    element.style.display = "none";
  },
  remove: (element) => {
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
