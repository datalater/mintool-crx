function addNotificationFilters() {
  return (async function (ctx, domUtils) {
    if (!ctx.isNotificationPage()) return;

    if (document.body.dataset.notificationFiltersEventBound) return;
    document.body.dataset.notificationFiltersEventBound = true;

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

    ctx.cleanups.push(() => {
      document.body.dataset.notificationFiltersEventBound = false;
    });
  })(githubContext, domUtils);
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
