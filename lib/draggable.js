/**
 * 드래그 가능한 패널: handle 요소를 드래그하면 element 위치가 바뀝니다.
 * element는 position: fixed 여야 하며, handle은 element 내부 요소 또는 element 자신입니다.
 * handle 내부에서 [data-no-drag]를 가진 요소(또는 그 자손)에서 mousedown 시에는 드래그를 시작하지 않습니다.
 *
 * @param {HTMLElement} element - 이동시킬 패널(또는 컨테이너) 요소
 * @param {{ handle?: HTMLElement | string }} options - handle: 드래그 영역(요소 또는 selector). 생략 시 element 전체
 */
function makeDraggable(element, options) {
  if (!element || !element.getBoundingClientRect) return;

  const handle =
    options.handle === undefined
      ? element
      : typeof options.handle === "string"
        ? element.querySelector(options.handle)
        : options.handle;

  if (!handle) return;

  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  function onMouseDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest("[data-no-drag]")) return;

    const rect = element.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;

    element.style.left = startLeft + "px";
    element.style.top = startTop + "px";
    element.style.transform = "";
    element.style.right = "auto";
    element.style.bottom = "auto";

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    e.preventDefault();
  }

  function onMouseMove(e) {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    element.style.left = startLeft + dx + "px";
    element.style.top = startTop + dy + "px";
  }

  function onMouseUp() {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }

  handle.style.cursor = "grab";
  handle.addEventListener("mousedown", onMouseDown);
}

if (typeof window !== "undefined") {
  window.makeDraggable = makeDraggable;
}
if (typeof globalThis !== "undefined") {
  globalThis.makeDraggable = makeDraggable;
}
