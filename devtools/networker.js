const MAX_ENTRIES = 500;

const els = {
  listCount: document.getElementById("list-count"),
  listEmpty: document.getElementById("list-empty"),
  filterEmpty: document.getElementById("filter-empty"),
  requestList: document.getElementById("request-list"),
  detailEmpty: document.getElementById("detail-empty"),
  detailWrap: document.getElementById("detail-wrap"),
  detailMethod: document.getElementById("detail-method"),
  detailStatus: document.getElementById("detail-status"),
  detailUrl: document.getElementById("detail-url"),
  detailSummary: document.getElementById("detail-summary"),
  filterInput: document.getElementById("filter-input"),
  autoToggle: document.getElementById("auto-toggle"),
  clearBtn: document.getElementById("clear-btn"),
  refreshBtn: document.getElementById("refresh-btn"),
  copyUrlBtn: document.getElementById("copy-url-btn"),
  copyJsonBtn: document.getElementById("copy-json-btn"),
};

/** @type {Array<ReturnType<typeof toEntry>>} */
let entries = [];
let selectedId = null;
let filterQuery = "";
let toastTimer = null;

function applyTheme(themeName) {
  document.body.classList.toggle("theme-dark", themeName === "dark");
}

function shortUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function toEntry(harEntry) {
  const request = harEntry?.request || {};
  const response = harEntry?.response || {};
  const url = request.url || "";
  const startedDateTime = harEntry.startedDateTime || "";
  const method = request.method || "GET";
  const status = response.status || 0;
  const id = `${startedDateTime}|${method}|${url}|${status}|${request.bodySize ?? ""}`;

  return {
    id,
    method,
    url,
    status,
    statusText: response.statusText || "",
    mimeType: response.content?.mimeType || "",
    requestMimeType: request.postData?.mimeType || "",
    hasPostData: Boolean(request.postData?.text || request.postData?.params),
    postDataTextLength: request.postData?.text ? request.postData.text.length : 0,
    requestBodySize: request.bodySize ?? -1,
    responseBodySize: response.bodySize ?? -1,
    startedDateTime,
    time: harEntry.time ?? -1,
    resourceType: harEntry._resourceType || "",
  };
}

function normalizeFilter(query) {
  return query.trim().toLowerCase();
}

function matchesFilter(entry, query) {
  if (!query) return true;
  return (
    entry.url.toLowerCase().includes(query) ||
    entry.method.toLowerCase().includes(query) ||
    String(entry.status).includes(query) ||
    entry.mimeType.toLowerCase().includes(query) ||
    entry.resourceType.toLowerCase().includes(query)
  );
}

function getVisibleEntries() {
  const query = normalizeFilter(filterQuery);
  return entries.filter((entry) => matchesFilter(entry, query));
}

function getSelectedEntry() {
  return entries.find((entry) => entry.id === selectedId) || null;
}

function upsertEntry(entry) {
  const index = entries.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    entries[index] = entry;
    return;
  }
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
}

function buildSummary(entry) {
  return JSON.stringify(
    {
      method: entry.method,
      url: entry.url,
      status: entry.status,
      statusText: entry.statusText,
      mimeType: entry.mimeType,
      requestMimeType: entry.requestMimeType,
      hasPostData: entry.hasPostData,
      postDataTextLength: entry.postDataTextLength,
      requestBodySize: entry.requestBodySize,
      responseBodySize: entry.responseBodySize,
      startedDateTime: entry.startedDateTime,
      timeMs: entry.time,
      resourceType: entry.resourceType,
    },
    null,
    2,
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.warn("[networker] clipboard failed", error);
    showToast("복사 실패");
    return false;
  }
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

function createRequestButton(entry) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "request-item";
  if (entry.id === selectedId) button.classList.add("is-active");

  const top = document.createElement("div");
  top.className = "item-top";

  const method = document.createElement("span");
  method.className = "item-method";
  method.textContent = entry.method;

  const badge = document.createElement("span");
  badge.className = "item-badge";
  badge.textContent = entry.status ? String(entry.status) : "…";

  top.append(method, badge);

  const url = document.createElement("div");
  url.className = "item-url";
  url.textContent = shortUrl(entry.url);
  url.title = entry.url;

  const sub = document.createElement("div");
  sub.className = "item-sub";
  const flags = [];
  if (entry.resourceType) flags.push(entry.resourceType);
  if (entry.mimeType) flags.push(entry.mimeType);
  if (entry.hasPostData) flags.push(`postData:${entry.postDataTextLength}`);
  else if (entry.requestBodySize > 0) flags.push(`bodySize:${entry.requestBodySize}`);
  sub.textContent = flags.join(" · ");

  button.append(top, url, sub);
  button.addEventListener("click", () => selectEntry(entry.id));
  return button;
}

function renderList() {
  const visible = getVisibleEntries();
  els.listCount.hidden = false;
  els.listCount.textContent = `${visible.length} / ${entries.length}`;

  if (!entries.length) {
    els.listEmpty.hidden = false;
    els.filterEmpty.hidden = true;
    els.requestList.hidden = true;
    els.requestList.replaceChildren();
    return;
  }

  els.listEmpty.hidden = true;

  if (!visible.length) {
    els.filterEmpty.hidden = false;
    els.requestList.hidden = true;
    els.requestList.replaceChildren();
    return;
  }

  els.filterEmpty.hidden = true;
  els.requestList.hidden = false;
  els.requestList.replaceChildren(...visible.map(createRequestButton));
}

function renderDetail() {
  const entry = getSelectedEntry();
  if (!entry) {
    els.detailEmpty.hidden = false;
    els.detailWrap.hidden = true;
    els.copyUrlBtn.disabled = true;
    els.copyJsonBtn.disabled = true;
    return;
  }

  els.detailEmpty.hidden = true;
  els.detailWrap.hidden = false;
  els.copyUrlBtn.disabled = false;
  els.copyJsonBtn.disabled = false;
  els.detailMethod.textContent = entry.method;
  els.detailStatus.textContent = entry.status
    ? `${entry.status} ${entry.statusText}`.trim()
    : "(no status)";
  els.detailUrl.textContent = entry.url;
  els.detailUrl.title = entry.url;
  els.detailSummary.textContent = buildSummary(entry);
}

function renderAll() {
  if (selectedId && !entries.some((entry) => entry.id === selectedId)) {
    selectedId = null;
  }
  renderList();
  renderDetail();
}

function selectEntry(id) {
  selectedId = id;
  renderAll();
}

function ingestHarEntry(harEntry) {
  const entry = toEntry(harEntry);
  if (!entry.url) return false;
  upsertEntry(entry);
  return true;
}

function onRequestFinished(harEntry) {
  if (!els.autoToggle.checked) return;
  if (!ingestHarEntry(harEntry)) return;
  if (!selectedId) selectedId = entries[0]?.id || null;
  renderAll();
}

function loadFromHar() {
  return new Promise((resolve) => {
    try {
      chrome.devtools.network.getHAR((harLog) => {
        const list = Array.isArray(harLog?.entries) ? harLog.entries : [];
        let added = 0;
        for (let i = list.length - 1; i >= 0; i--) {
          if (ingestHarEntry(list[i])) added += 1;
        }
        resolve({ added, total: list.length });
      });
    } catch (error) {
      console.warn("[networker] getHAR failed", error);
      resolve({ added: 0, total: 0, error });
    }
  });
}

async function refreshFromHar() {
  const result = await loadFromHar();
  if (!selectedId && entries.length) selectedId = entries[0].id;
  renderAll();
  if (result.error) {
    showToast("getHAR 실패");
    return;
  }
  showToast(`HAR ${result.total}건 중 ${result.added}건 반영`);
}

function clearEntries() {
  entries = [];
  selectedId = null;
  renderAll();
}

function init() {
  applyTheme(chrome.devtools.panels.themeName);
  if (chrome.devtools.panels.setThemeChangeHandler) {
    chrome.devtools.panels.setThemeChangeHandler(applyTheme);
  }

  els.filterInput.addEventListener("input", () => {
    filterQuery = els.filterInput.value;
    renderAll();
  });

  els.clearBtn.addEventListener("click", clearEntries);
  els.refreshBtn.addEventListener("click", () => {
    refreshFromHar().catch((error) => {
      console.warn("[networker] refresh failed", error);
    });
  });

  els.copyUrlBtn.addEventListener("click", async () => {
    const entry = getSelectedEntry();
    if (!entry) return;
    const ok = await copyText(entry.url);
    if (!ok) return;
    flashCopied(els.copyUrlBtn);
    showToast("복사 완료");
  });

  els.copyJsonBtn.addEventListener("click", async () => {
    const entry = getSelectedEntry();
    if (!entry) return;
    const ok = await copyText(buildSummary(entry));
    if (!ok) return;
    flashCopied(els.copyJsonBtn);
    showToast("복사 완료");
  });

  chrome.devtools.network.onRequestFinished.addListener(onRequestFinished);

  refreshFromHar().catch((error) => {
    console.warn("[networker] initial HAR load failed", error);
    renderAll();
  });
}

init();
