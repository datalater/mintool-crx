function addShortcutsInPr() {
  return (function () {
    const showFileTreeButtonSelector =
      '[data-action="click:file-tree-toggle#toggleFileTree"]';

    const COMMANDS = {
      ctrlShiftS: {
        keyPressed: (e) =>
          (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "s",
        handler: (shortcutKey) => {
          showToast(`${shortcutKey} triggered`).then(() => {
            const showFileTreeButton = document.querySelector(
              showFileTreeButtonSelector,
            );

            if (!showFileTreeButton) {
              showToast(
                `Cannot find file tree toggle button: ${showFileTreeButton}`,
              );
              return;
            }

            showFileTreeButton.click();
          });
        },
      },
    };

    document.addEventListener("keydown", (e) => {
      const command = Object.entries(COMMANDS).find(([_, cmd]) =>
        cmd.keyPressed(e),
      );
      if (!command) return;

      const [shortcutKey, { handler }] = command;
      handler(shortcutKey);
    });
  })();
}
