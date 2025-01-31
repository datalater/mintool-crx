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
  addCommentShortcutsInIssue();
  addCommentShortcutsInPr();

  addPrCommitLinksAutoEmbed();
})();

async function addPrCommitLinksAutoEmbed() {
  if (!isPullDetailPage()) return;
  if (!isAuthorDatalater()) return;

  await waitForDomLoaded();

  const timeout = 10_000;

  // TODO: regex에 동적으로 넣어야 한다.
  const titleForCommitLinks = "리뷰 요청 항목";

  const prBodyClass = ".js-command-palette-pull-body";
  const prBody = document.querySelector(prBodyClass);

  if (!prBody) return;

  const prPushedCommitClass =
    ".TimelineItem:has(.octicon-git-commit) .markdown-title[href*='/pull/'][href*='/commits/']";
  const prPushedCommits = document.querySelectorAll(prPushedCommitClass);
  const uniquePrPushedCommits = Array.from(prPushedCommits).filter(
    (commit, index, self) =>
      index === self.findIndex((t) => t.href === commit.href)
  );

  if (isPrCommitsIncluded(uniquePrPushedCommits)) return;

  const confirmed = confirm(
    "PR 설명에 PR 커밋이 모두 포함되지 않았습니다. 업데이트하시겠습니까? (기존 내용은 콘솔에 출력됩니다)"
  );
  if (!confirmed) return;

  await enterEditMode();
  await insertPrCommits();
  updateComment();

  function enterEditMode() {
    const threeDotButtonClass = ".details-overlay";
    const editButtonClass = ".js-comment-edit-button";

    const threeDotButton = prBody.querySelector(threeDotButtonClass);
    threeDotButton.open = "true";

    return new Promise((resolve) => {
      waitForElement(threeDotButton, editButtonClass, timeout).then(
        (editButton) => {
          editButton.click();
          resolve();
        }
      );
    });
  }

  function insertPrCommits() {
    const PR_COMMITS_SLOT_RE = /## 리뷰 요청 항목[\s\S]*?##/;

    const prBodyTextareaClass = 'textarea[name="pull_request[body]"]';

    return new Promise((resolve) => {
      waitForElement(prBody, prBodyTextareaClass, timeout).then(
        (prBodyTextarea) => {
          const originalValue = prBodyTextarea.value;
          console.log(originalValue);

          // TODO: 내용을 덮어쓰면 기존에 추가된 설명이 사라질 수 있다. 따라서 덮어쓰지 않고 더 나은 방식으로 업데이트할 수 있을지 고민해보자.
          const newValue = originalValue.replace(
            PR_COMMITS_SLOT_RE,
            `## 리뷰 요청 항목\n\n${uniquePrPushedCommits
              .map(
                (commit) =>
                  `- [${commit
                    .closest("code")
                    .textContent.trim()
                    .replace(/\[/g, "\\[")
                    .replace(/\]/g, "\\]")}](${commit.href})`
              )
              .join("\n")}\n\n##`
          );

          prBodyTextarea.value = newValue;
          resolve();
        }
      );
    });
  }

  function updateComment() {
    const submitButtonClass = "button[type='submit']";
    const submitButton = prBody.querySelector(submitButtonClass);
    submitButton.click();
  }

  function isPrCommitsIncluded(uniquePrPushedCommits) {
    return uniquePrPushedCommits.every((commit) =>
      Boolean(prBody.querySelector(`a[href*="${commit.href}"]`))
    );
  }
}

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

function addCommentShortcutsInIssue() {
  let currentComment = null;
  const timeout = 10_000;

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

function isPullDetailPage() {
  return location.pathname.includes("/pull/");
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

function isMergedPr() {
  return Boolean(document.querySelector('[title="Status: Merged"]'));
}

function isAuthorDatalater() {
  return Boolean(
    document.querySelector("a.author").textContent === "datalater"
  );
}
