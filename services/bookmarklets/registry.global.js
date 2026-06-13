var MINTOOL_BOOKMARKLETS = Object.freeze([
    {
      id: "outline",
      title: "outline",
      run: function outlineBookmarklet() {
        const styleId = "outline-style";

        const CSS_TEXT = `
        *, *::before, *::after {
          outline: 0.1px solid color-mix(in srgb, currentColor 70%, white 70%);
        }
      `;

        function injectStyle(root) {
          if (root.getElementById && root.getElementById(styleId)) return;

          const style = document.createElement("style");
          style.id = styleId;
          style.textContent = CSS_TEXT;
          (root.head || root).appendChild(style);
        }

        injectStyle(document);
        if (!document.body) return;

        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_ELEMENT,
        );
        let el;

        while ((el = walker.nextNode())) {
          if (el.shadowRoot) injectStyle(el.shadowRoot);
        }
      },
    },
    {
      id: "outline-clear",
      title: "outline-clear",
      run: function outlineClearBookmarklet() {
        const styleId = "outline-style";

        function removeStyle(root) {
          const style = root.getElementById && root.getElementById(styleId);
          if (style) style.parentNode.removeChild(style);
        }

        removeStyle(document);
        if (!document.body) return;

        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_ELEMENT,
        );
        let el;

        while ((el = walker.nextNode())) {
          if (el.shadowRoot) removeStyle(el.shadowRoot);
        }
      },
    },
    {
      id: "find-overflow",
      title: "find-overflow",
      run: function findOverflow() {
        var d = document;

        var valueAttr = "data-mintool-original-outline-value";
        var priorityAttr = "data-mintool-original-outline-priority";

        var w = d.documentElement.offsetWidth;
        var t = d.createTreeWalker(d.body, NodeFilter.SHOW_ELEMENT);
        var b;

        while (t.nextNode()) {
          b = t.currentNode.getBoundingClientRect();

          if (b.right > w || b.left < 0) {
            var el = t.currentNode;

            /**
             * 기존 inline outline 정보를 최초 1회만 저장합니다.
             *
             * el.style.getPropertyValue("outline")
             * - inline style에 직접 적힌 outline 값만 가져옵니다.
             * - CSS 파일이나 class에서 온 computed outline은 저장하지 않습니다.
             *
             * el.style.getPropertyPriority("outline")
             * - inline outline이 !important였는지 확인합니다.
             * - 반환값은 "important" 또는 "" 입니다.
             */
            if (!el.hasAttribute(valueAttr)) {
              el.setAttribute(valueAttr, el.style.getPropertyValue("outline"));
              el.setAttribute(
                priorityAttr,
                el.style.getPropertyPriority("outline"),
              );
            }

            el.style.setProperty("outline", "1px dotted red", "important");
            console.log(el);
          }
        }
      },
    },
    {
      id: "find-overflow-clear",
      title: "find-overflow-clear",
      run: function findOverflowClear() {
        var d = document;

        var valueAttr = "data-mintool-original-outline-value";
        var priorityAttr = "data-mintool-original-outline-priority";

        var t = d.createTreeWalker(d.body, NodeFilter.SHOW_ELEMENT);
        var el;

        while (t.nextNode()) {
          el = t.currentNode;

          /**
           * 우리가 건드린 요소만 복구합니다.
           */
          if (!el.hasAttribute(valueAttr)) continue;

          var originalValue = el.getAttribute(valueAttr);
          var originalPriority = el.getAttribute(priorityAttr);

          /**
           * 원래 inline outline이 있었다면 값과 priority를 그대로 복구합니다.
           * 예:
           *   outline: 2px solid blue !important
           */
          if (originalValue) {
            el.style.setProperty("outline", originalValue, originalPriority);
          } else {
            /**
             * 원래 inline outline이 없었다면 제거합니다.
             * 그러면 class/CSS 파일에서 정의된 outline이 다시 자연스럽게 보일 수 있습니다.
             */
            el.style.removeProperty("outline");
          }

          el.removeAttribute(valueAttr);
          el.removeAttribute(priorityAttr);
        }
      },
    },
    {
      id: "view-passwords",
      title: "view-passwords",
      run: function viewPasswords() {
        var s, F, j, f, i;
        s = "";
        F = document.forms;
        for (j = 0; j < F.length; ++j) {
          f = F[j];
          for (i = 0; i < f.length; ++i) {
            if (f[i].type.toLowerCase() == "password") s += f[i].value + "\n";
          }
        }
        if (s) MINTOOL_CONTENT_POPUP.show("Passwords in forms on this page:\n\n" + s);
        else alert("There are no passwords in forms on this page.");
      },
    },
  ]);
