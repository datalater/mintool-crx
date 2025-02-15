(function main() {
  const ctx = githubContext;

  function run() {
    ctx.cleanup();

    if (!ctx.isGitHubPage()) return;

    ctx.injectStyles();

    ctx.addAutoRefreshEvent();
    ctx.addNotificationFilters();

    ctx.addCommentShortcutsInIssue();
    ctx.addCommentShortcutsInPr();
    ctx.addPrCommitLinksAutoEmbed();
  }

  run();

  ctx.observerUrlChange(run);
})();
