const { waitForDomLoaded } = domUtils;

(function main() {
  const ctx = githubContext;

  function run() {
    console.group("run called");

    ctx.cleanup();

    if (!ctx.isGitHubPage()) return;

    ctx.injectStyles();

    ctx.addAutoRefreshEvent();
    ctx.addNotificationFiltersAttachEvent();

    ctx.addNotificationFilters();
  }

  run();

  ctx.observerUrlChange(run);

  /**************************************************/
  /*                                                */
  /* shortcut                                       */
  /*                                                */
  /**************************************************/
  ctx.addCommentShortcutsInIssue();
  ctx.addCommentShortcutsInPr();

  // addPrCommitLinksAutoEmbed();

  console.groupEnd();
})();

async function addPrCommitLinksAutoEmbed() {
  if (!isPullDetailPage()) return;
  if (!isAuthorDatalater()) return;

  await waitForDomLoaded();

  const timeout = 5_000;

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
    // PR 본문 영역을 찾기 위한 정규표현식:
    // "## 리뷰 요청 항목"으로 시작하여 다음 "##" 직전까지의 내용을 캡처합니다.
    const PR_COMMITS_SLOT_RE = /(## 리뷰 요청 항목\s*\n)([\s\S]*?)(\n##)/;

    // PR 본문 textarea의 셀렉터 (예시)
    const prBodyTextareaClass = 'textarea[name="pull_request[body]"]';

    return new Promise((resolve) => {
      waitForElement(prBody, prBodyTextareaClass, timeout).then(
        (prBodyTextarea) => {
          const originalValue = prBodyTextarea.value;
          console.log("%c원본 PR 본문:\n", "color: #7fe787;", originalValue);

          // PR 본문에서 "## 리뷰 요청 항목" 영역을 찾습니다.
          const slotMatch = originalValue.match(PR_COMMITS_SLOT_RE);
          if (!slotMatch) {
            console.warn("리뷰 요청 항목 영역을 찾지 못했습니다.");
            resolve();
            return;
          }
          const header = slotMatch[1]; // "## 리뷰 요청 항목"과 그 뒤의 줄바꿈 등
          const middle = slotMatch[2]; // 영역 02(커밋 링크 영역) 및 영역 03(나머지 고정 텍스트)가 섞여 있는 부분
          const footer = slotMatch[3]; // 다음 "##" 시작

          // 영역 02(커밋 링크 영역)와 영역 03(나머지 고정 텍스트)를 구분합니다.
          // 여기서는 각 줄별로 검사하여, 마크다운 목록 아이템(즉, "- [" 로 시작하는 줄)을 커밋 링크 영역으로 간주합니다.
          const lines = middle.split("\n");
          const commitLineRegex = /^- \[([^\]]+)\]\(([^)]+)\)(: (.*))?$/; // 그룹1: 커밋 이름, 그룹2: 링크, 그룹4: 설명 (선택)

          // 기존 커밋 링크 영역에서 커밋 이름별로 설명을 보존하기 위한 맵 생성
          // { commitName: description }
          const oldCommitMap = {};
          const preservedNonCommitLines = {
            beforeCommitLines: [],
            afterCommitLines: [],
          };
          let commitStarted = false;

          for (const line of lines) {
            if (commitLineRegex.test(line.trim())) {
              commitStarted = true;

              const match = line.trim().match(commitLineRegex);
              const commitName = match[1];
              // 설명이 있으면 저장 (match[4]가 설명 텍스트)
              if (match[4]) {
                oldCommitMap[commitName] = match[4];
              }
            } else {
              if (commitStarted) {
                preservedNonCommitLines.afterCommitLines.push(line);
              } else {
                preservedNonCommitLines.beforeCommitLines.push(line);
              }
            }
          }

          // 새 커밋 링크 영역을 생성합니다.
          // uniquePrPushedCommits는 새로운 커밋 요소들의 배열이라고 가정합니다.
          // 각 commit 요소에서 commit.closest("code").textContent.trim() 으로 커밋 이름을 추출하고, commit.href로 링크를 추출합니다.
          const newCommitLines = uniquePrPushedCommits.map((commit) => {
            // 새로운 커밋 이름 추출 및 대괄호 이스케이프 처리
            const newName = commit.closest("code").textContent.trim();
            const escapedName = newName
              .replace(/\[/g, "\\[")
              .replace(/\]/g, "\\]");
            const link = commit.href;
            // 기존 커밋 맵에 동일한 커밋 이름이 있으면 기존 설명을 보존합니다.
            const description = oldCommitMap[newName];
            return description
              ? `- [${escapedName}](${link}): ${description}`
              : `- [${escapedName}](${link})`;
          });

          // 새 영역 중 커밋 링크 영역을 구성할 때,
          // 기존 커밋 링크 영역 외의 고정 텍스트(preservedNonCommitLines)는 그대로 유지하고,
          // 새 커밋 링크 영역(newCommitLines)로 덮어씁니다.
          // (구조에 따라 preservedNonCommitLines가 상단에 위치하는 경우 그대로 두고, 그 아래에 새 commit 라인들을 추가)
          const newMiddle = [
            ...preservedNonCommitLines.beforeCommitLines,
            ...newCommitLines,
            ...preservedNonCommitLines.afterCommitLines,
          ].join("\n");

          // 최종 PR 본문을 재조합합니다.
          const newValue = originalValue.replace(
            PR_COMMITS_SLOT_RE,
            header + newMiddle + footer
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
