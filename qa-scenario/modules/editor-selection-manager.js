export function createEditorSelectionManager(editing) {
    function indentSelection() {
        updateSelectionBlock((line) => `  ${line}`, () => 2);
    }

    function unindentSelection() {
        updateSelectionBlock(removeLeadingIndent, getUnindentDelta);
    }

    function updateSelectionBlock(transformLine, getDelta) {
        const info = getSelectionInfo();
        if (!info.hasSelection || info.startLine === info.endLine) return;
        const { lines, lineStarts } = splitLines(info.block);
        const deltas = lines.map(getDelta);
        const nextBlock = lines.map(transformLine).join('\n');
        applyBlockUpdate(info, lineStarts, deltas, info.block, nextBlock);
    }

    function getSelectionInfo() {
        const start = editing.selectionStart;
        const end = editing.selectionEnd;
        const value = editing.value;
        const startLine = value.lastIndexOf('\n', start - 1) + 1;
        const endLine = getBlockEnd(value, end);
        const hasSelection = end > start;
        const block = value.slice(startLine, endLine);
        return { start, end, value, startLine, endLine, hasSelection, block };
    }

    function getBlockEnd(text, end) {
        const newline = text.indexOf('\n', end);
        return newline === -1 ? text.length : newline;
    }

    function splitLines(block) {
        const lines = block.split('\n');
        const lineStarts = [];
        let offset = 0;
        lines.forEach((line) => {
            lineStarts.push(offset);
            offset += line.length + 1;
        });
        return { lines, lineStarts };
    }

    function getUnindentDelta(line) {
        if (line.startsWith('  ')) return -2;
        if (line.startsWith(' ')) return -1;
        return 0;
    }

    function removeLeadingIndent(line) {
        if (line.startsWith('  ')) return line.slice(2);
        if (line.startsWith(' ')) return line.slice(1);
        return line;
    }

    function applyBlockUpdate(info, lineStarts, deltas, block, nextBlock) {
        editing.value = info.value.slice(0, info.startLine) + nextBlock + info.value.slice(info.endLine);

        const relativeStart = info.start - info.startLine;
        const relativeEnd = info.end - info.startLine;
        const nextRelativeStart = adjustIndex(relativeStart, lineStarts, deltas);
        const nextRelativeEnd = adjustIndex(relativeEnd, lineStarts, deltas);

        editing.selectionStart = info.startLine + nextRelativeStart;
        editing.selectionEnd = info.startLine + Math.min(nextBlock.length, Math.max(nextRelativeEnd, nextRelativeStart));
    }

    function adjustIndex(indexInBlock, lineStarts, deltas) {
        let adjusted = indexInBlock;
        lineStarts.forEach((lineStart, i) => {
            if (lineStart < indexInBlock) adjusted += deltas[i];
        });
        return Math.max(0, adjusted);
    }

    return {
        indentSelection,
        unindentSelection
    };
}
