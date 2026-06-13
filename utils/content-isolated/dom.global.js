const domUtils = {
  waitForDomLoaded: async function () {
    return new Promise((resolve) => {
      if (document.readyState === "complete") {
        resolve();
        return;
      }

      window.addEventListener("load", resolve);
    });
  },

  refresh: function () {
    location.reload();
  },
};

/**
 * 우클릭이 cross-origin iframe(예: 광고) 내부에서 발생하면 contextmenu 이벤트가
 * top frame까지 버블링되지 않습니다. background에서 webNavigation으로 알아낸
 * 해당 iframe의 URL(frameUrl)을 받아, top document에서 같은 src/origin을 가진
 * <iframe> 엘리먼트를 찾아 대상으로 사용합니다.
 */
function findIframeByUrl(url) {
  const iframes = Array.from(document.querySelectorAll("iframe"));
  return (
    iframes.find((iframe) => resolveIframeSrc(iframe) === url) ||
    findIframeByOrigin(iframes, url)
  );
}

function resolveIframeSrc(iframe) {
  try {
    return new URL(iframe.src, location.href).href;
  } catch {
    return iframe.src;
  }
}

function findIframeByOrigin(iframes, url) {
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    return null;
  }

  const matches = iframes.filter((iframe) => resolveIframeSrc(iframe).startsWith(origin));
  return matches.length === 1 ? matches[0] : null;
}

/** frameUrl이 있으면 매칭되는 iframe을, 없거나 못 찾으면 fallback을 반환합니다. */
function resolveCrossFrameTarget(frameUrl, fallback) {
  if (!frameUrl) return fallback;
  return findIframeByUrl(frameUrl) || fallback;
}
