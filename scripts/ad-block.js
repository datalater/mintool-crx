const BLOCKED_LIST = [
  {
    selectors: [".google-auto-placed", ".revenue_unit_wrap", ".adsbygoogle"],
    origin: "", // tistory
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
