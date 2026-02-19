# Changelog

All notable changes to this project are documented in this file.

## [2.2.2] - 2026-02-20

### Added
- Folder-open mode for QA Scenario editor using File System Access API with recursive `.json` discovery and hierarchical tree rendering.
- Directory handle auto-reconnect after reload using persisted handle storage (IndexedDB) when permissions allow restore.
- Right-click context menu for file tree actions to reduce accidental hover-click operations.

### Changed
- Reworked save flow so bound files/folders write directly to disk when write permissions are granted.
- Folder mode now starts fully expanded by default while still allowing manual collapse/expand afterwards.
- Added explicit write-permission recovery with `Enable Sync` in read-only folder mode.

### Fixed
- Stabilized folder-open behavior by handling partial traversal/read failures without aborting the entire load.
- Improved permission handling on auto-reconnect to avoid noisy DOMException failures when interaction is required.
- Synced file/folder operations to disk from context menu actions (`new`, `rename`, `delete`) in writable folder mode.

## [2.2.1] - 2026-02-20

### Added
- Bound path input and status line next to `Open...` in QA Scenario header.
- Human-readable sync timestamps (`YYYY-MM-DD HH:MM:SS`) in bound storage status.

### Changed
- Replaced `Bind/Open...` labeling with `Open...` and aligned top-bar layout to `[status] [path] [Open]`.
- Updated bound-path input styling for GitHub dark tone consistency.
- Made divider rows selectable so clicking divider rows highlights corresponding JSON area.

### Fixed
- Cursor behavior updates for checklist rows and headers (divider rows are clickable; non-pass header cells no longer imply clickability).
- Removed multi-file sync pause gate so bound file writes are attempted on save when permissions are available.
- Clarified save/sync messaging by showing local `Saved` indicator only when direct disk sync is unavailable.

## [2.2.0] - 2026-02-14

### Added
- Editor find/replace widget for plain text search and replace in QA Scenario editor.
- Shortcut configuration entries for find/replace flows (`Cmd/Ctrl+F`, `Cmd+Opt+F`, `Ctrl+H`, `Enter`, `Shift+Enter`, `Esc`).
- Deleted file restore via undo shortcut (`Cmd/Ctrl+Z`) after file-tree deletion.
- Divider step support in checklist rendering (`{ "divider": true | "title" }`) and divider example in new-file default template.
- Unit tests for find/replace manager, divider behavior, deleted-file history, and tree delete callback flow.

### Changed
- Improved find navigation behavior to keep match reveal/scroll sync reliable with widget focus.
- Updated selected file-row styling so selected item has stronger visual emphasis than non-selected rows.

### Fixed
- Prevented find widget button clicks from stealing focus during match navigation.

## [2.1.1] - 2026-02-14

### Changed
- Manifest version bump to `2.1.1`.
