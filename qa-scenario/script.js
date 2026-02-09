const editing = document.getElementById('editing');
const highlighting = document.getElementById('highlighting');
const highlightContent = document.getElementById('highlighting-content');
const checklistBody = document.getElementById('checklist-body');
const highlightOverlay = document.getElementById('highlight-overlay');
const jsonStatus = document.getElementById('json-status');
const scenarioTitle = document.getElementById('scenario-title');
const btnFormat = document.getElementById('btn-format');
const btnRepair = document.getElementById('btn-repair');
const saveIndicator = document.getElementById('save-indicator');
const saveIndicatorLabel = document.getElementById('save-indicator-label');
const btnFoldEditor = document.getElementById('btn-fold-editor');
const paneResizer = document.getElementById('pane-resizer');
const passHeaderToggle = document.getElementById('col-pass-toggle');
const btnNewFolder = document.getElementById('btn-new-folder');
const btnNewFile = document.getElementById('btn-new-file');
const btnToggleFolders = document.getElementById('btn-toggle-folders');
const fileTree = document.getElementById('file-tree');
const appContent = document.querySelector('.app-content');
const editorPane = document.getElementById('editor-pane');
const btnImport = document.getElementById('btn-import');
const btnExport = document.getElementById('btn-export');
const fileInput = document.getElementById('file-input');

let currentData = null;
let lastErrorPosition = -1;
let isPaneResizing = false;
let resizeStartX = 0;
let resizeStartEditorWidth = 0;
let manualEditorWidth = null;
let workspace = null;
let autosaveTimer = null;
let activeFileDirty = false;
let lastTreeSelectionType = 'file';

const MIN_EDITOR_WIDTH = 280;
const MIN_CHECKLIST_WIDTH = 360;
const WORKSPACE_VERSION = 1;
const WORKSPACE_STORAGE_KEY = 'qa-scenario.workspace.v1';
const AUTOSAVE_DELAY_MS = 800;
const DEFAULT_FOLDER_NAME = 'Scenarios';
const DEFAULT_FILE_NAME = 'scenario.json';
const DEFAULT_FILE_CONTENT = '{\n  "scenario": "Untitled Scenario",\n  "steps": []\n}';

// --- Editor Functions ---

btnFoldEditor.addEventListener('click', () => {
    const willFold = !appContent.classList.contains('folded');

    if (willFold) {
        stopPaneResize();
        appContent.classList.add('folded');
        editorPane.style.flex = '0 0 0px';
        editorPane.style.width = '0px';
        return;
    }

    appContent.classList.remove('folded');
    editorPane.style.width = '';

    if (typeof manualEditorWidth === 'number') {
        applyEditorWidth(manualEditorWidth, { persist: false });
        return;
    }

    editorPane.style.flex = '';
});

if (paneResizer) {
    paneResizer.addEventListener('pointerdown', handlePaneResizeStart);
}

window.addEventListener('pointermove', handlePaneResizeMove);
window.addEventListener('pointerup', stopPaneResize);
window.addEventListener('pointercancel', stopPaneResize);
window.addEventListener('beforeunload', () => {
    if (!autosaveTimer) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
    persistWorkspace();
});

if (passHeaderToggle) {
    passHeaderToggle.addEventListener('click', toggleAllPassStatus);
}

window.addEventListener('resize', () => {
    if (appContent.classList.contains('folded')) return;
    if (typeof manualEditorWidth !== 'number') return;
    applyEditorWidth(manualEditorWidth, { persist: false });
});

function getEditorWidthBounds() {
    const appWidth = appContent.getBoundingClientRect().width;
    const resizerWidth = paneResizer ? paneResizer.getBoundingClientRect().width : 0;
    const maxEditorWidth = Math.max(MIN_EDITOR_WIDTH, appWidth - MIN_CHECKLIST_WIDTH - resizerWidth);

    return {
        min: MIN_EDITOR_WIDTH,
        max: maxEditorWidth
    };
}

function applyEditorWidth(nextWidth, options = {}) {
    const { persist = true } = options;
    const { min, max } = getEditorWidthBounds();
    const clampedWidth = Math.min(Math.max(nextWidth, min), max);
    editorPane.style.flex = `0 0 ${clampedWidth}px`;
    if (persist) {
        manualEditorWidth = clampedWidth;
    }
    return clampedWidth;
}

function handlePaneResizeStart(event) {
    if (appContent.classList.contains('folded')) return;

    isPaneResizing = true;
    resizeStartX = event.clientX;
    resizeStartEditorWidth = editorPane.getBoundingClientRect().width;

    paneResizer.classList.add('resizing');
    document.body.classList.add('is-resizing');
    paneResizer.setPointerCapture(event.pointerId);
    event.preventDefault();
}

function handlePaneResizeMove(event) {
    if (!isPaneResizing) return;

    const deltaX = event.clientX - resizeStartX;
    applyEditorWidth(resizeStartEditorWidth + deltaX);
    event.preventDefault();
}

function stopPaneResize(event) {
    if (!isPaneResizing) return;

    isPaneResizing = false;
    paneResizer.classList.remove('resizing');
    document.body.classList.remove('is-resizing');

    if (!event || typeof event.pointerId !== 'number') return;
    if (paneResizer.hasPointerCapture(event.pointerId)) {
        paneResizer.releasePointerCapture(event.pointerId);
    }
}

function updateHighlighting(errorPos = -1) {
    const text = editing.value;
    highlightContent.innerHTML = syntaxHighlight(text, errorPos);
    syncScroll();
}

function syncScroll() {
    highlighting.scrollTop = editing.scrollTop;
    highlighting.scrollLeft = editing.scrollLeft;
    
    // Update highlight block position manually since overlay doesn't scroll
    const block = highlightOverlay.querySelector('.highlight-block');
    if (block && block.dataset.originalTop) {
        const originalTop = parseFloat(block.dataset.originalTop);
        block.style.top = (originalTop - editing.scrollTop) + 'px';
    }
}

function syntaxHighlight(json, errorPos = -1) {
    if (typeof json !== 'string') {
        json = JSON.stringify(json, null, 2);
    }

    const ERROR_START_TOKEN = '@@__JSON_ERROR_START__@@';
    const ERROR_END_TOKEN = '@@__JSON_ERROR_END__@@';
    let source = json;

    // Mark error location on the raw string first, so parse error positions stay exact.
    if (errorPos >= 0 && errorPos < source.length) {
        const before = source.substring(0, errorPos);
        const char = source.substring(errorPos, errorPos + 1);
        const after = source.substring(errorPos + 1);
        source = before + ERROR_START_TOKEN + (char || ' ') + ERROR_END_TOKEN + after;
    }

    // Escape HTML after token insertion.
    source = source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const highlighted = source.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, function (match) {
        let cls = 'json-number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'json-key';
            } else {
                cls = 'json-string';
            }
        } else if (/true|false/.test(match)) {
            cls = 'json-boolean';
        } else if (/null/.test(match)) {
            cls = 'json-null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });

    return highlighted
        .split(ERROR_START_TOKEN).join('<mark class="json-error">')
        .split(ERROR_END_TOKEN).join('</mark>');
}

function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderInlineCode(text) {
    const escapedText = escapeHtml(text);
    return escapedText.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');
}

function formatChecklistCellContent(rawValue) {
    if (!rawValue) return '-';
    return renderInlineCode(rawValue);
}

function setSaveIndicatorState(state = 'saved') {
    if (!saveIndicator) return;

    saveIndicator.classList.remove('is-dirty', 'is-saving', 'is-saved');

    let label = 'Saved';
    if (state === 'dirty') {
        label = 'Unsaved';
        saveIndicator.classList.add('is-dirty');
    } else if (state === 'saving') {
        label = 'Saving...';
        saveIndicator.classList.add('is-saving');
    } else {
        saveIndicator.classList.add('is-saved');
    }

    if (saveIndicatorLabel) {
        saveIndicatorLabel.textContent = label;
    }
}

function setRepairButtonVisible(isVisible) {
    if (!btnRepair) return;
    btnRepair.classList.toggle('is-hidden', !isVisible);
    btnRepair.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
}

function nowIso() {
    return new Date().toISOString();
}

function nowTs() {
    return Date.now();
}

function createId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function safeTimestamp(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : nowTs();
}

function sanitizeFolderName(name) {
    const trimmed = (name || '').trim();
    return trimmed || 'new-folder';
}

function sanitizeFileName(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return DEFAULT_FILE_NAME;
    return trimmed.endsWith('.json') ? trimmed : `${trimmed}.json`;
}

function getNextAvailableFolderName(preferredName = 'new-folder', excludeFolderId = null) {
    const sanitized = sanitizeFolderName(preferredName);
    const existingNames = new Set(
        (workspace?.folders || [])
            .filter(folder => folder.id !== excludeFolderId)
            .map(folder => folder.name.toLowerCase())
    );

    if (!existingNames.has(sanitized.toLowerCase())) {
        return sanitized;
    }

    let index = 2;
    while (true) {
        const candidate = `${sanitized}-${index}`;
        if (!existingNames.has(candidate.toLowerCase())) {
            return candidate;
        }
        index++;
    }
}

function getNextAvailableFileName(folderId, preferredName = DEFAULT_FILE_NAME, excludeFileId = null) {
    const sanitized = sanitizeFileName(preferredName);
    const existingNames = new Set(
        (workspace?.files || [])
            .filter(file => file.folderId === folderId && file.id !== excludeFileId)
            .map(file => file.name.toLowerCase())
    );

    if (!existingNames.has(sanitized.toLowerCase())) {
        return sanitized;
    }

    const dotIndex = sanitized.lastIndexOf('.');
    const hasExt = dotIndex > 0;
    const base = hasExt ? sanitized.slice(0, dotIndex) : sanitized;
    const ext = hasExt ? sanitized.slice(dotIndex) : '';

    let index = 2;
    while (true) {
        const candidate = `${base}-${index}${ext}`;
        if (!existingNames.has(candidate.toLowerCase())) {
            return candidate;
        }
        index++;
    }
}

function extractFileContent(rawFile) {
    if (!rawFile || typeof rawFile !== 'object') return '';
    if (typeof rawFile.content === 'string') return rawFile.content;
    if (typeof rawFile.overrideJson === 'string') return rawFile.overrideJson;
    if (rawFile.json && typeof rawFile.json === 'object') {
        try {
            return JSON.stringify(rawFile.json, null, 2);
        } catch (error) {
            return '';
        }
    }
    return '';
}

function createFolderRecord(name) {
    const timestamp = nowTs();
    return {
        id: createId('folder'),
        name: sanitizeFolderName(name),
        createdAt: timestamp,
        updatedAt: timestamp
    };
}

function createFileRecord(folderId, name, content = DEFAULT_FILE_CONTENT) {
    const timestamp = nowTs();
    return {
        id: createId('file'),
        folderId,
        name: sanitizeFileName(name),
        createdAt: timestamp,
        updatedAt: timestamp,
        content
    };
}

function createWorkspaceShell() {
    return {
        version: WORKSPACE_VERSION,
        updatedAt: nowIso(),
        folders: [],
        files: [],
        uiState: {
            activeFileId: null,
            expandedFolderIds: [],
            selectedFolderId: null
        }
    };
}

function getFileById(fileId) {
    if (!workspace || !Array.isArray(workspace.files)) return null;
    return workspace.files.find(file => file.id === fileId) || null;
}

function getFolderById(folderId) {
    if (!workspace || !Array.isArray(workspace.folders)) return null;
    return workspace.folders.find(folder => folder.id === folderId) || null;
}

function getActiveFile() {
    if (!workspace || !workspace.uiState) return null;
    return getFileById(workspace.uiState.activeFileId);
}

function ensureActiveFolderExpanded() {
    if (!workspace || !workspace.uiState) return;

    const activeFile = getActiveFile();
    if (!activeFile) return;

    const expanded = new Set(workspace.uiState.expandedFolderIds || []);
    expanded.add(activeFile.folderId);
    workspace.uiState.expandedFolderIds = Array.from(expanded);
}

function ensureWorkspaceConsistency() {
    if (!workspace) {
        workspace = createWorkspaceShell();
    }

    if (!Array.isArray(workspace.folders)) workspace.folders = [];
    if (!Array.isArray(workspace.files)) workspace.files = [];
    if (!workspace.uiState || typeof workspace.uiState !== 'object') {
        workspace.uiState = { activeFileId: null, expandedFolderIds: [], selectedFolderId: null };
    }
    if (!Array.isArray(workspace.uiState.expandedFolderIds)) {
        workspace.uiState.expandedFolderIds = [];
    }
    if (typeof workspace.uiState.selectedFolderId !== 'string') {
        workspace.uiState.selectedFolderId = null;
    }

    if (workspace.folders.length === 0) {
        workspace.folders.push(createFolderRecord(DEFAULT_FOLDER_NAME));
    }

    const folderIdSet = new Set(workspace.folders.map(folder => folder.id));
    const defaultFolderId = workspace.folders[0].id;

    workspace.files = workspace.files.map((file, index) => {
        const nextFile = { ...file };
        nextFile.id = (typeof nextFile.id === 'string' && nextFile.id) ? nextFile.id : createId('file');
        nextFile.folderId = folderIdSet.has(nextFile.folderId) ? nextFile.folderId : defaultFolderId;
        nextFile.name = sanitizeFileName(nextFile.name || nextFile.filePath || `scenario-${index + 1}.json`);
        nextFile.createdAt = safeTimestamp(nextFile.createdAt);
        nextFile.updatedAt = safeTimestamp(nextFile.updatedAt || nextFile.createdAt);
        if (typeof nextFile.content !== 'string') {
            nextFile.content = extractFileContent(nextFile);
        }
        return nextFile;
    });

    if (workspace.files.length === 0) {
        workspace.files.push(createFileRecord(defaultFolderId, DEFAULT_FILE_NAME));
    }

    const activeFileExists = workspace.files.some(file => file.id === workspace.uiState.activeFileId);
    if (!activeFileExists) {
        workspace.uiState.activeFileId = workspace.files[0].id;
    }

    if (workspace.uiState.selectedFolderId && !folderIdSet.has(workspace.uiState.selectedFolderId)) {
        workspace.uiState.selectedFolderId = null;
    }

    if (!workspace.uiState.selectedFolderId) {
        const activeFile = getActiveFile();
        workspace.uiState.selectedFolderId = activeFile ? activeFile.folderId : defaultFolderId;
    }

    const validExpanded = new Set(
        workspace.uiState.expandedFolderIds.filter(folderId => folderIdSet.has(folderId))
    );
    workspace.uiState.expandedFolderIds = Array.from(validExpanded);
    ensureActiveFolderExpanded();
}

function normalizeWorkspace(rawData) {
    const normalized = createWorkspaceShell();
    const source = (rawData && typeof rawData === 'object') ? rawData : {};

    normalized.version = WORKSPACE_VERSION;
    normalized.updatedAt = typeof source.updatedAt === 'string' ? source.updatedAt : nowIso();

    if (Array.isArray(source.folders)) {
        normalized.folders = source.folders.map((folder, index) => ({
            id: (typeof folder?.id === 'string' && folder.id) ? folder.id : createId('folder'),
            name: sanitizeFolderName((typeof folder?.name === 'string' && folder.name.trim()) ? folder.name.trim() : `folder-${index + 1}`),
            createdAt: safeTimestamp(folder?.createdAt),
            updatedAt: safeTimestamp(folder?.updatedAt || folder?.createdAt)
        }));
    }

    const sourceFiles = Array.isArray(source.files)
        ? source.files
        : (Array.isArray(source.rules) ? source.rules : []);

    normalized.files = sourceFiles.map((rawFile, index) => ({
        id: (typeof rawFile?.id === 'string' && rawFile.id) ? rawFile.id : createId('file'),
        folderId: rawFile?.folderId,
        name: sanitizeFileName(rawFile?.name || rawFile?.filePath || `scenario-${index + 1}.json`),
        createdAt: safeTimestamp(rawFile?.createdAt),
        updatedAt: safeTimestamp(rawFile?.updatedAt || rawFile?.createdAt),
        content: extractFileContent(rawFile)
    }));

    if (source.uiState && typeof source.uiState === 'object') {
        normalized.uiState = {
            activeFileId: typeof source.uiState.activeFileId === 'string'
                ? source.uiState.activeFileId
                : null,
            expandedFolderIds: Array.isArray(source.uiState.expandedFolderIds)
                ? [...source.uiState.expandedFolderIds]
                : [],
            selectedFolderId: typeof source.uiState.selectedFolderId === 'string'
                ? source.uiState.selectedFolderId
                : null
        };
    }

    workspace = normalized;
    ensureWorkspaceConsistency();
    return workspace;
}

function persistWorkspace(options = {}) {
    const { clearDirty = true } = options;

    if (!workspace) return;
    ensureWorkspaceConsistency();
    workspace.version = WORKSPACE_VERSION;
    workspace.updatedAt = nowIso();

    try {
        localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
    } catch (error) {
        console.error('Failed to persist workspace:', error);
    }

    if (clearDirty) {
        activeFileDirty = false;
        setSaveIndicatorState('saved');
    } else if (activeFileDirty) {
        setSaveIndicatorState('dirty');
    }

    renderFileTree();
}

function scheduleWorkspaceSave() {
    if (autosaveTimer) {
        clearTimeout(autosaveTimer);
    }

    setSaveIndicatorState('dirty');
    autosaveTimer = window.setTimeout(() => {
        autosaveTimer = null;
        setSaveIndicatorState('saving');
        persistWorkspace();
    }, AUTOSAVE_DELAY_MS);
}

function flushAutosave() {
    if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
    }
    if (activeFileDirty) {
        setSaveIndicatorState('saving');
    }
    persistWorkspace();
}

function updateActiveFileContent(nextContent, options = {}) {
    const { markDirty = true } = options;
    const activeFile = getActiveFile();
    if (!activeFile) return;

    if (activeFile.content === nextContent) return;

    activeFile.content = nextContent;
    activeFile.updatedAt = nowTs();

    if (markDirty) {
        activeFileDirty = true;
        setSaveIndicatorState('dirty');
        scheduleWorkspaceSave();
    }

    renderFileTree();
}

function loadActiveFileIntoEditor() {
    const activeFile = getActiveFile();
    const nextContent = activeFile ? activeFile.content : '';

    editing.value = nextContent;
    validateAndRender();
    clearStepHighlight();
    activeFileDirty = false;
    lastTreeSelectionType = 'file';
    setSaveIndicatorState('saved');
    renderFileTree();
}

function toggleFolder(folderId) {
    if (!workspace || !workspace.uiState) return;

    const previousSelected = workspace.uiState.selectedFolderId;
    workspace.uiState.selectedFolderId = folderId;
    lastTreeSelectionType = 'folder';

    const activeFile = getActiveFile();
    if (activeFile && activeFile.folderId === folderId) {
        if (previousSelected !== folderId) {
            persistWorkspace({ clearDirty: false });
        } else {
            renderFileTree();
        }
        return;
    }

    const expanded = new Set(workspace.uiState.expandedFolderIds || []);
    if (expanded.has(folderId)) {
        expanded.delete(folderId);
    } else {
        expanded.add(folderId);
    }
    workspace.uiState.expandedFolderIds = Array.from(expanded);
    persistWorkspace({ clearDirty: false });
}

function selectFile(fileId) {
    if (!workspace || !workspace.uiState) return;
    const targetFile = getFileById(fileId);
    if (!targetFile) return;

    workspace.uiState.selectedFolderId = targetFile ? targetFile.folderId : workspace.uiState.selectedFolderId;
    lastTreeSelectionType = 'file';

    if (workspace.uiState.activeFileId === fileId) {
        ensureActiveFolderExpanded();
        persistWorkspace({ clearDirty: false });
        return;
    }

    flushAutosave();
    workspace.uiState.activeFileId = fileId;
    ensureActiveFolderExpanded();
    persistWorkspace();
    loadActiveFileIntoEditor();
}

function createTreeRowActions(actions) {
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'tree-row-actions';

    actions.forEach(action => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tree-row-action';
        if (action.variant === 'danger') {
            btn.classList.add('danger');
        }
        btn.textContent = action.label;
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            action.onClick();
        });
        actionsWrap.appendChild(btn);
    });

    return actionsWrap;
}

function updateFolderToggleButtonState() {
    if (!btnToggleFolders || !workspace) return;

    const folders = Array.isArray(workspace.folders) ? workspace.folders : [];
    if (folders.length === 0) {
        btnToggleFolders.disabled = true;
        btnToggleFolders.textContent = 'Expand';
        btnToggleFolders.title = 'No folders';
        return;
    }

    const activeFile = getActiveFile();
    const activeFolderId = activeFile ? activeFile.folderId : null;
    const expandedSet = new Set(workspace.uiState?.expandedFolderIds || []);
    if (activeFolderId) {
        expandedSet.add(activeFolderId);
    }

    const allExpanded = folders.every(folder => expandedSet.has(folder.id));
    btnToggleFolders.disabled = false;
    btnToggleFolders.textContent = allExpanded ? 'Collapse' : 'Expand';
    btnToggleFolders.title = allExpanded
        ? 'Collapse all folders (active file folder stays open)'
        : 'Expand all folders';
}

function toggleAllFolders() {
    if (!workspace || !workspace.uiState) return;

    ensureWorkspaceConsistency();
    const folders = Array.isArray(workspace.folders) ? workspace.folders : [];
    if (folders.length === 0) return;

    const activeFile = getActiveFile();
    const activeFolderId = activeFile ? activeFile.folderId : null;
    const expandedSet = new Set(workspace.uiState.expandedFolderIds || []);
    if (activeFolderId) {
        expandedSet.add(activeFolderId);
    }

    const allExpanded = folders.every(folder => expandedSet.has(folder.id));

    if (allExpanded) {
        workspace.uiState.expandedFolderIds = activeFolderId ? [activeFolderId] : [];
    } else {
        workspace.uiState.expandedFolderIds = folders.map(folder => folder.id);
    }

    persistWorkspace({ clearDirty: false });
}

function renderFileTree() {
    if (!fileTree || !workspace) return;

    fileTree.innerHTML = '';
    ensureWorkspaceConsistency();

    const activeFile = getActiveFile();
    const activeFolderId = activeFile ? activeFile.folderId : null;
    const selectedFolderId = workspace.uiState.selectedFolderId || activeFolderId;
    const expandedSet = new Set(workspace.uiState.expandedFolderIds || []);
    if (activeFolderId) expandedSet.add(activeFolderId);
    workspace.uiState.expandedFolderIds = Array.from(expandedSet);
    updateFolderToggleButtonState();

    const sortedFolders = [...workspace.folders].sort((a, b) =>
        a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true })
    );

    sortedFolders.forEach(folder => {
        const folderWrap = document.createElement('div');
        folderWrap.className = 'tree-folder';

        const folderRow = document.createElement('div');
        folderRow.className = 'tree-folder-row';
        folderRow.setAttribute('role', 'button');
        folderRow.tabIndex = 0;
        if (folder.id === activeFolderId) {
            folderRow.classList.add('active-parent');
        }
        if (folder.id === selectedFolderId) {
            folderRow.classList.add('active-target');
        }

        const isExpanded = expandedSet.has(folder.id);

        const chevron = document.createElement('span');
        chevron.className = 'tree-chevron';
        chevron.textContent = isExpanded ? '▾' : '▸';

        const icon = document.createElement('span');
        icon.className = 'tree-icon tree-icon-folder';

        const name = document.createElement('span');
        name.className = 'tree-name';
        name.textContent = folder.name;

        const folderActions = createTreeRowActions([
            { label: 'Edit', onClick: () => handleRenameFolder(folder.id) },
            { label: 'Del', variant: 'danger', onClick: () => handleDeleteFolder(folder.id) }
        ]);

        folderRow.appendChild(chevron);
        folderRow.appendChild(icon);
        folderRow.appendChild(name);
        folderRow.appendChild(folderActions);
        folderRow.addEventListener('click', () => toggleFolder(folder.id));
        folderRow.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            toggleFolder(folder.id);
        });
        folderWrap.appendChild(folderRow);

        if (isExpanded) {
            const fileList = document.createElement('div');
            fileList.className = 'tree-file-list';

            const files = workspace.files
                .filter(file => file.folderId === folder.id)
                .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }));

            if (files.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'tree-empty';
                empty.textContent = 'No files';
                fileList.appendChild(empty);
            } else {
                files.forEach(file => {
                    const fileRow = document.createElement('div');
                    fileRow.className = 'tree-file-row';
                    fileRow.setAttribute('role', 'button');
                    fileRow.tabIndex = 0;
                    const isActive = activeFile && activeFile.id === file.id;
                    if (isActive) {
                        fileRow.classList.add('active');
                    }

                    const fileIcon = document.createElement('span');
                    fileIcon.className = 'tree-icon tree-icon-file';

                    const fileName = document.createElement('span');
                    fileName.className = 'tree-name';
                    fileName.textContent = `${file.name}${isActive && activeFileDirty ? ' *' : ''}`;

                    const fileActions = createTreeRowActions([
                        { label: 'Edit', onClick: () => handleRenameFile(file.id) },
                        { label: 'Del', variant: 'danger', onClick: () => handleDeleteFile(file.id) }
                    ]);

                    fileRow.appendChild(fileIcon);
                    fileRow.appendChild(fileName);
                    fileRow.appendChild(fileActions);
                    fileRow.addEventListener('click', () => selectFile(file.id));
                    fileRow.addEventListener('keydown', (event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        selectFile(file.id);
                    });
                    fileList.appendChild(fileRow);
                });
            }

            folderWrap.appendChild(fileList);
        }

        fileTree.appendChild(folderWrap);
    });
}

function handleCreateFolder() {
    if (!workspace) return;
    const input = window.prompt('Folder name', 'new-folder');
    if (input === null) return;

    const requestedName = input.trim();
    if (!requestedName) return;
    const nextFolderName = getNextAvailableFolderName(requestedName);

    const folder = createFolderRecord(nextFolderName);
    workspace.folders.push(folder);
    const newFileName = getNextAvailableFileName(folder.id, DEFAULT_FILE_NAME);
    const newFile = createFileRecord(folder.id, newFileName);
    workspace.files.push(newFile);
    workspace.uiState.activeFileId = newFile.id;
    workspace.uiState.selectedFolderId = folder.id;
    lastTreeSelectionType = 'file';
    workspace.uiState.expandedFolderIds = Array.from(
        new Set([...(workspace.uiState.expandedFolderIds || []), folder.id])
    );
    ensureActiveFolderExpanded();
    persistWorkspace();
    loadActiveFileIntoEditor();
}

function handleCreateFile() {
    if (!workspace) return;

    const activeFile = getActiveFile();
    const selectedFolderId = workspace.uiState?.selectedFolderId;
    const targetFolder = selectedFolderId ? getFolderById(selectedFolderId) : null;
    const activeFolderId = activeFile ? activeFile.folderId : null;
    const activeFolder = activeFolderId ? getFolderById(activeFolderId) : null;

    let folderId = null;
    if (lastTreeSelectionType === 'folder' && targetFolder) {
        folderId = targetFolder.id;
    } else if (activeFolder) {
        folderId = activeFolder.id;
    } else if (targetFolder) {
        folderId = targetFolder.id;
    } else {
        folderId = workspace.folders[0]?.id;
    }

    if (!folderId) return;

    const fallbackName = getNextAvailableFileName(folderId, DEFAULT_FILE_NAME);
    const input = window.prompt('File name', fallbackName);
    if (input === null) return;

    const requestedName = input.trim() || fallbackName;
    const name = getNextAvailableFileName(folderId, requestedName);
    const newFile = createFileRecord(folderId, name);
    workspace.files.push(newFile);
    workspace.uiState.activeFileId = newFile.id;
    workspace.uiState.selectedFolderId = folderId;
    lastTreeSelectionType = 'file';
    ensureActiveFolderExpanded();
    persistWorkspace();
    loadActiveFileIntoEditor();
}

function handleRenameFolder(folderId) {
    if (!workspace) return;

    const folder = getFolderById(folderId);
    if (!folder) {
        alert('Folder not found.');
        return;
    }

    const input = window.prompt('Rename folder', folder.name);
    if (input === null) return;

    const requestedName = input.trim();
    if (!requestedName) return;

    const nextName = getNextAvailableFolderName(requestedName, folder.id);
    folder.name = nextName;
    folder.updatedAt = nowTs();
    persistWorkspace();
}

function handleDeleteFolder(folderId) {
    if (!workspace) return;

    const folder = getFolderById(folderId);
    if (!folder) {
        alert('Folder not found.');
        return;
    }

    const filesInFolder = workspace.files.filter(file => file.folderId === folder.id);
    const removedFileIds = new Set(filesInFolder.map(file => file.id));
    const wasActiveRemoved = removedFileIds.has(workspace.uiState.activeFileId);
    const deletedFolderId = folder.id;

    workspace.folders = workspace.folders.filter(item => item.id !== deletedFolderId);
    workspace.files = workspace.files.filter(file => file.folderId !== deletedFolderId);

    if (wasActiveRemoved) {
        const nextActiveFile = workspace.files[0] || null;
        workspace.uiState.activeFileId = nextActiveFile ? nextActiveFile.id : null;
    }

    if (workspace.uiState.selectedFolderId === deletedFolderId) {
        const nextActiveFile = getActiveFile();
        workspace.uiState.selectedFolderId = nextActiveFile
            ? nextActiveFile.folderId
            : (workspace.folders[0]?.id || null);
    }

    ensureWorkspaceConsistency();
    ensureActiveFolderExpanded();
    persistWorkspace();

    if (wasActiveRemoved) {
        loadActiveFileIntoEditor();
    }
}

function handleRenameFile(fileId) {
    if (!workspace) return;

    const targetFile = getFileById(fileId);
    if (!targetFile) {
        alert('File not found.');
        return;
    }

    const input = window.prompt('Rename file', targetFile.name);
    if (input === null) return;

    const requestedName = input.trim();
    if (!requestedName) return;

    const nextName = getNextAvailableFileName(targetFile.folderId, requestedName, targetFile.id);
    targetFile.name = nextName;
    targetFile.updatedAt = nowTs();
    persistWorkspace();
}

function handleDeleteFile(fileId) {
    if (!workspace) return;

    const targetFile = getFileById(fileId);
    if (!targetFile) {
        alert('File not found.');
        return;
    }

    const wasActiveFile = workspace.uiState.activeFileId === targetFile.id;
    workspace.files = workspace.files.filter(file => file.id !== targetFile.id);

    if (wasActiveFile) {
        const nextInFolder = workspace.files.find(file => file.folderId === targetFile.folderId);
        const nextActiveFile = nextInFolder || workspace.files[0] || null;
        workspace.uiState.activeFileId = nextActiveFile ? nextActiveFile.id : null;
    }

    ensureWorkspaceConsistency();
    ensureActiveFolderExpanded();
    persistWorkspace();

    if (wasActiveFile) {
        loadActiveFileIntoEditor();
    }
}

function tryParseJson(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        return null;
    }
}

function buildWorkspaceExportPayload() {
    return {
        version: WORKSPACE_VERSION,
        exportedAt: nowIso(),
        updatedAt: workspace?.updatedAt || nowIso(),
        folders: (workspace?.folders || []).map(folder => ({
            id: folder.id,
            name: folder.name,
            createdAt: folder.createdAt,
            updatedAt: folder.updatedAt
        })),
        files: (workspace?.files || []).map(file => {
            const entry = {
                id: file.id,
                folderId: file.folderId,
                name: file.name,
                filePath: file.name,
                createdAt: file.createdAt,
                updatedAt: file.updatedAt,
                content: file.content
            };

            const parsed = tryParseJson(file.content);
            if (parsed !== null) {
                entry.json = parsed;
            }

            return entry;
        }),
        uiState: {
            activeFileId: workspace?.uiState?.activeFileId || null,
            expandedFolderIds: [...(workspace?.uiState?.expandedFolderIds || [])],
            selectedFolderId: workspace?.uiState?.selectedFolderId || null
        }
    };
}

function isWorkspacePayload(data) {
    if (!data || typeof data !== 'object') return false;
    const hasFolders = Array.isArray(data.folders);
    const hasFiles = Array.isArray(data.files) || Array.isArray(data.rules);
    return hasFolders && hasFiles;
}

function importTextToWorkspace(rawText) {
    const parsed = tryParseJson(rawText);

    if (!parsed || !isWorkspacePayload(parsed)) {
        alert('Import failed: file-tree workspace JSON is required.');
        return;
    }

    normalizeWorkspace(parsed);
    persistWorkspace();
    loadActiveFileIntoEditor();
}

function loadWorkspaceFromStorage() {
    let storedWorkspace = null;

    try {
        const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
        if (raw) {
            storedWorkspace = JSON.parse(raw);
        }
    } catch (error) {
        console.error('Failed to parse stored workspace:', error);
    }

    normalizeWorkspace(storedWorkspace);
    persistWorkspace();
    loadActiveFileIntoEditor();
}

// --- Logic Functions ---

function validateAndRender() {
    // Keep the visible layer in sync even when JSON is invalid.
    updateHighlighting();

    try {
        const data = JSON.parse(editing.value);
        currentData = data;
        jsonStatus.textContent = "Valid";
        jsonStatus.classList.remove('error');
        setRepairButtonVisible(false);
        lastErrorPosition = -1;
        renderChecklist(data);
        clearStepHighlight();
    } catch (e) {
        currentData = null;
        jsonStatus.textContent = "Invalid";
        jsonStatus.classList.add('error');
        setRepairButtonVisible(true);
        
        // Extract position from error message (e.g., "at position 123")
        const match = e.message.match(/at position (\d+)/);
        if (match) {
            lastErrorPosition = parseInt(match[1]);
            updateHighlighting(lastErrorPosition);
        } else {
            // Some browsers use "line X column Y"
            const lineColMatch = e.message.match(/line (\d+) column (\d+)/);
            if (lineColMatch) {
                const line = parseInt(lineColMatch[1]);
                const col = parseInt(lineColMatch[2]);
                // Convert line/col to absolute position
                const lines = editing.value.split('\n');
                let pos = 0;
                for (let i = 0; i < line - 1; i++) {
                    pos += lines[i].length + 1;
                }
                pos += col - 1;
                lastErrorPosition = pos;
                updateHighlighting(lastErrorPosition);
            }
        }

        updatePassHeaderState();
    }
}

function renderChecklist(data) {
    if (!data || !data.steps || !Array.isArray(data.steps)) {
        const fallbackTitle = "No valid steps found";
        scenarioTitle.textContent = fallbackTitle;
        scenarioTitle.title = fallbackTitle;
        scenarioTitle.classList.remove('is-primary');
        checklistBody.innerHTML = '<tr class="empty-state"><td colspan="5">JSON structure must contain a "steps" array.</td></tr>';
        updatePassHeaderState();
        return;
    }

    const hasScenarioKey = Object.prototype.hasOwnProperty.call(data, 'scenario');
    const scenarioText = data.scenario || "Untitled Scenario";
    scenarioTitle.textContent = scenarioText;
    scenarioTitle.title = scenarioText;
    scenarioTitle.classList.toggle('is-primary', hasScenarioKey);

    if (data.steps.length === 0) {
        checklistBody.innerHTML = '<tr class="empty-state"><td colspan="5">No steps in this scenario file.</td></tr>';
        updatePassHeaderState();
        return;
    }
    
    checklistBody.innerHTML = '';
    data.steps.forEach((step, index) => {
        const tr = document.createElement('tr');
        const givenValue = (step.given || '').trim();
        const whenValue = (step.when || '').trim();
        const thenValue = Array.isArray(step.then)
            ? step.then.map(item => (item || '').trim()).join('\n')
            : ((step.then || '').trim());
        
        // Pass Checkbox
        const isPassed = step.pass === true;
        
        tr.innerHTML = `
            <td class="col-num">${index + 1}</td>
            <td class="col-given">
                <div class="cell-content" contenteditable="true" data-index="${index}" data-field="given">${formatChecklistCellContent(givenValue)}</div>
            </td>
            <td class="col-when">
                <div class="cell-content" contenteditable="true" data-index="${index}" data-field="when">${formatChecklistCellContent(whenValue)}</div>
            </td>
            <td class="col-then">
                <div class="cell-content" contenteditable="true" data-index="${index}" data-field="then">${formatChecklistCellContent(thenValue)}</div>
            </td>
            <td class="col-pass">
                <label class="checkbox-container">
                    <input type="checkbox" data-index="${index}" ${isPassed ? 'checked' : ''}>
                    <span class="checkmark"></span>
                </label>
            </td>
        `;
        // Add click listener for row highlighting
        tr.addEventListener('click', (e) => {
            const isAlreadySelected = tr.classList.contains('selected-row');
            if (isAlreadySelected) {
                clearStepHighlight();
                return;
            }

            highlightStep(index);

            // UI Feedback
            // Use a more specific selector to ensure we clear all rows in the table
            const rows = checklistBody.querySelectorAll('tr');
            rows.forEach(r => r.classList.remove('selected-row'));
            tr.classList.add('selected-row');
        });

        const givenCell = tr.querySelector('.cell-content[data-field="given"]');
        const whenCell = tr.querySelector('.cell-content[data-field="when"]');
        const thenCell = tr.querySelector('.cell-content[data-field="then"]');

        if (givenCell) givenCell.dataset.rawValue = givenValue;
        if (whenCell) whenCell.dataset.rawValue = whenValue;
        if (thenCell) thenCell.dataset.rawValue = thenValue;

        checklistBody.appendChild(tr);
    });

    // Add event listeners to checkboxes
    document.querySelectorAll('.col-pass input').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const index = e.target.getAttribute('data-index');
            updatePassStatus(parseInt(index), e.target.checked);
        });
    });

    // Add event listeners for inline editing
    document.querySelectorAll('.cell-content[contenteditable="true"]').forEach(cell => {
        cell.addEventListener('focus', (e) => {
            const rawValue = e.target.dataset.rawValue || '';
            e.target.textContent = rawValue;
        });

        // Use input for real-time sync, blur for final cleanup
        cell.addEventListener('input', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            const field = e.target.getAttribute('data-field');
            const value = e.target.innerText; // Use innerText to keep formatting simple
            updateStepField(index, field, value);
        });

        cell.addEventListener('blur', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            const field = e.target.getAttribute('data-field');
            let value = e.target.innerText.trim();
            if (value === '-') value = ''; 
            updateStepField(index, field, value);
            e.target.dataset.rawValue = value;
            e.target.innerHTML = formatChecklistCellContent(value);
        });

        cell.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && e.target.dataset.field !== 'then') {
                e.preventDefault();
                e.target.blur();
            }
        });
    });

    updatePassHeaderState();
}

function updateStepField(index, field, value) {
    if (!currentData || !currentData.steps[index]) return;

    if (field === 'then') {
        // Handle both multiline input and potential array structure
        if (value.includes('\n')) {
            currentData.steps[index].then = value.split('\n').filter(line => line.trim() !== '');
        } else {
            // If it's single line but previously was an array, keep as array with one element
            if (Array.isArray(currentData.steps[index].then)) {
                currentData.steps[index].then = value.trim() ? [value.trim()] : [];
            } else {
                currentData.steps[index].then = value.trim();
            }
        }
    } else {
        currentData.steps[index][field] = value.trim();
    }

    syncDataToEditor();
}

function updatePassStatus(index, isChecked) {
    if (!currentData || !currentData.steps[index]) return;
    
    currentData.steps[index].pass = isChecked;
    syncDataToEditor();
    updatePassHeaderState();
}

function syncDataToEditor() {
    const updatedJson = JSON.stringify(currentData, null, 2);
    editing.value = updatedJson;
    highlightContent.innerHTML = syntaxHighlight(updatedJson);
    syncScroll();
    updateActiveFileContent(updatedJson);
}

function updatePassHeaderState() {
    if (!passHeaderToggle) return;

    const steps = (currentData && Array.isArray(currentData.steps)) ? currentData.steps : [];
    const hasSteps = steps.length > 0;
    const allPassed = hasSteps && steps.every(step => step.pass === true);

    passHeaderToggle.classList.toggle('all-passed', allPassed);
    passHeaderToggle.classList.toggle('disabled', !hasSteps);
    passHeaderToggle.setAttribute('aria-pressed', allPassed ? 'true' : 'false');
    passHeaderToggle.title = hasSteps
        ? (allPassed ? 'Set all steps to pass: false' : 'Set all steps to pass: true')
        : 'No steps to toggle';
}

function toggleAllPassStatus(event) {
    if (event) event.preventDefault();
    if (!currentData || !Array.isArray(currentData.steps) || currentData.steps.length === 0) return;

    const shouldSetAllTrue = currentData.steps.some(step => step.pass !== true);
    currentData.steps.forEach(step => {
        step.pass = shouldSetAllTrue;
    });

    syncDataToEditor();
    renderChecklist(currentData);
}

// --- Action Handlers ---

if (btnNewFolder) {
    btnNewFolder.addEventListener('click', handleCreateFolder);
}

if (btnNewFile) {
    btnNewFile.addEventListener('click', handleCreateFile);
}

if (btnToggleFolders) {
    btnToggleFolders.addEventListener('click', toggleAllFolders);
}

btnFormat.addEventListener('click', () => {
    try {
        const obj = JSON.parse(editing.value);
        editing.value = JSON.stringify(obj, null, 2);
        validateAndRender();
        updateActiveFileContent(editing.value);
        clearStepHighlight();
    } catch (e) {
        alert("Cannot format: Invalid JSON");
    }
});

btnRepair.addEventListener('click', () => {
    let text = editing.value;
    
    // 1. Replace single quotes with double quotes (basic heuristic)
    text = text.replace(/'/g, '"');
    
    // 2. Add quotes to unquoted keys
    text = text.replace(/([{,]\s*)([a-zA-Z0-9_$]+)(\s*:)/g, '$1"$2"$3');
    
    // 3. Remove trailing commas before } or ]
    text = text.replace(/,\s*([}\]])/g, '$1');
    
    // 4. Try to add missing commas between property/value pairs or array elements
    // This is tricky, but we can try to fix "value" "nextKey": or "value" { or "value" [
    text = text.replace(/(")\s*(")/g, '$1, $2');
    text = text.replace(/(\d|true|false|null)\s*(")/g, '$1, $2');
    text = text.replace(/(}|])\s*(")/g, '$1, $2');
    
    editing.value = text;
    validateAndRender();
    updateActiveFileContent(editing.value);
    
    if (jsonStatus.textContent === "Valid") {
        btnFormat.click(); // Auto-format if repair was successful
    }
});

btnExport.addEventListener('click', () => {
    try {
        flushAutosave();
        const exportPayload = buildWorkspaceExportPayload();
        const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const now = new Date();
        const fileName = `qa-scenarios-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.json`;
        
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        alert("Export failed");
    }
});

btnImport.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        importTextToWorkspace(event.target.result);
        fileInput.value = '';
    };
    reader.readAsText(file);
});

// --- Event Listeners ---

function handleEditorInput() {
    validateAndRender();
    updateActiveFileContent(editing.value);
}

editing.addEventListener('input', handleEditorInput);
editing.addEventListener('paste', () => {
    // Small delay to ensure textarea value is updated before validation
    setTimeout(handleEditorInput, 0);
});
editing.addEventListener('scroll', syncScroll);

// Support tab key in textarea
editing.addEventListener('keydown', function(e) {
  if (e.key == 'Tab') {
    e.preventDefault();
    var start = this.selectionStart;
    var end = this.selectionEnd;

    // set textarea value to: text before caret + tab + text after caret
    this.value = this.value.substring(0, start) +
      "  " + this.value.substring(end);

    // put caret at right position again
    this.selectionStart =
      this.selectionEnd = start + 2;
      
    handleEditorInput();
  }
});

loadWorkspaceFromStorage();

// --- Highlighting Logic ---

function clearStepHighlight() {
    highlightOverlay.innerHTML = '';
    checklistBody.querySelectorAll('tr').forEach(r => r.classList.remove('selected-row'));
}

function highlightStep(index) {
    const json = editing.value;
    const lines = json.split('\n');
    
    // Robust parser to find the Nth element of "steps" array
    let currentLine = 0;
    let inString = false;
    let braceDepth = 0; // {}
    let bracketDepth = 0; // []
    let stepsArrayFound = false;
    let currentStepIndex = -1;
    let stepStartLine = -1;
    let stepEndLine = -1;
    
    // We need to process char by char to handle nested structures correctly
    // efficiently scanning line by line
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Simple line-based check for "steps" key if not found yet
        // This is a safe optimization for standard formatting
        if (!stepsArrayFound) {
             if (line.includes('"steps": [')) {
                 stepsArrayFound = true;
                 bracketDepth = 1; // We assume [ is on this line or just passed
                 // But we must be careful. Let's stick to full char parsing for correctness?
                 // Textarea value is one big string, but we have lines array.
                 // Let's parse the full string but track newlines to know line numbers.
             }
        }
    }
    
    // --- Full Character Parser Implementation ---
    // Resetting to parse full text for consistent robust handling
    
    const text = editing.value;
    let line = 0;
    
    inString = false;
    braceDepth = 0;
    bracketDepth = 0;
    stepsArrayFound = false;
    currentStepIndex = -1;
    
    let targetStart = -1;
    let targetEnd = -1;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        
        if (char === '\n') {
            line++;
            continue;
        }
        
        if (char === '"' && text[i-1] !== '\\\\') {
            inString = !inString;
            continue;
        }
        
        if (inString) continue;
        
        // Find "steps": [ pattern
        if (!stepsArrayFound) {
            if (char === 's' && text.substr(i, 7) === 'steps":') {
               // Potential match, look ahead for [
               // Simplified: just wait until we hit [ at root level
            }
            if (char === '[' && text.lastIndexOf('"steps"', i) > -1) { 
               // This is a naive check. A better one:
               // If we are at root (braceDepth 0, bracketDepth 0) and see "steps" key...
               // Let's rely on the fact that "steps" is likely the only top-level array.
               // Or just find the first array value of "steps" key.
            }
             
            // State-machine style:
            // 1. Find key "steps"
            // 2. Find :
            // 3. Find [ -> stepsArrayFound = true
        }
    }
}

// Re-implementing with a simplified robust approach for this specific schema
function highlightStep(index) {
    const json = editing.value;
    const lines = json.split('\n');
    
    // 1. Find the "steps" array start
    // We need to be careful about not matching "steps" inside strings
    let stepsArrayStartIdx = -1;
    let inString = false;
    
    for (let i = 0; i < json.length; i++) {
        const char = json[i];
        if (char === '"' && json[i-1] !== '\\\\') {
            inString = !inString;
            continue;
        }
        
        if (!inString) {
            // Check for key "steps"
            if (char === 's' && json.substr(i, 7) === 'steps":') {
                 // Found key, now find [
                 let j = i + 7;
                 while (j < json.length) {
                     if (json[j] === '[') {
                         stepsArrayStartIdx = j;
                         break;
                     }
                     j++;
                 }
                 if (stepsArrayStartIdx !== -1) break;
            }
            
            // Allow string "steps" : [ space handling?
            // simpler: json.indexOf('"steps":') might be enough if we assume validity, 
            // but robustness is key.
            // Let's stick to the line-based approach but with smarter parsing?
            // No, the user wants exact object bounds.
        }
    }
    
    // If not found via strict parsing, try simple index search (faster, usually works)
    if (stepsArrayStartIdx === -1) {
        stepsArrayStartIdx = json.indexOf('"steps":');
        if (stepsArrayStartIdx !== -1) {
             stepsArrayStartIdx = json.indexOf('[', stepsArrayStartIdx);
        }
    }
    
    if (stepsArrayStartIdx === -1) return;

    // 2. Scan inside the array to find the N-th object
    let currentStepIdx = -1;
    let braceDepth = 0;
    let stepStartIndex = -1;
    let stepEndIndex = -1;
    
    inString = false;
    
    for (let i = stepsArrayStartIdx + 1; i < json.length; i++) {
        const char = json[i];
        
        if (char === '"' && json[i-1] !== '\\\\') {
            inString = !inString;
            continue;
        }
        
        if (inString) continue;
        
        if (char === '{') {
            if (braceDepth === 0) {
                currentStepIdx++;
                if (currentStepIdx === index) {
                    stepStartIndex = i;
                }
            }
            braceDepth++;
        } else if (char === '}') {
            braceDepth--;
            if (braceDepth === 0 && currentStepIdx === index) {
                stepEndIndex = i; // Include the closing brace
                break;
            }
        } else if (char === ']' && braceDepth === 0) {
            break; // End of steps array
        }
    }
    
    if (stepStartIndex !== -1 && stepEndIndex !== -1) {
        // Convert chars indices to line numbers
        const beforeStart = json.substring(0, stepStartIndex);
        const startLine = beforeStart.split('\n').length - 1;
        
        const beforeEnd = json.substring(0, stepEndIndex);
        const endLine = beforeEnd.split('\n').length - 1;
        
        drawHighlight(startLine, endLine);
        scrollToLine(startLine);
    }
}

function getEditorMetrics() {
    const styles = window.getComputedStyle(editing);
    const fontSize = parseFloat(styles.fontSize) || 14;
    let lineHeight = parseFloat(styles.lineHeight);
    const paddingTop = parseFloat(styles.paddingTop) || 0;

    if (Number.isNaN(lineHeight)) {
        lineHeight = fontSize * 1.5;
    }

    return { lineHeight, paddingTop };
}

function drawHighlight(startLine, endLine) {
    highlightOverlay.innerHTML = '';
    
    const { lineHeight, paddingTop } = getEditorMetrics();
    
    const top = paddingTop + (startLine * lineHeight);
    const height = ((endLine - startLine + 1) * lineHeight);
    
    const block = document.createElement('div');
    block.className = 'highlight-block';
    
    // Position relative to the visible area, accounting for scroll
    const initialTop = top - editing.scrollTop;
    
    block.style.top = initialTop + 'px';
    block.style.height = height + 'px';
    block.style.width = '100%';
    block.dataset.originalTop = top; // Store absolute top for scroll sync
    
    highlightOverlay.appendChild(block);
}

function scrollToLine(line) {
    const { lineHeight, paddingTop } = getEditorMetrics();
    const targetTop = paddingTop + (line * lineHeight);
    
    // Center the target line
    const containerHeight = editing.clientHeight;
    editing.scrollTop = targetTop - (containerHeight / 3);
}
