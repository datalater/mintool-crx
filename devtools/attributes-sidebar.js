const READ_ATTRIBUTES_EXPR = `(function () {
  const el = $0;
  if (!el || el.nodeType !== 1 || !el.attributes) return null;
  if (el.ownerDocument !== document) return null;
  const attributes = [];
  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    attributes.push({ name: attr.name, value: attr.value });
  }
  return {
    tagName: el.tagName.toLowerCase(),
    id: el.id || "",
    className: typeof el.className === "string" ? el.className : "",
    frameUrl: location.href,
    attributes,
  };
})()`;

const COLLECT_FRAME_URLS_EXPR = `(function () {
  const urls = [];
  const seen = Object.create(null);
  const add = (url) => {
    if (!url || seen[url]) return;
    seen[url] = true;
    urls.push(url);
  };
  const visit = (doc) => {
    const frames = doc.querySelectorAll("iframe, frame");
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const src = frame.getAttribute("src") || frame.src || "";
      try {
        const childDoc = frame.contentDocument;
        if (childDoc) {
          add(childDoc.URL || childDoc.location.href);
          visit(childDoc);
        } else {
          add(src);
        }
      } catch (error) {
        add(src);
      }
    }
  };
  visit(document);
  return urls;
})()`;

const elements = {
  label: document.getElementById("element-label"),
  count: document.getElementById("attr-count"),
  empty: document.getElementById("empty-state"),
  filterEmpty: document.getElementById("filter-empty"),
  wrap: document.getElementById("table-wrap"),
  tbody: document.getElementById("attr-tbody"),
  copyAllBtn: document.getElementById("copy-all-btn"),
  refreshBtn: document.getElementById("refresh-btn"),
  filterInput: document.getElementById("filter-input"),
};

let currentAttrs = [];
let filterQuery = "";
let refreshGeneration = 0;
const expandedAttrNames = new Set();

const COLLAPSE_MAX_LINES = 4;
const COLLAPSE_MAX_CHARS = 240;

function applyTheme(themeName) {
  document.body.classList.toggle("theme-dark", themeName === "dark");
}

function formatElementLabel(info) {
  let label = info.tagName;
  if (info.id) label += `#${info.id}`;
  if (info.className) {
    const classes = info.className.trim().split(/\s+/).filter(Boolean);
    if (classes.length) label += `.${classes.slice(0, 2).join(".")}`;
    if (classes.length > 2) label += "…";
  }
  return label;
}

function tryParseJson(value) {
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function formatValue(value) {
  const parsed = tryParseJson(value);
  if (parsed === null) {
    return { text: value, isJson: false };
  }
  return { text: JSON.stringify(parsed, null, 2), isJson: true };
}

function shouldCollapse(text) {
  if (text.length > COLLAPSE_MAX_CHARS) return true;
  let lines = 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "\n") continue;
    lines += 1;
    if (lines > COLLAPSE_MAX_LINES) return true;
  }
  return false;
}

function normalizeFilter(query) {
  return query.trim().toLowerCase();
}

function matchesFilter(attr, query) {
  if (!query) return true;
  return (
    attr.name.toLowerCase().includes(query) ||
    attr.value.toLowerCase().includes(query)
  );
}

function getVisibleAttrs() {
  const query = normalizeFilter(filterQuery);
  return currentAttrs.filter((attr) => matchesFilter(attr, query));
}

function updateAttrCount(visibleCount) {
  elements.count.hidden = false;
  if (normalizeFilter(filterQuery)) {
    elements.count.textContent = `${visibleCount} / ${currentAttrs.length} attrs`;
    return;
  }
  elements.count.textContent = `${currentAttrs.length} attrs`;
}

function showEmpty(message) {
  currentAttrs = [];
  elements.label.textContent = "요소를 선택하세요";
  elements.count.hidden = true;
  elements.empty.hidden = false;
  elements.empty.textContent = message;
  elements.filterEmpty.hidden = true;
  elements.wrap.hidden = true;
  elements.copyAllBtn.disabled = true;
  elements.tbody.replaceChildren();
  clearFrameHint();
}

function clearFrameHint() {
  const hint = document.getElementById("frame-hint");
  if (!hint) return;
  hint.hidden = true;
  hint.textContent = "";
  hint.removeAttribute("title");
}

function renderFrameHint(frameUrl, isIframe) {
  const hint = document.getElementById("frame-hint");
  if (!hint) return;
  if (!isIframe || !frameUrl) {
    clearFrameHint();
    return;
  }
  hint.hidden = false;
  hint.textContent = frameUrl;
  hint.title = frameUrl;
}

function createCopyButton(getText) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy-btn";
  button.textContent = "복사";
  button.addEventListener("click", async () => {
    const ok = await copyText(getText());
    if (!ok) return;
    flashCopied(button);
    showToast("복사 완료");
  });
  return button;
}

function createToggleButton(attrName, valueEl) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "toggle-btn";

  const sync = () => {
    const expanded = expandedAttrNames.has(attrName);
    valueEl.classList.toggle("is-collapsed", !expanded);
    button.textContent = expanded ? "접기" : "펼치기";
  };

  button.addEventListener("click", () => {
    if (expandedAttrNames.has(attrName)) {
      expandedAttrNames.delete(attrName);
    } else {
      expandedAttrNames.add(attrName);
    }
    sync();
  });

  sync();
  return button;
}

function createRow(attr) {
  const row = document.createElement("tr");

  const nameCell = document.createElement("td");
  nameCell.className = "attr-name";
  nameCell.textContent = attr.name;

  const valueCell = document.createElement("td");
  const formatted = formatValue(attr.value);
  const collapsible = shouldCollapse(formatted.text);

  const valueBlock = document.createElement("div");
  valueBlock.className = "value-block";

  const valueEl = document.createElement("pre");
  valueEl.className = formatted.isJson ? "attr-value is-json" : "attr-value";
  valueEl.textContent = formatted.text;
  valueBlock.appendChild(valueEl);

  if (collapsible) {
    valueBlock.appendChild(createToggleButton(attr.name, valueEl));
  }

  valueCell.appendChild(valueBlock);

  const actionCell = document.createElement("td");
  actionCell.className = "attr-actions";
  actionCell.appendChild(createCopyButton(() => attr.value));

  row.append(nameCell, valueCell, actionCell);
  return row;
}

function renderTableRows() {
  const visible = getVisibleAttrs();
  updateAttrCount(visible.length);
  elements.empty.hidden = true;

  if (!currentAttrs.length) {
    elements.filterEmpty.hidden = true;
    elements.wrap.hidden = true;
    elements.copyAllBtn.disabled = true;
    elements.tbody.replaceChildren();
    return;
  }

  if (!visible.length) {
    elements.filterEmpty.hidden = false;
    elements.wrap.hidden = true;
    elements.copyAllBtn.disabled = true;
    elements.tbody.replaceChildren();
    return;
  }

  elements.filterEmpty.hidden = true;
  elements.wrap.hidden = false;
  elements.copyAllBtn.disabled = false;
  elements.tbody.replaceChildren(...visible.map(createRow));
}

function renderAttributes(info, isIframe) {
  currentAttrs = info.attributes;
  elements.label.textContent = formatElementLabel(info);
  renderFrameHint(info.frameUrl, isIframe);
  renderTableRows();
}

function evalAsync(expression, options) {
  return new Promise((resolve) => {
    const finish = (result, exceptionInfo) => {
      if (exceptionInfo) {
        resolve({ ok: false, error: exceptionInfo });
        return;
      }
      resolve({ ok: true, result });
    };

    if (options) {
      chrome.devtools.inspectedWindow.eval(expression, options, finish);
      return;
    }
    chrome.devtools.inspectedWindow.eval(expression, finish);
  });
}

async function listNavigationFrameUrls() {
  const tabId = chrome.devtools.inspectedWindow.tabId;
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    if (!frames) return [];
    return frames
      .filter((frame) => frame.frameId !== 0 && frame.url)
      .map((frame) => frame.url);
  } catch (error) {
    console.warn("[attributes-sidebar] getAllFrames failed", error);
    return [];
  }
}

async function listDomFrameUrls() {
  const { ok, result } = await evalAsync(COLLECT_FRAME_URLS_EXPR);
  if (!ok || !Array.isArray(result)) return [];
  return result.filter(Boolean);
}

function uniqueUrls(urls) {
  const seen = new Set();
  const unique = [];
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    unique.push(url);
  }
  return unique;
}

async function listChildFrameUrls() {
  const [navUrls, domUrls] = await Promise.all([
    listNavigationFrameUrls(),
    listDomFrameUrls(),
  ]);
  return uniqueUrls([...navUrls, ...domUrls]);
}

async function readAttributesInFrame(frameURL) {
  const options = frameURL ? { frameURL } : undefined;
  const { ok, result } = await evalAsync(READ_ATTRIBUTES_EXPR, options);
  if (!ok || !result) return null;
  return result;
}

async function readSelectedAttributes() {
  const topResult = await readAttributesInFrame(null);
  if (topResult) {
    return { info: topResult, isIframe: false };
  }

  const frameUrls = await listChildFrameUrls();
  for (const frameURL of frameUrls) {
    const info = await readAttributesInFrame(frameURL);
    if (info) return { info, isIframe: true };
  }
  return null;
}

async function refreshAttributes() {
  const generation = ++refreshGeneration;
  const selected = await readSelectedAttributes();
  if (generation !== refreshGeneration) return;

  if (!selected) {
    showEmpty("Elements에서 요소를 선택하면 attributes가 표시됩니다.");
    return;
  }
  renderAttributes(selected.info, selected.isIframe);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.warn("[attributes-sidebar] clipboard failed", error);
    showToast("복사 실패");
    return false;
  }
}

function buildAllAttributesText(attrs) {
  const payload = {};
  for (const attr of attrs) {
    payload[attr.name] = attr.value;
  }
  return JSON.stringify(payload, null, 2);
}

function flashCopied(button) {
  const original = button.textContent;
  button.classList.add("is-copied");
  button.textContent = "복사 완료";
  setTimeout(() => {
    button.classList.remove("is-copied");
    button.textContent = original;
  }, 900);
}

let toastTimer = null;

function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 900);
}

function init() {
  applyTheme(chrome.devtools.panels.themeName);
  if (chrome.devtools.panels.setThemeChangeHandler) {
    chrome.devtools.panels.setThemeChangeHandler(applyTheme);
  }

  elements.refreshBtn.addEventListener("click", () => {
    refreshAttributes().catch((error) => {
      console.warn("[attributes-sidebar] refresh failed", error);
    });
  });

  elements.copyAllBtn.addEventListener("click", async () => {
    const visible = getVisibleAttrs();
    if (!visible.length) return;
    const ok = await copyText(buildAllAttributesText(visible));
    if (!ok) return;
    flashCopied(elements.copyAllBtn);
    showToast("복사 완료");
  });

  elements.filterInput.addEventListener("input", () => {
    filterQuery = elements.filterInput.value;
    if (!currentAttrs.length) return;
    renderTableRows();
  });

  chrome.devtools.panels.elements.onSelectionChanged.addListener(() => {
    refreshAttributes().catch((error) => {
      console.warn("[attributes-sidebar] selection refresh failed", error);
    });
  });

  refreshAttributes().catch((error) => {
    console.warn("[attributes-sidebar] initial refresh failed", error);
  });
}

init();
