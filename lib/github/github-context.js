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

  isAuthorDatalater: function () {
    return Boolean(
      document.querySelector("a.author").textContent === "datalater"
    );
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

  addAutoRefreshEvent: function () {
    const shouldRefresh = this.isPullsPage() || this.isNotificationPage();
    if (!shouldRefresh) return;

    if (document.body.dataset.autoRefreshEventBound) return;
    document.body.dataset.autoRefreshEventBound = true;

    document.addEventListener("visibilitychange", visibilityChangeHandler);

    this.cleanups.push(() => {
      document.removeEventListener("visibilitychange", visibilityChangeHandler);
      document.body.dataset.autoRefreshEventBound = false;
    });

    function visibilityChangeHandler() {
      if (document.hidden) return;
      if (!document.body.dataset.autoRefreshEventBound) return;

      showToast("Page refreshed", 2000);
      domUtils.refresh();
    }
  },

  addNotificationFiltersAttachEvent: function () {
    if (!this.isNotificationPage()) return;

    if (document.body.dataset.notificationFiltersEventBound) return;
    document.body.dataset.notificationFiltersEventBound = true;

    document.addEventListener("turbo:render", () => {
      this.addNotificationFilters();
    });
  },

  addNotificationFilters: async function () {
    if (!this.isNotificationPage()) return;

    await domUtils.waitForDomLoaded();

    const filtersList = document.querySelector(
      "[aria-label='Filters'] .ActionListWrap"
    );

    const customFilters = [
      {
        selector: ".octicon-git-merge",
        emoji: "🟣",
        text: "Review merged",
      },
    ];

    customFilters.forEach((filter) => {
      const count = Array.from(document.querySelectorAll(filter.selector))
        .map((merged) => {
          return merged.closest(".notifications-list-item");
        })
        .filter(Boolean).length;

      if (!count) return;

      const id = `custom-filter-${filter.selector}`;

      const currentFilter = filtersList.querySelector(`#${id}`);
      const newFilter = newFilterButton({
        selector: filter.selector,
        emoji: filter.emoji,
        text: filter.text,
        count,
      });

      if (currentFilter) {
        currentFilter.replaceWith(newFilter);
      } else {
        filtersList.appendChild(newFilter);
      }
    });
  },

  addCommentShortcutsInIssue,
  addCommentShortcutsInPr,
};

function addCommentShortcutsInIssue() {
  let currentComment = null;
  const timeout = 5_000;

  const threeDotButtonSelector =
    '[data-component="IconButton"][aria-haspopup]:has(.octicon-kebab-horizontal)';
  const commentSelector = `[data-testid="issue-body"], [data-timeline-event-id]`;
  const overlayContainerSelector = "#__primerPortalRoot__";
  const editButtonSelector = '[aria-keyshortcuts="e"]';
  const cancelButtonSelector = 'button[value="Cancel"]';

  const COMMANDS = {
    cmdShiftE: {
      keyPressed: (e) =>
        (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "e",
      handler: (currentComment) => {
        const threeDotButton = currentComment.querySelector(
          threeDotButtonSelector
        );
        if (!threeDotButton) return;

        threeDotButton.click();
        const targetSelector = editButtonSelector;

        waitForElement(
          document.querySelector(overlayContainerSelector),
          targetSelector,
          timeout
        ).then((element) => {
          element.click();
        });
      },
    },
    esc: {
      keyPressed: (e) => e.key.toLowerCase() === "escape",
      handler: (currentComment) => {
        const cancelButton = currentComment.querySelector(cancelButtonSelector);
        if (!cancelButton) return;

        cancelButton.click();
      },
    },
  };

  document.addEventListener("click", (e) => {
    const comment = e.target.closest(commentSelector);
    if (!comment) return;

    currentComment = comment;
    glow(currentComment);
  });

  document.addEventListener("keydown", (e) => {
    if (!currentComment) return;

    const command = Object.entries(COMMANDS).find(([_, cmd]) =>
      cmd.keyPressed(e)
    );
    if (!command) return;

    const [_, { handler }] = command;
    handler(currentComment);
  });

  function glow(element) {
    setTimeout(() => {
      element.style.transition = "box-shadow 0.3s ease-in-out";
      element.style.boxShadow = "0 0 8px 2px blueviolet";

      setTimeout(() => {
        element.style.boxShadow = "0 0 0 0 blueviolet";

        // Clean up styles after animation
        setTimeout(() => {
          element.style.transition = "";
          element.style.boxShadow = "";
        }, 300);
      }, 900);
    }, 0);
  }
}

function addCommentShortcutsInPr() {
  let currentComment = null;
  const timeout = 10_000;

  const threeDotButtonClass = ".details-overlay";
  const commentClass = `.timeline-comment:has(${threeDotButtonClass}), .review-comment:has(${threeDotButtonClass})`;
  const editButtonClass = ".js-comment-edit-button";
  const cancelButtonClass = ".js-comment-cancel-button";

  const COMMANDS = {
    cmdShiftE: {
      keyPressed: (e) =>
        (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "e",
      handler: (currentComment) => {
        const threeDotButton =
          currentComment.querySelector(threeDotButtonClass);
        if (!threeDotButton) return;

        threeDotButton.open = "true";
        const targetSelector = editButtonClass;

        waitForElement(threeDotButton, targetSelector, timeout).then(
          (element) => {
            element.click();
          }
        );
      },
    },
    esc: {
      keyPressed: (e) => e.key.toLowerCase() === "escape",
      handler: (currentComment) => {
        const threeDotButton =
          currentComment.querySelector(threeDotButtonClass);
        if (!threeDotButton) return;

        threeDotButton.open = "";

        const cancelButton = currentComment.querySelector(cancelButtonClass);
        if (!cancelButton) return;

        cancelButton.click();
      },
    },
  };

  document.addEventListener("click", (e) => {
    const comment = e.target.closest(commentClass);
    if (!comment) return;

    currentComment = comment;
    glow(currentComment);
  });

  document.addEventListener("keydown", (e) => {
    if (!currentComment) return;

    const command = Object.entries(COMMANDS).find(([_, cmd]) =>
      cmd.keyPressed(e)
    );
    if (!command) return;

    const [_, { handler }] = command;
    handler(currentComment);
  });

  function glow(element) {
    setTimeout(() => {
      element.style.transition = "box-shadow 0.3s ease-in-out";
      element.style.boxShadow = "0 0 8px 2px blueviolet";

      setTimeout(() => {
        element.style.boxShadow = "0 0 0 0 blueviolet";

        // Clean up styles after animation
        setTimeout(() => {
          element.style.transition = "";
          element.style.boxShadow = "";
        }, 300);
      }, 900);
    }, 0);
  }
}

function newFilterButton({
  selector,
  emoji = "💬",
  text = "new filter",
  count = 0,
} = {}) {
  if (!selector) throw new Error("[newFilterButton] selector is required");

  const id = `custom-filter-${selector}`;

  const newFilterButton = templateToElement(/* html */ `
      <button id=${id} data-view-component="true" class="ActionListContent">
        <span data-view-component="true" class="ActionListItem-label">
          ${emoji} ${text}
        </span>

        ${
          Boolean(count)
            ? `<span class="ActionListItem-visual ActionListItem-visual--trailing">
                <span title="${count}" data-view-component="true" class="Counter">${count}</span>
              </span>`
            : ""
        }
      </button>`);

  newFilterButton.addEventListener("click", () => {
    Array.from(document.querySelectorAll(".notifications-list-item")).forEach(
      (li) => {
        if (!li.querySelector(selector)) {
          li.remove();
        }
      }
    );
  });

  return newFilterButton;
}
