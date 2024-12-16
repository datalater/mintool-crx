function waitForElement(root, selector, timeout = 1000) {
  return new Promise((resolve, reject) => {
    const element = root.querySelector(selector);
    if (element) {
      resolve(element);
    }

    for (const node of root.querySelectorAll("*")) {
      if (node.shadowRoot) {
        const shadowElement = node.shadowRoot.querySelector(selector);
        if (shadowElement) {
          resolve(shadowElement);
        }
      }
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" || mutation.type === "childList") {
          const nodes =
            mutation.type === "attributes"
              ? [mutation.target]
              : mutation.addedNodes;

          for (const node of nodes) {
            if (!isElement(node)) continue;

            if (node.matches(selector)) {
              cleanup(observer, timeoutId);
              resolve(node);
            }

            if (node.shadowRoot) {
              const shadowElement = node.shadowRoot.querySelector(selector);
              if (shadowElement) {
                cleanup(observer, timeoutId);
                resolve(shadowElement);
              }

              observer.observe(node.shadowRoot, {
                childList: true,
                subtree: true,
                attributes: true,
              });
            }
          }
        }
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    root.querySelectorAll("*").forEach((node) => {
      if (node.shadowRoot) {
        observer.observe(node.shadowRoot, {
          childList: true,
          subtree: true,
          attributes: true,
        });
      }
    });

    const timeoutId = setTimeout(() => {
      cleanup(observer, timeoutId);
      reject(new Error(`Element not found: ${selector} (${timeout}ms)`));
    }, timeout);

    const cleanup = (observer, timeoutId) => {
      observer.disconnect();
      clearTimeout(timeoutId);
    };

    const isElement = (node) => {
      return node instanceof Element;
    };
  });
}
