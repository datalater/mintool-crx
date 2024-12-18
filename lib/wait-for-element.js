function waitForElement(root, selector, timeout = 1_000) {
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" || mutation.type === "childList") {
          const nodes =
            mutation.type === "attributes"
              ? [mutation.target]
              : mutation.addedNodes;

          for (const node of nodes) {
            if (!isElement(node)) continue;

            candidate = searchInTree(
              node,
              selector,
              observer,
              observedShadowRoots
            );
            if (candidate) {
              cleanup(observer, timeoutId);
              resolve(candidate);
            }
          }
        }
      }
    });

    const observedShadowRoots = new WeakSet();
    const observerConfig = {
      childList: true,
      subtree: true,
      attributes: true,
    };

    observer.observe(root, observerConfig);

    let candidate = searchInTree(root, selector, observer, observedShadowRoots);
    if (candidate) {
      resolve(candidate);
    }

    const timeoutId = setTimeout(() => {
      cleanup(observer, timeoutId);
      reject(
        new Error(
          `[waitForElement] Element not found: ${selector} (${timeout}ms)`
        )
      );
    }, timeout);

    function searchInTree(root, selector, observer, observedShadowRoots) {
      if (isElement(root) && root.matches(selector)) {
        return root;
      }

      if (root.shadowRoot) {
        if (!observedShadowRoots.has(root.shadowRoot)) {
          observedShadowRoots.add(root.shadowRoot);
          observer.observe(root.shadowRoot, observerConfig);
        }

        const found = searchInTree(
          root.shadowRoot,
          selector,
          observer,
          observedShadowRoots
        );
        if (found) {
          return found;
        }
      }

      for (const child of root.querySelectorAll("*")) {
        const found = searchInTree(
          child,
          selector,
          observer,
          observedShadowRoots
        );
        if (found) {
          return found;
        }
      }
    }

    function cleanup(observer, timeoutId) {
      observer.disconnect();
      clearTimeout(timeoutId);
    }

    function isElement(node) {
      return node instanceof Element;
    }
  });
}
