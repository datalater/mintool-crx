function addPrCommitLinksAutoEmbed() {
  return (async function (ctx, domUtils) {
    if (!ctx.isPullDetailPage()) return;
    if (!ctx.isMyPr()) return;
    if (ctx.isMergedPr()) return;

    await domUtils.waitForDomLoaded();

    const timeout = 5_000;

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
      const SLOT_RE = /(<!-- slot-start -->\n)([\s\S]*?)(<!-- slot-end -->)/;

      const prBodyTextareaClass = 'textarea[name="pull_request[body]"]';

      return new Promise((resolve) => {
        waitForElement(prBody, prBodyTextareaClass, timeout).then(
          (prBodyTextarea) => {
            const originalValue = prBodyTextarea.value;
            console.group("%c원본 PR 본문", "color: #7fe787;");
            console.log(originalValue);
            console.groupEnd();

            const slotMatch = originalValue.match(SLOT_RE);
            if (!slotMatch) {
              console.warn(
                "`<!-- slot-start -->` 와 `<!-- slot-end -->` 영역을 찾지 못했습니다."
              );
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
      const submitButtonClass = "button[type='submit']";
      const submitButton = prBody.querySelector(submitButtonClass);
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
  })(githubContext, domUtils);
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
