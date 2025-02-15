const githubContext = {
  debug: false,

  cleanups: [],

  cleanup: function () {
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];

    const datasetList = [
      "autoRefreshEventBound",
      "notificationFiltersEventBound",
    ];

    datasetList.forEach((dataset) => {
      delete document.body.dataset[dataset];
    });
  },

  isGitHubPage: function () {
    return location.hostname === "github.com";
  },
  isPullsPage: function () {
    return location.pathname.includes("/pulls");
  },
  isPullDetailPage: function () {
    return location.pathname.includes("/pull/");
  },
  isNotificationPage: function () {
    return location.pathname.includes("/notifications");
  },

  isMergedPr: function () {
    return Boolean(document.querySelector('[title="Status: Merged"]'));
  },

  isMyPr: function () {
    const prAuthor = document
      .querySelector('.timeline-comment-group[id^="pullrequest-"]')
      ?.querySelector("a.author")?.textContent;

    const loginUser = document.querySelector(
      'meta[name="octolytics-actor-login"]'
    )?.content;

    return Boolean(loginUser && loginUser === prAuthor);
  },

  injectStyles: function () {
    {
      const style = document.createElement("style");
      style.id = "mintool-github-style";

      style.innerHTML = /* css */ `
        .pull-discussion-timeline a:visited:visited:visited[href*="commits"] {
          color: blueviolet;
        }
      `;

      document.head.appendChild(style);
    }
  },

  observerUrlChange: function (handler) {
    const targetNode = document.body;

    const observer = new MutationObserver(() => {
      if (location.href !== observer.lastUrl) {
        if (observer.timer) cancelAnimationFrame(observer.timer);

        observer.timer = requestAnimationFrame(() => {
          observer.lastUrl = location.href;

          handler?.();
        });
      }
    });

    observer.lastUrl = location.href;
    observer.observe(targetNode, { childList: true, subtree: true });
  },

  addTurboRenderEvent: function (handler) {
    document.addEventListener("turbo:render", handler);
  },

  addAutoRefreshEvent: () => addAutoRefreshEvent(),

  addNotificationFilters: () => addNotificationFilters(),

  addCommentShortcutsInIssue: () => addCommentShortcutsInIssue(),

  addCommentShortcutsInPr: () => addCommentShortcutsInPr(),

  addPrCommitLinksAutoEmbed: () => addPrCommitLinksAutoEmbed(),
};
