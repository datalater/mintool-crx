# Agent Development Guide for mintool-crx

This document provides essential information for AI agents working on the mintool-crx Chrome extension project.

## Build/Test Commands

Since this is a Chrome Extension without a build system, testing is primarily manual:
- **Load Extension**: Load unpacked extension in Chrome developer mode from project root
- **Manual Testing**: Navigate to target sites (GitHub, TossInvest, Jira) to test features
- **QA Scenario Testing**: Open `qa-scenario/index.html` in browser for testing the QA automation interface
- **Console Debugging**: Use browser dev tools on target pages to debug content scripts

## Code Style Guidelines

### Project Structure (Architecture Standards)
- **500-line limit**: Single JS files should not exceed 500 lines - modularize immediately
- **Separation of Concerns**: Maintain strict boundaries between UI, logic, and utilities
- **Shared Utilities**: Place reusable functions in `/lib/` for cross-script usage
- **Constants**: All magic numbers and fixed strings belong in `/constants/` or `/configs/`

### JavaScript Conventions

#### Import/Export Patterns
- **Content Scripts**: Use global scope via `lib/global.js` for shared functionality
- **QA Module**: Modern ES modules (`import/export`) pattern in `/qa-scenario/`
- **Library Dependencies**: External libraries go in `/lib/` (e.g., `vue-min.js`, `toastify.js`)

#### Naming Conventions
- **Variables**: `camelCase` for local variables, `UPPER_SNAKE_CASE` for constants
- **Functions**: `camelCase` with descriptive verbs (`createElement`, `observeUrlChange`)
- **Global Objects**: `mintool` namespace for all global utilities
- **CSS Classes**: BEM-style with `mintool-` prefix (`mintool-toast`, `mintool-island`)

#### Error Handling
- **Async Operations**: Always include `try-catch` blocks around Chrome API calls
- **Element Selection**: Check for null returns from `querySelector` operations
- **Promise Rejections**: Include `.catch()` handlers or `try-catch` for `await`
- **Validation**: Use guard clauses for early returns on invalid inputs

### Code Organization Principles

#### Function Length & Complexity
- **5-Line Functions**: Preferred maximum length (see `.claude/CLAUDE.md` for refactoring guide)
- **Single Responsibility**: Each function should do exactly one thing
- **Pure Functions**: Prefer stateless utilities in `/lib/` where possible

#### DOM Manipulation
- **Utility Functions**: Use `createElement()`, `querySelector()` from `lib/global.js`
- **Shadow DOM Support**: Utilize enhanced query selectors that penetrate shadow roots
- **Event Handling**: Batch rapid events (like navigation changes) to prevent performance issues

#### Chrome Extension Specifics

##### Manifest V3 Compliance
- **Service Worker**: Background scripts use service worker pattern
- **Permissions**: Minimum required permissions only (no `<all_urls>` unless necessary)
- **Content Security**: No inline scripts or external resource loading

##### Content Script Architecture
- **MAIN World**: Inject global utilities into page context (`world: "MAIN"`)
- **ISOLATED World**: Content script logic with extension APIs
- **Communication**: Use custom events between worlds when needed

##### Site-Specific Scripts
- **GitHub Integration**: `/lib/github/` modules for GitHub-specific functionality
- **Target Patterns**: Match specific domains in `manifest.json` content script entries
- **Feature Detection**: Check for target elements before attempting operations

### CSS and Styling

#### Organization
- **CSS Variables**: Define design tokens in `:root` for colors, spacing, typography
- **Reset Styles**: Use `reset.css` for consistent base styling
- **Component Styles**: Keep component-specific CSS separate (e.g., `popup/popup.css`)

#### Design System
- **Z-Index Management**: Use `Z_INDEX_MAX` (2147483647) as reference
- **Responsive Design**: Mobile-first approach with `@media` queries
- **Overlay Patterns**: Consistent toast/notification styling via `createIsland()`

## Development Workflow

### Before Making Changes
1. **Check Existing Code**: Search `/lib/` and `/utils/` for existing functionality
2. **Review Architecture**: Consult `.agent/architecture.md` for patterns
3. **Check File Size**: If editing a file near 500 lines, plan modularization

### Making Changes
1. **Follow Conventions**: Use existing patterns for naming, structure, error handling
2. **Update Documentation**: Modify `.agent/` files if architecture decisions change
3. **Test Thoroughly**: Test on target domains with fresh extension reload

### Code Review Checklist
- [ ] Function names are self-documenting
- [ ] Error handling covers Chrome API failures
- [ ] No hardcoded constants (move to appropriate file)
- [ ] Shared utilities used instead of duplicates
- [ ] DOM queries handle null results
- [ ] File stays under 500 lines (or is modularized)
- [ ] Chrome extension permissions are minimal

## Key Files to Understand

### Core Architecture
- `manifest.json`: Extension configuration and permissions
- `lib/global.js`: Shared utilities and DOM helpers
- `background.js`: Service worker for extension lifecycle

### Feature Modules
- `lib/github/`: GitHub-specific enhancements
- `scripts/`: Site-specific content scripts
- `qa-scenario/`: Modern ES module pattern (reference for future architecture)

### Configuration
- `.agent/`: AI agent guidelines and architecture docs
- `rules/adblock-rules.json`: Declarative network request rules

This project follows a modular, utility-first approach with strict adherence to Chrome Extension Manifest V3 requirements. Always prioritize code reuse, clear naming conventions, and comprehensive error handling.