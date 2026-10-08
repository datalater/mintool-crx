(() => {
  const api = mintoolDomHider;
  api.createPickerUi = () => {
    const host = document.createElement("div");
    host.id = api.config.hostId;
    host.setAttribute(api.config.uiAttribute, "picker");
    host.style.cssText = `all:initial;position:fixed;inset:0;z-index:${api.config.panelZIndex};pointer-events:none`;
    // Stored rules may include other sites. Keep the inspector's data out of page-script DOM access.
    const root = host.attachShadow({ mode: "closed" });
    const expanded = new Set();
    let busy = false;
    root.innerHTML = `
      <style>
        :host { --accent:#345edb;--line:#e7eaf0;--ink:#263247;--muted:#667085;--small:11px; }
        * { box-sizing:border-box; } [hidden] { display:none!important; }
        .shield { position:fixed;inset:0;pointer-events:auto;cursor:crosshair;outline:none; }
        .outline { position:fixed;pointer-events:none;border:1px solid var(--accent);color:#fff;
          font:600 11px/18px system-ui;text-shadow:0 0 3px #345edb,0 0 3px #345edb; }
        .panel { position:fixed;right:12px;top:12px;width:min(${api.config.panelWidth}px,calc(100vw - 16px));
          max-height:calc(100vh - 16px);display:flex;flex-direction:column;pointer-events:auto;
          background:#fff;color:var(--ink);border:1px solid #d9dee8;border-radius:8px;
          box-shadow:0 4px 20px #17233b18;font:12px/1.4 system-ui,sans-serif;overflow:hidden; }
        .header { display:flex;align-items:center;gap:6px;padding:7px 9px;flex:none;user-select:none; }
        h2 { font-size:13px;margin:0;font-weight:600;flex:1; } p { margin:5px 0; }
        button,input,select { font:inherit;color:inherit; } button { cursor:pointer; }
        button,select,input[type=text] { border:1px solid #dce1e9;background:#fff;border-radius:4px;min-height:26px; }
        button { padding:3px 8px; } button:hover:not(:disabled) { background:#f0f3f8; }
        button:disabled { opacity:.4;cursor:default; }
        button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible { outline:2px solid var(--accent);outline-offset:1px; }
        .icon { padding:0;width:26px;min-width:26px;display:inline-grid;place-items:center; }
        .ghost { border-color:transparent;background:transparent;color:var(--muted); }
        button.primary { color:white;background:var(--accent);border-color:var(--accent); }
        button.primary:hover:not(:disabled) { background:#244bc2; }
        .body { overflow:auto;min-height:0;padding:0 10px 8px; }
        .selection { border-top:1px solid var(--line);padding:8px 0; }
        .section-label { display:flex;align-items:center;justify-content:space-between;color:var(--muted);font-size:var(--small);margin-bottom:4px; }
        #match { width:100%;padding:4px 6px;font:11px/1.4 monospace; }
        #match-count { color:var(--ink);font-size:12px; }
        .toolbar { display:flex;justify-content:flex-end;gap:3px;margin-top:4px; }
        button[aria-pressed=true] { color:var(--accent);background:#edf2ff; }
        .candidate-heading { display:flex;gap:5px;align-items:center;padding:4px 0;font-size:var(--small); }
        #count { color:var(--muted);font-variant-numeric:tabular-nums; }
        ul { list-style:none;margin:0;padding:0;max-height:240px;overflow:auto; }
        li { border-bottom:1px solid var(--line);border-left:2px solid transparent; }
        li[data-active=true] { border-left-color:var(--accent);background:#f1f5ff; }
        .summary-row { display:grid;grid-template-columns:22px 22px minmax(0,1fr) auto 24px 24px;gap:3px;align-items:center;min-height:34px;padding:3px 2px; }
        .summary-row .icon { width:24px;min-width:24px;min-height:24px; }
        .toggle { display:grid;place-items:center;width:22px;min-height:26px; }
        input[type=checkbox] { margin:0;accent-color:var(--accent);width:12px;height:12px; }
        .number { font-size:10px;font-weight:600;color:var(--muted); }
        li[data-active=true] .number { color:var(--accent); }
        .name { font:11px/1.4 monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
        li[data-enabled=false] .name { color:#8992a3; }
        .matches { font-size:10px;color:var(--muted);font-variant-numeric:tabular-nums; }
        .rule-details { padding:3px 7px 8px 24px; }
        .selector-input { width:100%;font:11px/1.4 monospace;padding:4px 5px;margin:3px 0; }
        .detail-row { display:flex;align-items:center;gap:5px; }
        .detail-row select { min-width:0;flex:1;font-size:11px; }
        .detail-row button { font-size:11px; }
        .delete:hover:not(:disabled) { color:#b42318; }
        .utilities { display:flex;gap:12px;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:6px;margin-top:6px; }
        details { min-width:0;font-size:var(--small);color:var(--muted); }
        details[open] { width:100%; } summary { cursor:pointer;min-height:24px;line-height:24px; }
        #scope { width:100%;font-size:11px;margin-top:4px; }
        pre { font:10px/1.5 monospace;max-height:160px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f7fa;padding:6px; }
        .footer { flex:none;border-top:1px solid var(--line);padding:7px 10px;background:#fff; }
        .footer-actions { display:flex;gap:5px;align-items:center; }
        #draft-state { margin-right:auto;font-size:var(--small);color:var(--muted); }
        #draft-state[data-dirty=true] { color:var(--accent); }
        #status { font-size:var(--small);color:var(--muted);margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
        #status:empty { display:none; }
        #status[data-error=true] { color:#b42318;white-space:normal;overflow-wrap:anywhere; }
        .collapsed-meta { font-size:10px;color:var(--muted); }
        .sr-only { position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%); }
      </style>
      <div class="shield" tabindex="0" aria-label="숨길 요소 선택 영역"></div>
      <div class="outline" hidden></div>
      <section class="panel" role="dialog" aria-label="숨기기 모드">
        <header class="header" title="드래그하여 이동">
          <span aria-hidden="true">⠿</span><h2>숨기기</h2><span id="preview-summary" class="collapsed-meta" hidden></span>
          <button id="collapse" class="icon ghost" data-no-drag aria-expanded="true" aria-label="패널 접기" title="패널 접기">−</button>
          <button id="close" class="icon ghost" data-no-drag aria-label="취소하고 닫기" title="취소하고 닫기">×</button>
        </header>
        <div id="controls" class="body">
          <div class="selection">
            <div class="section-label"><label for="match">현재 선택</label><strong id="match-count">—</strong></div>
            <select id="match" aria-label="현재 선택 범위"></select><code id="selector" class="sr-only"></code>
            <div class="toolbar">
              <button id="parent" class="icon ghost" aria-label="바깥 요소 선택" title="바깥 요소 (↑)">↑</button>
              <button id="child" class="icon ghost" aria-label="안쪽 요소 선택" title="안쪽 요소 (↓)">↓</button>
              <button id="lock" class="ghost" aria-pressed="false" title="대상 고정 (F2)">고정</button>
              <button id="add" class="icon" aria-label="후보에 추가" title="후보에 추가">+</button>
            </div>
          </div>
          <div class="candidate-heading">후보 <span id="count">0</span></div>
          <ul id="candidates"></ul>
          <div class="utilities">
            <details id="help"><summary>도움말·설정</summary>
              <p>반투명 영역이 숨김 미리보기입니다. 클릭하면 후보에 추가되고, 저장하면 실제로 숨겨집니다.</p>
              <p>F2 고정 · ↑/↓ 바깥/안쪽 · Esc 취소<br>번호로 후보와 영역을 연결합니다. ⌖는 위치 보기, ▸는 편집입니다.</p>
              <label>새 후보 범위<select id="scope" aria-label="새 후보 적용 범위"><option value="page">이 페이지</option><option value="site">사이트 전체</option></select></label>
              <p>현재 페이지·사이트 공통 규칙을 편집합니다. 수정은 저장 전까지 초안입니다. 같은 클래스가 광고임을 보장하지 않으므로 적용 범위를 확인하세요.</p>
            </details>
            <details id="storage-preview"><summary>저장소</summary><p>chrome.storage.local · 저장된 숨김 규칙만 표시합니다. 미저장 초안은 제외합니다.</p><pre id="storage-json"></pre></details>
          </div>
        </div>
        <footer id="footer" class="footer">
          <div id="status" role="status" aria-live="polite"></div>
          <div class="footer-actions"><span id="draft-state">변경 없음</span><button id="cancel" class="ghost">취소</button><button id="save" class="primary" disabled>저장</button></div>
        </footer>
      </section>`;
    document.documentElement.append(host);
    const get = (id) => root.getElementById(id);
    let dragging = false;
    const drag = makeDraggable(root.querySelector(".panel"), {
      handle: root.querySelector(".header"), keepInViewport: true, margin: api.config.viewportMargin,
      onDragChange(value) { dragging = value; },
    });
    get("collapse").addEventListener("click", () => {
      const collapsed = !get("controls").hidden;
      get("controls").hidden = collapsed; get("footer").hidden = collapsed; get("preview-summary").hidden = !collapsed;
      get("collapse").textContent = collapsed ? "+" : "−";
      get("collapse").title = collapsed ? "패널 펼치기" : "패널 접기";
      get("collapse").setAttribute("aria-label", get("collapse").title);
      get("collapse").setAttribute("aria-expanded", String(!collapsed));
      drag.clamp();
    });
    return {
      host, root, get, isDragging: () => dragging,
      shield: root.querySelector(".shield"), outline: root.querySelector(".outline"),
      status(text, { error = false } = {}) { get("status").textContent = text; get("status").title = text; get("status").dataset.error = String(error); },
      showStorage(snapshot) { get("storage-json").textContent = JSON.stringify(snapshot, null, 2); },
      setDirty(dirty, saving) {
        get("save").disabled = saving || !dirty;
        get("draft-state").textContent = dirty ? "변경 있음" : "변경 없음";
        get("draft-state").dataset.dirty = String(dirty);
      },
      showCurrent(option) {
        get("selector").textContent = option?.selector || "요소 위로 마우스를 옮기세요.";
        get("match-count").textContent = option ? `${option.count}개` : "—";
        get("preview-summary").textContent = `후보 ${get("count").textContent}`;
      },
      showOptions(options, index) {
        const values = options.length ? options : [{ selector: "요소를 가리키세요", label: "", count: 0 }];
        get("match").replaceChildren(...values.map((option, i) => {
          const node = document.createElement("option"); node.value = String(i);
          node.textContent = options.length ? `${option.selector} · ${option.count}개` : option.selector;
          node.title = option.label; return node;
        }));
        get("match").value = String(index); get("match").disabled = !options.length;
        this.showCurrent(options[index]); get("add").disabled = !options.length;
      },
      showCandidates(candidates, actions, activeId) {
        const focused = root.activeElement, focusedId = focused?.closest("li")?.dataset.id, field = focused?.dataset.field;
        for (const id of expanded) if (!candidates.some((candidate) => candidate.id === id)) expanded.delete(id);
        get("count").textContent = String(candidates.length);
        get("candidates").replaceChildren(...candidates.map((candidate) => createCandidateRow(candidate, actions, candidate.id === activeId)));
        if (focusedId && field) findRow(focusedId)?.querySelector(`[data-field="${field}"]`)?.focus({ preventScroll: true });
      },
      focusCandidate(id) {
        const row = findRow(id), list = get("candidates"); if (!row) return;
        const box = row.getBoundingClientRect(), viewport = list.getBoundingClientRect();
        if (box.bottom > viewport.bottom) list.scrollTop += box.bottom - viewport.bottom;
        else if (box.top < viewport.top) list.scrollTop -= viewport.top - box.top;
      },
      busy(value) { busy = value; root.querySelectorAll("button,select,input").forEach((element) => { element.disabled = value; }); get("save").textContent = value ? "저장 중…" : "저장"; },
      remove() { drag.destroy(); host.remove(); },
    };

    function findRow(id) { return [...get("candidates").children].find((row) => row.dataset.id === id); }

    function createCandidateRow(candidate, actions, active) {
      const item = document.createElement("li");
      item.dataset.id = candidate.id; item.dataset.active = String(active); item.dataset.enabled = String(candidate.enabled);
      if (active) item.setAttribute("aria-current", "true");
      const summary = document.createElement("div"); summary.className = "summary-row";
      const enabledLabel = document.createElement("label"); enabledLabel.className = "toggle";
      const enabled = document.createElement("input"); enabled.type = "checkbox"; enabled.checked = candidate.enabled; enabled.dataset.field = "enabled";
      enabled.setAttribute("aria-label", `후보 ${candidate.number} 사용`);
      enabled.addEventListener("change", () => actions.change(candidate.id, { enabled: enabled.checked })); enabledLabel.append(enabled);
      const number = document.createElement("strong"); number.className = "number"; number.textContent = `#${candidate.number}`; number.title = active ? "최근 선택" : "후보 번호";
      const name = document.createElement("code"); name.className = "name"; name.textContent = candidate.selector; name.title = candidate.selector;
      const count = document.createElement("span"); count.className = "matches";
      const matches = api.resolveSelector(candidate.selector); count.textContent = matches === null ? "!" : String(matches.length); count.title = matches === null ? "잘못된 selector" : `${matches.length}개 매칭`;
      const locate = document.createElement("button"); locate.className = "icon ghost"; locate.textContent = "⌖"; locate.dataset.action = "locate";
      locate.title = "위치 보기"; locate.setAttribute("aria-label", `후보 ${candidate.number} 위치 보기`); locate.addEventListener("click", () => actions.locate(candidate.id));
      const more = document.createElement("button"); more.className = "icon ghost"; more.dataset.action = "expand";
      more.title = "규칙 편집"; more.setAttribute("aria-label", `후보 ${candidate.number} 편집`);
      const details = document.createElement("div"); details.className = "rule-details"; details.id = `mintool-rule-detail-${candidate.number}`;
      more.setAttribute("aria-controls", details.id);
      const setOpen = (value) => { details.hidden = !value; more.textContent = value ? "▾" : "▸"; more.setAttribute("aria-expanded", String(value)); };
      setOpen(expanded.has(candidate.id));
      more.addEventListener("click", () => {
        if (busy) return;
        if (expanded.has(candidate.id)) expanded.delete(candidate.id); else expanded.add(candidate.id);
        setOpen(expanded.has(candidate.id));
      });
      const selector = document.createElement("input"); selector.type = "text"; selector.className = "selector-input"; selector.dataset.field = "selector"; selector.value = candidate.selector;
      selector.setAttribute("aria-label", `후보 ${candidate.number} selector`); selector.addEventListener("change", () => actions.change(candidate.id, { selector: selector.value.trim() }));
      const row = document.createElement("div"); row.className = "detail-row";
      const scope = document.createElement("select"); scope.dataset.field = "scope"; scope.setAttribute("aria-label", `후보 ${candidate.number} 적용 범위`);
      for (const [value, text] of [["page", "이 페이지"], ["site", "사이트 전체"]]) { const option = document.createElement("option"); option.value = value; option.textContent = text; scope.append(option); }
      scope.value = candidate.page === null ? "site" : "page"; scope.addEventListener("change", () => actions.change(candidate.id, { scope: scope.value }));
      const remove = document.createElement("button"); remove.textContent = "삭제"; remove.className = "ghost delete"; remove.dataset.action = "remove";
      remove.addEventListener("click", () => actions.remove(candidate.id));
      row.append(scope, remove); details.append(selector, row);
      summary.append(enabledLabel, number, name, count, locate, more); item.append(summary, details);
      return item;
    }
  };
})();
