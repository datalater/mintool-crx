(function main() {
  if (!isGitHubPage()) return;

  injectStyles();

  addAutoRefreshEvent();
  addNotificationFiltersAttachEvent();

  addNotificationFilters();

  /**************************************************/
  /*                                                */
  /* shortcut                                       */
  /*                                                */
  /**************************************************/
  addCommentShortcuts();
})();

function injectStyles() {
  const style = document.createElement("style");
  style.id = "mintool-github-style";

  style.innerHTML = /* css */ `
    .pull-discussion-timeline a:visited:visited:visited[href*="commits"] {
      color: blueviolet;
    }
  `;

  document.head.appendChild(style);
}

function addAutoRefreshEvent() {
  if (!(isPullsPage() || isNotificationPage())) return;

  if (document.body.dataset.autoRefreshEventBound) return;
  document.body.dataset.autoRefreshEventBound = true;

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;

    showToast("Page refreshed", 2000);
    refresh();
  });
}

function addNotificationFiltersAttachEvent() {
  if (!isNotificationPage()) return;

  if (document.body.dataset.notificationFiltersEventBound) return;
  document.body.dataset.notificationFiltersEventBound = true;

  document.addEventListener("turbo:render", () => {
    addNotificationFilters();
  });
}

async function addNotificationFilters() {
  if (!isNotificationPage()) return;

  await waitForDomLoaded();

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
}

function addCommentShortcuts() {
  let currentComment = null;
  const timeout = 10_000;

  const threeDotButtonClass = ".details-overlay";
  const timelineCommentClass = `.timeline-comment:has(${threeDotButtonClass})`;
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
    const comment = e.target.closest(timelineCommentClass);
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

///////////////////////////////////////////////

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

function refresh() {
  location.reload();
}

function isGitHubPage() {
  return location.hostname === "github.com";
}

function isPullsPage() {
  return location.pathname.includes("/pulls");
}

function isNotificationPage() {
  return location.pathname.includes("/notifications");
}

async function waitForDomLoaded() {
  return new Promise((resolve) => {
    if (document.readyState === "complete") {
      resolve();
      return;
    }

    window.addEventListener("load", resolve);
  });
}
