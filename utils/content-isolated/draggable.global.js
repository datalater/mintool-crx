/**
 * Drag a fixed panel by its handle. [data-no-drag] excludes controls in the handle.
 * Existing callers may ignore the return value. Owners with a finite lifetime should destroy().
 * @param {HTMLElement} element
 * @param {{handle?: HTMLElement|string, keepInViewport?: boolean, margin?: number, onDragChange?: Function}} options
 */
function makeDraggable(element, options = {}) {
  if (!element?.getBoundingClientRect) return;
  const handle = options.handle === undefined ? element : typeof options.handle === "string"
    ? element.querySelector(options.handle) : options.handle;
  if (!handle) return;
  let start = null;
  let bodyStyles = null;
  let dragBody = null;
  const previousCursor = handle.style.cursor;
  const resize = options.keepInViewport ? new ResizeObserver(clamp) : null;
  handle.style.cursor = "grab";
  handle.addEventListener("mousedown", onMouseDown);
  if (options.keepInViewport) window.addEventListener("resize", clamp);
  resize?.observe(element);
  return { clamp, destroy };

  function onMouseDown(event) {
    if (start || event.button !== 0 || event.target.closest("[data-no-drag]")) return;
    const rect = element.getBoundingClientRect();
    start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    Object.assign(element.style, { left: `${rect.left}px`, top: `${rect.top}px`, right: "auto", bottom: "auto", transform: "" });
    dragBody = document.body;
    bodyStyles = ["user-select", "cursor"].map((key) => [key, dragBody.style.getPropertyValue(key), dragBody.style.getPropertyPriority(key)]);
    dragBody.style.userSelect = "none";
    dragBody.style.cursor = "grabbing";
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseup", onMouseUp, true);
    window.addEventListener("blur", onMouseUp);
    options.onDragChange?.(true);
    event.preventDefault();
  }

  function onMouseMove(event) {
    if (!start) return;
    element.style.left = `${start.left + event.clientX - start.x}px`;
    element.style.top = `${start.top + event.clientY - start.y}px`;
    if (options.keepInViewport) clamp();
  }

  function clamp() {
    if (!options.keepInViewport || !element.isConnected) return;
    const margin = options.margin ?? 0;
    const rect = element.getBoundingClientRect();
    const left = Math.max(margin, Math.min(rect.left, document.documentElement.clientWidth - rect.width - margin));
    const top = Math.max(margin, Math.min(rect.top, window.innerHeight - rect.height - margin));
    if (left !== rect.left) { element.style.left = `${left}px`; element.style.right = "auto"; }
    if (top !== rect.top) { element.style.top = `${top}px`; element.style.bottom = "auto"; }
  }

  function onMouseUp() {
    if (!start) return;
    start = null;
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("mouseup", onMouseUp, true);
    window.removeEventListener("blur", onMouseUp);
    bodyStyles?.forEach(([key, value, priority]) => {
      if (value) dragBody.style.setProperty(key, value, priority);
      else dragBody.style.removeProperty(key);
    });
    bodyStyles = null;
    dragBody = null;
    options.onDragChange?.(false);
  }

  function destroy() {
    onMouseUp();
    handle.removeEventListener("mousedown", onMouseDown);
    handle.style.cursor = previousCursor;
    window.removeEventListener("resize", clamp);
    resize?.disconnect();
  }
}

if (typeof window !== "undefined") window.makeDraggable = makeDraggable;
if (typeof globalThis !== "undefined") globalThis.makeDraggable = makeDraggable;
