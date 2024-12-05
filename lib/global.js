const DEBUG_CONTAINER_ID = "mintool-debug-container";
const DEBUG_CONTENT_ID = "mintool-debug-content";

const screen = {
  outline,
  outlineClear,

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
              children: "Debug",
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
};

Object.assign(globalThis, {
  scr: screen,
  createElement,
  templateToElement,
});

////////////////////////////////////////////

function outline() {
  const style = document.createElement("style");
  style.id = "outline-style";

  style.textContent = `
    *, *::before, *::after {
      outline: 0.1px solid;
    }
  `;

  document.head.appendChild(style);
}

function outlineClear() {
  const style = document.getElementById("outline-style");

  style && style.parentNode.removeChild(style);
}

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
