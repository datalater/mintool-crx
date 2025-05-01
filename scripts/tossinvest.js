(function main() {
  const cleanups = [];

  runner();
  mintool.observeUrlChange(runner);

  function runner() {
    cleanup();

    if (!isTossInvestPage()) return;

    if (isStockPage()) {
      runDisplayPriceRanger();
    }
  }

  function runDisplayPriceRanger() {
    const SELECTORS = Object.freeze({
      priceWrapper: "._1sivumi0 ._1p5yqoh0",
      priceRangerId: "price-ranger",
    });

    const PERCENT = 0.02;

    waitForElement(document.body, SELECTORS.priceWrapper, 8_000).then(() => {
      displayPriceRanger(SELECTORS, PERCENT);
    });
  }

  function displayPriceRanger(selectors, percent) {
    if (!selectors) {
      throw new Error("[displayPriceRanger] selectors is required");
    }

    if (!percent) {
      throw new Error("[displayPriceRanger] percent is required");
    }

    if (!document.querySelector(selectors.priceWrapper)) {
      console.error(
        `price wrapper selector not found: document.querySelector('${selectors.priceWrapper}')`
      );
      return;
    }

    const priceRangerIdUnique = `${selectors.priceRangerId}-${percent}`;

    run();

    function run() {
      const target = document.querySelector(selectors.priceWrapper);
      const options = { subtree: true, childList: true };

      const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
          if (mutation.type === "childList") {
            const price = Number(parsePrice(mutation.target.textContent));
            updatePriceRangeBy({ target, price, percent: percent });
          }
        }
      });

      observer.observe(target, options);

      const price = Number(parsePrice(target.textContent));
      updatePriceRangeBy({ target, price, percent: percent });

      cleanups.push(() => observer.disconnect());
    }

    function updatePriceRangeBy({ target, price, percent }) {
      const [lower, upper] = getPriceRange(price, percent);

      const newPriceRanger = createPriceRanger({ percent, upper, lower });

      const priceRanger = document.getElementById(priceRangerIdUnique);

      if (priceRanger) {
        priceRanger.replaceWith(newPriceRanger);
      } else {
        target.after(newPriceRanger);
      }
    }

    function createPriceRanger({ percent, upper, lower }) {
      const percentString = String(percent * 100);

      return templateToElement(`
      <div id="${priceRangerIdUnique}" style="display: flex; flex-direction: column; font-size: 10px; font-family: monospace; color: #c3c3c6; margin-right: 4px;">
        <span>+${percentString}% $${upper.toFixed(2)}</span>
        <span>-${percentString}% $${lower.toFixed(2)}</span>
      </div>
    `);
    }

    function getPriceRange(price, percent) {
      return [price * (1 - percent), price * (1 + percent)];
    }

    function parsePrice(text) {
      return text.replace("$", "");
    }
  }

  function isTossInvestPage() {
    return location.origin === "https://tossinvest.com";
  }

  function isStockPage() {
    return location.pathname.includes("/stock");
  }

  function cleanup() {
    cleanups.forEach((cleanup) => cleanup());
    cleanups.length = 0;
  }
})();
