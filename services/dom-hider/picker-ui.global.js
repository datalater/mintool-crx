(() => {
  const api = mintoolDomHider;
  api.createPickerUi = () => {
    const host = document.createElement("div");
    host.id = api.config.hostId;
    host.style.cssText = `all:initial;position:fixed;inset:0;z-index:${api.config.panelZIndex};pointer-events:none`;
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { --accent:#345edb; --border:#d5dbea; --ink:#17233b; }
        * { box-sizing:border-box; }
        .shield { position:fixed;inset:0;pointer-events:auto;cursor:crosshair;outline:none; }
        .outline { position:fixed;pointer-events:none;border:2px solid #e4ab22;background:#e4ab2212; }
        .panel { position:fixed;right:12px;top:12px;width:min(370px,calc(100vw - 24px));
          max-height:calc(100vh - 24px);overflow:auto;pointer-events:auto;
          background:#fff;color:var(--ink);border:1px solid var(--border);border-radius:12px;
          box-shadow:0 8px 32px #0003;padding:16px;font:13px/1.5 system-ui,sans-serif; }
        h2 { font-size:16px;margin:0 0 8px; } p { margin:8px 0; }
        select,button { font:inherit;color:inherit;background:#fff;border:1px solid var(--border);
          border-radius:6px;padding:6px; } select { width:100%;margin:4px 0; }
        button { cursor:pointer; } button:disabled { opacity:.45;cursor:default; }
        button:focus-visible,select:focus-visible { outline:2px solid var(--accent);outline-offset:2px; }
        button.primary { background:var(--accent);color:white;border-color:var(--accent); }
        .row { display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px; }
        .hint { color:#59657b;font-size:12px; } code { display:block;overflow-wrap:anywhere;font-size:11px; }
        ul { list-style:none;margin:8px 0;padding:0; } li { padding:8px 0;border-top:1px solid var(--border); }
        [role=status] { min-height:20px;overflow-wrap:anywhere; }
      </style>
      <div class="shield" tabindex="0" aria-label="숨길 요소 선택 영역"></div>
      <div class="outline" hidden></div>
      <section class="panel" role="dialog" aria-label="숨기기 모드">
        <div class="row"><h2>숨기기 모드</h2><button id="collapse" aria-expanded="true">패널 접기</button></div>
        <p id="preview-summary" class="hint">요소 위로 마우스를 옮기세요.</p>
        <div id="controls">
        <p class="hint">마우스를 올려 미리보기 → 클릭하여 후보 추가.<br>Esc: 취소 · ↑/↓: 바깥/안쪽 · F2: 대상 고정</p>
        <label>현재 선택 범위<select id="match" aria-label="현재 선택 범위"></select></label>
        <code id="selector">요소 위로 마우스를 옮기세요.</code>
        <div class="row">
          <button id="parent">바깥 요소 ↑</button><button id="child">안쪽 요소 ↓</button>
          <button id="add">후보에 추가</button><button id="lock">대상 고정 (F2)</button>
        </div>
        <h3>숨김 후보 <span id="count">0</span></h3>
        <ul id="candidates"></ul>
        <label>저장할 적용 범위<select id="scope" aria-label="저장할 적용 범위">
          <option value="page">이 페이지 (경로·쿼리 일치, # 제외)</option>
          <option value="site">이 사이트 전체 (같은 origin)</option>
        </select></label>
        <p class="hint">같은 클래스가 광고임을 보장하지 않습니다. 선택 범위를 확인하세요.
        구조가 바뀌면 규칙을 다시 선택해야 할 수 있습니다.</p>
        <div id="status" role="status" aria-live="polite"></div>
        <div class="row"><button id="save" class="primary" disabled>저장하고 적용</button><button id="cancel">취소</button></div>
        </div>
      </section>`;
    document.documentElement.append(host);
    const get = (id) => root.getElementById(id);
    get("collapse").addEventListener("click", () => {
      get("controls").hidden = !get("controls").hidden;
      get("collapse").textContent = get("controls").hidden ? "패널 펼치기" : "패널 접기";
      get("collapse").setAttribute("aria-expanded", String(!get("controls").hidden));
    });
    return {
      host, root, get,
      shield: root.querySelector(".shield"),
      outline: root.querySelector(".outline"),
      status(text) { get("status").textContent = text; },
      showCurrent(option) {
        get("selector").textContent = option?.selector || "선택할 수 없는 영역입니다.";
        get("preview-summary").textContent = option ? `${option.label} 미리보기 · 숨김 후보 ${get("count").textContent}개` : "선택할 수 없는 영역입니다.";
      },
      showOptions(options, index) {
        get("match").replaceChildren(...options.map((option, i) => {
          const node = document.createElement("option");
          node.value = String(i);
          node.textContent = `${option.label} — ${option.selector}`;
          return node;
        }));
        get("match").value = String(index);
        this.showCurrent(options[index]);
        get("add").disabled = !options.length;
      },
      showCandidates(candidates, onRemove) {
        get("count").textContent = String(candidates.length);
        get("save").disabled = !candidates.length;
        get("candidates").replaceChildren(...candidates.map((candidate, index) => {
          const item = document.createElement("li");
          const label = document.createElement("code");
          const count = api.resolveSelector(candidate.selector)?.length ?? 0;
          label.textContent = `${candidate.selector} (${count}개)`;
          const remove = document.createElement("button");
          remove.textContent = "후보 제거";
          remove.addEventListener("click", () => onRemove(index));
          item.append(label, remove);
          return item;
        }));
      },
      busy(value) {
        root.querySelectorAll("button,select").forEach((element) => { element.disabled = value; });
      },
      remove() { host.remove(); },
    };
  };
})();
