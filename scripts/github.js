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
    ctx.addShortcutsInPr();
    ctx.addPrCommitLinksAutoEmbed();
  }

  run();

  ctx.observeUrlChange(run);
})(githubContext);
