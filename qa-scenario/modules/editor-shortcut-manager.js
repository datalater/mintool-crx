export function isEditorSaveShortcut(event) {
    if (!event || event.isComposing) return false;
    const hasPrimaryModifier = event.metaKey || event.ctrlKey;
    const isSaveKey = event.key === 's' || event.key === 'S' || event.code === 'KeyS';
    return hasPrimaryModifier && isSaveKey && !event.shiftKey && !event.altKey;
}

export function isEditorUndoShortcut(event) {
    if (!event || event.isComposing) return false;
    const hasPrimaryModifier = event.metaKey || event.ctrlKey;
    const isUndoKey = event.key === 'z' || event.key === 'Z' || event.code === 'KeyZ';
    return hasPrimaryModifier && isUndoKey && !event.shiftKey && !event.altKey;
}

export function isEditorRedoShortcut(event) {
    if (!event || event.isComposing) return false;
    const hasPrimaryModifier = event.metaKey || event.ctrlKey;
    const isShiftRedo = (event.key === 'z' || event.key === 'Z' || event.code === 'KeyZ') && event.shiftKey;
    const isCtrlYRedo = (event.key === 'y' || event.key === 'Y' || event.code === 'KeyY') && !event.shiftKey;
    return hasPrimaryModifier && !event.altKey && (isShiftRedo || isCtrlYRedo);
}

export function runNativeEditCommand(documentObject, command) {
    if (!documentObject || typeof documentObject.execCommand !== 'function') return false;
    try {
        return documentObject.execCommand(command) !== false;
    } catch (_) {
        return false;
    }
}
