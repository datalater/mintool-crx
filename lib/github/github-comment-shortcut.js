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
  const timeout = 5_000;

  const configs = [
    {
      commentSelector: ".timeline-comment",
      threeDotButtonSelector: ".details-overlay",
      editButtonSelector: ".js-comment-edit-button",
      cancelButtonSelector: ".js-comment-cancel-button",
    },
    {
      commentSelector: ".review-comment",
      threeDotButtonSelector: ".details-overlay",
      editButtonSelector: ".js-comment-edit-button",
      cancelButtonSelector: ".js-comment-cancel-button",
    },
    {
      commentSelector: "[data-first-thread-comment]",
      threeDotButtonSelector: '[data-testid="comment-header-hamburger"]',
      editButtonSelector: "[aria-keyshortcuts='e']",
      cancelButtonSelector: "[data-variant='default']",
    },
  ];

  class DetailsThreeDotComment {
    constructor({ element, config }) {
      this.element = element;
      this.config = config;
    }

    get threeDotButton() {
      return this.element.querySelector(this.config.threeDotButtonSelector);
    }

    openThreeDotMenu() {
      this.threeDotButton.open = "true";
    }

    closeThreeDotMenu() {
      this.threeDotButton.open = "";
    }

    async clickEditButton() {
      waitForElement(
        this.threeDotButton,
        this.config.editButtonSelector,
        timeout,
      ).then((element) => {
        element.click();
      });
    }

    clickCancelButton() {
      this.closeThreeDotMenu();

      const cancelButton = this.element.querySelector(
        this.config.cancelButtonSelector,
      );
      if (!cancelButton) return;

      cancelButton.click();
    }
  }

  class ButtonThreeDotComment {
    constructor({ element, config }) {
      this.element = element;
      this.config = config;
    }

    get threeDotButton() {
      return this.element.querySelector(this.config.threeDotButtonSelector);
    }

    openThreeDotMenu() {
      this.threeDotButton.click();
    }

    closeThreeDotMenu() {}

    async clickEditButton() {
      const root = await waitForElement(
        document,
        "[data-component='AnchoredOverlay']",
        5000,
      );
      if (!root) return;

      waitForElement(root, this.config.editButtonSelector, timeout).then(
        (element) => {
          element.click();
        },
      );
    }

    clickCancelButton() {
      this.closeThreeDotMenu();

      const cancelButton = this.element.querySelector(
        this.config.cancelButtonSelector,
      );
      if (!cancelButton) return;

      cancelButton.click();
    }
  }

  function CommentFactory({ element, config }) {
    if (config.threeDotButtonSelector === ".details-overlay") {
      return new DetailsThreeDotComment({ element, config });
    }

    if (
      config.threeDotButtonSelector ===
      '[data-testid="comment-header-hamburger"]'
    ) {
      return new ButtonThreeDotComment({ element, config });
    }

    throw new Error("Unknown comment type");
  }

  return (function () {
    let currentComment = null;

    const COMMANDS = {
      cmdShiftE: {
        keyPressed: (e) =>
          (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "e",
        handler: (currentComment) => {
          const threeDotButton = currentComment.threeDotButton;
          if (!threeDotButton) return;

          currentComment.openThreeDotMenu();
          currentComment.clickEditButton();
        },
      },
      esc: {
        keyPressed: (e) => e.key.toLowerCase() === "escape",
        handler: (currentComment) => {
          const threeDotButton = currentComment.threeDotButton;
          if (!threeDotButton) return;

          currentComment.clickCancelButton();
        },
      },
    };

    document.addEventListener(
      "click",
      function setCurrentComment(e) {
        let comment;

        const currentCommentConfig = configs.find((config) => {
          const commentSelectorThatHasThreeDotButton = `${config.commentSelector}:has(${config.threeDotButtonSelector})`;
          comment = e.target.closest(commentSelectorThatHasThreeDotButton);
          return Boolean(comment);
        });

        if (!comment) return;

        currentComment = CommentFactory({
          element: comment,
          config: currentCommentConfig,
        });

        glow(currentComment.element);
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
