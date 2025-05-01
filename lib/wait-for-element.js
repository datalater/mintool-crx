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
