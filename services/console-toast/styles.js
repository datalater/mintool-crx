(function () {
  const HOST_ID = "mintool-console-toast-host";
  const STYLE_ID = "mintool-console-toast-style";
  const Z_INDEX_MAX = 2147483647;

  globalThis.mintoolConsoleToastInjectStyles = function injectStyles() {
    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${HOST_ID} {
        all: initial;
        --surface: #ffffff;
        --text: #1a1a1a;
        --muted: #6b7280;
        --border: #e5e7eb;
        --action: #2563eb;
        --log: #9ca3af;
        --info: #2563eb;
        --warn: #d97706;
        --error: #dc2626;
        --bg-soft: #f8fafc;
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: ${Z_INDEX_MAX};
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
        pointer-events: none;
        font-family: "Pretendard", "Noto Sans KR", system-ui, sans-serif;
      }
      #${HOST_ID} * { box-sizing: border-box; }
      #${HOST_ID} .mintool-ct-list {
        display: flex;
        flex-direction: column-reverse;
        gap: 8px;
        width: min(420px, calc(100vw - 32px));
      }
      #${HOST_ID} .mintool-ct-toast {
        pointer-events: auto;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        align-items: start;
        padding: 12px;
        border-radius: 10px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-left: 3px solid var(--log);
        box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
      #${HOST_ID} .mintool-ct-toast.is-visible {
        opacity: 1;
        transform: translateY(0);
      }
      #${HOST_ID} .mintool-ct-toast[data-level="info"],
      #${HOST_ID} .mintool-ct-row[data-level="info"] { border-left-color: var(--info); }
      #${HOST_ID} .mintool-ct-toast[data-level="warn"],
      #${HOST_ID} .mintool-ct-row[data-level="warn"] { border-left-color: var(--warn); }
      #${HOST_ID} .mintool-ct-toast[data-level="error"],
      #${HOST_ID} .mintool-ct-row[data-level="error"] { border-left-color: var(--error); }
      #${HOST_ID} .mintool-ct-toast-meta,
      #${HOST_ID} .mintool-ct-row-meta {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }
      #${HOST_ID} .mintool-ct-topline {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 8px;
        min-width: 0;
      }
      #${HOST_ID} .mintool-ct-level {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--muted);
      }
      #${HOST_ID} [data-level="info"] .mintool-ct-level { color: var(--info); }
      #${HOST_ID} [data-level="warn"] .mintool-ct-level { color: var(--warn); }
      #${HOST_ID} [data-level="error"] .mintool-ct-level { color: var(--error); }
      #${HOST_ID} .mintool-ct-place,
      #${HOST_ID} .mintool-ct-time {
        font-size: 12px;
        color: var(--muted);
      }
      #${HOST_ID} .mintool-ct-place {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
      }
      #${HOST_ID} .mintool-ct-message {
        font-size: 13px;
        line-height: 1.45;
        color: var(--text);
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 7.5em;
        overflow: auto;
      }
      #${HOST_ID} .mintool-ct-toast-actions {
        display: flex;
        align-items: center;
        gap: 2px;
      }
      #${HOST_ID} .mintool-ct-action,
      #${HOST_ID} .mintool-ct-text-btn {
        all: unset;
        cursor: pointer;
        padding: 6px 8px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        color: var(--action);
        white-space: nowrap;
      }
      #${HOST_ID} .mintool-ct-action:hover,
      #${HOST_ID} .mintool-ct-text-btn:hover {
        background: rgba(37, 99, 235, 0.08);
      }
      #${HOST_ID} .mintool-ct-action.is-done { color: var(--muted); }
      #${HOST_ID} .mintool-ct-icon-btn {
        all: unset;
        cursor: pointer;
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        color: var(--muted);
        font-size: 14px;
        line-height: 1;
      }
      #${HOST_ID} .mintool-ct-icon-btn:hover {
        background: rgba(15, 23, 42, 0.06);
        color: var(--text);
      }
      #${HOST_ID}.is-panel-open .mintool-ct-list { display: none; }
      #${HOST_ID} .mintool-ct-dock {
        pointer-events: auto;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      #${HOST_ID} .mintool-ct-dock-btn {
        all: unset;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: var(--surface);
        border: 1px solid var(--border);
        box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
        color: var(--text);
        font-size: 13px;
        font-weight: 600;
      }
      #${HOST_ID} .mintool-ct-dock-btn:hover { background: var(--bg-soft); }
      #${HOST_ID} .mintool-ct-dock-close {
        all: unset;
        cursor: pointer;
        width: 32px;
        height: 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: var(--surface);
        border: 1px solid var(--border);
        box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
        color: var(--muted);
        font-size: 14px;
        line-height: 1;
      }
      #${HOST_ID} .mintool-ct-dock-close:hover {
        background: #fef2f2;
        color: var(--error);
      }
      #${HOST_ID} .mintool-ct-level-counts {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px;
      }
      #${HOST_ID} .mintool-ct-level-count {
        padding: 1px 6px;
        border-radius: 999px;
        background: #f3f4f6;
        color: var(--muted);
        font-size: 11px;
        font-weight: 600;
        line-height: 1.4;
      }
      #${HOST_ID} .mintool-ct-level-count[data-level="error"] {
        background: #fef2f2;
        color: var(--error);
      }
      #${HOST_ID} .mintool-ct-level-count[data-level="warn"] {
        background: #fffbeb;
        color: var(--warn);
      }
      #${HOST_ID} .mintool-ct-level-count[data-level="info"] {
        background: #eff6ff;
        color: var(--info);
      }
      #${HOST_ID} .mintool-ct-level-count[data-level="log"] {
        background: #f3f4f6;
        color: #4b5563;
      }
      #${HOST_ID} .mintool-ct-level-counts.is-interactive .mintool-ct-level-count {
        all: unset;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        padding: 1px 6px;
        border-radius: 999px;
        background: #f3f4f6;
        color: var(--muted);
        font-size: 11px;
        font-weight: 600;
        line-height: 1.4;
      }
      #${HOST_ID} .mintool-ct-level-counts.is-interactive .mintool-ct-level-count[data-level="error"] {
        background: #fef2f2;
        color: var(--error);
      }
      #${HOST_ID} .mintool-ct-level-counts.is-interactive .mintool-ct-level-count[data-level="warn"] {
        background: #fffbeb;
        color: var(--warn);
      }
      #${HOST_ID} .mintool-ct-level-counts.is-interactive .mintool-ct-level-count[data-level="info"] {
        background: #eff6ff;
        color: var(--info);
      }
      #${HOST_ID} .mintool-ct-level-counts.is-interactive .mintool-ct-level-count[data-level="log"] {
        background: #f3f4f6;
        color: #4b5563;
      }
      #${HOST_ID} .mintool-ct-level-counts.is-interactive .mintool-ct-level-count:hover {
        filter: brightness(0.97);
      }
      #${HOST_ID} .mintool-ct-level-counts.is-interactive .mintool-ct-level-count.is-active {
        outline: 2px solid currentColor;
        outline-offset: 1px;
      }
      #${HOST_ID} .mintool-ct-panel-title-wrap {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
      }
      #${HOST_ID} .mintool-ct-panel {
        pointer-events: auto;
        width: min(420px, calc(100vw - 32px));
        max-height: min(420px, calc(100vh - 120px));
        display: flex;
        flex-direction: column;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
        overflow: hidden;
      }
      #${HOST_ID} .mintool-ct-panel[hidden] { display: none !important; }
      #${HOST_ID} .mintool-ct-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 12px 8px;
      }
      #${HOST_ID} .mintool-ct-panel-title {
        font-size: 14px;
        font-weight: 700;
        color: var(--text);
      }
      #${HOST_ID} .mintool-ct-search {
        margin: 0 12px 8px;
        padding: 8px 10px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--bg-soft);
        color: var(--text);
        font-size: 13px;
        outline: none;
      }
      #${HOST_ID} .mintool-ct-search:focus {
        border-color: #93c5fd;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
      }
      #${HOST_ID} .mintool-ct-panel-list {
        flex: 1;
        overflow: auto;
        padding: 0 8px 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      #${HOST_ID} .mintool-ct-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        align-items: start;
        padding: 10px;
        border-radius: 8px;
        background: var(--bg-soft);
        border-left: 3px solid var(--log);
      }
      #${HOST_ID} .mintool-ct-empty {
        padding: 24px 12px;
        text-align: center;
        color: var(--muted);
        font-size: 13px;
      }
      #${HOST_ID} .mintool-ct-panel-footer {
        display: flex;
        justify-content: flex-end;
        padding: 8px 12px 12px;
        border-top: 1px solid var(--border);
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  };
})();
