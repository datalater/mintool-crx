import {
    isEditorSaveShortcut,
    isEditorUndoShortcut,
    isEditorRedoShortcut,
    runNativeEditCommand
} from '../modules/editor-shortcut-manager.js';
import { assertEqual, test } from './lib/test-runner.mjs';

function createEvent(overrides = {}) {
    return {
        key: '',
        code: '',
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        isComposing: false,
        ...overrides
    };
}

test('save shortcut detection: cmd/ctrl+s only', () => {
    assertEqual(isEditorSaveShortcut(createEvent({ metaKey: true, key: 's', code: 'KeyS' })), true);
    assertEqual(isEditorSaveShortcut(createEvent({ ctrlKey: true, key: 'S', code: 'KeyS' })), true);
    assertEqual(isEditorSaveShortcut(createEvent({ metaKey: true, shiftKey: true, key: 's', code: 'KeyS' })), false);
});

test('undo/redo shortcut detection works for mac and windows patterns', () => {
    assertEqual(isEditorUndoShortcut(createEvent({ metaKey: true, key: 'z', code: 'KeyZ' })), true);
    assertEqual(isEditorUndoShortcut(createEvent({ ctrlKey: true, key: 'Z', code: 'KeyZ' })), true);
    assertEqual(isEditorRedoShortcut(createEvent({ metaKey: true, shiftKey: true, key: 'z', code: 'KeyZ' })), true);
    assertEqual(isEditorRedoShortcut(createEvent({ ctrlKey: true, key: 'y', code: 'KeyY' })), true);
});

test('native edit command wrapper handles missing/throwing execCommand safely', () => {
    assertEqual(runNativeEditCommand(null, 'undo'), false);
    assertEqual(runNativeEditCommand({}, 'undo'), false);
    assertEqual(runNativeEditCommand({ execCommand: () => true }, 'undo'), true);
    assertEqual(runNativeEditCommand({ execCommand: () => false }, 'undo'), false);
    assertEqual(runNativeEditCommand({ execCommand: () => { throw new Error('boom'); } }, 'undo'), false);
});
