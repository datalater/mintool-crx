(() => {
  const api = mintoolDomHider;
  api.startPicker = ({ onClose, onSaved, rules, storageSnapshot }) => {
    const ui = api.createPickerUi();
    const sheet = api.createHideSheet("preview", { allowReveal: false });
    const events = new AbortController();
    const originalFocus = document.activeElement;
    const startUrl = location.href;
    const expected = api.contextRules(rules, startUrl).map((rule) => ({ ...rule }));
    let candidates = expected.map((rule, index) => ({ ...rule, number: index + 1 }));
    let nextNumber = candidates.length + 1;
    let activeId = null;
    let target = null;
    let options = [];
    let optionIndex = 0;
    let innerTargets = [];
    let pendingFrame = null;
    let pointer = null;
    let closed = false;
    let saving = false;
    let frozen = false;

    listen(ui.shield, "pointermove", (event) => {
      if (saving || frozen || ui.isDragging()) return;
      pointer = { x: event.clientX, y: event.clientY };
      if (pendingFrame === null) pendingFrame = requestAnimationFrame(pickAtPointer);
    });
    listen(ui.shield, "click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (pendingFrame !== null) { cancelAnimationFrame(pendingFrame); pendingFrame = null; pickAtPointer(); }
      addCandidate();
    });
    for (const type of ["pointerdown", "pointerup", "click", "dblclick", "auxclick", "contextmenu"]) {
      listen(ui.host, type, (event) => { event.stopPropagation(); });
    }
    listen(ui.get("match"), "change", () => { optionIndex = Number(ui.get("match").value); render(); });
    listen(ui.get("scope"), "change", () => {
      candidates.filter((rule) => !expected.some((original) => original.id === rule.id))
        .forEach((rule) => { rule.page = ui.get("scope").value === "site" ? null : api.pageKey(startUrl); });
      renderRows(); render();
    });
    listen(ui.get("parent"), "click", selectParent);
    listen(ui.get("child"), "click", selectChild);
    listen(ui.get("add"), "click", addCandidate);
    listen(ui.get("lock"), "click", toggleFreeze);
    listen(ui.get("cancel"), "click", close);
    listen(ui.get("save"), "click", save);
    listen(window, "scroll", positionOutline, { capture: true, passive: true });
    listen(window, "resize", positionOutline);
    listen(window, "keydown", (event) => {
      if (saving) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
      if (event.key === "F2") { event.preventDefault(); event.stopImmediatePropagation(); toggleFreeze(); }
      const inControl = event.composedPath().some((node) =>
        node instanceof HTMLSelectElement || node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement);
      if (!inControl && ["ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation();
        event.key === "ArrowUp" ? selectParent() : selectChild();
      }
    }, { capture: true });
    ui.showStorage(storageSnapshot);
    ui.shield.focus();
    renderRows(); render();
    return { close, updateStorage: ui.showStorage };

    function listen(element, type, handler, extra = {}) {
      element.addEventListener(type, handler, { ...extra, signal: events.signal });
    }

    function pickAtPointer() {
      pendingFrame = null;
      if (!pointer || closed || saving || ui.isDragging()) return;
      // Hit-test the original DOM synchronously, then restore our sheets before paint.
      const sheets = [...document.querySelectorAll(`style[${api.config.sheetAttribute}]`)];
      const disabled = sheets.map((element) => element.disabled);
      ui.host.style.display = "none";
      try {
        sheets.forEach((element) => { element.disabled = true; });
        let element = document.elementFromPoint(pointer.x, pointer.y);
        while (element && !(element instanceof HTMLElement)) element = element.parentElement;
        if (element !== target) { innerTargets = []; select(element); }
      } finally {
        sheets.forEach((element, index) => { element.disabled = disabled[index]; });
        ui.host.style.removeProperty("display");
      }
    }

    function select(element) {
      target = api.selectable(element) ? element : null;
      ui.outline.textContent = "";
      options = target ? api.selectionOptions(target) : [];
      optionIndex = options.length > 1 ? 1 : 0;
      ui.showOptions(options, optionIndex);
      ui.status(""); render();
    }

    function toggleFreeze() {
      frozen = !frozen;
      ui.get("lock").textContent = frozen ? "고정 해제 (F2)" : "대상 고정 (F2)";
      ui.status(frozen ? "대상을 고정했습니다. 패널에서 범위를 조정하세요." : "마우스 위치의 대상을 선택합니다.");
    }

    function selectParent() {
      if (!target || !api.selectable(target.parentElement)) return;
      innerTargets.push(target); select(target.parentElement);
    }

    function selectChild() {
      const child = innerTargets.pop();
      if (child?.isConnected) select(child);
    }

    function render() {
      const preview = options[optionIndex]?.selector;
      sheet.set([...candidates.filter((rule) => rule.enabled).map((rule) => rule.selector), ...(preview ? [preview] : [])]);
      ui.showCurrent(options[optionIndex]);
      ui.get("parent").disabled = !target || !api.selectable(target.parentElement);
      ui.get("child").disabled = !innerTargets.length;
      ui.get("save").disabled = saving || api.ruleSnapshot(candidates) === api.ruleSnapshot(expected);
      positionOutline();
    }

    function positionOutline() {
      ui.outline.hidden = !target?.isConnected;
      if (ui.outline.hidden) return;
      const rect = target.getBoundingClientRect();
      ui.outline.hidden = !rect.width || !rect.height;
      Object.assign(ui.outline.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    }

    function renderRows() {
      ui.showCandidates(candidates, { remove: removeCandidate, change: changeCandidate, locate: locateCandidate }, activeId);
      if (activeId) ui.focusCandidate(activeId);
    }

    function addCandidate() {
      if (saving || !options[optionIndex]) return;
      const { selector } = options[optionIndex];
      const matches = api.resolveSelector(selector);
      if (!matches?.length) { ui.status("대상이 변경됐습니다. 다시 선택하세요."); return; }
      const existing = candidates.find((rule) => rule.selector === selector || (rule.enabled &&
        matches.every((element) => (api.resolveSelector(rule.selector) || []).some((other) => other === element || other.contains(element)))));
      if (existing) {
        activeId = existing.id; renderRows();
        ui.outline.textContent = `#${existing.number}`;
        ui.status(`이미 후보 #${existing.number}에 포함된 영역입니다.`); return;
      }
      const rule = {
        id: `rule-${crypto.getRandomValues(new Uint32Array(4)).join("-")}`,
        origin: location.origin, page: ui.get("scope").value === "site" ? null : api.pageKey(startUrl),
        selector, enabled: true, number: nextNumber++,
      };
      candidates.push(rule); activeId = rule.id;
      renderRows(); render();
      ui.outline.textContent = `#${rule.number}`;
      ui.status(`후보 #${rule.number} 추가 · ${matches.length}개 요소 · 아직 저장되지 않았습니다.`);
    }

    function clearHover() {
      target = null; options = []; innerTargets = [];
      ui.showOptions([], 0); ui.outline.textContent = "";
    }

    function removeCandidate(id) {
      candidates = candidates.filter((rule) => rule.id !== id);
      if (activeId === id) activeId = null;
      clearHover(); renderRows(); render();
      ui.status("초안에서 제거했습니다. 저장하면 규칙이 삭제되고, 취소하면 원래대로 돌아갑니다.");
    }

    function changeCandidate(id, patch) {
      const rule = candidates.find((item) => item.id === id);
      Object.assign(rule, patch.scope ? { page: patch.scope === "site" ? null : api.pageKey(startUrl) } : patch);
      activeId = id;
      clearHover(); renderRows(); render();
      ui.status(api.resolveSelector(rule.selector) === null ? "유효하지 않거나 보호 영역을 포함하는 selector입니다." : `후보 #${rule.number} 수정 · 저장 전까지 초안입니다.`);
    }

    function locateCandidate(id) {
      const rule = candidates.find((item) => item.id === id);
      const matches = api.resolveSelector(rule.selector) || [];
      activeId = id; clearHover(); frozen = true;
      ui.get("lock").textContent = "고정 해제 (F2)";
      target = matches.find((element) => { const r = element.getBoundingClientRect(); return r.width && r.height; }) || null;
      target?.scrollIntoView({ block: "center", behavior: "auto" });
      renderRows(); render();
      ui.outline.textContent = `#${rule.number}`;
      ui.status(target ? `후보 #${rule.number}의 첫 영역입니다. 총 ${matches.length}개 매칭.` : `후보 #${rule.number}: 현재 페이지에서 표시할 영역이 없습니다.`);
    }

    async function save() {
      if (saving || api.ruleSnapshot(candidates) === api.ruleSnapshot(expected)) return;
      if (location.href !== startUrl) { ui.status("페이지가 바뀌었습니다. 취소 후 다시 선택하세요."); return; }
      if (candidates.some((rule) => api.resolveSelector(rule.selector) === null)) {
        ui.status("유효하지 않은 selector를 수정하거나 제거하세요."); return;
      }
      saving = true; ui.busy(true); ui.status("저장 중…");
      let saved = false;
      try {
        const response = await chrome.runtime.sendMessage({
          type: api.config.messageType, operation: api.config.operations.saveEditor, url: startUrl,
          expected, rules: candidates.map(({ id, origin, page, selector, enabled }) => ({ id, origin, page, selector, enabled })),
        });
        if (!response?.ok) throw new Error(response?.error || "저장 응답이 없습니다.");
        saved = true;
        await onSaved(); close();
      } catch (error) {
        if (saved) { close(); console.warn("[MinTool] 저장은 완료됐습니다. 재적용하려면 새로고침하세요.", error); return; }
        saving = false; ui.busy(false); renderRows(); render();
        ui.status(`저장하지 못했습니다: ${error.message}`);
      }
    }

    function close() {
      if (closed) return;
      closed = true; events.abort();
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
      sheet.remove(); ui.remove();
      if (originalFocus?.isConnected) originalFocus.focus({ preventScroll: true });
      onClose();
    }
  };
})();
