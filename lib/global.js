const DEBUG_CONTAINER_ID = "mintool-debug-container";
const DEBUG_CONTENT_ID = "mintool-debug-content";

const EVENT_PUSH_STATE = "[mintool] custom-push-state";
const EVENT_REPLACE_STATE = "[mintool] custom-replace-state";

const mintool = {
  init() {
    monkeyPatchPushState();
    monkeyPatchReplaceState();
  },

  observeUrlChange: function observeUrlChange(handler, delay = 300) {
    const BATCH_DELAY = delay;

    run();

    function run() {
      const queueEvent = createBatchQueueEvent((events) => {
        // [DEBUG] next 앱 등 SPA 앱에서 커스텀 이벤트가 어떤 순서로 어떻게 처리되는지 디버깅하고 싶을 때 사용
        // console.log(
        //   "%c[mintool] 배치 처리된 내비게이션 이벤트:",
        //   "color: #aaa",
        //   events
        // );
        handler();
      }, BATCH_DELAY);

      const handleQueueEvent = (event) => {
        queueEvent(event.type);
      };

      window.addEventListener(EVENT_PUSH_STATE, handleQueueEvent);
      window.addEventListener(EVENT_REPLACE_STATE, handleQueueEvent);
      window.addEventListener("popstate", handleQueueEvent);
    }

    function createBatchQueueEvent(handler, delay) {
      let isProcessing = false;
      let batchTimeout = null;
      const eventQueue = new Set();

      const processBatch = () => {
        if (eventQueue.size > 0) {
          handler([...eventQueue]);
          eventQueue.clear();
        }
        isProcessing = false;
        batchTimeout = null;
      };

      return (event) => {
        eventQueue.add(event);

        if (!isProcessing) {
          isProcessing = true;
          batchTimeout = setTimeout(processBatch, delay);
        }
      };
    }

    return () => {
      if (batchTimeout) {
        clearTimeout(batchTimeout);
      }

      window.removeEventListener(EVENT_PUSH_STATE, handleQueueEvent);
      window.removeEventListener(EVENT_REPLACE_STATE, handleQueueEvent);
      window.removeEventListener("popstate", handleQueueEvent);
    };
  },

  append: (value, options) => {
    const container =
      document.getElementById(DEBUG_CONTAINER_ID) ||
      document.body.appendChild(
        createElement("div", {
          id: DEBUG_CONTAINER_ID,
        })
      );

    const content = container.querySelector(
      `#${DEBUG_CONTENT_ID}-${options?.id}`
    );

    const newContent = createElement("div", {
      ...options,
      id: options?.id ? `${DEBUG_CONTENT_ID}-${options.id}` : undefined,
      children: jsonStringifyInHtml(value),
    });

    if (content) {
      content.replaceWith(newContent);
    } else {
      container.appendChild(newContent);
    }
  },

  prepend: (value, options) => {
    const container =
      document.getElementById(DEBUG_CONTAINER_ID) ||
      document.body.insertBefore(
        createElement("div", {
          id: DEBUG_CONTAINER_ID,
        }),
        document.body.firstChild
      );

    const content = container.querySelector(
      `#${DEBUG_CONTENT_ID}-${options?.id}`
    );

    const newContent = createElement("div", {
      ...options,
      id: options?.id ? `${DEBUG_CONTENT_ID}-${options.id}` : undefined,
      children: jsonStringifyInHtml(value),
    });

    if (content) {
      content.replaceWith(newContent);
    } else {
      container.appendChild(newContent);
    }
  },

  debug: (value, options) => {
    const container =
      document.getElementById(DEBUG_CONTAINER_ID) ||
      document.body.appendChild(
        createElement("details", {
          id: DEBUG_CONTAINER_ID,
          open: true,
          style: {
            position: "fixed",
            bottom: 0,
            left: 0,
            padding: "10px",
            outline: "1px solid",
            background: "#fff",
            opacity: 0.9,
            zIndex: 2147483647,
            maxHeight: "500px",
            overflow: "auto",
          },
          children: [
            createElement("summary", {
              style: {
                cursor: "pointer",
              },
              children: `Debug ${options?.id ? `[${options.id}]` : ""}`,
            }),
          ],
        })
      );

    const content = container.querySelector(
      `#${DEBUG_CONTENT_ID}-${options?.id}`
    );

    const newContent = createElement("div", {
      ...options,
      id: options?.id ? `${DEBUG_CONTENT_ID}-${options.id}` : undefined,
      children: jsonStringifyInHtml(value),
    });

    if (content) {
      content.replaceWith(newContent);
    } else {
      container.appendChild(newContent);
    }
  },

  clear: () => {
    document.querySelectorAll(`#${DEBUG_CONTAINER_ID}`).forEach((el) => {
      el.remove();
    });
  },

  querySelector,
  querySelectorAll,
  showToast,
};

Object.assign(globalThis, {
  mintool,
  createElement,
  templateToElement,
});

// MAIN world에서 실행될 때만 초기화 (최상위 프레임에서만 실행)
if (window.top === window.self) {
  mintool.init();
}

////////////////////////////////////////////

const PROJECT_PREFIX = "mintool";
const Z_INDEX_MAX = 2147483647;
const Z_INDEX_TOAST = Z_INDEX_MAX - 1;
const overlayMargin = "20px";
const overlayPadding = "8px 16px";

function showToast(text, duration = 2000) {
  if (document.querySelector(`.${PROJECT_PREFIX}-toast`)) {
    document.querySelector(`.${PROJECT_PREFIX}-toast`).remove();
  }

  return new Promise((resolve) => {
    const toast = createIsland({
      zIndex: Z_INDEX_TOAST,
      opacity: 0,
      transition: "opacity 0.3s ease-in-out",
    });
    toast.classList.add(`${PROJECT_PREFIX}-toast`);
    toast.innerHTML = text;

    toast.addEventListener(
      "transitionend",
      () => {
        resolve();
      },
      { once: true }
    );

    setTimeout(function show() {
      toast.style.opacity = "1";
    }, 100);

    setTimeout(function hide() {
      toast.style.opacity = "0";
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, duration);
  });
}

function createIsland(styleProps = {}) {
  const element = document.createElement("div");
  element.classList.add(`${PROJECT_PREFIX}-island`);
  element.style.position = "fixed";
  element.style.top = overlayMargin;
  element.style.left = "50%";
  element.style.transform = "translateX(-50%)";
  element.style.textAlign = "center";
  element.style.padding = overlayPadding;
  element.style.backgroundColor = "rgba(0, 0, 0, 1)";
  element.style.outline = "1px solid #fff";
  element.style.color = "#fff";
  element.style.borderRadius = "4px";
  element.style.fontSize = "16px";
  element.style.lineHeight = "1.4";
  Object.assign(element.style, styleProps);

  document.body.appendChild(element);

  const style = document.createElement("style");
  style.id = `${PROJECT_PREFIX}-island-style`;
  style.textContent = `
    .${PROJECT_PREFIX}-island {
      @media (max-width: 768px) {
        width: calc(100% - 20px);
        font-size: 14px;
      }
    }
  `;

  if (!document.getElementById(style.id)) {
    document.head.appendChild(style);
  }

  return element;
}

////////////////////////////////////////////

function querySelector(selector, root = document) {
  const element = root.querySelector(selector);
  if (element) {
    return element;
  }

  const shadowRoots = Array.from(root.querySelectorAll("*")).filter(
    (node) => node.shadowRoot
  );

  for (const node of shadowRoots) {
    const element = node.shadowRoot.querySelector(selector);
    if (element) {
      return element;
    }
  }
}

function querySelectorAll(selector, root = document) {
  let elements;

  elements = Array.from(root.querySelectorAll(selector));

  const shadowRoots = Array.from(root.querySelectorAll("*")).filter(
    (node) => node.shadowRoot
  );

  for (const node of shadowRoots) {
    elements = elements.concat(
      Array.from(node.shadowRoot.querySelectorAll(selector))
    );
  }

  return elements;
}

function jsonStringifyInHtml(value) {
  if (value === null) {
    const nullSpan = createElement("span", {
      style: { color: "#888888" },
      children: "null",
    });
    return nullSpan;
  }

  if (!isObject(value))
    throw new Error("[jsonStringifyInHtml] value is not an object");

  const defaultMarginLeft = 4;
  const marginLeft = defaultMarginLeft * 6;

  const listStyle = {
    listStyleType: "disc",
    marginLeft: `${marginLeft}px`, // Add 'px' for proper margin
  };

  const isDark = false;
  const styles = {
    light: {
      keyColor: "#126329",
      valueColor: "#0b2f69",
    },
    dark: {
      keyColor: "#7ee787",
      valueColor: "#91bde1",
    },
  };
  const style = isDark ? styles.dark : styles.light;

  const fragment = document.createDocumentFragment();

  Object.entries(value).forEach(([k, v], index) => {
    const li = createElement("li", {
      style: listStyle,
    });

    li.append(
      createElement("span", {
        style: { color: style.keyColor },
        children: `"${k}": `,
      })
    );

    if (typeof v === "string" || typeof v === "number") {
      li.append(
        createElement("span", {
          style: { color: style.valueColor },
          children: `"${v}"`,
        })
      );
    } else if (typeof v === "boolean") {
      li.append(
        createElement("span", {
          style: { color: style.valueColor },
          children: v,
        })
      );
    } else if (typeof v === "object") {
      if (Array.isArray(v) && v.length === 0) {
        li.append(
          createElement("span", {
            style: { color: style.valueColor },
            children: " []",
          })
        );
      } else {
        li.append(jsonStringifyInHtml(v));
      }
    }

    fragment.appendChild(li);
  });

  return fragment;
}

function createElement(tag, props = {}) {
  const element = document.createElement(tag);
  applyProps(element, props);

  function applyProps(element, props) {
    for (const [key, value] of Object.entries(props)) {
      if (key === "style" && typeof value === "object") {
        applyStyles(element, value);
      } else if (key === "children") {
        applyChildren(element, value);
      } else {
        if (value !== undefined) {
          element[key] = value;
        }
      }
    }
  }

  function applyStyles(element, styles) {
    for (const [cssProperty, cssValue] of Object.entries(styles)) {
      const kebabCaseProperty = cssProperty.replace(
        /[A-Z]/g,
        (match) => `-${match.toLowerCase()}`
      );
      element.style.setProperty(kebabCaseProperty, cssValue);
    }
  }

  function applyChildren(element, children) {
    if (Array.isArray(children)) {
      element.append(...children);
    } else {
      element.append(children);
    }
  }

  return element;
}

function templateToElement(innerHTML) {
  const container = document.createElement("div");
  container.innerHTML = innerHTML;
  return container.firstElementChild;
}

function isObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof RegExp) &&
    !(value instanceof Date) &&
    !(value instanceof Set) &&
    !(value instanceof Map)
  );
}

function waitForElement(root, selector, timeout = 1000) {
  const ERROR_MESSAGE = `[waitForElement] Element not found: ${selector} (${timeout}ms)`;

  const QUICK_CHECK_COUNT = 10;

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let rafId;
    let timeoutId;
    let checkCount = 0;
    const observedShadowRoots = new WeakSet();

    findWithQuickChecks()
      .then((element) => {
        if (element) {
          resolve(element);
        } else {
          return findWithSlowPolling();
        }
      })
      .then(resolve)
      .catch(reject);

    function findWithQuickChecks() {
      return new Promise((resolve, reject) => {
        quickCheck();

        function quickCheck() {
          checkCount++;
          const element = findInTree(root);

          if (isTimeout()) {
            cleanupRaf();
            reject(new Error(ERROR_MESSAGE));
            return;
          }

          if (element) {
            cleanupRaf();
            resolve(element);
            return;
          }

          if (checkCount < QUICK_CHECK_COUNT) {
            rafId = requestAnimationFrame(quickCheck);
            return;
          }

          cleanupRaf();
          resolve(null);
        }
      });
    }

    function findWithSlowPolling() {
      return new Promise((resolve, reject) => {
        let delay = 50;

        slowCheck();

        function slowCheck() {
          if (isTimeout()) {
            cleanupTimeout();
            reject(new Error(ERROR_MESSAGE));
            return;
          }

          const element = findInTree(root);

          if (element) {
            cleanupTimeout();
            resolve(element);
            return;
          }

          delay = Math.min(delay * 1.5, 500);
          timeoutId = setTimeout(slowCheck, delay);
        }
      });
    }

    function findInTree(root) {
      if (isElement(root) && root.matches(selector)) {
        return root;
      }

      if (root.shadowRoot) {
        if (!observedShadowRoots.has(root.shadowRoot)) {
          observedShadowRoots.add(root.shadowRoot);
        }

        const foundInShadow = findInTree(root.shadowRoot);
        if (foundInShadow) {
          return foundInShadow;
        }
      }

      const children = root.querySelectorAll("*");
      for (const child of children) {
        const foundInChild = findInTree(child);
        if (foundInChild) {
          return foundInChild;
        }
      }

      return null;
    }

    function cleanupRaf() {
      rafId && cancelAnimationFrame(rafId);
    }

    function cleanupTimeout() {
      timeoutId && clearTimeout(timeoutId);
    }

    function isTimeout() {
      return Date.now() - startTime > timeout;
    }

    function isElement(node) {
      return node instanceof Element;
    }
  });
}

// === MAIN world에서만 작동 (manifest.json에서 world: "MAIN" 설정을 지칭) === //
function monkeyPatchPushState() {
  const originalPushState = history.pushState;

  history.pushState = function (...args) {
    originalPushState.apply(history, args);

    const navEvent = new CustomEvent(EVENT_PUSH_STATE);
    window.dispatchEvent(navEvent);
  };
}

function monkeyPatchReplaceState() {
  const originalReplaceState = history.replaceState;

  history.replaceState = function (...args) {
    originalReplaceState.apply(history, args);

    const navEvent = new CustomEvent(EVENT_REPLACE_STATE);
    window.dispatchEvent(navEvent);
  };
}
