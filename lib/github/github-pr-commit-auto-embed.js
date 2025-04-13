function addPrCommitLinksAutoEmbed() {
  const selectors = Object.freeze({
    prBody: "[id*='pullrequest']",
    prPushedCommit:
      ".TimelineItem:has(.octicon-git-commit) .markdown-title[href*='/pull/'][href*='/commits/']",
    prBodyTextarea: 'textarea[name="pull_request[body]"]',

    threeDotButton: ".details-overlay",
    editButton: ".js-comment-edit-button",
    submitButton: "button[type='submit']",

    isCommentEditingClass: "is-comment-editing",
  });

  const timeout = 5_000;

  return (async function (ctx, domUtils, vueMin) {
    if (!ctx.isPullDetailPage()) return;
    if (!ctx.isMyPr()) return;
    if (ctx.isMergedPr()) return;

    await domUtils.waitForDomLoaded();

    const { ref, watch } = vueMin;

    const isPrBodyEditing = ref(false);

    let prBody = document.querySelector(selectors.prBody);
    if (!prBody) return;

    observeIsPrBodyEditing({
      callback: (isEditing) => {
        isPrBodyEditing.value = isEditing;
      },
    });

    displayAutoEmbedSectionInSidebar({
      onClickSync: syncPrCommits,
      onCheckPrCommitsIncluded: checkPrCommitsIncluded,
    });

    watch(isPrBodyEditing, function update() {
      displayAutoEmbedSectionInSidebar({
        onClickSync: syncPrCommits,
        onCheckPrCommitsIncluded: checkPrCommitsIncluded,
      });
    });

    function observeIsPrBodyEditing({ callback }) {
      let observer = null;

      const setupObserver = () => {
        if (observer) {
          observer.disconnect();
        }

        observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.attributeName === "class") {
              const isEditing = mutation.target.classList.contains(
                selectors.isCommentEditingClass
              );
              callback(isEditing);
            }
          });
        });

        observer.observe(prBody, { attributeFilter: ["class"] });
      };

      setupObserver();

      const bodyObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.removedNodes.length > 0) {
            const newPrBody = document.querySelector(selectors.prBody);
            if (newPrBody && newPrBody !== prBody) {
              prBody = newPrBody;
              setupObserver();
            }
          }
        });
      });

      bodyObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    function getUniquePrPushedCommits() {
      const prPushedCommits = document.querySelectorAll(
        selectors.prPushedCommit
      );
      const uniquePrPushedCommits = Array.from(prPushedCommits).filter(
        (commit, index, self) =>
          index === self.findIndex((t) => t.href === commit.href)
      );

      return uniquePrPushedCommits;
    }

    function checkPrCommitsIncluded() {
      return isPrCommitsIncluded(getUniquePrPushedCommits());
    }

    async function syncPrCommits() {
      const uniquePrPushedCommits = getUniquePrPushedCommits();

      if (isPrCommitsIncluded(uniquePrPushedCommits)) {
        showToast("PR 커밋이 본문에 이미 포함되어 있습니다.");
        return;
      }

      const confirmed = confirm(
        "PR 설명에 PR 커밋이 모두 포함되지 않았습니다. 업데이트하시겠습니까? (기존 내용은 콘솔에 출력됩니다)"
      );
      if (!confirmed) return;

      await enterEditMode();
      await insertPrCommits();
      updateComment();

      function enterEditMode() {
        const threeDotButton = prBody.querySelector(selectors.threeDotButton);
        threeDotButton.open = "true";

        return new Promise((resolve) => {
          waitForElement(threeDotButton, selectors.editButton, timeout).then(
            (editButton) => {
              editButton.click();
              resolve();
            }
          );
        });
      }
    }

    function insertPrCommits() {
      const uniquePrPushedCommits = getUniquePrPushedCommits();

      const SLOT_RE = /(<!-- slot-start -->\n)([\s\S]*?)(<!-- slot-end -->)/;

      return new Promise((resolve) => {
        waitForElement(prBody, selectors.prBodyTextarea, timeout).then(
          (prBodyTextarea) => {
            const originalValue = prBodyTextarea.value;
            console.group("%c원본 PR 본문", "color: #7fe787;");
            console.log(originalValue);
            console.groupEnd();

            const slotMatch = originalValue.match(SLOT_RE);
            if (!slotMatch) {
              const noSlotMessage =
                "`&lt;!-- slot-start --&gt;` 와 `&lt;!-- slot-end --&gt;` 영역을 찾지 못했습니다.";
              showToast(noSlotMessage, 5000);
              resolve();
              return;
            }

            const newCommitLines = uniquePrPushedCommits.map((commit) => {
              const newName = commit.closest("code").textContent.trim();
              const escapedName = newName
                .replace(/\[/g, "\\[")
                .replace(/\]/g, "\\]");
              const link = commit.href;
              return `- [${escapedName}](${link})`;
            });

            const originLines = slotMatch[0].split("\n");
            const newLines = newCommitLines;

            const originBlocks = transformToBlocks(originLines);
            const newBlocks = transformToBlocks(newLines);

            const originCommitBlocks = originBlocks.filter(
              (block) => block instanceof CommitLink
            );
            const newCommitBlocks = newBlocks.filter(
              (block) => block instanceof CommitLink
            );

            const mergedCommitBlocks = mergeCommitBlocks(
              originCommitBlocks,
              newCommitBlocks
            );

            const isEmptySlot = originCommitBlocks.length === 0;
            const hasAnyCommitDescription = originCommitBlocks.some(
              (block) => block.description
            );
            const hasAnyTextBlocks = originBlocks.some(
              (block) => block instanceof Text
            );
            const isOnlyCommitBlocks =
              !hasAnyCommitDescription && !hasAnyTextBlocks;

            const isCreateMode = isEmptySlot || isOnlyCommitBlocks;

            if (isCreateMode) {
              const resultBlocks = [
                SlotStart.create(),
                LineBreak.create(),
                ...newCommitBlocks,
                LineBreak.create(),
                SlotEnd.create(),
              ];

              const resultLines = resultBlocks.map((block) => block.line);

              const newValue = originalValue.replace(
                SLOT_RE,
                resultLines.join("\n")
              );

              prBodyTextarea.value = newValue;
              resolve();
              return;
            }

            const mergedBlockIndexes = mergeBlockIndex(
              originBlocks.map((block) => block.blockIndex),
              mergedCommitBlocks.map((block) => block.blockIndex)
            );

            const originBlockMap = new Map(
              originBlocks.map((block) => [block.blockIndex, block])
            );
            const mergedCommitBlockMap = new Map(
              mergedCommitBlocks.map((block) => [block.blockIndex, block])
            );

            const resultBlocks = mergedBlockIndexes
              .map(
                (blockIndex) =>
                  mergedCommitBlockMap.get(blockIndex) ||
                  originBlockMap.get(blockIndex)
              )
              .filter(Boolean);

            const resultLines = resultBlocks.map((block) => block.line);

            const newValue = originalValue.replace(
              SLOT_RE,
              resultLines.join("\n")
            );

            prBodyTextarea.value = newValue;
            resolve();
          }
        );
      });
    }

    function updateComment() {
      const submitButton = prBody.querySelector(selectors.submitButton);
      submitButton.click();
    }

    function isPrCommitsIncluded(uniquePrPushedCommits) {
      const missingCommits = uniquePrPushedCommits.filter(
        (commit) => !prBody.querySelector(`a[href*="${commit.href}"]`)
      );

      if (missingCommits.length > 0) {
        console.group("%c누락된 PR 커밋", "color: #f85149;");
        missingCommits.forEach((commit) => {
          const commitInfo = commit.closest("code").textContent.trim();
          const escapedName = commitInfo
            .replace(/\[/g, "\\[")
            .replace(/\]/g, "\\]");
          console.log(`- [${escapedName}](${commit.href})`);
        });
        console.groupEnd();
      }

      return missingCommits.length === 0;
    }
  })(githubContext, domUtils, vueMin);
}

class SlotStart {
  line;
  blockIndex;

  constructor(line, blockIndex) {
    this.line = line;
    this.blockIndex = blockIndex;
  }

  static isSlotStart(line) {
    return line.startsWith("\x3C!-- slot-start -->");
  }

  static create(line = "\x3C!-- slot-start -->", blockIndex) {
    return new SlotStart(line, blockIndex);
  }
}

class SlotEnd {
  line;
  blockIndex;

  constructor(line, blockIndex) {
    this.line = line;
    this.blockIndex = blockIndex;
  }

  static isSlotEnd(line) {
    return line.startsWith("\x3C!-- slot-end -->");
  }

  static create(line = "\x3C!-- slot-end -->", blockIndex) {
    return new SlotEnd(line, blockIndex);
  }
}

class LineBreak {
  line;
  blockIndex;

  constructor(line, blockIndex) {
    this.line = line;
    this.blockIndex = blockIndex;
  }

  static isLineBreak(line) {
    return line === "";
  }

  static create(line = "", blockIndex) {
    return new LineBreak(line, blockIndex);
  }
}

class CommitLink {
  line;
  blockIndex;

  static commitLineRegex = /^- \[(.+?)\]\((https:[^)]+)\)(: (.*))?$/;

  constructor(line, blockIndex) {
    this.line = line;
    this.blockIndex = blockIndex;
  }

  static isCommitLink(line) {
    return this.commitLineRegex.test(line);
  }

  static create(line, blockIndex) {
    return new CommitLink(line, blockIndex);
  }

  get title() {
    return this.line.match(CommitLink.commitLineRegex)[1];
  }

  get link() {
    return this.line.match(CommitLink.commitLineRegex)[2];
  }

  get description() {
    return this.line.match(CommitLink.commitLineRegex)[3];
  }

  set description(description) {
    this.line = this.line.replace(this.description, description);
  }

  static isSame(c1, c2) {
    return c1.link === c2.link && c1.title === c2.title;
  }

  static isUpdated(c1, c2) {
    return c1.link === c2.link || c1.title === c2.title;
  }

  static isDifferent(c1, c2) {
    return c1.link !== c2.link && c1.title !== c2.title;
  }

  static mergeCommit(originCommitLink, newCommitLink) {
    const mergedTitle = newCommitLink.title;
    const mergedLink = newCommitLink.link;
    const mergedDescription = originCommitLink.description;

    const mergedLine = `- [${mergedTitle}](${mergedLink}${
      mergedDescription ? `: ${mergedDescription}` : ""
    })`;

    return new CommitLink(mergedLine, originCommitLink.blockIndex);
  }
}

class Text {
  line;
  blockIndex;

  constructor(line, blockIndex) {
    this.line = line;
    this.blockIndex = blockIndex;
  }

  static isText(line) {
    return (
      !SlotStart.isSlotStart(line) &&
      !SlotEnd.isSlotEnd(line) &&
      !LineBreak.isLineBreak(line) &&
      !CommitLink.isCommitLink(line)
    );
  }

  static create(line, blockIndex) {
    return new Text(line, blockIndex);
  }
}

function transformToBlocks(lines, blockIndex) {
  return lines.map((line, index) => {
    if (SlotStart.isSlotStart(line)) {
      return SlotStart.create(line, blockIndex || index);
    }

    if (LineBreak.isLineBreak(line)) {
      return LineBreak.create(line, blockIndex || index);
    }

    if (CommitLink.isCommitLink(line)) {
      return CommitLink.create(line, blockIndex || index);
    }

    if (Text.isText(line)) {
      return Text.create(line, blockIndex || index);
    }

    if (SlotEnd.isSlotEnd(line)) {
      return SlotEnd.create(line, blockIndex || index);
    }

    return line;
  });
}

function mergeCommitBlocks(originCommitBlocks, newCommitBlocks) {
  let lastMatchedIndex = null;

  const mergedCommitBlocks = newCommitBlocks.map((newCommitBlock) => {
    const sameOrigin = originCommitBlocks.find((originCommitBlock) => {
      return CommitLink.isSame(originCommitBlock, newCommitBlock);
    });
    if (sameOrigin) {
      lastMatchedIndex = sameOrigin.blockIndex;
      return sameOrigin;
    }

    const updatedOrigin = originCommitBlocks.find((originCommitBlock) => {
      return CommitLink.isUpdated(originCommitBlock, newCommitBlock);
    });
    if (updatedOrigin) {
      lastMatchedIndex = updatedOrigin.blockIndex;
      return CommitLink.mergeCommit(updatedOrigin, newCommitBlock);
    }

    return new CommitLink(
      newCommitBlock.line,
      lastMatchedIndex
        ? `${lastMatchedIndex}-${newCommitBlock.blockIndex}`
        : newCommitBlock.blockIndex
    );
  });

  return mergedCommitBlocks;
}

function mergeBlockIndex(originIndexes, newIndexes) {
  const newIndexesSet = new Set(newIndexes);

  return originIndexes.flatMap((item) =>
    newIndexesSet.has(item)
      ? [item, ...newIndexes.filter((x) => String(x).startsWith(`${item}-`))]
      : [item]
  );
}

function displayAutoEmbedSectionInSidebar({
  onClickSync,
  onCheckPrCommitsIncluded,
}) {
  const prSidebar = document.getElementById("partial-discussion-sidebar");

  if (!prSidebar) return;

  const mLogoSvgString = `
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 181 181"
          width="20"
          height="20"
        >
          <path
            fill="salmon"
            d="M180.726 90.338c0 49.892-40.457 90.337-90.363 90.337S0 140.23 0 90.337C0 40.446 40.457 0 90.363 0s90.363 40.446 90.363 90.338"
          ></path>

          <!-- 가운데 "M" 텍스트 -->
          <text
            x="90.5"
            y="130"
            font-size="120"
            font-family="Arial"
            font-weight="bold"
            fill="white"
            text-anchor="middle"
          >
            M
          </text>
        </svg>
`;

  const doneSvgString = `
<svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" data-view-component="true" class="octicon octicon-check color-fg-success" fill="#3fb950">
    <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path>
</svg>
`;

  const inProgressSvgString = `
<svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" data-view-component="true" class="octicon octicon-dot-fill hx_dot-fill-pending-icon" fill="#d29922">
    <path d="M8 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"></path>
</svg>
`;

  const syncSvgString = `
<svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" data-view-component="true" class="octicon octicon-sync" fill="#9198a1">
    <path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z"></path>
</svg>
`;

  const createCommitAutoEmbedSection = () =>
    templateToElement(`
 <section class="cae-section">
    <div class="cae-header cae-content">
      <div class="cae-header-title">
        ${mLogoSvgString}
        <span>Commit Auto Embed</span>
      </div>
      <span>
        <button title="check" class="cae-sync-button">
          ${syncSvgString}
        </button>
      </span>
    </div>
    <div class="cae-content">
      <span>PR commits included?</span>
      <span class="cae-status">${
        onCheckPrCommitsIncluded() ? doneSvgString : inProgressSvgString
      }</span>
    </div>

    <style>
      .cae-section {
        display: flex;
        flex-direction: column;
        gap: 4px;
        border: 1px solid #3d444d;
      }
      
      .cae-header {
        background-color: #192138;
        font-weight: 700;
      }

      .cae-header-title {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      
      .cae-content {
        display: flex;
        justify-content: space-between;
        padding: 8px;
        font-size: 12px;
        color: white;
      }

      .cae-sync-button {
        border: 0;
        appearance: none;
        background-color: transparent;
        user-select: none;
        white-space: nowrap;
        cursor: pointer;
        padding: 0;
        display: inline-block;
        color: #9198a1;
      }

      .cae-sync-button:hover {
        color: #4493f8;
      }
    </style>    
  </section>
`);

  const newCaeSection = createCommitAutoEmbedSection();

  const caeStatus = newCaeSection.querySelector(".cae-status");
  const caeSyncButton = newCaeSection.querySelector(".cae-sync-button");

  caeSyncButton.addEventListener("click", onClickSync);

  const oldCaeSection = prSidebar.querySelector(".cae-section");

  if (oldCaeSection) {
    oldCaeSection.replaceWith(newCaeSection);
  } else {
    prSidebar.insertBefore(newCaeSection, prSidebar.firstChild);
  }
}
