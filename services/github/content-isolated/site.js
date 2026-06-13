(async function main() {
  const ctx = githubContext;
  const features = await _featureSettingsPromise;

  function run() {
    ctx.cleanup();

    if (!ctx.isGitHubPage()) return;

    ctx.injectStyles();

    if (features.githubAutoRefresh !== false) ctx.addAutoRefreshEvent();
    if (features.githubNotificationFilters !== false) ctx.addNotificationFilters();
    if (features.githubCommentShortcut !== false) {
      ctx.addCommentShortcutsInIssue();
      ctx.addCommentShortcutsInPr();
    }
    if (features.githubShortcut !== false) ctx.addShortcutsInPr();
    if (features.githubPrCommitAutoEmbed !== false) ctx.addPrCommitLinksAutoEmbed();
  }

  run();

  ctx.observeUrlChange(run);
})(githubContext);
