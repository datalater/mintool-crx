import { WORKSPACE_STORAGE_KEY } from './constants/storage.js';
import { AUTOSAVE_DELAY_MS, WORKSPACE_VERSION, DEFAULT_FILE_NAME } from './configs/workspace.js';
import { tryParseJson } from './utils/json.js';
import { nowTs, nowIso } from './utils/date.js';
import * as Workspace from './modules/workspace-manager.js';
import * as UI from './modules/ui-renderer.js';
import * as Editor from './modules/editor-manager.js';
import { captureEditorSelectionSnapshot, restoreEditorSelectionSnapshot } from './modules/editor-caret-manager.js';

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
let manualEditorWidth = null;
let manualFileTreeWidth = null;
const MIN_EDITOR_WIDTH = 0;
const DEFAULT_FILE_TREE_WIDTH = 260;
const MIN_FILE_TREE_WIDTH = 180;
const MIN_JSON_EDITOR_WIDTH = 280;
let stepHighlightRange = null;
let stopPaneResizing = () => {};
let stopFileTreeResizing = () => {};
let visibleExportFieldPaths = [];

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
const REQUIRED_EXPORT_FIELD_SET = new Set(REQUIRED_EXPORT_FIELDS);

// --- Initialization ---

function init() {
    loadWorkspace();
    setupEventListeners();
    setupResizing();
    setupWindowListeners();
    applyLineNumberVisibility();
    applyFileTreePreference();
    setupTreeMenu();
    setupExportMenu();
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
        unindentSelection();
    } else {
        indentSelection();
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

function indentSelection() {
    updateSelectionBlock((line) => `  ${line}`, () => 2);
}

function unindentSelection() {
    updateSelectionBlock(removeLeadingIndent, getUnindentDelta);
}

function updateSelectionBlock(transformLine, getDelta) {
    const info = getSelectionInfo();
    const block = info.text.slice(info.blockStart, info.blockEnd);
    const parts = splitLines(block);
    const deltas = parts.lines.map((line) => getDelta(line));
    const nextBlock = parts.lines.map(transformLine).join('\n');
    applyBlockUpdate(info, parts.lineStarts, deltas, block, nextBlock);
}

function getSelectionInfo() {
    const start = EL.editing.selectionStart;
    const end = EL.editing.selectionEnd;
    const text = EL.editing.value;
    const blockStart = text.lastIndexOf('\n', start - 1) + 1;
    const blockEnd = getBlockEnd(text, end);
    return { text, start, end, blockStart, blockEnd };
}

function getBlockEnd(text, end) {
    const lineEnd = text.indexOf('\n', end);
    return lineEnd === -1 ? text.length : lineEnd;
}

function splitLines(block) {
    const lines = block.split('\n');
    const lineStarts = [0];
    for (let i = 1; i < lines.length; i++) {
        lineStarts.push(lineStarts[i - 1] + lines[i - 1].length + 1);
    }
    return { lines, lineStarts };
}

function getUnindentDelta(line) {
    if (line.startsWith('  ')) return -2;
    return 0;
}

function removeLeadingIndent(line) {
    if (line.startsWith('  ')) return line.slice(2);
    return line;
}

function applyBlockUpdate(info, lineStarts, deltas, block, nextBlock) {
    const startInBlock = info.start - info.blockStart;
    const endInBlock = info.end - info.blockStart;
    const nextStart = info.blockStart + adjustIndex(startInBlock, lineStarts, deltas);
    const nextEnd = info.blockStart + adjustIndex(endInBlock, lineStarts, deltas);
    EL.editing.setRangeText(nextBlock, info.blockStart, info.blockEnd, 'select');
    EL.editing.selectionStart = nextStart;
    EL.editing.selectionEnd = nextEnd;
}

function adjustIndex(indexInBlock, lineStarts, deltas) {
    let adjusted = indexInBlock;
    for (let i = 0; i < lineStarts.length; i++) {
        if (lineStarts[i] >= indexInBlock) break;
        adjusted += deltas[i];
    }
    return adjusted;
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
    if (!EL.btnTreeMenu || !EL.treeMenu) return;
    EL.btnTreeMenu.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleTreeMenu();
    });
    document.addEventListener('click', handleTreeMenuOutsideClick);
    document.addEventListener('keydown', handleTreeMenuEscape);
}

function toggleTreeMenu() {
    closeExportMenu();
    setTreeMenuOpen(!EL.treeMenu.classList.contains('is-open'));
}

function setTreeMenuOpen(isOpen) {
    if (!EL.treeMenu || !EL.btnTreeMenu) return;
    EL.treeMenu.classList.toggle('is-open', isOpen);
    EL.btnTreeMenu.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function closeTreeMenu() {
    setTreeMenuOpen(false);
}

function handleTreeMenuOutsideClick(event) {
    if (!EL.treeMenu || !EL.btnTreeMenu) return;
    if (EL.treeMenu.contains(event.target)) return;
    if (EL.btnTreeMenu.contains(event.target)) return;
    setTreeMenuOpen(false);
}

function handleTreeMenuEscape(event) {
    if (event.key !== 'Escape') return;
    setTreeMenuOpen(false);
}

function setupExportMenu() {
    if (!EL.btnExportMenu || !EL.exportOptionsMenu) return;
    EL.btnExportMenu.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleExportMenu();
    });

    const modeInputs = [EL.exportModeAll, EL.exportModeCustom].filter(Boolean);
    modeInputs.forEach((input) => {
        input.addEventListener('change', handleExportModeChange);
    });

    if (EL.exportFieldSearch) {
        EL.exportFieldSearch.addEventListener('input', renderExportFieldList);
    }
    if (EL.exportFieldList) {
        EL.exportFieldList.addEventListener('change', handleExportFieldSelectionChange);
    }
    if (EL.btnExportSelectAll) {
        EL.btnExportSelectAll.addEventListener('click', selectVisibleExportFields);
    }
    if (EL.btnExportClearAll) {
        EL.btnExportClearAll.addEventListener('click', clearVisibleExportFields);
    }

    document.addEventListener('click', handleExportMenuOutsideClick);
    document.addEventListener('keydown', handleExportMenuEscape);
    syncExportOptionUiFromWorkspace();
}

function toggleExportMenu() {
    setExportMenuOpen(!EL.exportOptionsMenu.classList.contains('is-open'));
}

function setExportMenuOpen(isOpen) {
    if (!EL.exportOptionsMenu || !EL.btnExportMenu) return;
    EL.exportOptionsMenu.classList.toggle('is-open', isOpen);
    EL.btnExportMenu.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) {
        closeTreeMenu();
        if (EL.exportFieldSearch) {
            EL.exportFieldSearch.value = '';
        }
        renderExportFieldList();
    }
}

function closeExportMenu() {
    setExportMenuOpen(false);
}

function handleExportMenuOutsideClick(event) {
    if (!EL.exportOptionsMenu || !EL.exportSplit) return;
    if (EL.exportSplit.contains(event.target)) return;
    closeExportMenu();
}

function handleExportMenuEscape(event) {
    if (event.key !== 'Escape') return;
    closeExportMenu();
}

function syncExportOptionUiFromWorkspace() {
    const preferences = getExportPreferences();
    setExportModeInputState(preferences.mode);
    updateExportMenuVisibility(preferences.mode);
    updateExportButtonLabel(preferences.mode);
    renderExportFieldList();
}

function handleExportModeChange(event) {
    const nextMode = normalizeExportMode(event?.target?.value);
    const previous = getExportPreferences();
    persistExportPreferences({ mode: nextMode, customFields: previous.customFields });
    setExportModeInputState(nextMode);
    updateExportMenuVisibility(nextMode);
    updateExportButtonLabel(nextMode);
    renderExportFieldList();
}

function setExportModeInputState(mode) {
    if (EL.exportModeAll) EL.exportModeAll.checked = mode === EXPORT_MODE_ALL;
    if (EL.exportModeCustom) EL.exportModeCustom.checked = mode === EXPORT_MODE_CUSTOM;
}

function updateExportMenuVisibility(mode) {
    if (!EL.exportCustomOptions) return;
    EL.exportCustomOptions.classList.toggle('is-hidden', mode !== EXPORT_MODE_CUSTOM);
}

function updateExportButtonLabel(mode) {
    if (!EL.btnExport) return;
    const modeLabel = mode === EXPORT_MODE_CUSTOM ? '직접 선택' : '전체 필드';
    EL.btnExport.title = `Export (${modeLabel})`;
    EL.btnExport.setAttribute('aria-label', `Export (${modeLabel})`);
}

function getExportPreferences() {
    const uiState = workspace?.uiState || {};
    return {
        mode: normalizeExportMode(uiState.exportMode),
        customFields: normalizeCustomExportFields(uiState.customExportFields)
    };
}

function normalizeExportMode(value) {
    if (value === EXPORT_MODE_REQUIRED_LEGACY) return EXPORT_MODE_CUSTOM;
    return EXPORT_MODES.has(value) ? value : EXPORT_MODE_ALL;
}

function normalizeCustomExportFields(fields) {
    if (!Array.isArray(fields)) return [];
    const deduped = new Set();
    fields.forEach((field) => {
        const canonical = canonicalizeExportFieldPath(field);
        if (!canonical) return;
        if (isRequiredExportFieldPath(canonical)) return;
        deduped.add(canonical);
    });
    return [...deduped];
}

function canonicalizeExportFieldPath(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    const withoutArrays = trimmed.replace(/\[\]/g, '');
    const normalized = withoutArrays.replace(/\.{2,}/g, '.').replace(/^\.|\.$/g, '');
    return normalized;
}

function persistExportPreferences(preferences) {
    if (!workspace?.uiState) return;
    workspace.uiState.exportMode = normalizeExportMode(preferences.mode);
    workspace.uiState.customExportFields = normalizeCustomExportFields(preferences.customFields);
    Workspace.persistWorkspace(workspace);
}

function renderExportFieldList() {
    if (!EL.exportFieldList || !EL.exportFieldCount || !EL.exportFieldEmpty) return;

    const preferences = getExportPreferences();
    const allFields = collectWorkspaceFieldPaths();
    const requiredFields = allFields.filter(isRequiredExportFieldPath);
    const optionalFields = allFields.filter(field => !isRequiredExportFieldPath(field));
    const normalizedCustomFields = normalizeHierarchicalExportSelections(preferences.customFields, optionalFields);
    if (!hasSameFieldSet(preferences.customFields, normalizedCustomFields)) {
        persistExportPreferences({ mode: preferences.mode, customFields: normalizedCustomFields });
    }

    const query = (EL.exportFieldSearch?.value || '').trim().toLowerCase();
    const visibleOptional = query
        ? optionalFields.filter(field => field.toLowerCase().includes(query))
        : optionalFields;
    visibleExportFieldPaths = visibleOptional;

    EL.exportFieldList.innerHTML = '';
    if (visibleOptional.length === 0 && query) {
        EL.exportFieldEmpty.classList.remove('is-hidden');
    } else {
        EL.exportFieldEmpty.classList.add('is-hidden');
    }

    const selectedFields = new Set(normalizedCustomFields);
    const fragment = document.createDocumentFragment();

    requiredFields.forEach((field) => {
        fragment.appendChild(createExportFieldOption(field, {
            checked: true,
            required: true
        }));
    });

    visibleOptional.forEach((field) => {
        fragment.appendChild(createExportFieldOption(field, {
            checked: selectedFields.has(field),
            indeterminate: !selectedFields.has(field) && hasSelectedDescendantField(field, selectedFields),
            required: false
        }));
    });

    EL.exportFieldList.appendChild(fragment);

    EL.exportFieldCount.textContent = `required ${requiredFields.length} (always included) · selected ${selectedFields.size} / optional ${optionalFields.length}`;
}

function createExportFieldOption(field, options = {}) {
    const isRequired = options.required === true;
    const isChecked = isRequired || options.checked === true;
    const isIndeterminate = options.indeterminate === true;
    const label = document.createElement('label');
    label.className = isRequired ? 'export-field-option is-required' : 'export-field-option';
    label.title = isRequired ? 'required field' : field;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.field = field;
    checkbox.checked = isChecked;
    checkbox.disabled = isRequired;
    if (!isRequired) {
        checkbox.indeterminate = isIndeterminate;
    }

    const name = document.createElement('span');
    name.className = 'export-field-name';
    name.textContent = field;

    if (isRequired) {
        const badge = document.createElement('span');
        badge.className = 'export-required-badge';
        badge.textContent = 'required';
        badge.title = 'required field';
        label.appendChild(checkbox);
        label.appendChild(name);
        label.appendChild(badge);
        return label;
    }

    label.appendChild(checkbox);
    label.appendChild(name);
    return label;
}

function isRequiredExportFieldPath(field) {
    const canonical = canonicalizeExportFieldPath(field);
    return REQUIRED_EXPORT_FIELD_SET.has(canonical);
}

function hasSameFieldSet(left, right) {
    if (left.length !== right.length) return false;
    const leftSet = new Set(left);
    for (const field of right) {
        if (!leftSet.has(field)) return false;
    }
    return true;
}

function normalizeHierarchicalExportSelections(fields, allOptionalFields) {
    const optionalSet = new Set(allOptionalFields);
    const normalized = new Set();

    fields.forEach((field) => {
        const canonical = canonicalizeExportFieldPath(field);
        if (!canonical) return;
        if (!optionalSet.has(canonical)) return;
        normalized.add(canonical);
    });

    const sortedFields = [...allOptionalFields].sort((left, right) => {
        return getFieldDepth(right) - getFieldDepth(left);
    });

    sortedFields.forEach((field) => {
        const descendants = getStrictDescendantFieldPaths(field, allOptionalFields);
        if (descendants.length === 0) return;
        if (descendants.every(descendant => normalized.has(descendant))) {
            normalized.add(field);
            return;
        }
        normalized.delete(field);
    });

    return [...normalized].sort((a, b) => a.localeCompare(b));
}

function getFieldDepth(field) {
    if (!field) return 0;
    return field.split('.').filter(Boolean).length;
}

function hasSelectedDescendantField(field, selectedFields) {
    const prefix = `${field}.`;
    for (const selected of selectedFields) {
        if (selected.startsWith(prefix)) {
            return true;
        }
    }
    return false;
}

function getStrictDescendantFieldPaths(field, allFields) {
    const prefix = `${field}.`;
    return allFields.filter(candidate => candidate.startsWith(prefix));
}

function getDescendantFieldPaths(field, allFields) {
    const prefix = `${field}.`;
    return allFields.filter(candidate => candidate === field || candidate.startsWith(prefix));
}

function applyFieldSelectionWithHierarchy(selectedFields, field, isChecked, allOptionalFields) {
    const targets = getDescendantFieldPaths(field, allOptionalFields);
    targets.forEach((target) => {
        if (isChecked) {
            selectedFields.add(target);
        } else {
            selectedFields.delete(target);
        }
    });
}

function handleExportFieldSelectionChange(event) {
    const target = event.target;
    if (!target || target.type !== 'checkbox') return;
    if (target.disabled) return;
    const field = canonicalizeExportFieldPath(target.dataset.field);
    if (!field) return;

    const preferences = getExportPreferences();
    const selected = new Set(preferences.customFields);
    const allOptionalFields = getOptionalExportFieldPaths();
    applyFieldSelectionWithHierarchy(selected, field, target.checked, allOptionalFields);
    const normalized = normalizeHierarchicalExportSelections([...selected], allOptionalFields);
    persistExportPreferences({ mode: preferences.mode, customFields: normalized });
    renderExportFieldList();
}

function selectVisibleExportFields() {
    const preferences = getExportPreferences();
    const selected = new Set(preferences.customFields);
    const allOptionalFields = getOptionalExportFieldPaths();
    visibleExportFieldPaths.forEach((field) => {
        applyFieldSelectionWithHierarchy(selected, field, true, allOptionalFields);
    });
    const normalized = normalizeHierarchicalExportSelections([...selected], allOptionalFields);
    persistExportPreferences({ mode: preferences.mode, customFields: normalized });
    renderExportFieldList();
}

function clearVisibleExportFields() {
    const preferences = getExportPreferences();
    const selected = new Set(preferences.customFields);
    const allOptionalFields = getOptionalExportFieldPaths();
    visibleExportFieldPaths.forEach((field) => {
        applyFieldSelectionWithHierarchy(selected, field, false, allOptionalFields);
    });
    const normalized = normalizeHierarchicalExportSelections([...selected], allOptionalFields);
    persistExportPreferences({ mode: preferences.mode, customFields: normalized });
    renderExportFieldList();
}

function getOptionalExportFieldPaths() {
    return collectWorkspaceFieldPaths().filter(field => !isRequiredExportFieldPath(field));
}

function collectWorkspaceFieldPaths() {
    const paths = new Set(REQUIRED_EXPORT_FIELDS);
    const files = Array.isArray(workspace?.files) ? workspace.files : [];

    files.forEach((file) => {
        const parsed = tryParseJson(file?.content);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
        collectFieldPaths(parsed, '', paths);
    });

    return [...paths].sort((a, b) => a.localeCompare(b));
}

function collectFieldPaths(value, prefix, bucket) {
    if (Array.isArray(value)) {
        if (!prefix) return;
        value.forEach((item) => {
            collectFieldPaths(item, prefix, bucket);
        });
        return;
    }

    if (!value || typeof value !== 'object') return;
    Object.keys(value).forEach((key) => {
        const nextPath = prefix ? `${prefix}.${key}` : key;
        bucket.add(nextPath);
        collectFieldPaths(value[key], nextPath, bucket);
    });
}

function handleExportClick() {
    const preferences = getExportPreferences();
    const payload = buildExportPayload(preferences);
    downloadExportPayload(payload);
}

function buildExportPayload(preferences) {
    const folderMap = new Map((workspace?.folders || []).map(folder => [folder.id, folder.name]));
    const files = (workspace?.files || []).map((file, index) => buildExportFileRecord(file, index, folderMap, preferences));

    return {
        format: EXPORT_FORMAT,
        version: WORKSPACE_VERSION,
        exportedAt: nowIso(),
        exportMode: preferences.mode,
        requiredFields: [...REQUIRED_EXPORT_FIELDS],
        customFields: preferences.mode === EXPORT_MODE_CUSTOM ? preferences.customFields : [],
        files
    };
}

function buildExportFileRecord(file, index, folderMap, preferences) {
    const name = typeof file?.name === 'string' && file.name.trim()
        ? file.name
        : `scenario-${index + 1}.json`;
    const folder = folderMap.get(file?.folderId) || 'Imported';
    const parsed = tryParseJson(file?.content);
    const base = { name, folder };

    if (parsed === null) {
        return {
            ...base,
            rawContent: file?.content || ''
        };
    }

    return {
        ...base,
        data: buildScenarioDataForExport(parsed, preferences)
    };
}

function buildScenarioDataForExport(parsed, preferences) {
    if (preferences.mode === EXPORT_MODE_ALL) {
        return parsed;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return buildRequiredScenarioWithDefaults({});
    }

    const selectedPaths = preferences.mode === EXPORT_MODE_CUSTOM
        ? [...REQUIRED_EXPORT_FIELDS, ...preferences.customFields]
        : [...REQUIRED_EXPORT_FIELDS];
    const selectorTree = buildFieldSelectorTree(selectedPaths);
    const selected = selectValueByFieldTree(parsed, selectorTree);
    return buildRequiredScenarioWithDefaults(selected);
}

function buildRequiredScenarioWithDefaults(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? { ...input } : {};
    const scenario = typeof source.scenario === 'string' && source.scenario.trim()
        ? source.scenario
        : 'Untitled Scenario';
    const steps = Array.isArray(source.steps)
        ? source.steps.map(step => buildRequiredStepWithDefaults(step))
        : [];
    return {
        ...source,
        scenario,
        steps
    };
}

function buildRequiredStepWithDefaults(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? { ...input } : {};
    return {
        ...source,
        given: toChecklistArray(source.given),
        when: toChecklistArray(source.when),
        then: toChecklistArray(source.then),
        pass: source.pass === true
    };
}

function buildFieldSelectorTree(paths) {
    const root = createFieldSelectorNode();
    paths.forEach((path) => {
        const canonical = canonicalizeExportFieldPath(path);
        if (!canonical) return;
        const tokens = canonical.split('.').filter(Boolean);
        appendFieldSelectorPath(root, tokens);
    });
    return root;
}

function createFieldSelectorNode() {
    return {
        includeSelf: false,
        children: new Map()
    };
}

function appendFieldSelectorPath(root, tokens) {
    let current = root;
    tokens.forEach((token, index) => {
        if (!current.children.has(token)) {
            current.children.set(token, createFieldSelectorNode());
        }
        current = current.children.get(token);
        if (index === tokens.length - 1) {
            current.includeSelf = true;
        }
    });
}

function selectValueByFieldTree(value, node) {
    if (!node) return undefined;
    if (Array.isArray(value)) return selectArrayByFieldTree(value, node);
    if (!value || typeof value !== 'object') {
        return node.includeSelf ? value : undefined;
    }

    if (node.includeSelf && node.children.size === 0) {
        return cloneExportValue(value);
    }

    const output = {};
    node.children.forEach((childNode, key) => {
        const childValue = selectValueByFieldTree(value[key], childNode);
        if (childValue !== undefined) {
            output[key] = childValue;
        }
    });

    if (Object.keys(output).length > 0) {
        return output;
    }

    if (node.includeSelf) {
        return cloneExportValue(value);
    }
    return undefined;
}

function selectArrayByFieldTree(value, node) {
    if (!Array.isArray(value)) return undefined;

    if (node.includeSelf && node.children.size === 0) {
        return cloneExportValue(value);
    }

    const selectedItems = value.map(item => selectValueByFieldTree(item, node));

    if (selectedItems.some(item => item !== undefined)) {
        return selectedItems.map(item => (item === undefined ? {} : item));
    }

    if (node.includeSelf) {
        return cloneExportValue(value);
    }
    return [];
}

function cloneExportValue(value) {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_) {
        return value;
    }
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

function formatExportFilenameDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'unknown-date';
    const yyyy = String(date.getFullYear());
    const mon = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mon}-${dd}_${hh}-${mm}-${ss}`;
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
    const importedWorkspace = toWorkspaceFromImportedPayload(parsed);
    if (!importedWorkspace) return alert('Unsupported import format');
    applyImportedWorkspace(importedWorkspace);
}

function toWorkspaceFromImportedPayload(payload) {
    if (isExportPackagePayload(payload)) {
        return buildWorkspaceFromExportPackage(payload);
    }
    if (isWorkspacePayload(payload)) {
        return payload;
    }
    if (isScenarioPayload(payload)) {
        return buildWorkspaceFromSingleScenario(payload);
    }
    return null;
}

function isWorkspacePayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
    return Array.isArray(payload.files)
        || Array.isArray(payload.rules)
        || Array.isArray(payload.folders)
        || Boolean(payload.uiState);
}

function isScenarioPayload(payload) {
    return Boolean(payload && typeof payload === 'object' && !Array.isArray(payload) && Array.isArray(payload.steps));
}

function isExportPackagePayload(payload) {
    return Boolean(payload
        && typeof payload === 'object'
        && payload.format === EXPORT_FORMAT
        && Array.isArray(payload.files));
}

function buildWorkspaceFromSingleScenario(scenarioData) {
    const folder = Workspace.createFolderRecord('Imported');
    const file = Workspace.createFileRecord(folder.id, `${DEFAULT_FILE_NAME || 'scenario'}.json`, JSON.stringify(scenarioData, null, 2));
    return {
        version: WORKSPACE_VERSION,
        folders: [folder],
        files: [file],
        uiState: {}
    };
}

function buildWorkspaceFromExportPackage(payload) {
    const folderByName = new Map();
    const folders = [];
    const files = [];
    const entries = Array.isArray(payload.files) ? payload.files : [];

    const getFolderId = (name) => {
        const normalized = normalizeFolderName(name);
        if (folderByName.has(normalized)) return folderByName.get(normalized).id;
        const folder = Workspace.createFolderRecord(normalized);
        folderByName.set(normalized, folder);
        folders.push(folder);
        return folder.id;
    };

    entries.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object') return;
        const folderId = getFolderId(entry.folder);
        const nextName = normalizeImportedFileName(entry.name, index);
        const content = normalizeImportedFileContent(entry);
        files.push(Workspace.createFileRecord(folderId, nextName, content));
    });

    return {
        version: WORKSPACE_VERSION,
        folders,
        files,
        uiState: {
            exportMode: normalizeExportMode(payload.exportMode),
            customExportFields: Array.isArray(payload.customFields) ? payload.customFields : []
        }
    };
}

function normalizeFolderName(value) {
    const name = typeof value === 'string' ? value.trim() : '';
    return name || 'Imported';
}

function normalizeImportedFileName(value, index) {
    const name = typeof value === 'string' ? value.trim() : '';
    if (name) return name;
    return `scenario-${index + 1}.json`;
}

function normalizeImportedFileContent(entry) {
    if (typeof entry.rawContent === 'string') return entry.rawContent;
    if (Object.prototype.hasOwnProperty.call(entry, 'data')) {
        return JSON.stringify(entry.data, null, 2);
    }
    return JSON.stringify(buildRequiredScenarioWithDefaults({}), null, 2);
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
        manualFileTreeWidth = preferred;
    }
    if (isFileTreeVisible()) {
        const nextWidth = manualFileTreeWidth ?? DEFAULT_FILE_TREE_WIDTH;
        manualFileTreeWidth = applyFileTreeWidth(nextWidth, { persist: false });
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
        stopFileTreeResizing();
    }

    EL.fileTreePanel.classList.toggle('is-collapsed', !shouldShow);
    EL.fileTreePanel.dataset.treeVisible = shouldShow ? 'true' : 'false';

    if (shouldShow) {
        const nextWidth = manualFileTreeWidth ?? DEFAULT_FILE_TREE_WIDTH;
        manualFileTreeWidth = applyFileTreeWidth(nextWidth, { persist: false });
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

function getLineColumn(text, position) {
    const clamped = Math.max(0, Math.min(position, text.length));
    let line = 1;
    let column = 1;

    for (let i = 0; i < clamped; i++) {
        if (text[i] === '\n') {
            line += 1;
            column = 1;
        } else {
            column += 1;
        }
    }

    return { line, column };
}

function getPositionFromLineColumn(text, location) {
    if (!location || location.line < 1 || location.column < 1) return -1;
    let line = 1;
    let index = 0;

    while (index < text.length && line < location.line) {
        if (text[index] === '\n') line += 1;
        index += 1;
    }

    const position = index + location.column - 1;
    return normalizeErrorPosition(text, position);
}

function findTrailingCommaPosition(text) {
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length - 1; i++) {
        const char = text[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\' && inString) {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString || char !== ',') continue;
        const next = findNextNonWhitespace(text, i + 1);
        if (next !== -1 && (text[next] === ']' || text[next] === '}')) return i;
    }

    return -1;
}

function findNextNonWhitespace(text, start) {
    for (let i = start; i < text.length; i++) {
        if (!/\s/.test(text[i])) return i;
    }
    return -1;
}

function normalizeErrorPosition(text, position) {
    if (!Number.isFinite(position) || text.length === 0) return -1;
    return Math.min(Math.max(position, 0), text.length - 1);
}

function getEditorMetrics() {
    const styles = getComputedStyle(EL.editing);
    const fontSize = parseFloat(styles.fontSize) || 13;
    let lineHeight = parseFloat(styles.lineHeight);
    if (Number.isNaN(lineHeight)) lineHeight = fontSize * 1.5;
    const paddingTop = parseFloat(styles.paddingTop) || 0;
    return { lineHeight, paddingTop };
}

function setupResizing() {
    let isPaneResizing = false;
    let resizeOriginLeft = 0;
    let isFileTreeResizing = false;

    const startPaneResizing = (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        isPaneResizing = true;
        resizeOriginLeft = EL.appContent.getBoundingClientRect().left;
        document.body.classList.add('is-resizing');
        EL.paneResizer.classList.add('resizing');
    };

    const stopPaneResize = () => {
        if (!isPaneResizing) return;
        isPaneResizing = false;
        document.body.classList.remove('is-resizing');
        EL.paneResizer.classList.remove('resizing');
    };

    const startFileTreeResizing = (event) => {
        if (event.button !== 0 || !isFileTreeVisible()) return;
        event.preventDefault();
        isFileTreeResizing = true;
        document.body.classList.add('is-resizing');
        EL.fileTreeResizer.classList.add('resizing');
    };

    const stopFileTreeResize = () => {
        if (!isFileTreeResizing) return;
        isFileTreeResizing = false;
        EL.fileTreeResizer.classList.remove('resizing');
        if (Number.isFinite(manualFileTreeWidth)) {
            persistFileTreeWidthPreference(manualFileTreeWidth);
        }
        if (!isPaneResizing) {
            document.body.classList.remove('is-resizing');
        }
    };

    stopPaneResizing = stopPaneResize;
    stopFileTreeResizing = stopFileTreeResize;

    EL.paneResizer.addEventListener('mousedown', startPaneResizing);
    if (EL.fileTreeResizer) {
        EL.fileTreeResizer.addEventListener('mousedown', startFileTreeResizing);
    }

    window.addEventListener('mousemove', (event) => {
        if (isPaneResizing) {
            const width = event.clientX - resizeOriginLeft;
            applyEditorWidth(width);
        }
        if (isFileTreeResizing) {
            const paneLeft = EL.editorPane.getBoundingClientRect().left;
            const width = event.clientX - paneLeft;
            applyFileTreeWidth(width, { persist: false });
        }
    });
    window.addEventListener('mouseup', () => {
        stopPaneResize();
        stopFileTreeResize();
    });
    window.addEventListener('mouseleave', () => {
        stopPaneResize();
        stopFileTreeResize();
    });
}

function getFileTreeWidthBounds() {
    const editorPaneWidth = EL.editorPane.getBoundingClientRect().width;
    const resizerWidth = getFileTreeResizerWidth();
    const maxFileTreeWidth = Math.max(MIN_FILE_TREE_WIDTH, editorPaneWidth - MIN_JSON_EDITOR_WIDTH - resizerWidth);
    return { min: MIN_FILE_TREE_WIDTH, max: maxFileTreeWidth };
}

function getFileTreeResizerWidth() {
    const value = getComputedStyle(document.documentElement)
        .getPropertyValue('--tree-resizer-width')
        .trim();
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
    return EL.fileTreeResizer ? EL.fileTreeResizer.getBoundingClientRect().width : 0;
}

function applyFileTreeWidth(nextWidth, options = {}) {
    if (!EL.fileTreePanel) return null;
    const { persist = true } = options;
    const bounds = getFileTreeWidthBounds();
    const clampedWidth = Math.min(Math.max(nextWidth, bounds.min), bounds.max);
    EL.fileTreePanel.style.flex = `0 0 ${clampedWidth}px`;
    EL.fileTreePanel.style.width = `${clampedWidth}px`;
    manualFileTreeWidth = clampedWidth;
    if (persist) {
        persistFileTreeWidthPreference(clampedWidth);
    }
    return clampedWidth;
}

function getEditorWidthBounds() {
    const appWidth = EL.appContent.getBoundingClientRect().width;
    const resizerWidth = getPaneResizerWidth();
    const minChecklistWidth = resizerWidth;
    const maxEditorWidth = Math.max(MIN_EDITOR_WIDTH, appWidth - minChecklistWidth - resizerWidth);
    return { min: MIN_EDITOR_WIDTH, max: maxEditorWidth };
}

function getPaneResizerWidth() {
    const value = getComputedStyle(document.documentElement)
        .getPropertyValue('--pane-resizer-width')
        .trim();
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
    return EL.paneResizer ? EL.paneResizer.getBoundingClientRect().width : 0;
}

function applyEditorWidth(nextWidth, options = {}) {
    const { persist = true } = options;
    const bounds = getEditorWidthBounds();
    const clampedWidth = Math.min(Math.max(nextWidth, bounds.min), bounds.max);
    EL.editorPane.style.flex = `0 0 ${clampedWidth}px`;
    if (persist) manualEditorWidth = clampedWidth;
    return clampedWidth;
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

function handleWindowResize() {
    if (EL.appContent.classList.contains('folded')) return;
    if (typeof manualEditorWidth === 'number') {
        applyEditorWidth(manualEditorWidth, { persist: false });
    }
    if (typeof manualFileTreeWidth === 'number' && isFileTreeVisible()) {
        applyFileTreeWidth(manualFileTreeWidth, { persist: false });
    }
}

function setupEventListeners() {
    EL.editing.addEventListener('input', handleEditorInput);
    EL.editing.addEventListener('paste', handleEditorPaste);
    EL.editing.addEventListener('scroll', syncScroll);
    EL.editing.addEventListener('keydown', handleEditorKeydown);

    EL.btnFoldEditor.addEventListener('click', () => {
        const willFold = !EL.appContent.classList.contains('folded');
        if (willFold) {
            stopPaneResizing();
            stopFileTreeResizing();
            EL.appContent.classList.add('folded');
            EL.editorPane.style.flex = '0 0 0px';
            EL.editorPane.style.width = '0px';
            return;
        }

        EL.appContent.classList.remove('folded');
        EL.editorPane.style.width = '';
        if (typeof manualEditorWidth === 'number') {
            applyEditorWidth(manualEditorWidth, { persist: false });
            if (typeof manualFileTreeWidth === 'number' && isFileTreeVisible()) {
                applyFileTreeWidth(manualFileTreeWidth, { persist: false });
            }
            return;
        }
        EL.editorPane.style.flex = '';
        if (isFileTreeVisible()) {
            applyFileTreeWidth(manualFileTreeWidth ?? DEFAULT_FILE_TREE_WIDTH, { persist: false });
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
