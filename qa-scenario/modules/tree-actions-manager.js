export function buildTreeRenderOptions(deps) {
    const {
        getWorkspace,
        getActiveFileDirty,
        setLastTreeSelectionType,
        persist,
        loadActiveFile,
        workspaceApi,
        prompt
    } = deps;

    return {
        activeFileDirty: getActiveFileDirty(),
        onToggleFolder: (id) => {
            const workspace = getWorkspace();
            const expanded = new Set(workspace.uiState.expandedFolderIds);
            if (expanded.has(id)) {
                expanded.delete(id);
            } else {
                expanded.add(id);
            }
            workspace.uiState.expandedFolderIds = Array.from(expanded);
            workspace.uiState.selectedFolderId = id;
            workspace.uiState.selectedFileId = null;
            workspace.uiState.lastSelectionType = 'folder';
            setLastTreeSelectionType('folder');
            persist();
        },
        onSelectFile: (id) => {
            const workspace = getWorkspace();
            workspace.uiState.activeFileId = id;
            workspace.uiState.selectedFolderId = workspaceApi.getFileById(workspace, id).folderId;
            workspace.uiState.selectedFileId = id;
            workspace.uiState.lastSelectionType = 'file';
            setLastTreeSelectionType('file');
            persist();
            loadActiveFile();
        },
        onRenameFolder: (id) => {
            const workspace = getWorkspace();
            const folder = workspaceApi.getFolderById(workspace, id);
            const nextName = prompt('Rename folder', folder.name);
            if (!nextName) return;
            folder.name = workspaceApi.getNextAvailableFolderName(workspace, nextName, id);
            persist();
        },
        onDeleteFolder: (id) => {
            const workspace = getWorkspace();
            workspace.folders = workspace.folders.filter(folder => folder.id !== id);
            workspace.files = workspace.files.filter(file => file.folderId !== id);
            if (workspace.uiState.selectedFolderId === id) {
                workspace.uiState.selectedFolderId = null;
            }
            if (workspace.uiState.selectedFileId) {
                const selectedFile = workspaceApi.getFileById(workspace, workspace.uiState.selectedFileId);
                if (!selectedFile || selectedFile.folderId === id) {
                    workspace.uiState.selectedFileId = null;
                }
            }
            persist();
            loadActiveFile();
        },
        onRenameFile: (id) => {
            const workspace = getWorkspace();
            const file = workspaceApi.getFileById(workspace, id);
            const nextName = prompt('Rename file', file.name);
            if (!nextName) return;
            file.name = workspaceApi.getNextAvailableFileName(workspace, file.folderId, nextName, id);
            persist();
        },
        onDeleteFile: (id) => {
            const workspace = getWorkspace();
            workspace.files = workspace.files.filter(file => file.id !== id);
            if (workspace.uiState.selectedFileId === id) {
                workspace.uiState.selectedFileId = null;
            }
            persist();
            loadActiveFile();
        }
    };
}
