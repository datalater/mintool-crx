import { getActiveFile } from './workspace-manager.js';

export function createTreeRowActions(actions) {
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

export function updatePassHeaderState(passHeaderToggle, currentData) {
    if (!passHeaderToggle) return;

    const steps = (currentData && Array.isArray(currentData.steps)) ? currentData.steps : [];
    const hasSteps = steps.length > 0;
    const allPassed = hasSteps && steps.every(step => step.pass === true);

    passHeaderToggle.classList.toggle('all-passed', allPassed);
    passHeaderToggle.classList.toggle('disabled', !hasSteps);
    passHeaderToggle.setAttribute('aria-pressed', allPassed ? 'true' : 'false');
}

export function renderFileTree(container, workspace, options = {}) {
    const { 
        activeFileDirty, 
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
    if (activeFolderId) expandedSet.add(activeFolderId);

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

        const folderActions = createTreeRowActions([
            { label: 'Edit', onClick: () => onRenameFolder(folder.id) },
            { label: 'Del', variant: 'danger', onClick: () => onDeleteFolder(folder.id) }
        ]);

        folderRow.appendChild(chevron);
        folderRow.appendChild(icon);
        folderRow.appendChild(name);
        folderRow.appendChild(folderActions);
        folderRow.addEventListener('click', () => onToggleFolder(folder.id));
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
                    const isActive = activeFile && activeFile.id === file.id;
                    if (file.id === selectedFileId) fileRow.classList.add('is-selected');
                    if (isActive) fileRow.classList.add('is-open');

                    const openIndicator = document.createElement('span');
                    openIndicator.className = `tree-open-indicator${isActive ? ' is-active' : ''}`;

                    const fileIcon = document.createElement('span');
                    fileIcon.className = 'tree-icon tree-icon-file';

                    const fileName = document.createElement('span');
                    fileName.className = 'tree-name';
                    fileName.textContent = `${file.name}${isActive && activeFileDirty ? ' *' : ''}`;

                    const fileActions = createTreeRowActions([
                        { label: 'Edit', onClick: () => onRenameFile(file.id) },
                        { label: 'Del', variant: 'danger', onClick: () => onDeleteFile(file.id) }
                    ]);

                    fileRow.appendChild(openIndicator);
                    fileRow.appendChild(fileIcon);
                    fileRow.appendChild(fileName);
                    fileRow.appendChild(fileActions);
                    fileRow.addEventListener('click', () => onSelectFile(file.id));
                    fileList.appendChild(fileRow);
                });
            }
            folderWrap.appendChild(fileList);
        }
        container.appendChild(folderWrap);
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
    data.steps.forEach((step, index) => {
        const tr = document.createElement('tr');
        const isPassed = step.pass === true;
        
        tr.innerHTML = `
            <td class="col-num">${index + 1}</td>
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

        populateCell('given', (step.given || '').trim());
        populateCell('when', (step.when || '').trim());
        const thenVal = Array.isArray(step.then) ? step.then.join('\n') : (step.then || '');
        populateCell('then', thenVal.trim());

        tr.addEventListener('click', (e) => {
            if (e.target.closest('.cell-content') || e.target.closest('.col-pass')) return;
            const rows = container.querySelectorAll('tr');
            rows.forEach(r => r.classList.remove('selected-row'));
            tr.classList.add('selected-row');
            onHighlightStep(index);
        });

        tr.querySelector('.col-pass input').addEventListener('change', (e) => onUpdatePass(index, e.target.checked));
        container.appendChild(tr);
    });
}
