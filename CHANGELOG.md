# Changelog

All notable changes to this project are documented in this file.

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
