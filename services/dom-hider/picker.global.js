(() => {
  const api = mintoolDomHider;
  api.startPicker = ({ onClose, onSaved, rules, storageSnapshot }) => {
    const ui = api.createPickerUi();
    const previewLayer = api.createPreviewLayer(ui.root);
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
    listen(ui.get("close"), "click", close);
    listen(ui.get("save"), "click", save);
    listen(window, "scroll", positionOutline, { capture: true, passive: true });
    listen(window, "resize", positionOutline);
    listen(window, "keydown", (event) => {
      if (saving) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
      if (event.key === "F2") { event.preventDefault(); event.stopImmediatePropagation(); toggleFreeze(); }
      const inControl = [ui.root.activeElement, ...event.composedPath()].some((node) =>
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
      // The shield intercepts iframe clicks; only our UI needs to move out of the hit-test.
      ui.host.style.display = "none";
      try {
        let element = document.elementFromPoint(pointer.x, pointer.y);
        while (element && !(element instanceof HTMLElement)) element = element.parentElement;
        if (element !== target) { innerTargets = []; select(element); }
      } finally {
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
      setFrozen(!frozen);
      ui.status(frozen ? "대상 고정됨" : "마우스로 대상 선택");
    }

    function setFrozen(value) {
      frozen = value;
      ui.get("lock").textContent = value ? "고정됨" : "고정";
      ui.get("lock").title = value ? "고정 해제 (F2)" : "대상 고정 (F2)";
      ui.get("lock").setAttribute("aria-pressed", String(value));
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
      previewLayer.set([...candidates.filter((rule) => rule.enabled), ...(preview ? [{ selector: preview }] : [])]);
      ui.showCurrent(options[optionIndex]);
      ui.get("parent").disabled = !target || !api.selectable(target.parentElement);
      ui.get("child").disabled = !innerTargets.length;
      ui.get("match").disabled = saving || !options.length;
      ui.get("add").disabled = saving || !options.length;
      ui.setDirty(api.ruleSnapshot(candidates) !== api.ruleSnapshot(expected), saving);
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
      if (!matches?.length) { ui.status("대상이 변경됐습니다. 다시 선택하세요.", { error: true }); return; }
      const existing = candidates.find((rule) => rule.selector === selector || (rule.enabled &&
        matches.every((element) => (api.resolveSelector(rule.selector) || []).some((other) => other === element || other.contains(element)))));
      if (existing) {
        activeId = existing.id; renderRows();
        ui.outline.textContent = `#${existing.number}`;
        ui.status(`#${existing.number}에 이미 포함됨`); return;
      }
      const rule = {
        id: `rule-${crypto.getRandomValues(new Uint32Array(4)).join("-")}`,
        origin: location.origin, page: ui.get("scope").value === "site" ? null : api.pageKey(startUrl),
        selector, enabled: true, number: nextNumber++,
      };
      candidates.push(rule); activeId = rule.id;
      renderRows(); render();
      ui.outline.textContent = `#${rule.number}`;
      ui.status(`#${rule.number} 추가 · ${matches.length}개`);
    }

    function clearHover() {
      target = null; options = []; innerTargets = [];
      ui.showOptions([], 0); ui.outline.textContent = "";
    }

    function removeCandidate(id) {
      candidates = candidates.filter((rule) => rule.id !== id);
      if (activeId === id) activeId = null;
      clearHover(); renderRows(); render();
      ui.status("초안에서 삭제 · 저장 전까지 취소 가능");
    }

    function changeCandidate(id, patch) {
      const rule = candidates.find((item) => item.id === id);
      Object.assign(rule, patch.scope ? { page: patch.scope === "site" ? null : api.pageKey(startUrl) } : patch);
      activeId = id;
      clearHover(); renderRows(); render();
      const invalid = api.resolveSelector(rule.selector) === null;
      ui.status(invalid ? "유효하지 않거나 보호 영역을 포함하는 selector입니다." : `#${rule.number} 수정`, { error: invalid });
    }

    function locateCandidate(id) {
      const rule = candidates.find((item) => item.id === id);
      const matches = api.resolveSelector(rule.selector) || [];
      activeId = id; clearHover(); setFrozen(true);
      target = matches.find((element) => { const r = element.getBoundingClientRect(); return r.width && r.height; }) || null;
      target?.scrollIntoView({ block: "center", behavior: "auto" });
      renderRows(); render();
      ui.outline.textContent = `#${rule.number}`;
      ui.status(target ? `#${rule.number} 위치 · ${matches.length}개 중 첫 영역` : `#${rule.number}: 표시할 영역 없음`);
    }

    async function save() {
      if (saving || api.ruleSnapshot(candidates) === api.ruleSnapshot(expected)) return;
      if (location.href !== startUrl) { ui.status("페이지가 바뀌었습니다. 취소 후 다시 선택하세요.", { error: true }); return; }
      if (candidates.some((rule) => api.resolveSelector(rule.selector) === null)) {
        ui.status("유효하지 않은 selector를 수정하거나 제거하세요.", { error: true }); return;
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
        ui.status(`저장하지 못했습니다: ${error.message}`, { error: true });
      }
    }

    function close() {
      if (closed) return;
      closed = true; events.abort();
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
      previewLayer.remove(); ui.remove();
      if (originalFocus?.isConnected) originalFocus.focus({ preventScroll: true });
      onClose();
    }
  };
})();
