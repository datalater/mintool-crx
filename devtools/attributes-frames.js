const ATTR_SIDEBAR_READ_EXPR = `(function () {
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

const ATTR_SIDEBAR_COLLECT_FRAMES_EXPR = `(function () {
  const urls = [];
  const seen = Object.create(null);
  const add = (url) => {
    if (!url || seen[url]) return;
    seen[url] = true;
    urls.push(url);
  };
  const addResolved = (url) => {
    if (!url) return;
    try {
      add(new URL(url, location.href).href);
    } catch (error) {
      add(url);
    }
  };
  const visit = (doc) => {
    const frames = doc.querySelectorAll("iframe, frame");
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      try {
        const childDoc = frame.contentDocument;
        if (childDoc) {
          add(childDoc.URL || childDoc.location.href);
          visit(childDoc);
          continue;
        }
      } catch (error) {
        // cross-origin
      }
      addResolved(frame.src || frame.getAttribute("src") || "");
    }
  };
  visit(document);
  return urls;
})()`;

function attrSidebarEvalAsync(expression, options) {
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

async function attrSidebarListNavigationFrameUrls() {
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

async function attrSidebarListDomFrameUrls() {
  const { ok, result } = await attrSidebarEvalAsync(ATTR_SIDEBAR_COLLECT_FRAMES_EXPR);
  if (!ok || !Array.isArray(result)) return [];
  return result.filter(Boolean);
}

function attrSidebarUniqueUrls(urls) {
  const seen = new Set();
  const unique = [];
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    unique.push(url);
  }
  return unique;
}

function expandFrameUrlCandidates(url) {
  const candidates = [];
  const add = (value) => {
    if (!value || candidates.includes(value)) return;
    candidates.push(value);
  };

  add(url);
  try {
    const parsed = new URL(url);
    add(parsed.href);
    add(`${parsed.origin}${parsed.pathname}${parsed.search}`);
  } catch (error) {
    // ignore invalid urls
  }

  try {
    const decoded = decodeURI(url);
    if (decoded !== url) add(decoded);
  } catch (error) {
    // ignore
  }

  return candidates;
}

async function attrSidebarListChildFrameUrls() {
  const [navUrls, domUrls] = await Promise.all([
    attrSidebarListNavigationFrameUrls(),
    attrSidebarListDomFrameUrls(),
  ]);
  const merged = attrSidebarUniqueUrls([...navUrls, ...domUrls]);
  const expanded = [];
  for (const url of merged) {
    for (const candidate of expandFrameUrlCandidates(url)) {
      if (!expanded.includes(candidate)) expanded.push(candidate);
    }
  }
  return expanded;
}

async function attrSidebarReadInFrame(frameURL) {
  const options = frameURL ? { frameURL } : undefined;
  const { ok, result } = await attrSidebarEvalAsync(ATTR_SIDEBAR_READ_EXPR, options);
  if (!ok || !result) return null;
  return result;
}

async function readSelectedAttributes() {
  // iframe 선택 시 top의 $0이 이전 light DOM에 머무는 경우가 있어
  // child frame을 먼저 확인하고, 없을 때만 top을 사용한다.
  const frameUrls = await attrSidebarListChildFrameUrls();
  if (frameUrls.length) {
    const frameHits = await Promise.all(
      frameUrls.map(async (frameURL) => {
        const info = await attrSidebarReadInFrame(frameURL);
        return info ? { info, isIframe: true } : null;
      }),
    );
    const hit = frameHits.find(Boolean);
    if (hit) return { ...hit, frameCount: frameUrls.length };
  }

  const topResult = await attrSidebarReadInFrame(null);
  if (topResult) {
    return { info: topResult, isIframe: false, frameCount: frameUrls.length };
  }

  return { info: null, isIframe: false, frameCount: frameUrls.length };
}
