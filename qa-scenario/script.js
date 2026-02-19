import { WORKSPACE_STORAGE_KEY } from './constants/storage.js';
import { AUTOSAVE_DELAY_MS, WORKSPACE_VERSION, DEFAULT_FILE_NAME } from './configs/workspace.js';
import { EDITOR_CONFIG } from './configs/editor-config.js';
import { tryParseJson } from './utils/json.js';
import { nowTs, nowIso } from './utils/date.js';
import * as Workspace from './modules/workspace-manager.js';
import * as UI from './modules/ui-renderer.js';
import * as Editor from './modules/editor-manager.js';
import { captureEditorSelectionSnapshot, restoreEditorSelectionSnapshot } from './modules/editor-caret-manager.js';
import { createResizerLayoutManager } from './modules/resizer-layout-manager.js';
import { buildExportPayload, buildRequiredScenarioWithDefaults, formatExportFilenameDate } from './modules/export-data-manager.js';
import { createExportMenuManager } from './modules/export-menu-manager.js';
import { toWorkspaceFromImportedPayload as convertImportedPayloadToWorkspace } from './modules/import-workspace-converter.js';
import { createTreeMenuManager } from './modules/tree-menu-manager.js';
import { getLineColumn, getPositionFromLineColumn, findTrailingCommaPosition, normalizeErrorPosition } from './modules/text-position-utils.js';
import { createEditorSelectionManager } from './modules/editor-selection-manager.js';
import { resolveParseErrorPosition, formatParseErrorMessage, formatRuntimeErrorMessage, getSafeErrorMessage } from './modules/json-error-manager.js';
import {
    updateSaveIndicatorView,
    applyLineNumberVisibilityView,
    applyLineNumberPreferenceFromWorkspace,
    updateLineNumbersView,
    setJsonValidationValidView,
    setJsonValidationErrorView,
    updateJsonErrorMessageView,
    formatSavedTime
} from './modules/editor-view-state-manager.js';
import { setupMainEventListeners } from './modules/event-listener-manager.js';
import { updateFolderToggleButtonStateView, toggleAllFoldersState } from './modules/tree-folder-state-manager.js';
import { buildTreeRenderOptions } from './modules/tree-actions-manager.js';
import { createEditorHighlightManager } from './modules/editor-highlight-manager.js';
import {
    isEditorSaveShortcut,
    isEditorUndoShortcut,
    isEditorRedoShortcut,
    isEditorCursorHistoryBackShortcut,
    isEditorCursorHistoryForwardShortcut,
    isEditorFindOpenShortcut,
    isEditorReplaceOpenShortcut,
    isEditorFindNextShortcut,
    isEditorFindPreviousShortcut,
    isEditorFindCloseShortcut,
    runNativeEditCommand
} from './modules/editor-shortcut-manager.js';
import { createEditorCursorHistoryManager } from './modules/editor-cursor-history-manager.js';
import { createEditorFindReplaceManager } from './modules/editor-find-replace-manager.js';
import { createDeletedFileHistoryManager } from './modules/deleted-file-history-manager.js';

// --- Global State Mirroring the original ---
const EL = {
    editing: document.getElementById('editing'),
    highlighting: document.getElementById('highlighting'),
    highlightContent: document.getElementById('highlighting-content'),
    checklistBody: document.getElementById('checklist-body'),
    highlightOverlay: document.getElementById('highlight-overlay'),
    jsonStatus: document.getElementById('json-status'),
    jsonErrorPosition: document.getElementById('json-error-position'),
    jsonErrorMessage: document.getElementById('json-error-message'),
    appVersion: document.getElementById('app-version'),
    lineNumbers: document.getElementById('line-numbers'),
    toggleLineNumbers: document.getElementById('toggle-line-numbers'),
    editorWrapper: document.getElementById('editor-wrapper'),
    editorFindWidget: document.getElementById('editor-find-widget'),
    editorFindInput: document.getElementById('editor-find-input'),
    editorFindCount: document.getElementById('editor-find-count'),
    btnEditorFindPrev: document.getElementById('btn-editor-find-prev'),
    btnEditorFindNext: document.getElementById('btn-editor-find-next'),
    btnEditorFindClose: document.getElementById('btn-editor-find-close'),
    editorReplaceRow: document.getElementById('editor-replace-row'),
    editorReplaceInput: document.getElementById('editor-replace-input'),
    btnEditorReplaceOne: document.getElementById('btn-editor-replace-one'),
    btnEditorReplaceAll: document.getElementById('btn-editor-replace-all'),
    scenarioTitle: document.getElementById('scenario-title'),
    btnFormat: document.getElementById('btn-format'),
    saveIndicator: document.getElementById('save-indicator'),
    saveIndicatorTime: document.getElementById('save-indicator-time'),
    saveIndicatorLabel: document.getElementById('save-indicator-label'),
    btnFoldEditor: document.getElementById('btn-fold-editor'),
    paneResizer: document.getElementById('pane-resizer'),
    passHeaderToggle: document.getElementById('col-pass-toggle'),
    btnNewFolder: document.getElementById('btn-new-folder'),
    btnNewFile: document.getElementById('btn-new-file'),
    btnToggleFolders: document.getElementById('btn-toggle-folders'),
    btnToggleTree: document.getElementById('btn-toggle-tree'),
    btnTreeMenu: document.getElementById('btn-tree-menu'),
    btnShowTree: document.getElementById('btn-show-tree'),
    treeMenu: document.getElementById('tree-menu'),
    fileTree: document.getElementById('file-tree'),
    fileTreePanel: document.querySelector('.file-tree-panel'),
    fileTreeResizer: document.getElementById('file-tree-resizer'),
    appContent: document.querySelector('.app-content'),
    editorPane: document.getElementById('editor-pane'),
    btnImport: document.getElementById('btn-import'),
    boundFilePathInput: document.getElementById('bound-file-path'),
    boundFileStatus: document.getElementById('bound-file-status'),
    btnExport: document.getElementById('btn-export'),
    exportSplit: document.getElementById('export-split'),
    btnExportMenu: document.getElementById('btn-export-menu'),
    exportOptionsMenu: document.getElementById('export-options-menu'),
    exportModeAll: document.getElementById('export-mode-all'),
    exportModeCustom: document.getElementById('export-mode-custom'),
    exportCustomOptions: document.getElementById('export-custom-options'),
    exportFieldSearch: document.getElementById('export-field-search'),
    btnExportSelectAll: document.getElementById('btn-export-select-all'),
    btnExportClearAll: document.getElementById('btn-export-clear-all'),
    exportFieldList: document.getElementById('export-field-list'),
    exportFieldCount: document.getElementById('export-field-count'),
    exportFieldEmpty: document.getElementById('export-field-empty'),
    fileInput: document.getElementById('file-input')
};

let currentData = null;
let workspace = null;
let autosaveTimer = null;
let activeFileDirty = false;
let lastTreeSelectionType = 'file';
const MIN_EDITOR_WIDTH = 0;
const DEFAULT_FILE_TREE_WIDTH = 260;
const MIN_FILE_TREE_WIDTH = 180;
const MIN_JSON_EDITOR_WIDTH = 280;
let resizerLayout = null;
let exportMenuManager = null;
let treeMenuManager = null;
let editorSelectionManager = null;
let editorHighlightManager = null;
let editorCursorHistoryManager = null;
let editorFindReplaceManager = null;
let deletedFileHistoryManager = null;
let boundFileHandle = null;
let boundDirectoryHandle = null;
let boundDirectoryWriteEnabled = false;
let directoryFileHandleById = new Map();
let boundFileName = '';
let boundFileReadonly = false;
let treeMutationsEnabled = true;
let directDiskSyncAvailable = false;
let lastSaveIndicatorState = 'saved';
let diskFlushInFlight = false;
let diskFlushQueued = false;
let directoryFlushInFlight = false;
let directoryFlushQueued = false;

const BOUND_FILE_PATH_DEFAULT_LABEL = '';
const BOUND_FILE_PATH_DEFAULT_TOOLTIP = 'No file bound';
const LOCAL_SAVE_ONLY_TOOLTIP = '로컬 저장소(localStorage)에 저장되었습니다. 현재 디스크 파일에 직접 저장할 수 없어 이 상태를 표시합니다.';
const DIRECTORY_LOCAL_SAVE_TOOLTIP = '폴더 기반 모드에서는 현재 로컬 저장 후 필요 시 디스크 동기화를 확장할 예정입니다. 지금은 로컬 저장을 기준으로 동작합니다.';

const EXPORT_MODE_ALL = 'all';
const EXPORT_MODE_CUSTOM = 'custom';
const EXPORT_MODE_REQUIRED_LEGACY = 'required';
const EXPORT_MODES = new Set([EXPORT_MODE_ALL, EXPORT_MODE_CUSTOM]);
const EXPORT_FORMAT = 'qa-scenario-export';
const REQUIRED_EXPORT_FIELDS = [
    'scenario',
    'steps',
    'steps.divider',
    'steps.given',
    'steps.when',
    'steps.then',
    'steps.pass'
];

// --- Initialization ---

function init() {
    loadAppVersionLabel();
    setupResizerLayout();
    setupExportMenuManager();
    setupTreeMenuManager();
    setupEditorSelectionManager();
    setupEditorHighlightManager();
    setupEditorCursorHistoryManager();
    setupEditorFindReplaceManager();
    setupDeletedFileHistoryManager();
    loadWorkspace();
    setupEventListeners();
    resizerLayout.setupResizing();
    setupWindowListeners();
    applyLineNumberVisibility();
    applyFileTreePreference();
    setupTreeMenu();
    setupExportMenu();
}

async function loadAppVersionLabel() {
    if (!EL.appVersion) return;

    const applyVersion = (value) => {
        const version = String(value || '').trim();
        if (!version) return;
        EL.appVersion.textContent = `v${version}`;
        EL.appVersion.title = `Current version: v${version}`;
    };

    if (typeof chrome !== 'undefined'
        && chrome.runtime
        && typeof chrome.runtime.getManifest === 'function') {
        const manifest = chrome.runtime.getManifest();
        applyVersion(manifest?.version);
        return;
    }

    try {
        const response = await fetch('../manifest.json', { cache: 'no-store' });
        if (!response.ok) return;
        const manifest = await response.json();
        applyVersion(manifest?.version);
    } catch {}
}

function setupEditorSelectionManager() {
    editorSelectionManager = createEditorSelectionManager(EL.editing);
}

function setupEditorHighlightManager() {
    editorHighlightManager = createEditorHighlightManager({
        editing: EL.editing,
        highlightOverlay: EL.highlightOverlay,
        jsonErrorPosition: EL.jsonErrorPosition,
        getLineColumn,
        getEditorMetrics
    });
}

function setupEditorCursorHistoryManager() {
    editorCursorHistoryManager = createEditorCursorHistoryManager({
        editing: EL.editing,
        maxEntries: EDITOR_CONFIG.cursorHistory.maxEntries
    });
    editorCursorHistoryManager.reset();
}

function setupEditorFindReplaceManager() {
    editorFindReplaceManager = createEditorFindReplaceManager({
        editing: EL.editing,
        onStateChange: renderEditorFindWidget,
        onTextMutated: () => {
            validateAndRender();
            updateActiveFileFromEditor();
        }
    });
    renderEditorFindWidget(editorFindReplaceManager.getState());
}

function setupDeletedFileHistoryManager() {
    deletedFileHistoryManager = createDeletedFileHistoryManager({
        getWorkspace: () => workspace,
        persist,
        loadActiveFile,
        maxEntries: 30
    });
}

function setupResizerLayout() {
    resizerLayout = createResizerLayoutManager({
        el: {
            appContent: EL.appContent,
            paneResizer: EL.paneResizer,
            fileTreeResizer: EL.fileTreeResizer,
            fileTreePanel: EL.fileTreePanel,
            editorPane: EL.editorPane
        },
        isFileTreeVisible,
        persistFileTreeWidthPreference,
        minEditorWidth: MIN_EDITOR_WIDTH,
        minFileTreeWidth: MIN_FILE_TREE_WIDTH,
        minJsonEditorWidth: MIN_JSON_EDITOR_WIDTH
    });
}

function setupExportMenuManager() {
    exportMenuManager = createExportMenuManager({
        el: {
            btnExport: EL.btnExport,
            exportSplit: EL.exportSplit,
            btnExportMenu: EL.btnExportMenu,
            exportOptionsMenu: EL.exportOptionsMenu,
            exportModeAll: EL.exportModeAll,
            exportModeCustom: EL.exportModeCustom,
            exportCustomOptions: EL.exportCustomOptions,
            exportFieldSearch: EL.exportFieldSearch,
            btnExportSelectAll: EL.btnExportSelectAll,
            btnExportClearAll: EL.btnExportClearAll,
            exportFieldList: EL.exportFieldList,
            exportFieldCount: EL.exportFieldCount,
            exportFieldEmpty: EL.exportFieldEmpty
        },
        getWorkspace: () => workspace,
        persistWorkspace: () => Workspace.persistWorkspace(workspace),
        parseJson: tryParseJson,
        closeTreeMenu,
        requiredExportFields: REQUIRED_EXPORT_FIELDS,
        exportModeAll: EXPORT_MODE_ALL,
        exportModeCustom: EXPORT_MODE_CUSTOM,
        exportModeRequiredLegacy: EXPORT_MODE_REQUIRED_LEGACY,
        exportModes: EXPORT_MODES
    });
}

function setupTreeMenuManager() {
    treeMenuManager = createTreeMenuManager({
        btnTreeMenu: EL.btnTreeMenu,
        treeMenu: EL.treeMenu,
        closeExportMenu
    });
}

function loadWorkspace() {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    const stored = raw ? tryParseJson(raw) : null;
    workspace = Workspace.normalizeWorkspace(stored);
    applyLineNumberPreference();
    applyFileTreePreference();
    applyFileTreeWidthPreference();
    updateStorageTargetFromWorkspaceMeta();
    loadActiveFile();
}

function persist() {
    Workspace.persistWorkspace(workspace);
    activeFileDirty = false;
    updateSaveIndicator('saved');
    scheduleBoundFileFlush();
    scheduleDirectoryFileFlush();
    renderTree();
}

function loadActiveFile() {
    clearStepHighlight();
    const activeFile = Workspace.getActiveFile(workspace);
    EL.editing.value = activeFile ? activeFile.content : '';
    validateAndRender();
    renderTree();
    updateSaveIndicator('saved');
    activeFileDirty = false;
    editorCursorHistoryManager.reset();
    editorFindReplaceManager.syncFromEditorInput();
}

// --- Logic ---

function validateAndRender() {
    updateLineNumbers();
    const text = EL.editing.value;
    updateHighlighting();

    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        currentData = null;
        setJsonValidationErrorState('Invalid JSON');
        updateErrorMessage(formatParseErrorMessage(e));
        parseErrorPosition(getSafeErrorMessage(e));
        return;
    }

    currentData = parsed;
    try {
        renderChecklist();
        setJsonValidationValidState();
    } catch (e) {
        setJsonValidationErrorState('Runtime Error');
        updateErrorPosition(-1);
        updateErrorMessage(formatRuntimeErrorMessage(e));
        console.error('[qa-scenario] checklist render failed', e);
    }
}

function handleEditorInput() {
    validateAndRender();
    updateActiveFileFromEditor();
    editorFindReplaceManager.syncFromEditorInput();
}

function handleEditorPaste() {
    setTimeout(handleEditorInput, 0);
}

function handleEditorSelectionChange() {
    editorCursorHistoryManager.recordSelectionChange();
    editorFindReplaceManager.syncFromEditorSelection();
}

function handleEditorKeydown(event) {
    if (isEditorFindOpenShortcut(event, EDITOR_CONFIG)) {
        event.preventDefault();
        openFindWidget(false);
        return;
    }

    if (isEditorReplaceOpenShortcut(event, EDITOR_CONFIG)) {
        event.preventDefault();
        openFindWidget(true);
        return;
    }

    const findState = editorFindReplaceManager.getState();
    if (findState.isOpen && isEditorFindCloseShortcut(event, EDITOR_CONFIG)) {
        event.preventDefault();
        closeFindWidget();
        return;
    }

    const isCursorHistoryBack = isEditorCursorHistoryBackShortcut(event, EDITOR_CONFIG);
    const isCursorHistoryForward = isEditorCursorHistoryForwardShortcut(event, EDITOR_CONFIG);
    if (isCursorHistoryBack || isCursorHistoryForward) {
        event.preventDefault();
        const handled = isCursorHistoryForward
            ? editorCursorHistoryManager.moveForward()
            : editorCursorHistoryManager.moveBack();
        if (handled) syncScroll();
        return;
    }

    if (isEditorSaveShortcut(event)) {
        event.preventDefault();
        runFormatAndSave();
        return;
    }

    if (isEditorUndoShortcut(event) || isEditorRedoShortcut(event)) {
        event.preventDefault();
        const command = isEditorRedoShortcut(event) ? 'redo' : 'undo';
        const handled = runNativeEditCommand(document, command);
        if (handled) {
            setTimeout(handleEditorInput, 0);
        }
        return;
    }

    if (event.key !== 'Tab' && event.code !== 'Tab') return;
    event.preventDefault();
    const isShift = event.shiftKey || event.getModifierState('Shift');
    if (isShift) {
        editorSelectionManager.unindentSelection();
    } else {
        editorSelectionManager.indentSelection();
    }
    handleEditorInput();
}

function openFindWidget(showReplace) {
    const selectedText = getEditorSelectedText();
    editorFindReplaceManager.open({ showReplace, seedQuery: selectedText });
    if (EL.editorFindInput) {
        EL.editorFindInput.focus();
        EL.editorFindInput.select();
    }
}

function closeFindWidget() {
    editorFindReplaceManager.close();
    EL.editing.focus();
}

function getEditorSelectedText() {
    const start = EL.editing.selectionStart;
    const end = EL.editing.selectionEnd;
    if (start === end) return '';
    return EL.editing.value.slice(start, end);
}

function handleFindInput() {
    editorFindReplaceManager.setQuery(EL.editorFindInput.value);
    editorFindReplaceManager.revealActiveMatch({ focusEditor: false });
    syncScrollToActiveMatch();
}

function handleFindInputKeydown(event) {
    if (isEditorFindCloseShortcut(event, EDITOR_CONFIG)) {
        event.preventDefault();
        closeFindWidget();
        return;
    }
    if (isEditorFindPreviousShortcut(event, EDITOR_CONFIG)) {
        event.preventDefault();
        editorFindReplaceManager.findPrevious({ focusEditor: false });
        syncScrollToActiveMatch();
        return;
    }
    if (isEditorFindNextShortcut(event, EDITOR_CONFIG)) {
        event.preventDefault();
        editorFindReplaceManager.findNext({ focusEditor: false });
        syncScrollToActiveMatch();
    }
}

function handleReplaceInput() {
    editorFindReplaceManager.setReplaceText(EL.editorReplaceInput.value);
}

function handleReplaceInputKeydown(event) {
    if (isEditorFindCloseShortcut(event, EDITOR_CONFIG)) {
        event.preventDefault();
        closeFindWidget();
        return;
    }
    if (!isEditorFindNextShortcut(event, EDITOR_CONFIG)) return;
    event.preventDefault();
    editorFindReplaceManager.replaceCurrent();
    syncScrollToActiveMatch();
}

function handleFindNext() {
    editorFindReplaceManager.findNext();
    syncScrollToActiveMatch();
}

function handleFindPrev() {
    editorFindReplaceManager.findPrevious();
    syncScrollToActiveMatch();
}

function handleReplaceOne() {
    editorFindReplaceManager.replaceCurrent();
    syncScrollToActiveMatch();
}

function handleReplaceAll() {
    editorFindReplaceManager.replaceAll();
    syncScrollToActiveMatch();
}

function syncScrollToActiveMatch() {
    const activeMatch = editorFindReplaceManager.getActiveMatch();
    if (!activeMatch) {
        syncScroll();
        return;
    }
    scrollToLine(activeMatch.start);
    syncScroll();
}

function renderEditorFindWidget(state) {
    if (!EL.editorFindWidget || !EL.editorReplaceRow) return;
    EL.editorFindWidget.classList.toggle('is-hidden', !state.isOpen);
    EL.editorReplaceRow.classList.toggle('is-hidden', !state.showReplace);

    if (EL.editorFindInput && EL.editorFindInput.value !== state.query) {
        EL.editorFindInput.value = state.query;
    }
    if (EL.editorReplaceInput && EL.editorReplaceInput.value !== state.replaceText) {
        EL.editorReplaceInput.value = state.replaceText;
    }

    if (EL.editorFindCount) {
        const current = state.matchCount > 0 && state.activeMatchIndex >= 0
            ? state.activeMatchIndex + 1
            : 0;
        EL.editorFindCount.textContent = `${current} / ${state.matchCount}`;
    }
}

function runFormatAndSave() {
    try {
        const selectionSnapshot = captureEditorSelectionSnapshot(EL.editing);
        EL.editing.value = JSON.stringify(JSON.parse(EL.editing.value), null, 2);
        restoreEditorSelectionSnapshot(EL.editing, selectionSnapshot);
        handleEditorInput();
        flushAutosaveAndPersist();
    } catch (e) {
        alert("Invalid JSON");
    }
}

function updateActiveFileFromEditor() {
    const activeFile = Workspace.getActiveFile(workspace);
    if (!activeFile) return;
    if (activeFile.content === EL.editing.value) return;
    activeFile.content = EL.editing.value;
    activeFile.updatedAt = nowTs();
    activeFileDirty = true;
    updateSaveIndicator('dirty');
    scheduleSave();
}

function updateHighlighting(errorPos = -1) {
    EL.highlightContent.innerHTML = Editor.syntaxHighlight(EL.editing.value, errorPos);
    syncScroll();
}

function syncScroll() {
    EL.highlighting.scrollTop = EL.editing.scrollTop;
    EL.highlighting.scrollLeft = EL.editing.scrollLeft;
    EL.lineNumbers.scrollTop = EL.editing.scrollTop;
    updateStepHighlightPosition();
}

function parseErrorPosition(msg) {
    const position = resolveParseErrorPosition(
        msg,
        EL.editing.value,
        getPositionFromLineColumn,
        findTrailingCommaPosition
    );
    if (position === null) {
        updateErrorPosition(-1);
        return;
    }
    applyErrorPosition(position);
}

function applyErrorPosition(position) {
    const normalized = normalizeErrorPosition(EL.editing.value, position);
    if (normalized < 0) return updateErrorPosition(-1);
    updateHighlighting(normalized);
    updateErrorPosition(normalized);
}

function renderTree() {
    const treeOptions = buildTreeRenderOptions({
        getWorkspace: () => workspace,
        getActiveFileDirty: () => activeFileDirty,
        canMutateTree: () => treeMutationsEnabled,
        setLastTreeSelectionType: (nextType) => { lastTreeSelectionType = nextType; },
        persist,
        loadActiveFile,
        workspaceApi: Workspace,
        prompt: (message, defaultValue) => window.prompt(message, defaultValue),
        onDeleteFile: (deletedFile, deletedIndex) => {
            deletedFileHistoryManager.recordDeletedFile(deletedFile, deletedIndex);
        }
    });
    UI.renderFileTree(EL.fileTree, workspace, treeOptions);
    updateFolderToggleButtonState();
}

function updateFolderToggleButtonState() {
    updateFolderToggleButtonStateView(
        {
            btnToggleFolders: EL.btnToggleFolders,
            fileTreePanel: EL.fileTreePanel
        },
        workspace,
        Workspace.getActiveFile
    );
}

function toggleAllFolders() {
    const changed = toggleAllFoldersState(workspace, Workspace.getActiveFile);
    if (!changed) return;
    persist();
}

function setupTreeMenu() {
    if (!treeMenuManager) return;
    treeMenuManager.setup();
}

function closeTreeMenu() {
    if (!treeMenuManager) return;
    treeMenuManager.close();
}

function setupExportMenu() {
    exportMenuManager.setup();
}

function closeExportMenu() {
    if (!exportMenuManager) return;
    exportMenuManager.closeMenu();
}

function syncExportOptionUiFromWorkspace() {
    if (!exportMenuManager) return;
    exportMenuManager.syncUiFromWorkspace();
}

function getExportPreferences() {
    return exportMenuManager.getExportPreferences();
}

function normalizeExportMode(value) {
    return exportMenuManager.normalizeExportMode(value);
}

function canonicalizeExportFieldPath(value) {
    return exportMenuManager.canonicalizeFieldPath(value);
}

function handleExportClick() {
    const preferences = getExportPreferences();
    const payload = buildExportPayload({
        workspace,
        preferences,
        exportFormat: EXPORT_FORMAT,
        workspaceVersion: WORKSPACE_VERSION,
        requiredExportFields: REQUIRED_EXPORT_FIELDS,
        exportModeCustom: EXPORT_MODE_CUSTOM,
        nowIso,
        parseJson: tryParseJson,
        canonicalizeFieldPath: canonicalizeExportFieldPath
    });
    downloadExportPayload(payload);
}

function downloadExportPayload(payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qa-scenarios-${formatExportFilenameDate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function renderChecklist() {
    UI.renderChecklist(EL.checklistBody, currentData, {
        onUpdatePass: (idx, val) => {
            currentData.steps[idx].pass = val;
            syncToEditor();
        },
        onUpdateStep: (idx, field, val) => {
            if (isStepArrayField(field)) {
                currentData.steps[idx][field] = toChecklistArray(val);
            } else {
                currentData.steps[idx][field] = val;
            }
            syncToEditor();
        },
        onHighlightStep: (idx) => {
            const bounds = Editor.findStepBounds(EL.editing.value, idx);
            if (!bounds) return clearStepHighlight();
            renderStepHighlight(bounds);
            scrollToLine(bounds.start);
        },
        onScenarioTitleUpdate: (title, isPrimary) => {
            EL.scenarioTitle.textContent = title;
            EL.scenarioTitle.title = title;
            EL.scenarioTitle.classList.toggle('is-primary', isPrimary);
        }
    });
    UI.updatePassHeaderState(EL.passHeaderToggle, currentData);
    clearHighlightIfNoSelection();
}

function isStepArrayField(field) {
    return field === 'given' || field === 'when' || field === 'then';
}

function toChecklistArray(value) {
    if (Array.isArray(value)) {
        return value
            .map(item => (item == null ? '' : String(item).trim()))
            .filter(Boolean);
    }
    if (value == null) return [];
    return String(value)
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
}

function clearHighlightIfNoSelection() {
    if (!EL.checklistBody) return;
    const hasSelection = Boolean(EL.checklistBody.querySelector('.selected-row'));
    if (!hasSelection) clearStepHighlight();
}

function toggleAllPass() {
    if (!hasSteps(currentData)) return;
    const nextValue = !areAllStepsPassed(currentData.steps);
    currentData.steps.forEach(step => {
        if (UI.isChecklistDividerStep(step)) return;
        step.pass = nextValue;
    });
    syncToEditor();
    renderChecklist();
}

function syncToEditor() {
    EL.editing.value = JSON.stringify(currentData, null, 2);
    renderEditorFromCurrentData();
    const activeFile = Workspace.getActiveFile(workspace);
    if (activeFile) {
        activeFile.content = EL.editing.value;
        activeFile.updatedAt = nowTs();
        activeFileDirty = true;
        updateSaveIndicator('dirty');
        scheduleSave();
    }
}

function scheduleSave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(persist, AUTOSAVE_DELAY_MS || 800);
}

function scheduleBoundFileFlush() {
    if (!boundFileHandle || boundFileReadonly) return;

    diskFlushQueued = true;
    if (diskFlushInFlight) return;
    queueMicrotask(flushBoundFileIfNeeded);
}

function getBoundFileContentForFlush() {
    const activeFile = Workspace.getActiveFile(workspace);
    if (!activeFile) return null;
    return activeFile.content;
}

async function flushBoundFileIfNeeded() {
    if (!diskFlushQueued || diskFlushInFlight || !boundFileHandle || boundFileReadonly) return;
    const content = getBoundFileContentForFlush();
    if (typeof content !== 'string') {
        diskFlushQueued = false;
        setDirectDiskSyncAvailable(false);
        updateBoundFilePathInput('Sync skipped: no active file content', 'warning');
        return;
    }

    diskFlushQueued = false;
    diskFlushInFlight = true;
    try {
        const writable = await boundFileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        setDirectDiskSyncAvailable(true);
        updateBoundFilePathInput(`Synced ${formatSavedTime(nowIso())}`, 'bound');
    } catch (error) {
        console.error('[qa-scenario] bound file flush failed', error);
        setDirectDiskSyncAvailable(false);
        updateBoundFilePathInput('Sync failed', 'warning');
    } finally {
        diskFlushInFlight = false;
        if (diskFlushQueued) {
            queueMicrotask(flushBoundFileIfNeeded);
        }
    }
}

function scheduleDirectoryFileFlush() {
    if (!boundDirectoryHandle || !boundDirectoryWriteEnabled) return;

    directoryFlushQueued = true;
    if (directoryFlushInFlight) return;
    queueMicrotask(flushDirectoryFileIfNeeded);
}

function getActiveDirectoryFileFlushTarget() {
    const activeFile = Workspace.getActiveFile(workspace);
    if (!activeFile) return null;
    const fileHandle = directoryFileHandleById.get(activeFile.id);
    if (!fileHandle) return null;
    return {
        activeFile,
        fileHandle
    };
}

async function flushDirectoryFileIfNeeded() {
    if (!directoryFlushQueued || directoryFlushInFlight || !boundDirectoryHandle || !boundDirectoryWriteEnabled) return;

    const target = getActiveDirectoryFileFlushTarget();
    if (!target) {
        directoryFlushQueued = false;
        setDirectDiskSyncAvailable(false);
        updateBoundFilePathInput('Folder sync skipped: no active disk file', 'warning');
        return;
    }

    directoryFlushQueued = false;
    directoryFlushInFlight = true;
    try {
        const writable = await target.fileHandle.createWritable();
        await writable.write(target.activeFile.content || '');
        await writable.close();
        setDirectDiskSyncAvailable(true);
        updateBoundFilePathInput(`Folder synced ${formatSavedTime(nowIso())}`, 'bound');
    } catch (error) {
        console.error('[qa-scenario] directory file flush failed', error);
        setDirectDiskSyncAvailable(false);
        updateBoundFilePathInput('Folder sync failed', 'warning');
    } finally {
        directoryFlushInFlight = false;
        if (directoryFlushQueued) {
            queueMicrotask(flushDirectoryFileIfNeeded);
        }
    }
}

function flushAutosaveAndPersist() {
    if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
    }
    persist();
}

function applyImportedWorkspace(data) {
    workspace = Workspace.normalizeWorkspace(data);
    persist();
    loadActiveFile();
    syncExportOptionUiFromWorkspace();
}

function toImportedWorkspaceFromText(text) {
    const parsed = tryParseJson(text);
    if (!parsed) return null;
    const importedWorkspace = convertImportedPayloadToWorkspace(parsed, {
        exportFormat: EXPORT_FORMAT,
        workspaceVersion: WORKSPACE_VERSION,
        defaultFileName: DEFAULT_FILE_NAME,
        createFolderRecord: Workspace.createFolderRecord,
        createFileRecord: Workspace.createFileRecord,
        normalizeExportMode,
        buildRequiredScenarioWithDefaults
    });
    return importedWorkspace;
}

async function handleImportFile(file) {
    const text = await file.text();
    const importedWorkspace = toImportedWorkspaceFromText(text);
    if (!importedWorkspace) return alert('Unsupported or invalid JSON format');
    clearBoundFile();
    boundDirectoryHandle = null;
    setTreeMutationsEnabled(true);
    applyImportedWorkspace(importedWorkspace);
    updateBoundFilePathInput('Imported only: not bound to disk', 'warning');
}

async function handleBindOpenClick(event) {
    const forceFileOpen = Boolean(event?.shiftKey);
    if (!forceFileOpen && typeof window.showDirectoryPicker === 'function') {
        try {
            const directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            if (!directoryHandle) return;
            await bindAndLoadFromDirectoryHandle(directoryHandle);
            return;
        } catch (error) {
            if (error?.name !== 'AbortError') {
                console.error('[qa-scenario] open directory failed', error);
                alert('Open folder failed');
            }
            return;
        }
    }

    await handleBindOpenFileClick();
}

async function handleBindOpenFileClick() {
    if (typeof window.showOpenFilePicker !== 'function') {
        EL.fileInput.value = '';
        EL.fileInput.click();
        return;
    }

    try {
        const [handle] = await window.showOpenFilePicker({
            multiple: false,
            types: [{
                description: 'JSON Files',
                accept: { 'application/json': ['.json'] }
            }],
            excludeAcceptAllOption: false
        });
        if (!handle) return;
        await bindAndLoadFromFileHandle(handle);
    } catch (error) {
        if (error?.name === 'AbortError') return;
        console.error('[qa-scenario] open file failed', error);
        alert('Open failed');
    }
}

async function bindAndLoadFromDirectoryHandle(handle) {
    const loaded = await loadWorkspaceFromDirectoryHandle(handle);
    if (!loaded?.workspace) {
        alert('Unsupported or invalid directory contents');
        return;
    }

    const writeGranted = await ensureDirectoryReadWritePermission(handle);

    clearBoundFile();
    boundDirectoryHandle = handle;
    boundDirectoryWriteEnabled = writeGranted;
    directoryFileHandleById = loaded.fileHandleById;
    setTreeMutationsEnabled(false);
    setDirectDiskSyncAvailable(writeGranted);

    applyImportedWorkspace(loaded.workspace);
    setWorkspaceBoundFileMeta(loaded.rootName, 'directory');
    applyBoundFilePath(loaded.rootName);
    if (writeGranted) {
        updateBoundFilePathInput(`Folder loaded: ${loaded.loadedJsonFileCount} JSON files (direct save enabled)`, 'bound');
        scheduleDirectoryFileFlush();
    } else {
        const tone = loaded.loadedJsonFileCount > 0 ? 'warning' : 'default';
        updateBoundFilePathInput(`Folder loaded: ${loaded.loadedJsonFileCount} JSON files (local save mode)`, tone);
    }
}

async function loadWorkspaceFromDirectoryHandle(rootHandle) {
    const rootName = rootHandle?.name || 'Opened Folder';
    const folders = [];
    const files = [];
    const fileHandleById = new Map();
    const folderIdByPath = new Map();

    const ensureFolder = (relativePath) => {
        const key = relativePath || '';
        if (folderIdByPath.has(key)) return folderIdByPath.get(key);
        const segments = key ? key.split('/') : [];
        const folderName = segments.length > 0 ? segments[segments.length - 1] : rootName;
        const parentPath = segments.length > 1 ? segments.slice(0, -1).join('/') : '';
        const parentId = segments.length > 0 ? (folderIdByPath.get(parentPath) || null) : null;
        const folder = Workspace.createFolderRecord(folderName, parentId, key);
        folders.push(folder);
        folderIdByPath.set(key, folder.id);
        return folder.id;
    };

    ensureFolder('');
    let loadedJsonFileCount = 0;

    const walkDirectory = async (dirHandle, currentPath) => {
        for await (const [entryName, entryHandle] of dirHandle.entries()) {
            if (entryHandle.kind === 'directory') {
                const nextPath = currentPath ? `${currentPath}/${entryName}` : entryName;
                ensureFolder(nextPath);
                await walkDirectory(entryHandle, nextPath);
                continue;
            }
            if (entryHandle.kind !== 'file') continue;
            if (!entryName.toLowerCase().endsWith('.json')) continue;

            let content = '';
            try {
                const file = await entryHandle.getFile();
                content = await file.text();
            } catch (error) {
                console.warn('[qa-scenario] failed to read file from directory', entryName, error);
                continue;
            }

            const folderId = ensureFolder(currentPath);
            const record = Workspace.createFileRecord(folderId, entryName, content);
            files.push(record);
            fileHandleById.set(record.id, entryHandle);
            loadedJsonFileCount += 1;
        }
    };

    await walkDirectory(rootHandle, '');

    if (files.length === 0) {
        const fallbackFolderId = ensureFolder('');
        const fallback = Workspace.createFileRecord(
            fallbackFolderId,
            DEFAULT_FILE_NAME,
            JSON.stringify(buildRequiredScenarioWithDefaults({}), null, 2)
        );
        files.push(fallback);
    }

    return {
        rootName,
        loadedJsonFileCount,
        fileHandleById,
        workspace: {
            version: WORKSPACE_VERSION,
            folders,
            files,
            uiState: {
                sourceMode: 'directory',
                expandedFolderIds: folders.map((folder) => folder.id)
            }
        }
    };
}

async function ensureDirectoryReadWritePermission(handle) {
    if (!handle || typeof handle.queryPermission !== 'function') return false;
    const options = { mode: 'readwrite' };

    let permission = await handle.queryPermission(options);
    if (permission === 'granted') return true;
    if (typeof handle.requestPermission !== 'function') return false;

    permission = await handle.requestPermission(options);
    return permission === 'granted';
}

async function bindAndLoadFromFileHandle(handle) {
    const file = await handle.getFile();
    const text = await file.text();
    const importedWorkspace = toImportedWorkspaceFromText(text);
    if (!importedWorkspace) {
        alert('Unsupported or invalid JSON format');
        return;
    }

    applyImportedWorkspace(importedWorkspace);
    boundDirectoryHandle = null;
    boundDirectoryWriteEnabled = false;
    directoryFileHandleById = new Map();
    setTreeMutationsEnabled(true);
    const readWriteGranted = await ensureReadWritePermission(handle);
    boundFileHandle = handle;
    boundFileName = file.name || 'untitled.json';
    boundFileReadonly = !readWriteGranted;
    setWorkspaceBoundFileMeta(boundFileName, 'file');
    applyBoundFilePath(boundFileName);
    if (boundFileReadonly) {
        setDirectDiskSyncAvailable(false);
        updateBoundFilePathInput('Bound read-only: write permission denied', 'warning');
    } else {
        setDirectDiskSyncAvailable(true);
        updateBoundFilePathInput('Bound: saving writes directly to file', 'bound');
        scheduleBoundFileFlush();
    }
}

async function ensureReadWritePermission(handle) {
    if (!handle || typeof handle.queryPermission !== 'function') return false;
    const options = { mode: 'readwrite' };

    let permission = await handle.queryPermission(options);
    if (permission === 'granted') return true;
    if (typeof handle.requestPermission !== 'function') return false;

    permission = await handle.requestPermission(options);
    return permission === 'granted';
}

function setWorkspaceBoundFileMeta(name, kind = 'file') {
    if (!workspace?.uiState) return;
    workspace.uiState.boundFile = {
        kind,
        name,
        boundAt: nowIso()
    };
    Workspace.persistWorkspace(workspace);
}

function clearWorkspaceBoundFileMeta() {
    if (!workspace?.uiState || !workspace.uiState.boundFile) return;
    delete workspace.uiState.boundFile;
    Workspace.persistWorkspace(workspace);
}

function clearBoundFile(options = {}) {
    const clearMeta = options.clearMeta !== false;
    boundFileHandle = null;
    boundDirectoryHandle = null;
    boundDirectoryWriteEnabled = false;
    directoryFileHandleById = new Map();
    boundFileName = '';
    applyBoundFilePath(BOUND_FILE_PATH_DEFAULT_LABEL);
    boundFileReadonly = false;
    setDirectDiskSyncAvailable(false);
    diskFlushInFlight = false;
    diskFlushQueued = false;
    directoryFlushInFlight = false;
    directoryFlushQueued = false;
    if (clearMeta) {
        clearWorkspaceBoundFileMeta();
    }
    updateStorageTargetFromWorkspaceMeta();
}

function updateStorageTargetFromWorkspaceMeta() {
    const boundMeta = workspace?.uiState?.boundFile;
    const name = boundMeta?.name;
    const kind = boundMeta?.kind || 'file';
    if (!name) {
        setTreeMutationsEnabled(true);
        setDirectDiskSyncAvailable(false);
        applyBoundFilePath(BOUND_FILE_PATH_DEFAULT_LABEL);
        updateBoundFilePathInput(BOUND_FILE_PATH_DEFAULT_TOOLTIP);
        return;
    }
    setTreeMutationsEnabled(kind !== 'directory');
    setDirectDiskSyncAvailable(false);
    applyBoundFilePath(name);
    if (kind === 'directory') {
        updateBoundFilePathInput('Not connected: re-open folder to load disk tree', 'warning');
        return;
    }
    updateBoundFilePathInput('Not connected: re-open file to resume direct save', 'warning');
}

function applyBoundFilePath(path) {
    if (!EL.boundFilePathInput) return;
    const value = path || '';
    EL.boundFilePathInput.value = value;
    EL.boundFilePathInput.title = value || BOUND_FILE_PATH_DEFAULT_TOOLTIP;
}

function updateBoundFilePathInput(label, tone = 'default') {
    if (EL.boundFilePathInput) {
        EL.boundFilePathInput.classList.remove('is-bound', 'is-warning');
    }
    if (EL.boundFileStatus) {
        EL.boundFileStatus.textContent = label;
        EL.boundFileStatus.title = label;
        EL.boundFileStatus.classList.remove('is-bound', 'is-warning');
    }
    if (tone === 'bound') {
        if (EL.boundFilePathInput) EL.boundFilePathInput.classList.add('is-bound');
        if (EL.boundFileStatus) EL.boundFileStatus.classList.add('is-bound');
    } else if (tone === 'warning') {
        if (EL.boundFilePathInput) EL.boundFilePathInput.classList.add('is-warning');
        if (EL.boundFileStatus) EL.boundFileStatus.classList.add('is-warning');
    }
}

function updateSaveIndicator(state) {
    lastSaveIndicatorState = state;
    updateSaveIndicatorView({
        saveIndicator: EL.saveIndicator,
        saveIndicatorTime: EL.saveIndicatorTime,
        saveIndicatorLabel: EL.saveIndicatorLabel
    }, state, workspace?.updatedAt);
    refreshSaveIndicatorPresentation();
}

function setTreeMutationsEnabled(isEnabled) {
    treeMutationsEnabled = Boolean(isEnabled);
    if (EL.btnNewFolder) {
        EL.btnNewFolder.title = treeMutationsEnabled
            ? 'New folder'
            : 'Folder mode is read-only in this version';
    }
    if (EL.btnNewFile) {
        EL.btnNewFile.title = treeMutationsEnabled
            ? 'New file'
            : 'Folder mode is read-only in this version';
    }
}

function setDirectDiskSyncAvailable(isAvailable) {
    directDiskSyncAvailable = Boolean(isAvailable);
    refreshSaveIndicatorPresentation();
}

function refreshSaveIndicatorPresentation() {
    if (!EL.saveIndicator) return;

    EL.saveIndicator.classList.toggle('is-local-only-hidden', directDiskSyncAvailable);

    const shouldShowLocalSaveTooltip = !directDiskSyncAvailable && lastSaveIndicatorState === 'saved';
    const tooltip = shouldShowLocalSaveTooltip
        ? (boundDirectoryHandle ? DIRECTORY_LOCAL_SAVE_TOOLTIP : LOCAL_SAVE_ONLY_TOOLTIP)
        : '';

    EL.saveIndicator.title = tooltip;
    if (EL.saveIndicatorLabel) {
        EL.saveIndicatorLabel.title = tooltip;
    }
}

function applyLineNumberVisibility() {
    applyLineNumberVisibilityView({
        toggleLineNumbers: EL.toggleLineNumbers,
        editorWrapper: EL.editorWrapper,
        editing: EL.editing,
        lineNumbers: EL.lineNumbers
    }, persistLineNumberPreference);
}

function applyLineNumberPreference() {
    applyLineNumberPreferenceFromWorkspace(workspace, EL.toggleLineNumbers);
}

function persistLineNumberPreference(shouldShow) {
    if (!workspace?.uiState) return;
    workspace.uiState.showLineNumbers = shouldShow;
    Workspace.persistWorkspace(workspace);
}

function applyFileTreePreference() {
    if (!workspace?.uiState || !EL.fileTreePanel) return;
    const shouldShow = workspace.uiState.showFileTree !== false;
    setFileTreeVisibility(shouldShow, { persist: false });
}

function applyFileTreeWidthPreference() {
    if (!workspace?.uiState || !EL.fileTreePanel) return;
    const preferred = workspace.uiState.fileTreeWidth;
    if (Number.isFinite(preferred) && preferred > 0) {
        resizerLayout.setManualFileTreeWidth(preferred);
    }
    if (isFileTreeVisible()) {
        const nextWidth = resizerLayout.getManualFileTreeWidth() ?? DEFAULT_FILE_TREE_WIDTH;
        resizerLayout.setManualFileTreeWidth(resizerLayout.applyFileTreeWidth(nextWidth, { persist: false }));
    }
}

function persistFileTreeWidthPreference(width) {
    if (!workspace?.uiState) return;
    workspace.uiState.fileTreeWidth = width;
    Workspace.persistWorkspace(workspace);
}

function setFileTreeVisibility(shouldShow, options = {}) {
    if (!EL.fileTreePanel || !EL.btnToggleTree) return;
    const persist = options.persist !== false;

    if (!shouldShow) {
        resizerLayout.stopFileTreeResizing();
    }

    EL.fileTreePanel.classList.toggle('is-collapsed', !shouldShow);
    EL.fileTreePanel.dataset.treeVisible = shouldShow ? 'true' : 'false';

    if (shouldShow) {
        const nextWidth = resizerLayout.getManualFileTreeWidth() ?? DEFAULT_FILE_TREE_WIDTH;
        resizerLayout.setManualFileTreeWidth(resizerLayout.applyFileTreeWidth(nextWidth, { persist: false }));
    }

    closeTreeMenu();
    if (persist && workspace?.uiState) {
        workspace.uiState.showFileTree = shouldShow;
        Workspace.persistWorkspace(workspace);
    }
}

function isFileTreeVisible() {
    return Boolean(EL.fileTreePanel && !EL.fileTreePanel.classList.contains('is-collapsed'));
}

function updateLineNumbers() {
    updateLineNumbersView(EL.editing, EL.lineNumbers);
}

function renderEditorFromCurrentData() {
    updateLineNumbers();
    updateHighlighting();
    setJsonValidationValidState();
    UI.updatePassHeaderState(EL.passHeaderToggle, currentData);
}

function setJsonValidationValidState() {
    setJsonValidationValidView(
        EL.jsonStatus,
        () => updateErrorPosition(-1),
        updateErrorMessage
    );
}

function setJsonValidationErrorState(label) {
    setJsonValidationErrorView(EL.jsonStatus, label);
}

function updateErrorMessage(message) {
    updateJsonErrorMessageView(EL.jsonErrorMessage, message);
}

function hasSteps(data) {
    if (!data || !Array.isArray(data.steps)) return false;
    return data.steps.some(step => !UI.isChecklistDividerStep(step));
}

function areAllStepsPassed(steps) {
    const checkableSteps = steps.filter(step => !UI.isChecklistDividerStep(step));
    if (checkableSteps.length === 0) return false;
    return checkableSteps.every(step => step.pass === true);
}

function clearStepHighlight() {
    editorHighlightManager.clearStepHighlight();
}

function renderStepHighlight(bounds) {
    editorHighlightManager.renderStepHighlight(bounds);
}

function updateStepHighlightPosition() {
    editorHighlightManager.updateStepHighlightPosition();
}

function scrollToLine(position) {
    editorHighlightManager.scrollToLine(position);
}

function updateErrorPosition(position) {
    editorHighlightManager.updateErrorPosition(position);
}

function getEditorMetrics() {
    const styles = getComputedStyle(EL.editing);
    const fontSize = parseFloat(styles.fontSize) || 13;
    let lineHeight = parseFloat(styles.lineHeight);
    if (Number.isNaN(lineHeight)) lineHeight = fontSize * 1.5;
    const paddingTop = parseFloat(styles.paddingTop) || 0;
    return { lineHeight, paddingTop };
}

function handleWindowResize() {
    const isFolded = EL.appContent.classList.contains('folded');
    resizerLayout.handleWindowResize(isFolded);
}

function setupWindowListeners() {
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('resize', handleWindowResize);
}

function handleBeforeUnload() {
    if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
    }
    if (activeFileDirty) persist();
}

function setupEventListeners() {
    setupMainEventListeners({
        el: EL,
        onDocumentKeydown: handleDocumentKeydown,
        onEditorInput: handleEditorInput,
        onEditorPaste: handleEditorPaste,
        onEditorScroll: syncScroll,
        onEditorKeydown: handleEditorKeydown,
        onEditorKeyup: handleEditorSelectionChange,
        onEditorClick: handleEditorSelectionChange,
        onEditorSelect: handleEditorSelectionChange,
        onFindInput: handleFindInput,
        onFindInputKeydown: handleFindInputKeydown,
        onReplaceInput: handleReplaceInput,
        onReplaceInputKeydown: handleReplaceInputKeydown,
        onFindNext: handleFindNext,
        onFindPrev: handleFindPrev,
        onFindClose: closeFindWidget,
        onReplaceOne: handleReplaceOne,
        onReplaceAll: handleReplaceAll,
        onFoldEditor: () => {
            const willFold = !EL.appContent.classList.contains('folded');
            if (willFold) {
                resizerLayout.stopPaneResizing();
                resizerLayout.stopFileTreeResizing();
                EL.appContent.classList.add('folded');
                EL.editorPane.style.flex = '0 0 0px';
                EL.editorPane.style.width = '0px';
                return;
            }

            EL.appContent.classList.remove('folded');
            EL.editorPane.style.width = '';
            const manualEditorWidth = resizerLayout.getManualEditorWidth();
            const manualFileTreeWidth = resizerLayout.getManualFileTreeWidth();
            if (Number.isFinite(manualEditorWidth)) {
                resizerLayout.applyEditorWidth(manualEditorWidth, { persist: false });
                if (Number.isFinite(manualFileTreeWidth) && isFileTreeVisible()) {
                    resizerLayout.applyFileTreeWidth(manualFileTreeWidth, { persist: false });
                }
                return;
            }

            EL.editorPane.style.flex = '';
            if (isFileTreeVisible()) {
                resizerLayout.applyFileTreeWidth(manualFileTreeWidth ?? DEFAULT_FILE_TREE_WIDTH, { persist: false });
            }
        },
        onFormat: runFormatAndSave,
        onToggleLineNumbers: applyLineNumberVisibility,
        onToggleFolders: () => {
            toggleAllFolders();
            closeTreeMenu();
        },
        onToggleTree: () => {
            const isCollapsed = EL.fileTreePanel?.classList.contains('is-collapsed');
            setFileTreeVisibility(Boolean(isCollapsed));
            closeTreeMenu();
        },
        onShowTree: () => {
            setFileTreeVisibility(true);
        },
        onTogglePassHeader: () => {
            if (EL.passHeaderToggle.classList.contains('disabled')) return;
            toggleAllPass();
        },
        onNewFolder: () => {
            if (!treeMutationsEnabled) {
                alert('Folder mode is read-only in this version.');
                return;
            }
            const name = window.prompt('Folder name', 'new-folder');
            if (!name) return;
            const folder = Workspace.createFolderRecord(name);
            workspace.folders.push(folder);
            persist();
        },
        onNewFile: () => {
            if (!treeMutationsEnabled) {
                alert('Folder mode is read-only in this version.');
                return;
            }
            const folderId = workspace.uiState.selectedFolderId || workspace.folders[0].id;
            const defaultName = Workspace.getNextAvailableFileName(workspace, folderId, 'scenario.json');
            const name = window.prompt('File name', defaultName);
            const trimmedName = name ? name.trim() : '';
            if (!trimmedName) return;
            const nextName = Workspace.getNextAvailableFileName(workspace, folderId, trimmedName);
            const file = Workspace.createFileRecord(folderId, nextName);
            workspace.files.push(file);
            workspace.uiState.activeFileId = file.id;
            workspace.uiState.selectedFolderId = folderId;
            workspace.uiState.selectedFileId = file.id;
            workspace.uiState.lastSelectionType = 'file';
            lastTreeSelectionType = 'file';
            persist();
            loadActiveFile();
        },
        onExport: handleExportClick,
        onImportClick: handleBindOpenClick,
        onImportFile: handleImportFile,
        onImportError: () => {
            alert('Open failed');
        }
    });
}

function handleDocumentKeydown(event) {
    if (!isEditorUndoShortcut(event, EDITOR_CONFIG)) return;
    const activeElement = document.activeElement;
    if (activeElement === EL.editing) return;
    if (isTextEditingElement(activeElement)) return;
    if (!deletedFileHistoryManager.restoreLastDeletedFile()) return;
    event.preventDefault();
}

function isTextEditingElement(element) {
    if (!element) return false;
    const tagName = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : '';
    if (tagName === 'input' || tagName === 'textarea') return true;
    return element.isContentEditable === true;
}

init();
