(() => {
  const api = mintoolDomHider;
  api.startPicker = ({ onClose, onSaved }) => {
    const ui = api.createPickerUi();
    const sheet = api.createHideSheet("preview");
    const events = new AbortController();
    const originalFocus = document.activeElement;
    const startUrl = location.href;
    let target = null;
    let options = [];
    let optionIndex = 0;
    let candidates = [];
    let innerTargets = [];
    let pendingFrame = null;
    let pointer = null;
    let closed = false;
    let saving = false;
    let frozen = false;

    listen(ui.shield, "pointermove", (event) => {
      if (saving || frozen) return;
      pointer = { x: event.clientX, y: event.clientY };
      if (pendingFrame === null) pendingFrame = requestAnimationFrame(pickAtPointer);
    });
    listen(ui.shield, "click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      // A click can arrive before the pointermove animation frame.
      if (pendingFrame !== null) { cancelAnimationFrame(pendingFrame); pendingFrame = null; pickAtPointer(); }
      addCandidate();
    });
    for (const type of ["pointerdown", "pointerup", "click", "dblclick", "auxclick", "contextmenu"]) {
      listen(ui.host, type, (event) => { event.stopPropagation(); });
    }
    listen(ui.get("match"), "change", () => {
      optionIndex = Number(ui.get("match").value);
      ui.showCurrent(options[optionIndex]);
      render();
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
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key === "F2") { event.preventDefault(); event.stopImmediatePropagation(); toggleFreeze(); }
      const inControl = event.composedPath().some((node) => node instanceof HTMLSelectElement);
      if (!inControl && ["ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        event.key === "ArrowUp" ? selectParent() : selectChild();
      }
    }, { capture: true });
    ui.shield.focus();
    render();
    return close;

    function listen(element, type, handler, extra = {}) {
      element.addEventListener(type, handler, { ...extra, signal: events.signal });
    }

    function pickAtPointer() {
      pendingFrame = null;
      if (!pointer || closed || saving) return;
      // Restore only our sheets during this synchronous hit-test. They are re-enabled
      // before paint, so hidden targets remain selectable without chasing the element behind them.
      const sheets = [...document.querySelectorAll(`style[${api.config.sheetAttribute}]`)];
      const disabled = sheets.map((element) => element.disabled);
      ui.host.style.display = "none";
      try {
        sheets.forEach((element) => { element.disabled = true; });
        let element = document.elementFromPoint(pointer.x, pointer.y);
        while (element && !(element instanceof HTMLElement)) element = element.parentElement;
        if (element !== target) {
          innerTargets = [];
          select(element);
        }
      } finally {
        sheets.forEach((element, index) => { element.disabled = disabled[index]; });
        ui.host.style.removeProperty("display");
      }
    }

    function select(element) {
      target = api.selectable(element) ? element : null;
      options = target ? api.selectionOptions(target) : [];
      // Default to the most specific repeated attribute/class, but expose its exact scope.
      optionIndex = options.length > 1 ? 1 : 0;
      ui.showOptions(options, optionIndex);
      ui.status("");
      render();
    }

    function toggleFreeze() {
      frozen = !frozen;
      ui.get("lock").textContent = frozen ? "고정 해제 (F2)" : "대상 고정 (F2)";
      ui.status(frozen ? "대상을 고정했습니다. 패널에서 범위를 조정하세요." : "마우스 위치의 대상을 선택합니다.");
    }

    function selectParent() {
      if (!target || !api.selectable(target.parentElement)) return;
      innerTargets.push(target);
      select(target.parentElement);
    }

    function selectChild() {
      const child = innerTargets.pop();
      if (child?.isConnected) select(child);
    }

    function render() {
      const preview = options[optionIndex]?.selector;
      sheet.set([...candidates.map((item) => item.selector), ...(preview ? [preview] : [])]);
      ui.showCurrent(options[optionIndex]);
      ui.get("parent").disabled = !target || !api.selectable(target.parentElement);
      ui.get("child").disabled = !innerTargets.length;
      positionOutline();
    }

    function positionOutline() {
      if (!target?.isConnected) { ui.outline.hidden = true; return; }
      const rect = target.getBoundingClientRect();
      ui.outline.hidden = !rect.width || !rect.height;
      Object.assign(ui.outline.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    }

    function addCandidate() {
      if (saving || !options[optionIndex]) return;
      const { selector } = options[optionIndex];
      const matches = api.resolveSelector(selector);
      if (!matches?.length) { ui.status("대상이 변경됐습니다. 다시 선택하세요."); return; }
      const existing = candidates.flatMap((item) => api.resolveSelector(item.selector) || []);
      if (matches.every((element) => existing.some((other) => other === element || other.contains(element)))) {
        ui.status("이미 후보에 포함된 영역입니다."); return;
      }
      candidates.push({ selector });
      ui.showCandidates(candidates, removeCandidate);
      ui.status(`${matches.length}개 요소의 규칙을 후보에 추가했습니다. 아직 저장되지 않았습니다.`);
      render();
    }

    function removeCandidate(index) {
      candidates.splice(index, 1);
      // Removing a candidate must visibly restore it, not leave the current hover preview behind.
      target = null; options = []; innerTargets = [];
      ui.showOptions([], 0);
      ui.showCandidates(candidates, removeCandidate);
      render();
    }

    async function save() {
      if (saving || !candidates.length) return;
      if (location.href !== startUrl) { ui.status("페이지가 바뀌었습니다. 취소 후 다시 선택하세요."); return; }
      if (candidates.some((item) => !api.resolveSelector(item.selector)?.length)) {
        ui.status("일부 대상이 변경됐습니다. 후보를 다시 확인하세요."); return;
      }
      saving = true;
      ui.busy(true);
      ui.status("저장 중…");
      try {
        const response = await chrome.runtime.sendMessage({
          type: api.config.messageType, operation: api.config.operations.add, url: startUrl,
          scope: ui.get("scope").value, selectors: candidates.map((item) => item.selector),
        });
        if (!response?.ok) throw new Error(response?.error || "저장 응답이 없습니다.");
        await onSaved();
        close();
      } catch (error) {
        saving = false;
        ui.busy(false);
        ui.showCandidates(candidates, removeCandidate);
        render();
        ui.status(`저장하지 못했습니다: ${error.message}`);
      }
    }

    function close() {
      if (closed) return;
      closed = true;
      events.abort();
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
      sheet.remove();
      ui.remove();
      if (originalFocus?.isConnected) originalFocus.focus({ preventScroll: true });
      onClose();
    }
  };
})();
