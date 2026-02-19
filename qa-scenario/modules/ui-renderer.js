import { getActiveFile } from './workspace-manager.js';

export function createTreeRowActions(actions) {
    if (!Array.isArray(actions) || actions.length === 0) return null;
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

export function formatChecklistCellContent(rawValue) {
    if (!rawValue) return '-';
    // Simple mock of renderInlineCode for now, can be improved
    const escaped = rawValue.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');
}

function normalizeStepFieldForEditor(value) {
    if (Array.isArray(value)) {
        return value
            .map(item => (item == null ? '' : String(item).trim()))
            .filter(Boolean)
            .join('\n');
    }
    if (value == null) return '';
    return String(value).trim();
}

export function normalizeChecklistDividerValue(value) {
    if (value === true) return true;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function isChecklistDividerStep(step) {
    return normalizeChecklistDividerValue(step?.divider) !== null;
}

export function getChecklistDividerTitle(step) {
    const normalized = normalizeChecklistDividerValue(step?.divider);
    if (typeof normalized === 'string') return normalized;
    return normalized === true ? 'divider' : '';
}

export function updatePassHeaderState(passHeaderToggle, currentData) {
    if (!passHeaderToggle) return;

    const steps = (currentData && Array.isArray(currentData.steps)) ? currentData.steps : [];
    const checkableSteps = steps.filter(step => !isChecklistDividerStep(step));
    const hasSteps = checkableSteps.length > 0;
    const allPassed = hasSteps && checkableSteps.every(step => step.pass === true);

    passHeaderToggle.classList.toggle('all-passed', allPassed);
    passHeaderToggle.classList.toggle('disabled', !hasSteps);
    passHeaderToggle.setAttribute('aria-pressed', allPassed ? 'true' : 'false');
}

export function renderFileTree(container, workspace, options = {}) {
    const { 
        activeFileDirty, 
        canMutateTree,
        onToggleFolder, 
        onSelectFile, 
        onRenameFolder, 
        onDeleteFolder, 
        onRenameFile, 
        onDeleteFile 
    } = options;

    if (!container || !workspace) return;
    container.innerHTML = '';

    const activeFile = getActiveFile(workspace);
    const activeFolderId = activeFile ? activeFile.folderId : null;
    const selectedFolderId = workspace.uiState.lastSelectionType === 'folder'
        ? workspace.uiState.selectedFolderId
        : null;
    const selectedFileId = workspace.uiState.lastSelectionType === 'file'
        ? workspace.uiState.selectedFileId
        : null;
    const expandedSet = new Set(workspace.uiState.expandedFolderIds || []);

    const folderById = new Map(workspace.folders.map(folder => [folder.id, folder]));
    const rootFolders = [];
    const childFoldersByParentId = new Map();
    workspace.folders.forEach((folder) => {
        const parentId = folder.parentId;
        if (!parentId || !folderById.has(parentId)) {
            rootFolders.push(folder);
            return;
        }
        if (!childFoldersByParentId.has(parentId)) {
            childFoldersByParentId.set(parentId, []);
        }
        childFoldersByParentId.get(parentId).push(folder);
    });

    const filesByFolderId = new Map();
    workspace.files.forEach((file) => {
        if (!filesByFolderId.has(file.folderId)) {
            filesByFolderId.set(file.folderId, []);
        }
        filesByFolderId.get(file.folderId).push(file);
    });

    const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true });

    const renderFolder = (folder, depth = 0) => {
        const folderWrap = document.createElement('div');
        folderWrap.className = 'tree-folder';

        const folderRow = document.createElement('div');
        folderRow.className = 'tree-folder-row';
        folderRow.style.paddingLeft = `${10 + (depth * 16)}px`;
        folderRow.setAttribute('role', 'button');
        folderRow.tabIndex = 0;
        if (folder.id === activeFolderId) folderRow.classList.add('active-parent');
        if (folder.id === selectedFolderId) folderRow.classList.add('active-target');

        const isExpanded = expandedSet.has(folder.id);
        const chevron = document.createElement('span');
        chevron.className = 'tree-chevron';
        chevron.textContent = isExpanded ? '▾' : '▸';

        const icon = document.createElement('span');
        icon.className = 'tree-icon tree-icon-folder';

        const name = document.createElement('span');
        name.className = 'tree-name';
        name.textContent = folder.name;
        name.title = folder.path || folder.name;

        const folderActionItems = [];
        if (canMutateTree && typeof onRenameFolder === 'function') {
            folderActionItems.push({ label: 'Edit', onClick: () => onRenameFolder(folder.id) });
        }
        if (canMutateTree && typeof onDeleteFolder === 'function') {
            folderActionItems.push({ label: 'Del', variant: 'danger', onClick: () => onDeleteFolder(folder.id) });
        }
        const folderActions = createTreeRowActions(folderActionItems);

        folderRow.appendChild(chevron);
        folderRow.appendChild(icon);
        folderRow.appendChild(name);
        if (folderActions) {
            folderRow.appendChild(folderActions);
        }
        folderRow.addEventListener('click', () => onToggleFolder(folder.id));
        folderWrap.appendChild(folderRow);

        if (isExpanded) {
            const fileList = document.createElement('div');
            fileList.className = 'tree-file-list';

            const childFolders = (childFoldersByParentId.get(folder.id) || []).sort(byName);
            childFolders.forEach((childFolder) => {
                fileList.appendChild(renderFolder(childFolder, depth + 1));
            });

            const files = (filesByFolderId.get(folder.id) || []).sort(byName);

            if (files.length === 0 && childFolders.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'tree-empty';
                empty.textContent = 'No files';
                empty.style.paddingLeft = `${40 + (depth * 16)}px`;
                fileList.appendChild(empty);
            } else {
                files.forEach(file => {
                    const fileRow = document.createElement('div');
                    fileRow.className = 'tree-file-row';
                    fileRow.style.paddingLeft = `${28 + (depth * 16)}px`;
                    const isActive = activeFile && activeFile.id === file.id;
                    if (file.id === selectedFileId) fileRow.classList.add('is-selected');
                    if (isActive) fileRow.classList.add('is-open');

                    const openIndicator = document.createElement('span');
                    openIndicator.className = `tree-open-indicator${isActive ? ' is-active' : ''}`;

                    const fileIcon = document.createElement('span');
                    fileIcon.className = 'tree-icon tree-icon-file';

                    const fileName = document.createElement('span');
                    fileName.className = 'tree-name';
                    const visibleFileName = `${file.name}${isActive && activeFileDirty ? ' *' : ''}`;
                    fileName.textContent = visibleFileName;
                    fileName.title = visibleFileName;

                    const fileActionItems = [];
                    if (canMutateTree && typeof onRenameFile === 'function') {
                        fileActionItems.push({ label: 'Edit', onClick: () => onRenameFile(file.id) });
                    }
                    if (canMutateTree && typeof onDeleteFile === 'function') {
                        fileActionItems.push({ label: 'Del', variant: 'danger', onClick: () => onDeleteFile(file.id) });
                    }
                    const fileActions = createTreeRowActions(fileActionItems);

                    fileRow.appendChild(openIndicator);
                    fileRow.appendChild(fileIcon);
                    fileRow.appendChild(fileName);
                    if (fileActions) {
                        fileRow.appendChild(fileActions);
                    }
                    fileRow.addEventListener('click', () => onSelectFile(file.id));
                    fileList.appendChild(fileRow);
                });
            }
            folderWrap.appendChild(fileList);
        }
        return folderWrap;
    };

    rootFolders
        .sort(byName)
        .forEach((folder) => {
            container.appendChild(renderFolder(folder));
        });
}

export function renderChecklist(container, data, options = {}) {
    const { onUpdatePass, onUpdateStep, onHighlightStep, onScenarioTitleUpdate } = options;
    if (!container) return;

    if (!data || !data.steps || !Array.isArray(data.steps)) {
        container.innerHTML = '<tr class="empty-state"><td colspan="5">JSON structure must contain a "steps" array.</td></tr>';
        if (onScenarioTitleUpdate) onScenarioTitleUpdate("No valid steps found", false);
        return;
    }

    if (onScenarioTitleUpdate) {
        onScenarioTitleUpdate(data.scenario || "Untitled Scenario", Object.prototype.hasOwnProperty.call(data, 'scenario'));
    }

    if (data.steps.length === 0) {
        container.innerHTML = '<tr class="empty-state"><td colspan="5">No steps in this scenario file.</td></tr>';
        return;
    }

    container.innerHTML = '';
    let visibleIndex = 0;
    data.steps.forEach((step, index) => {
        if (isChecklistDividerStep(step)) {
            const dividerRow = document.createElement('tr');
            dividerRow.className = 'checklist-divider-row';
            const dividerCell = document.createElement('td');
            dividerCell.colSpan = 5;
            dividerCell.textContent = getChecklistDividerTitle(step);
            dividerRow.appendChild(dividerCell);
            dividerRow.addEventListener('click', () => {
                const rows = container.querySelectorAll('tr');
                rows.forEach((row) => {
                    row.classList.remove('selected-row');
                });
                dividerRow.classList.add('selected-row');
                onHighlightStep(index);
            });
            container.appendChild(dividerRow);
            return;
        }

        visibleIndex += 1;
        const tr = document.createElement('tr');
        const isPassed = step.pass === true;
        
        tr.innerHTML = `
            <td class="col-num">${visibleIndex}</td>
            <td class="col-given"><div class="cell-content" contenteditable="true" data-index="${index}" data-field="given"></div></td>
            <td class="col-when"><div class="cell-content" contenteditable="true" data-index="${index}" data-field="when"></div></td>
            <td class="col-then"><div class="cell-content" contenteditable="true" data-index="${index}" data-field="then"></div></td>
            <td class="col-pass">
                <label class="checkbox-container">
                    <input type="checkbox" data-index="${index}" ${isPassed ? 'checked' : ''}>
                    <span class="checkmark"></span>
                </label>
            </td>
        `;

        const populateCell = (field, val) => {
            const cell = tr.querySelector(`[data-field="${field}"]`);
            cell.dataset.rawValue = val;
            cell.innerHTML = formatChecklistCellContent(val);
            
            cell.addEventListener('focus', (e) => { e.target.textContent = e.target.dataset.rawValue; });
            cell.addEventListener('input', (e) => onUpdateStep(index, field, e.target.innerText));
            cell.addEventListener('blur', (e) => {
                let v = e.target.innerText.trim();
                if (v === '-') v = '';
                onUpdateStep(index, field, v);
                e.target.dataset.rawValue = v;
                e.target.innerHTML = formatChecklistCellContent(v);
            });
        };

        populateCell('given', normalizeStepFieldForEditor(step.given));
        populateCell('when', normalizeStepFieldForEditor(step.when));
        populateCell('then', normalizeStepFieldForEditor(step.then));

        tr.addEventListener('click', () => {
            const rows = container.querySelectorAll('tr');
            rows.forEach((row) => {
                row.classList.remove('selected-row');
            });
            tr.classList.add('selected-row');
            onHighlightStep(index);
        });

        tr.querySelector('.col-pass input').addEventListener('change', (e) => onUpdatePass(index, e.target.checked));
        container.appendChild(tr);
    });
}
