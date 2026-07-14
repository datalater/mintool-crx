(function () {
  const HISTORY_LIMIT = 300;
  const history = [];
  let seq = 0;

  globalThis.mintoolConsoleToastStore = {
    append(level, message, place = "") {
      const entry = {
        id: ++seq,
        level,
        message,
        place,
        ts: Date.now(),
      };
      history.push(entry);
      if (history.length > HISTORY_LIMIT) history.shift();
      return entry;
    },
    list(query = "", levelFilter = "") {
      return history.filter((entry) => {
        if (levelFilter && !matchesLevelFilter(entry.level, levelFilter)) {
          return false;
        }
        if (!query) return true;
        const hay = `${entry.level} ${entry.message} ${entry.place}`.toLowerCase();
        return hay.includes(query);
      });
    },
    recent(limit) {
      return history.slice(-limit);
    },
    size() {
      return history.length;
    },
    counts() {
      const counts = { error: 0, warn: 0, info: 0, log: 0 };
      for (const entry of history) {
        if (entry.level === "error") counts.error += 1;
        else if (entry.level === "warn") counts.warn += 1;
        else if (entry.level === "info") counts.info += 1;
        else counts.log += 1;
      }
      return counts;
    },
    clear() {
      history.length = 0;
    },
  };

  function matchesLevelFilter(entryLevel, levelFilter) {
    if (levelFilter === "log") {
      return entryLevel === "log" || entryLevel === "debug";
    }
    return entryLevel === levelFilter;
  }
})();
