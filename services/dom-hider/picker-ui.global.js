(() => {
  const api = mintoolDomHider;
  api.createPickerUi = () => {
    const host = document.createElement("div");
    host.id = api.config.hostId;
    host.setAttribute(api.config.uiAttribute, "picker");
    host.style.cssText = `all:initial;position:fixed;inset:0;z-index:${api.config.panelZIndex};pointer-events:none`;
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { --accent:#345edb; --border:#d5dbea; --ink:#17233b; }
        * { box-sizing:border-box; }
        .shield { position:fixed;inset:0;pointer-events:auto;cursor:crosshair;outline:none; }
        .outline { position:fixed;pointer-events:none;border:2px solid #e4ab22;background:#e4ab2212;
          font:bold 16px/24px system-ui;color:#8b5100; }
        .panel { position:fixed;right:12px;top:12px;width:min(390px,calc(100vw - 24px));
          max-height:calc(100vh - 24px);overflow:auto;pointer-events:auto;
          background:#fff;color:var(--ink);border:1px solid var(--border);border-radius:12px;
          box-shadow:0 8px 32px #0003;padding:12px 16px;font:13px/1.5 system-ui,sans-serif; }
        .header { display:flex;align-items:center;gap:8px;position:sticky;top:0;background:#fff;
          z-index:1;padding:4px 0;user-select:none; }
        h2 { font-size:16px;margin:0; } h3 { margin:12px 0 6px; } p { margin:8px 0; }
        select,button,input { font:inherit;color:inherit;background:#fff;border:1px solid var(--border);
          border-radius:6px;padding:6px; } select { width:100%;margin:4px 0; }
        button { cursor:pointer; } button:disabled,input:disabled { opacity:.45;cursor:default; }
        button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible { outline:2px solid var(--accent);outline-offset:2px; }
        button.primary { background:var(--accent);color:white;border-color:var(--accent); }
        .row { display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px; }
        .row select { width:auto;flex:1; }
        .hint { color:#59657b;font-size:12px; } code { display:block;overflow-wrap:anywhere;font-size:11px; }
        ul { list-style:none;margin:6px 0;padding:0;max-height:260px;overflow:auto; }
        li { padding:10px 8px;margin:4px 0;border:1px solid var(--border);border-radius:8px; }
        li[data-active=true] { border-color:var(--accent);background:#edf2ff;box-shadow:inset 3px 0 var(--accent); }
        .candidate-title { display:flex;gap:8px;align-items:center;margin-bottom:4px; }
        .badge { color:var(--accent);font-size:11px; }
        .selector-input { width:100%;font:11px/1.5 monospace; }
        [role=status] { min-height:20px;overflow-wrap:anywhere; }
        details { border-top:1px solid var(--border);padding-top:8px;margin-top:12px; }
        summary { cursor:pointer; } pre { font:11px/1.5 monospace;max-height:200px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f7fa;padding:8px; }
      </style>
      <div class="shield" tabindex="0" aria-label="숨길 요소 선택 영역"></div>
      <div class="outline" hidden></div>
      <section class="panel" role="dialog" aria-label="숨기기 모드">
        <header class="header" title="드래그하여 패널 이동">
          <span aria-hidden="true">⠿</span><h2>숨기기 모드</h2>
          <button id="collapse" data-no-drag aria-expanded="true">패널 접기</button>
        </header>
        <p id="preview-summary" class="hint">요소 위로 마우스를 옮기세요.</p>
        <div id="controls">
          <p class="hint">마우스로 미리보기 → 클릭하여 후보 추가.<br>Esc: 취소 · ↑/↓: 바깥/안쪽 · F2: 대상 고정</p>
          <label>현재 선택 범위<select id="match" aria-label="현재 선택 범위"></select></label>
          <code id="selector">요소 위로 마우스를 옮기세요.</code>
          <div class="row"><button id="parent">바깥 요소 ↑</button><button id="child">안쪽 요소 ↓</button>
            <button id="add">후보에 추가</button><button id="lock">대상 고정 (F2)</button></div>
          <h3>숨김 후보 <span id="count">0</span></h3>
          <p class="hint">현재 페이지·사이트 공통 규칙을 불러옵니다. 수정·삭제는 저장 전까지 초안입니다.</p>
          <ul id="candidates"></ul>
          <label>새 후보 적용 범위<select id="scope" aria-label="새 후보 적용 범위">
            <option value="page">이 페이지 (경로·쿼리 일치, # 제외)</option>
            <option value="site">이 사이트 전체 (같은 origin)</option>
          </select></label>
          <p class="hint">같은 클래스가 광고임을 보장하지 않습니다. 구조가 바뀌면 규칙을 다시 선택해야 할 수 있습니다.</p>
          <div id="status" role="status" aria-live="polite"></div>
          <div class="row"><button id="save" class="primary" disabled>저장하고 적용</button><button id="cancel">취소</button></div>
          <details id="storage-preview"><summary>저장소 미리보기 (저장된 값)</summary>
            <p class="hint">chrome.storage.local의 숨김 규칙 데이터만 표시합니다. 미저장 초안은 포함하지 않습니다.</p>
            <pre id="storage-json"></pre>
          </details>
        </div>
      </section>`;
    document.documentElement.append(host);
    const get = (id) => root.getElementById(id);
    let dragging = false;
    const drag = makeDraggable(root.querySelector(".panel"), {
      handle: root.querySelector(".header"), keepInViewport: true, margin: api.config.viewportMargin,
      onDragChange(value) { dragging = value; },
    });
    get("collapse").addEventListener("click", () => {
      get("controls").hidden = !get("controls").hidden;
      get("collapse").textContent = get("controls").hidden ? "패널 펼치기" : "패널 접기";
      get("collapse").setAttribute("aria-expanded", String(!get("controls").hidden));
      drag.clamp();
    });
    return {
      host, root, get, isDragging: () => dragging,
      shield: root.querySelector(".shield"), outline: root.querySelector(".outline"),
      status(text) { get("status").textContent = text; },
      showStorage(snapshot) { get("storage-json").textContent = JSON.stringify(snapshot, null, 2); },
      showCurrent(option) {
        get("selector").textContent = option?.selector || "요소 위로 마우스를 옮기세요.";
        get("preview-summary").textContent = `${option ? `${option.label} 미리보기 · ` : ""}숨김 후보 ${get("count").textContent}개`;
      },
      showOptions(options, index) {
        get("match").replaceChildren(...options.map((option, i) => {
          const node = document.createElement("option");
          node.value = String(i); node.textContent = `${option.label} — ${option.selector}`; return node;
        }));
        get("match").value = String(index);
        this.showCurrent(options[index]);
        get("add").disabled = !options.length;
      },
      showCandidates(candidates, actions, activeId) {
        const focused = root.activeElement;
        const focusedId = focused?.closest("li")?.dataset.id;
        const field = focused?.dataset.field;
        get("count").textContent = String(candidates.length);
        get("candidates").replaceChildren(...candidates.map((candidate) => createCandidateRow(candidate, actions, candidate.id === activeId)));
        if (focusedId && field) findRow(focusedId)?.querySelector(`[data-field="${field}"]`)?.focus({ preventScroll: true });
      },
      focusCandidate(id) {
        const row = findRow(id), list = get("candidates");
        if (!row) return;
        const box = row.getBoundingClientRect(), viewport = list.getBoundingClientRect();
        if (box.bottom > viewport.bottom) list.scrollTop += box.bottom - viewport.bottom;
        else if (box.top < viewport.top) list.scrollTop -= viewport.top - box.top;
      },
      busy(value) { root.querySelectorAll("button,select,input").forEach((element) => { element.disabled = value; }); },
      remove() { drag.destroy(); host.remove(); },
    };

    function findRow(id) { return [...get("candidates").children].find((row) => row.dataset.id === id); }

    function createCandidateRow(candidate, actions, active) {
      const item = document.createElement("li");
      item.dataset.id = candidate.id; item.dataset.active = String(active);
      const title = document.createElement("div"); title.className = "candidate-title";
      const number = document.createElement("strong"); number.textContent = `#${candidate.number}`;
      const count = document.createElement("span");
      const matches = api.resolveSelector(candidate.selector);
      count.textContent = matches === null ? "잘못된 selector" : `${matches.length}개 매칭`;
      title.append(number, count);
      if (active) { const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = "최근 선택"; title.append(badge); }
      const selector = document.createElement("input");
      selector.className = "selector-input"; selector.dataset.field = "selector"; selector.value = candidate.selector;
      selector.setAttribute("aria-label", `후보 ${candidate.number} selector`);
      selector.addEventListener("change", () => actions.change(candidate.id, { selector: selector.value.trim() }));
      const row = document.createElement("div"); row.className = "row";
      const enabledLabel = document.createElement("label");
      const enabled = document.createElement("input"); enabled.type = "checkbox"; enabled.checked = candidate.enabled;
      enabled.dataset.field = "enabled";
      enabled.addEventListener("change", () => actions.change(candidate.id, { enabled: enabled.checked }));
      enabledLabel.append(enabled, document.createTextNode(" 사용"));
      const scope = document.createElement("select"); scope.dataset.field = "scope";
      scope.setAttribute("aria-label", `후보 ${candidate.number} 적용 범위`);
      for (const [value, text] of [["page", "이 페이지"], ["site", "사이트 전체"]]) {
        const option = document.createElement("option"); option.value = value; option.textContent = text; scope.append(option);
      }
      scope.value = candidate.page === null ? "site" : "page";
      scope.addEventListener("change", () => actions.change(candidate.id, { scope: scope.value }));
      row.append(enabledLabel, scope);
      const locate = document.createElement("button"); locate.textContent = "위치 보기"; locate.dataset.action = "locate";
      locate.addEventListener("click", () => actions.locate(candidate.id));
      const remove = document.createElement("button"); remove.textContent = "후보 제거"; remove.dataset.action = "remove";
      remove.addEventListener("click", () => actions.remove(candidate.id));
      row.append(locate, remove);
      item.append(title, selector, row);
      return item;
    }
  };
})();
