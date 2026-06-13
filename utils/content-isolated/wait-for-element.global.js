function waitForElement(root, selector, timeout = 1000) {
  const ERROR_MESSAGE = `[waitForElement] Element not found: ${selector} (${timeout}ms)`;

  const QUICK_CHECK_COUNT = 10;

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let rafId;
    let timeoutId;
    let checkCount = 0;
    let shadowScanComplete = false;
    let hasAnyShadowRoot = false;
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
      if (!root) return null;

      if (isElement(root) && root.matches(selector)) {
        return root;
      }

      if (root.querySelector) {
        const found = root.querySelector(selector);
        if (found) {
          return found;
        }
      }

      if (root.shadowRoot && !observedShadowRoots.has(root.shadowRoot)) {
        observedShadowRoots.add(root.shadowRoot);
        hasAnyShadowRoot = true;
        const foundInShadow = findInTree(root.shadowRoot);
        if (foundInShadow) {
          return foundInShadow;
        }
      }

      if (shadowScanComplete && !hasAnyShadowRoot) {
        return null;
      }

      const stack = [];
      pushChildren(root, stack);

      while (stack.length) {
        const node = stack.pop();
        if (!node) continue;

        if (node.shadowRoot && !observedShadowRoots.has(node.shadowRoot)) {
          observedShadowRoots.add(node.shadowRoot);
          hasAnyShadowRoot = true;
          const foundInShadow = findInTree(node.shadowRoot);
          if (foundInShadow) {
            return foundInShadow;
          }
        }

        pushChildren(node, stack);
      }

      shadowScanComplete = true;
      return null;
    }

    function pushChildren(node, stack) {
      const children = node.children;
      if (children && children.length) {
        for (let i = children.length - 1; i >= 0; i--) {
          stack.push(children[i]);
        }
        return;
      }

      if (node.childNodes && node.childNodes.length) {
        for (let i = node.childNodes.length - 1; i >= 0; i--) {
          const child = node.childNodes[i];
          if (child.nodeType === 1) {
            stack.push(child);
          }
        }
      }
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
