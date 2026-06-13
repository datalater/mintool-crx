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
