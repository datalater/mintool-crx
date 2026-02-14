export const EDITOR_CONFIG = {
    shortcuts: {
        save: {
            codes: ['KeyS'],
            keys: ['s'],
            primary: true,
            shift: false,
            alt: false
        },
        undo: {
            codes: ['KeyZ'],
            keys: ['z'],
            primary: true,
            shift: false,
            alt: false
        },
        redoByShift: {
            codes: ['KeyZ'],
            keys: ['z'],
            primary: true,
            shift: true,
            alt: false
        },
        redoByCtrlY: {
            codes: ['KeyY'],
            keys: ['y'],
            primary: true,
            shift: false,
            alt: false
        },
        cursorHistoryBack: {
            codes: ['Minus', 'NumpadSubtract'],
            keys: ['-'],
            primary: true,
            shift: false,
            alt: false
        },
        cursorHistoryForward: {
            codes: ['Minus', 'NumpadSubtract'],
            keys: ['_', '-'],
            primary: true,
            shift: true,
            alt: false
        }
    },
    cursorHistory: {
        maxEntries: 200
    }
};
