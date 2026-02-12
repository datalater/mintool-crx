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
let stepHighlightRange = null;
let resizerLayout = null;
let exportMenuManager = null;
let treeMenuManager = null;
let editorSelectionManager = null;

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
    const byPosition = getPositionFromMessage(msg);
    if (byPosition !== null) return applyErrorPosition(byPosition);

    const byLineColumn = getLineColumnFromMessage(msg);
    if (byLineColumn) return applyErrorPosition(getPositionFromLineColumn(EL.editing.value, byLineColumn));

    if (isUnexpectedEndError(msg)) return applyErrorPosition(EL.editing.value.length - 1);

    const trailingComma = findTrailingCommaPosition(EL.editing.value);
    if (trailingComma >= 0) return applyErrorPosition(trailingComma);

    updateErrorPosition(-1);
}

function getPositionFromMessage(msg) {
    const match = msg.match(/at position (\d+)/i);
    return match ? parseInt(match[1], 10) : null;
}

function getLineColumnFromMessage(msg) {
    const match = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i);
    if (!match) return null;
    return { line: parseInt(match[1], 10), column: parseInt(match[2], 10) };
}

function isUnexpectedEndError(msg) {
    return msg.includes('Unexpected end of JSON input');
}

function applyErrorPosition(position) {
    const normalized = normalizeErrorPosition(EL.editing.value, position);
    if (normalized < 0) return updateErrorPosition(-1);
    updateHighlighting(normalized);
    updateErrorPosition(normalized);
}

function renderTree() {
    UI.renderFileTree(EL.fileTree, workspace, {
        activeFileDirty,
        onToggleFolder: (id) => {
            const expanded = new Set(workspace.uiState.expandedFolderIds);
            if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
            workspace.uiState.expandedFolderIds = Array.from(expanded);
            workspace.uiState.selectedFolderId = id;
            workspace.uiState.selectedFileId = null;
            workspace.uiState.lastSelectionType = 'folder';
            lastTreeSelectionType = 'folder';
            persist();
        },
        onSelectFile: (id) => {
            workspace.uiState.activeFileId = id;
            workspace.uiState.selectedFolderId = Workspace.getFileById(workspace, id).folderId;
            workspace.uiState.selectedFileId = id;
            workspace.uiState.lastSelectionType = 'file';
            lastTreeSelectionType = 'file';
            persist();
            loadActiveFile();
        },
        onRenameFolder: (id) => {
            const f = Workspace.getFolderById(workspace, id);
            const n = window.prompt('Rename folder', f.name);
            if (n) { f.name = Workspace.getNextAvailableFolderName(workspace, n, id); persist(); }
        },
        onDeleteFolder: (id) => {
            workspace.folders = workspace.folders.filter(f => f.id !== id);
            workspace.files = workspace.files.filter(f => f.folderId !== id);
            if (workspace.uiState.selectedFolderId === id) {
                workspace.uiState.selectedFolderId = null;
            }
            if (workspace.uiState.selectedFileId) {
                const selectedFile = Workspace.getFileById(workspace, workspace.uiState.selectedFileId);
                if (!selectedFile || selectedFile.folderId === id) {
                    workspace.uiState.selectedFileId = null;
                }
            }
            persist();
            loadActiveFile();
        },
        onRenameFile: (id) => {
            const f = Workspace.getFileById(workspace, id);
            const n = window.prompt('Rename file', f.name);
            if (n) { f.name = Workspace.getNextAvailableFileName(workspace, f.folderId, n, id); persist(); }
        },
        onDeleteFile: (id) => {
            workspace.files = workspace.files.filter(f => f.id !== id);
            if (workspace.uiState.selectedFileId === id) {
                workspace.uiState.selectedFileId = null;
            }
            persist();
            loadActiveFile();
        }
    });
    updateFolderToggleButtonState();
}

function updateFolderToggleButtonState() {
    if (!EL.btnToggleFolders || !workspace) return;

    const folders = Array.isArray(workspace.folders) ? workspace.folders : [];
    if (folders.length === 0) {
        EL.btnToggleFolders.disabled = true;
        if (EL.fileTreePanel) {
            EL.fileTreePanel.dataset.foldersExpanded = 'false';
        }
        return;
    }

    const activeFile = Workspace.getActiveFile(workspace);
    const activeFolderId = activeFile ? activeFile.folderId : null;
    const expandedSet = new Set(workspace.uiState?.expandedFolderIds || []);
    if (activeFolderId) expandedSet.add(activeFolderId);

    const allExpanded = folders.every(folder => expandedSet.has(folder.id));
    EL.btnToggleFolders.disabled = false;
    if (EL.fileTreePanel) {
        EL.fileTreePanel.dataset.foldersExpanded = allExpanded ? 'true' : 'false';
    }
}

function toggleAllFolders() {
    if (!workspace || !workspace.uiState) return;

    const folders = Array.isArray(workspace.folders) ? workspace.folders : [];
    if (folders.length === 0) return;

    const activeFile = Workspace.getActiveFile(workspace);
    const activeFolderId = activeFile ? activeFile.folderId : null;
    const expandedSet = new Set(workspace.uiState.expandedFolderIds || []);
    if (activeFolderId) expandedSet.add(activeFolderId);

    const allExpanded = folders.every(folder => expandedSet.has(folder.id));
    if (allExpanded) {
        workspace.uiState.expandedFolderIds = activeFolderId ? [activeFolderId] : [];
    } else {
        workspace.uiState.expandedFolderIds = folders.map(folder => folder.id);
    }

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
    EL.saveIndicator.classList.remove('is-dirty', 'is-saving', 'is-saved');
    EL.saveIndicator.classList.add(`is-${state}`);
    if (state === 'saved') {
        updateLastSavedTime(workspace?.updatedAt);
    } else if (state === 'dirty' && EL.saveIndicatorTime) {
        EL.saveIndicatorTime.textContent = '';
    }
    EL.saveIndicatorLabel.textContent = state === 'dirty' ? 'Unsaved' : (state === 'saving' ? 'Saving...' : 'Saved');
}

function updateLastSavedTime(value) {
    if (!EL.saveIndicatorTime) return;
    EL.saveIndicatorTime.textContent = formatSavedTime(value);
}

function formatSavedTime(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '---- -- -- --:--:--';
    const yyyy = String(date.getFullYear());
    const mon = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mon}-${dd} ${hh}:${mm}:${ss}`;
}

function applyLineNumberVisibility() {
    const shouldShow = EL.toggleLineNumbers.checked;
    EL.editorWrapper.classList.toggle('has-line-numbers', shouldShow);
    if (shouldShow) updateLineNumbers();
    persistLineNumberPreference(shouldShow);
}

function applyLineNumberPreference() {
    if (!workspace?.uiState) return;
    EL.toggleLineNumbers.checked = workspace.uiState.showLineNumbers !== false;
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
    const lineCount = Math.max(1, EL.editing.value.split('\n').length);
    const lines = Array.from({ length: lineCount }, (_, i) => i + 1);
    EL.lineNumbers.textContent = lines.join('\n');
}

function renderEditorFromCurrentData() {
    updateLineNumbers();
    updateHighlighting();
    setJsonValidationValidState();
    UI.updatePassHeaderState(EL.passHeaderToggle, currentData);
}

function setJsonValidationValidState() {
    EL.jsonStatus.textContent = "Valid";
    EL.jsonStatus.classList.remove('error');
    updateErrorPosition(-1);
    updateErrorMessage('');
}

function setJsonValidationErrorState(label) {
    EL.jsonStatus.textContent = label;
    EL.jsonStatus.classList.add('error');
}

function updateErrorMessage(message) {
    if (!EL.jsonErrorMessage) return;
    const normalized = String(message || '').trim();
    EL.jsonErrorMessage.textContent = normalized;
    EL.jsonErrorMessage.title = normalized;
    EL.jsonErrorMessage.classList.toggle('is-hidden', !normalized);
}

function formatParseErrorMessage(error) {
    return `JSON parse error: ${getSafeErrorMessage(error)}`;
}

function formatRuntimeErrorMessage(error) {
    const name = error && error.name ? error.name : 'Error';
    return `Render error (${name}): ${getSafeErrorMessage(error)}`;
}

function getSafeErrorMessage(error) {
    if (error && typeof error.message === 'string' && error.message.trim()) {
        return error.message.trim();
    }
    return String(error || 'Unknown error').trim();
}

function hasSteps(data) {
    return Boolean(data && Array.isArray(data.steps) && data.steps.length > 0);
}

function areAllStepsPassed(steps) {
    return steps.every(step => step.pass === true);
}

function clearStepHighlight() {
    stepHighlightRange = null;
    EL.highlightOverlay.innerHTML = '';
}

function renderStepHighlight(bounds) {
    stepHighlightRange = getLineRange(EL.editing.value, bounds.start, bounds.end);
    EL.highlightOverlay.innerHTML = '<div class="highlight-block"></div>';
    updateStepHighlightPosition();
}

function updateStepHighlightPosition() {
    if (!stepHighlightRange) return;
    const block = EL.highlightOverlay.firstElementChild;
    if (!block) return;

    const metrics = getEditorMetrics();
    const height = Math.max(1, stepHighlightRange.endLine - stepHighlightRange.startLine + 1) * metrics.lineHeight;
    const top = metrics.paddingTop + (stepHighlightRange.startLine - 1) * metrics.lineHeight - EL.editing.scrollTop;

    block.style.top = `${top}px`;
    block.style.height = `${height}px`;
}

function getLineRange(text, start, end) {
    const startLoc = getLineColumn(text, start);
    const endLoc = getLineColumn(text, end);
    return { startLine: startLoc.line, endLine: endLoc.line };
}

function scrollToLine(position) {
    const line = getLineColumn(EL.editing.value, position).line;
    const metrics = getEditorMetrics();
    const targetTop = metrics.paddingTop + (line - 1) * metrics.lineHeight;
    EL.editing.scrollTop = Math.max(0, targetTop - (EL.editing.clientHeight / 3));
    updateStepHighlightPosition();
}

function updateErrorPosition(position) {
    if (!Number.isFinite(position) || position < 0) {
        EL.jsonErrorPosition.textContent = '';
        EL.jsonErrorPosition.classList.add('is-hidden');
        return;
    }

    const location = getLineColumn(EL.editing.value, position);
    EL.jsonErrorPosition.textContent = `Line ${location.line}, Col ${location.column}`;
    EL.jsonErrorPosition.classList.remove('is-hidden');
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
    EL.editing.addEventListener('input', handleEditorInput);
    EL.editing.addEventListener('paste', handleEditorPaste);
    EL.editing.addEventListener('scroll', syncScroll);
    EL.editing.addEventListener('keydown', handleEditorKeydown);

    EL.btnFoldEditor.addEventListener('click', () => {
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
    });
    
    EL.btnFormat.addEventListener('click', runFormatAndSave);

    EL.toggleLineNumbers.addEventListener('change', applyLineNumberVisibility);

    EL.btnToggleFolders.addEventListener('click', () => {
        toggleAllFolders();
        closeTreeMenu();
    });

    EL.btnToggleTree.addEventListener('click', () => {
        const isCollapsed = EL.fileTreePanel?.classList.contains('is-collapsed');
        setFileTreeVisibility(Boolean(isCollapsed));
        closeTreeMenu();
    });

    EL.btnShowTree.addEventListener('click', () => {
        setFileTreeVisibility(true);
    });

    EL.passHeaderToggle.addEventListener('click', () => {
        if (EL.passHeaderToggle.classList.contains('disabled')) return;
        toggleAllPass();
    });

    EL.btnNewFolder.addEventListener('click', () => {
        const n = window.prompt('Folder name', 'new-folder');
        if (n) {
            const f = Workspace.createFolderRecord(n);
            workspace.folders.push(f);
            persist();
        }
    });

    EL.btnNewFile.addEventListener('click', () => {
        const fId = workspace.uiState.selectedFolderId || workspace.folders[0].id;
        const defaultName = Workspace.getNextAvailableFileName(workspace, fId, 'scenario.json');
        const n = window.prompt('File name', defaultName);
        const trimmedName = n ? n.trim() : '';
        if (trimmedName) {
            const nextName = Workspace.getNextAvailableFileName(workspace, fId, trimmedName);
            const f = Workspace.createFileRecord(fId, nextName);
            workspace.files.push(f);
            workspace.uiState.activeFileId = f.id;
            workspace.uiState.selectedFolderId = fId;
            workspace.uiState.selectedFileId = f.id;
            workspace.uiState.lastSelectionType = 'file';
            lastTreeSelectionType = 'file';
            persist();
            loadActiveFile();
        }
    });

    EL.btnExport.addEventListener('click', handleExportClick);

    EL.btnImport.addEventListener('click', () => {
        EL.fileInput.value = '';
        EL.fileInput.click();
    });

    EL.fileInput.addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        try {
            await handleImportFile(file);
        } catch (error) {
            alert('Import failed');
        }
    });
}

init();
