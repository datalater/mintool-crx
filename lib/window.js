const screen = {
  debug: (value) => {
    document.body.appendChild(jsonStringifyInHtml(value));
  },
};

Object.assign(window, { screen, jsonStringifyInHtml });

////////////////////////////////////////////

function jsonStringifyInHtml(value) {
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
        element[key] = value;
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
