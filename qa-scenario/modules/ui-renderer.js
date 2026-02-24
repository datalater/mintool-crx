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

export function normalizeEditableChecklistDividerValue(value) {
    const normalized = normalizeChecklistDividerValue(value);
    return normalized === null ? true : normalized;
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
        showInlineActions,
        onOpenContextMenu,
        onMoveFile,
        pendingCopyFileIds,
        fileSearchState,
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
    const pendingCopySet = pendingCopyFileIds instanceof Set
        ? pendingCopyFileIds
        : new Set(Array.isArray(pendingCopyFileIds) ? pendingCopyFileIds : []);
    const searchQuery = String(fileSearchState?.query || '').trim();
    const hasSearchQuery = searchQuery.length > 0;
    const searchNeedle = searchQuery.toLowerCase();
    const searchMatchesByFileId = fileSearchState?.matchesByFileId instanceof Map
        ? fileSearchState.matchesByFileId
        : new Map();
    const canDragMove = Boolean(canMutateTree && typeof onMoveFile === 'function');
    const DRAG_FILE_MIME = 'application/x-qa-scenario-file-id';
    let draggingFileId = '';

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

    const visibleFolderIds = new Set();
    if (hasSearchQuery) {
        workspace.files.forEach((file) => {
            if (!searchMatchesByFileId.has(file.id)) return;
            let cursor = file.folderId;
            while (cursor) {
                if (visibleFolderIds.has(cursor)) break;
                visibleFolderIds.add(cursor);
                const parentFolder = folderById.get(cursor);
                cursor = parentFolder?.parentId || null;
            }
        });
    }

    const appendHighlightedText = (target, sourceText) => {
        target.textContent = '';
        const text = String(sourceText || '');
        if (!hasSearchQuery || !searchNeedle) {
            target.textContent = text;
            return;
        }

        const lowered = text.toLowerCase();
        let cursor = 0;
        while (cursor < text.length) {
            const found = lowered.indexOf(searchNeedle, cursor);
            if (found < 0) {
                target.appendChild(document.createTextNode(text.slice(cursor)));
                break;
            }

            if (found > cursor) {
                target.appendChild(document.createTextNode(text.slice(cursor, found)));
            }

            const mark = document.createElement('mark');
            mark.className = 'tree-search-hit';
            mark.textContent = text.slice(found, found + searchNeedle.length);
            target.appendChild(mark);
            cursor = found + searchNeedle.length;
        }
    };

    const getDraggedFileId = (dataTransfer) => {
        if (!dataTransfer || typeof dataTransfer.getData !== 'function') return '';
        return dataTransfer.getData(DRAG_FILE_MIME) || dataTransfer.getData('text/plain') || '';
    };

    const getCurrentDraggedFileId = (dataTransfer) => draggingFileId || getDraggedFileId(dataTransfer);

    const clearDropTargets = () => {
        if (!container || typeof container.querySelectorAll !== 'function') return;
        container.querySelectorAll('.tree-folder-row.is-drop-target').forEach((node) => {
            node.classList.remove('is-drop-target');
        });
    };

    const moveFileToFolder = (fileId, folderId) => {
        if (!canDragMove) return;
        const maybePromise = onMoveFile(fileId, folderId);
        if (maybePromise && typeof maybePromise.catch === 'function') {
            maybePromise.catch((error) => {
                console.error('[qa-scenario] failed to move file by drag and drop', error);
            });
        }
    };

    const renderFolder = (folder, depth = 0) => {
        if (hasSearchQuery && !visibleFolderIds.has(folder.id)) {
            return null;
        }

        const folderWrap = document.createElement('div');
        folderWrap.className = 'tree-folder';

        const folderRow = document.createElement('div');
        folderRow.className = 'tree-folder-row';
        folderRow.style.paddingLeft = `${10 + (depth * 16)}px`;
        folderRow.setAttribute('role', 'button');
        folderRow.tabIndex = 0;
        if (folder.id === activeFolderId) folderRow.classList.add('active-parent');
        if (folder.id === selectedFolderId) folderRow.classList.add('active-target');

        const isExpanded = hasSearchQuery ? true : expandedSet.has(folder.id);
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
        if (showInlineActions && canMutateTree && typeof onRenameFolder === 'function') {
            folderActionItems.push({ label: 'Edit', onClick: () => onRenameFolder(folder.id) });
        }
        if (showInlineActions && canMutateTree && typeof onDeleteFolder === 'function') {
            folderActionItems.push({ label: 'Del', variant: 'danger', onClick: () => onDeleteFolder(folder.id) });
        }
        const folderActions = createTreeRowActions(folderActionItems);

        folderRow.appendChild(chevron);
        folderRow.appendChild(icon);
        folderRow.appendChild(name);
        if (folderActions) {
            folderRow.appendChild(folderActions);
        }

        if (canDragMove) {
            folderRow.addEventListener('dragover', (event) => {
                const draggedFileId = getCurrentDraggedFileId(event.dataTransfer);
                if (!draggedFileId) return;
                const draggedFile = workspace.files.find((item) => item.id === draggedFileId);
                if (!draggedFile || draggedFile.folderId === folder.id) return;
                event.preventDefault();
                if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = 'move';
                }
                folderRow.classList.add('is-drop-target');
            });

            folderRow.addEventListener('dragleave', () => {
                folderRow.classList.remove('is-drop-target');
            });

            folderRow.addEventListener('drop', (event) => {
                folderRow.classList.remove('is-drop-target');
                const draggedFileId = getCurrentDraggedFileId(event.dataTransfer);
                if (!draggedFileId) return;
                const draggedFile = workspace.files.find((item) => item.id === draggedFileId);
                if (!draggedFile || draggedFile.folderId === folder.id) return;
                event.preventDefault();
                event.stopPropagation();
                draggingFileId = '';
                clearDropTargets();
                moveFileToFolder(draggedFileId, folder.id);
            });
        }

        folderRow.addEventListener('click', () => onToggleFolder(folder.id));
        if (typeof onOpenContextMenu === 'function') {
            folderRow.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenContextMenu({
                    type: 'folder',
                    id: folder.id,
                    x: event.clientX,
                    y: event.clientY
                });
            });
        }
        folderWrap.appendChild(folderRow);

        if (isExpanded) {
            const fileList = document.createElement('div');
            fileList.className = 'tree-file-list';

            const childFolders = (childFoldersByParentId.get(folder.id) || [])
                .sort(byName)
                .filter((childFolder) => !hasSearchQuery || visibleFolderIds.has(childFolder.id));
            childFolders.forEach((childFolder) => {
                const childNode = renderFolder(childFolder, depth + 1);
                if (childNode) {
                    fileList.appendChild(childNode);
                }
            });

            const files = (filesByFolderId.get(folder.id) || [])
                .sort(byName)
                .filter((file) => !hasSearchQuery || searchMatchesByFileId.has(file.id));

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
                    const isPendingCopy = pendingCopySet.has(file.id);
                    if (file.id === selectedFileId) fileRow.classList.add('is-selected');
                    if (isActive) fileRow.classList.add('is-open');
                    if (isPendingCopy) fileRow.classList.add('is-pending-copy');

                    const openIndicator = document.createElement('span');
                    openIndicator.className = `tree-open-indicator${isActive ? ' is-active' : ''}`;

                    const fileIcon = document.createElement('span');
                    fileIcon.className = 'tree-icon tree-icon-file';

                    const fileTextWrap = document.createElement('span');
                    fileTextWrap.className = 'tree-file-text';

                    const fileName = document.createElement('span');
                    fileName.className = 'tree-name';

                    const visibleFileName = `${file.name}${isActive && activeFileDirty ? ' *' : ''}`;
                    fileName.title = visibleFileName;
                    appendHighlightedText(fileName, visibleFileName);
                    fileTextWrap.appendChild(fileName);

                    const matchInfo = searchMatchesByFileId.get(file.id);
                    const hasContentSnippet = Boolean(hasSearchQuery && matchInfo?.snippet);
                    if (hasContentSnippet) {
                        fileRow.classList.add('has-search-snippet');
                        const snippet = document.createElement('span');
                        snippet.className = 'tree-search-snippet';
                        appendHighlightedText(snippet, matchInfo.snippet);
                        fileTextWrap.appendChild(snippet);
                    }

                    const fileActionItems = [];
                    if (showInlineActions && canMutateTree && typeof onRenameFile === 'function') {
                        fileActionItems.push({ label: 'Edit', onClick: () => onRenameFile(file.id) });
                    }
                    if (showInlineActions && canMutateTree && typeof onDeleteFile === 'function') {
                        fileActionItems.push({ label: 'Del', variant: 'danger', onClick: () => onDeleteFile(file.id) });
                    }
                    const fileActions = createTreeRowActions(fileActionItems);

                    const searchBadges = document.createElement('span');
                    searchBadges.className = 'tree-search-badges';
                    if (hasSearchQuery && matchInfo?.nameMatched) {
                        const nameBadge = document.createElement('span');
                        nameBadge.className = 'tree-search-badge';
                        nameBadge.textContent = 'Name';
                        searchBadges.appendChild(nameBadge);
                    }
                    if (hasSearchQuery && Number(matchInfo?.contentMatchCount) > 0) {
                        const contentBadge = document.createElement('span');
                        contentBadge.className = 'tree-search-badge';
                        contentBadge.textContent = `Content ${matchInfo.contentMatchCount}`;
                        searchBadges.appendChild(contentBadge);
                    }

                    fileRow.appendChild(openIndicator);
                    fileRow.appendChild(fileIcon);
                    fileRow.appendChild(fileTextWrap);
                    if (isPendingCopy) {
                        const pendingBadge = document.createElement('span');
                        pendingBadge.className = 'tree-copy-pending-badge';
                        pendingBadge.textContent = '복사 중...';
                        fileRow.appendChild(pendingBadge);
                    }
                    if (searchBadges.childElementCount > 0) {
                        fileRow.appendChild(searchBadges);
                    }
                    if (fileActions) {
                        fileRow.appendChild(fileActions);
                    }
                    if (canDragMove) {
                        fileRow.draggable = true;
                        fileRow.addEventListener('dragstart', (event) => {
                            if (!event.dataTransfer) return;
                            draggingFileId = file.id;
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData(DRAG_FILE_MIME, file.id);
                            event.dataTransfer.setData('text/plain', file.id);
                            fileRow.classList.add('is-dragging');
                        });
                        fileRow.addEventListener('dragend', () => {
                            draggingFileId = '';
                            fileRow.classList.remove('is-dragging');
                            clearDropTargets();
                        });
                    }
                    fileRow.addEventListener('click', () => onSelectFile(file.id));
                    if (typeof onOpenContextMenu === 'function') {
                        fileRow.addEventListener('contextmenu', (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onOpenContextMenu({
                                type: 'file',
                                id: file.id,
                                x: event.clientX,
                                y: event.clientY
                            });
                        });
                    }
                    fileList.appendChild(fileRow);
                });
            }
            folderWrap.appendChild(fileList);
        }
        return folderWrap;
    };

    if (hasSearchQuery && searchMatchesByFileId.size === 0) {
        const empty = document.createElement('div');
        empty.className = 'tree-empty';
        empty.textContent = `No matching files for "${searchQuery}"`;
        container.appendChild(empty);
        return;
    }

    rootFolders
        .sort(byName)
        .forEach((folder) => {
            const folderNode = renderFolder(folder);
            if (folderNode) {
                container.appendChild(folderNode);
            }
        });
}

function createAddRowButton(afterIndex, onAddStep) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'checklist-add-row-btn';
    btn.textContent = '+';
    btn.title = 'Add step below';
    btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onAddStep(afterIndex);
    });
    return btn;
}

function appendAddRowButton(container, anchorRow, afterIndex, onAddStep) {
    const wrapperRow = document.createElement('tr');
    wrapperRow.className = 'checklist-add-row-zone';
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.appendChild(createAddRowButton(afterIndex, onAddStep));
    wrapperRow.appendChild(cell);
    container.appendChild(wrapperRow);
}

export function renderChecklist(container, data, options = {}) {
    const { onUpdatePass, onUpdateStep, onHighlightStep, onScenarioTitleUpdate, onAddStep, onOpenChecklistContextMenu } = options;
    if (!container) return;

    const blurOnEscape = (editable) => {
        editable.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.currentTarget?.blur === 'function') {
                event.currentTarget.blur();
            }
        });
    };

    if (!data || !data.steps || !Array.isArray(data.steps)) {
        container.innerHTML = '<tr class="empty-state"><td colspan="5">JSON structure must contain a "steps" array.</td></tr>';
        if (onScenarioTitleUpdate) onScenarioTitleUpdate("No valid steps found", false);
        return;
    }

    if (onScenarioTitleUpdate) {
        onScenarioTitleUpdate(data.scenario || "Untitled Scenario", Object.prototype.hasOwnProperty.call(data, 'scenario'));
    }

    if (data.steps.length === 0) {
        container.innerHTML = '';
        const emptyRow = document.createElement('tr');
        emptyRow.className = 'empty-state';
        emptyRow.innerHTML = '<td colspan="5">No steps in this scenario file.</td>';
        container.appendChild(emptyRow);
        if (typeof onAddStep === 'function') {
            appendAddRowButton(container, emptyRow, -1, onAddStep);
        }
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
            const dividerContent = document.createElement('div');
            dividerContent.className = 'cell-content checklist-divider-content';
            dividerContent.contentEditable = 'true';
            dividerContent.dataset.field = 'divider';

            const rawDividerText = getChecklistDividerTitle(step);
            dividerContent.dataset.rawValue = rawDividerText;
            dividerContent.textContent = rawDividerText;

            dividerContent.addEventListener('focus', (event) => {
                event.target.textContent = event.target.dataset.rawValue;
            });
            dividerContent.addEventListener('input', (event) => {
                onUpdateStep(index, 'divider', event.target.innerText);
            });
            dividerContent.addEventListener('blur', (event) => {
                const nextDividerValue = normalizeEditableChecklistDividerValue(event.target.innerText);
                onUpdateStep(index, 'divider', nextDividerValue);

                const nextLabel = getChecklistDividerTitle({ divider: nextDividerValue });
                event.target.dataset.rawValue = nextLabel;
                event.target.textContent = nextLabel;
            });
            blurOnEscape(dividerContent);

            const dividerInner = document.createElement('div');
            dividerInner.className = 'checklist-divider-inner';

            const dividerSpacer = document.createElement('span');
            dividerSpacer.className = 'checklist-divider-spacer';
            dividerSpacer.setAttribute('aria-hidden', 'true');

            dividerInner.appendChild(dividerSpacer);
            dividerInner.appendChild(dividerContent);
            dividerCell.appendChild(dividerInner);
            dividerRow.appendChild(dividerCell);
            dividerRow.addEventListener('click', () => {
                const rows = container.querySelectorAll('tr');
                rows.forEach((row) => {
                    row.classList.remove('selected-row');
                });
                dividerRow.classList.add('selected-row');
                onHighlightStep(index);
            });
            if (typeof onOpenChecklistContextMenu === 'function') {
                dividerRow.addEventListener('contextmenu', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenChecklistContextMenu({ index, x: event.clientX, y: event.clientY });
                });
            }
            container.appendChild(dividerRow);
            if (typeof onAddStep === 'function') {
                appendAddRowButton(container, dividerRow, index, onAddStep);
            }
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
            blurOnEscape(cell);
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
        if (typeof onOpenChecklistContextMenu === 'function') {
            tr.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenChecklistContextMenu({ index, x: event.clientX, y: event.clientY });
            });
        }

        tr.querySelector('.col-pass input').addEventListener('change', (e) => onUpdatePass(index, e.target.checked));
        container.appendChild(tr);
        if (typeof onAddStep === 'function') {
            appendAddRowButton(container, tr, index, onAddStep);
        }
    });
}
