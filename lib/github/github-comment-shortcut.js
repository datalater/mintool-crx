function addCommentShortcutsInIssue() {
  return (function () {
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
            threeDotButtonSelector,
          );
          if (!threeDotButton) return;

          threeDotButton.click();
          const targetSelector = editButtonSelector;

          waitForElement(
            document.querySelector(overlayContainerSelector),
            targetSelector,
            timeout,
          ).then((element) => {
            element.click();
          });
        },
      },
      esc: {
        keyPressed: (e) => e.key.toLowerCase() === "escape",
        handler: (currentComment) => {
          const cancelButton =
            currentComment.querySelector(cancelButtonSelector);
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
        cmd.keyPressed(e),
      );
      if (!command) return;

      const [_, { handler }] = command;
      handler(currentComment);
    });
  })();
}

function addCommentShortcutsInPr() {
  return (function () {
    let currentComment = null;
    const timeout = 5_000;

    const threeDotButtonClass = ".details-overlay";
    const newThreeDotButtonSelector =
      '[data-testid="comment-header-hamburger"]';

    const threeDotButtonSelectorJoined = [
      ".details-overlay",
      '[data-testid="comment-header-hamburger"]',
    ].join(", ");

    const commentSelector = [
      `.timeline-comment:has(${threeDotButtonClass})`,
      `.review-comment:has(${threeDotButtonClass})`,
      `[data-first-thread-comment]:has(${newThreeDotButtonSelector})`,
    ].join(", ");

    const editButtonClass = ".js-comment-edit-button, [aria-keyshortcuts='e']";
    const cancelButtonClass =
      ".js-comment-cancel-button, [data-variant='default']";

    const COMMANDS = {
      cmdShiftE: {
        keyPressed: (e) =>
          (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "e",
        handler: async (currentComment) => {
          const threeDotButton = currentComment.querySelector(
            threeDotButtonSelectorJoined,
          );
          if (!threeDotButton) return;

          const targetSelector = editButtonClass;

          if (threeDotButton.matches("button")) {
            threeDotButton.click();

            const root = await waitForElement(
              document,
              "[data-component='AnchoredOverlay']",
              timeout,
            );

            if (!root) return;

            waitForElement(root, targetSelector, timeout).then((element) => {
              element.click();
            });
          }

          if (threeDotButton.matches("details")) {
            threeDotButton.open = "true";

            waitForElement(threeDotButton, targetSelector, timeout).then(
              (element) => {
                element.click();
              },
            );
          }
        },
      },
      esc: {
        keyPressed: (e) => e.key.toLowerCase() === "escape",
        handler: (currentComment) => {
          const threeDotButton = currentComment.querySelector(
            threeDotButtonSelectorJoined,
          );
          if (!threeDotButton) return;

          threeDotButton.open = "";

          const cancelButton = currentComment.querySelector(cancelButtonClass);
          if (!cancelButton) return;

          cancelButton.click();
        },
      },
    };

    document.addEventListener(
      "click",
      (e) => {
        const comment = e.target.closest(commentSelector);
        if (!comment) return;

        currentComment = comment;
        glow(currentComment);
      },
      { capture: true },
    );

    document.addEventListener("keydown", (e) => {
      if (!currentComment) return;

      const command = Object.entries(COMMANDS).find(([_, cmd]) =>
        cmd.keyPressed(e),
      );
      if (!command) return;

      const [_, { handler }] = command;
      handler(currentComment);
    });
  })();
}

function glow(element) {
  setTimeout(() => {
    element.style.transition = "box-shadow 0.3s ease-in-out";
    element.style.boxShadow = "0 0 8px 2px blueviolet";

    setTimeout(() => {
      element.style.boxShadow = "0 0 0 0 blueviolet";

      setTimeout(cleanup, 300);
    }, 900);
  }, 0);

  function cleanup() {
    element.style.transition = "";
    element.style.boxShadow = "";
  }
}
