import { WORKSPACE_STORAGE_KEY } from './constants/storage.js';
import { AUTOSAVE_DELAY_MS, WORKSPACE_VERSION, DEFAULT_FILE_NAME } from './configs/workspace.js';
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
    updateJsonErrorMessageView
} from './modules/editor-view-state-manager.js';
import { setupMainEventListeners } from './modules/event-listener-manager.js';
import { updateFolderToggleButtonStateView, toggleAllFoldersState } from './modules/tree-folder-state-manager.js';
import { buildTreeRenderOptions } from './modules/tree-actions-manager.js';
import { createEditorHighlightManager } from './modules/editor-highlight-manager.js';

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
    lineNumbers: document.getElementById('line-numbers'),
    toggleLineNumbers: document.getElementById('toggle-line-numbers'),
    editorWrapper: document.getElementById('editor-wrapper'),
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

const EXPORT_MODE_ALL = 'all';
const EXPORT_MODE_CUSTOM = 'custom';
const EXPORT_MODE_REQUIRED_LEGACY = 'required';
const EXPORT_MODES = new Set([EXPORT_MODE_ALL, EXPORT_MODE_CUSTOM]);
const EXPORT_FORMAT = 'qa-scenario-export';
const REQUIRED_EXPORT_FIELDS = [
    'scenario',
    'steps',
    'steps.given',
    'steps.when',
    'steps.then',
    'steps.pass'
];

// --- Initialization ---

function init() {
    setupResizerLayout();
    setupExportMenuManager();
    setupTreeMenuManager();
    setupEditorSelectionManager();
    setupEditorHighlightManager();
    loadWorkspace();
    setupEventListeners();
    resizerLayout.setupResizing();
    setupWindowListeners();
    applyLineNumberVisibility();
    applyFileTreePreference();
    setupTreeMenu();
    setupExportMenu();
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
    loadActiveFile();
}

function persist() {
    Workspace.persistWorkspace(workspace);
    activeFileDirty = false;
    updateSaveIndicator('saved');
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
}

function handleEditorPaste() {
    setTimeout(handleEditorInput, 0);
}

function handleEditorKeydown(event) {
    if (isEditorSaveShortcut(event)) {
        event.preventDefault();
        runFormatAndSave();
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

function isEditorSaveShortcut(event) {
    if (!event || event.isComposing) return false;
    const hasPrimaryModifier = event.metaKey || event.ctrlKey;
    const isSaveKey = event.key === 's' || event.key === 'S' || event.code === 'KeyS';
    return hasPrimaryModifier && isSaveKey && !event.shiftKey && !event.altKey;
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
        setLastTreeSelectionType: (nextType) => { lastTreeSelectionType = nextType; },
        persist,
        loadActiveFile,
        workspaceApi: Workspace,
        prompt: (message, defaultValue) => window.prompt(message, defaultValue)
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
    currentData.steps.forEach(step => { step.pass = nextValue; });
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

async function handleImportFile(file) {
    const text = await file.text();
    const parsed = tryParseJson(text);
    if (!parsed) return alert('Invalid JSON');
    const importedWorkspace = convertImportedPayloadToWorkspace(parsed, {
        exportFormat: EXPORT_FORMAT,
        workspaceVersion: WORKSPACE_VERSION,
        defaultFileName: DEFAULT_FILE_NAME,
        createFolderRecord: Workspace.createFolderRecord,
        createFileRecord: Workspace.createFileRecord,
        normalizeExportMode,
        buildRequiredScenarioWithDefaults
    });
    if (!importedWorkspace) return alert('Unsupported import format');
    applyImportedWorkspace(importedWorkspace);
}

function updateSaveIndicator(state) {
    updateSaveIndicatorView({
        saveIndicator: EL.saveIndicator,
        saveIndicatorTime: EL.saveIndicatorTime,
        saveIndicatorLabel: EL.saveIndicatorLabel
    }, state, workspace?.updatedAt);
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
    return Boolean(data && Array.isArray(data.steps) && data.steps.length > 0);
}

function areAllStepsPassed(steps) {
    return steps.every(step => step.pass === true);
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
        onEditorInput: handleEditorInput,
        onEditorPaste: handleEditorPaste,
        onEditorScroll: syncScroll,
        onEditorKeydown: handleEditorKeydown,
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
            const name = window.prompt('Folder name', 'new-folder');
            if (!name) return;
            const folder = Workspace.createFolderRecord(name);
            workspace.folders.push(folder);
            persist();
        },
        onNewFile: () => {
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
        onImportClick: () => {
            EL.fileInput.value = '';
            EL.fileInput.click();
        },
        onImportFile: handleImportFile,
        onImportError: () => {
            alert('Import failed');
        }
    });
}

init();
