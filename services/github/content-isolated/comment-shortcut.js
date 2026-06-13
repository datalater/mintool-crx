function addCommentShortcutsInIssue() {
  const timeout = 5_000;

  const popupOverlaySelector = "[data-component='AnchoredOverlay']";

  const iconButtonSelector = '[data-component="IconButton"][aria-haspopup]';
  const threeDotButtonSelector = `${iconButtonSelector} .octicon-kebab-horizontal`;

  const configs = [
    {
      commentSelector: `[data-testid="issue-body"], [data-timeline-event-id]`,
      threeDotButtonSelector: threeDotButtonSelector,
      editButtonSelector: '[aria-keyshortcuts="e"]',
      cancelButtonSelector: 'button[value="Cancel"]',
    },
  ];

  class ButtonThreeDotComment {
    constructor({ element, config }) {
      this.element = element;
      this.config = config;
    }

    get threeDotButton() {
      const icon = this.element.querySelector(
        this.config.threeDotButtonSelector,
      );
      return icon?.closest(iconButtonSelector) ?? null;
    }

    openThreeDotMenu() {
      this.threeDotButton.click();
    }

    closeThreeDotMenu() {}

    async clickEditButton() {
      const root = await waitForElement(document, popupOverlaySelector, 5000);
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
    if (config.threeDotButtonSelector === threeDotButtonSelector) {
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

function addCommentShortcutsInPr() {
  const timeout = 5_000;

  const configs = [
    {
      commentSelector: ".timeline-comment",
      threeDotButtonSelector: ".timeline-comment-actions .details-overlay",
      editButtonSelector: ".js-comment-edit-button",
      cancelButtonSelector: ".js-comment-cancel-button",
      commentFactoryType: "DetailsThreeDotComment",
    },
    {
      commentSelector: ".review-comment",
      threeDotButtonSelector: ".details-overlay",
      editButtonSelector: ".js-comment-edit-button",
      cancelButtonSelector: ".js-comment-cancel-button",
      commentFactoryType: "DetailsThreeDotComment",
    },
    {
      commentSelector: "[data-first-thread-comment]",
      threeDotButtonSelector: '[data-testid="comment-header-hamburger"]',
      editButtonSelector: "[aria-keyshortcuts='e']",
      cancelButtonSelector: "[data-variant='default']",
      commentFactoryType: "ButtonThreeDotComment",
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
    if (config.commentFactoryType === "DetailsThreeDotComment") {
      return new DetailsThreeDotComment({ element, config });
    }

    if (config.commentFactoryType === "ButtonThreeDotComment") {
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
