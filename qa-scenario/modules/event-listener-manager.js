export function setupMainEventListeners(config) {
    const {
        el,
        onEditorInput,
        onEditorPaste,
        onEditorScroll,
        onEditorKeydown,
        onEditorKeyup,
        onEditorClick,
        onEditorSelect,
        onFoldEditor,
        onFormat,
        onToggleLineNumbers,
        onToggleFolders,
        onToggleTree,
        onShowTree,
        onTogglePassHeader,
        onNewFolder,
        onNewFile,
        onExport,
        onImportClick,
        onImportFile,
        onImportError
    } = config;

    el.editing.addEventListener('input', onEditorInput);
    el.editing.addEventListener('paste', onEditorPaste);
    el.editing.addEventListener('scroll', onEditorScroll);
    el.editing.addEventListener('keydown', onEditorKeydown);
    if (typeof onEditorKeyup === 'function') el.editing.addEventListener('keyup', onEditorKeyup);
    if (typeof onEditorClick === 'function') el.editing.addEventListener('click', onEditorClick);
    if (typeof onEditorSelect === 'function') el.editing.addEventListener('select', onEditorSelect);

    el.btnFoldEditor.addEventListener('click', onFoldEditor);
    el.btnFormat.addEventListener('click', onFormat);
    el.toggleLineNumbers.addEventListener('change', onToggleLineNumbers);
    el.btnToggleFolders.addEventListener('click', onToggleFolders);
    el.btnToggleTree.addEventListener('click', onToggleTree);
    el.btnShowTree.addEventListener('click', onShowTree);
    el.passHeaderToggle.addEventListener('click', onTogglePassHeader);
    el.btnNewFolder.addEventListener('click', onNewFolder);
    el.btnNewFile.addEventListener('click', onNewFile);
    el.btnExport.addEventListener('click', onExport);
    el.btnImport.addEventListener('click', onImportClick);

    el.fileInput.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            await onImportFile(file);
        } catch (error) {
            onImportError(error);
        }
    });
}
