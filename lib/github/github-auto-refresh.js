function addAutoRefreshEvent() {
  return (function (ctx, domUtils) {
    const shouldRefresh = ctx.isPullsPage() || ctx.isNotificationPage();
    if (!shouldRefresh) return;

    if (document.body.dataset.autoRefreshEventBound) return;
    document.body.dataset.autoRefreshEventBound = true;

    document.addEventListener("visibilitychange", visibilityChangeHandler);

    ctx.cleanups.push(() => {
      document.removeEventListener("visibilitychange", visibilityChangeHandler);
      document.body.dataset.autoRefreshEventBound = false;
    });

    function visibilityChangeHandler() {
      if (document.hidden) return;
      if (!document.body.dataset.autoRefreshEventBound) return;

      showToast("Page refreshed", 2000);
      domUtils.refresh();
    }
  })(githubContext, domUtils);
}
