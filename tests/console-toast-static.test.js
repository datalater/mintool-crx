const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function testManifestWiresConsoleToast() {
  const manifest = readJson("manifest.json");
  const mainWorld = manifest.content_scripts.find(
    (entry) => entry.world === "MAIN",
  );
  const toastIsolated = manifest.content_scripts.find((entry) =>
    entry.js?.includes("services/console-toast/content-isolated.js"),
  );

  assert.ok(mainWorld.js.includes("services/console-toast/store.js"));
  assert.ok(mainWorld.js.includes("services/console-toast/styles.js"));
  assert.ok(mainWorld.js.includes("services/console-toast/ui.js"));
  assert.ok(mainWorld.js.includes("services/console-toast/content-main.js"));
  assert.equal(mainWorld.run_at, "document_start");
  assert.ok(toastIsolated);
  assert.equal(toastIsolated.run_at, "document_start");
  assert.ok(
    !fs.existsSync(path.join(ROOT, "services/console-toast/page-hook.js")),
  );
}

function testConsoleToastIsOptIn() {
  const source = readText("utils/content-isolated/feature-guard.global.js");
  assert.match(source, /key:\s*'consoleToast'/);
  assert.match(source, /defaultEnabled:\s*false/);
}

function testMainHooksConsoleAndUiFeatures() {
  const main = readText("services/console-toast/content-main.js");
  const isolated = readText("services/console-toast/content-isolated.js");
  const ui = readText("services/console-toast/ui.js");
  const store = readText("services/console-toast/store.js");

  assert.match(main, /console\[level\]\s*=/);
  assert.match(main, /patchConsole/);
  assert.match(main, /isPanelOpen/);
  assert.doesNotMatch(isolated, /injectInline|page-hook|getStubSource/);
  assert.match(ui, /aria-label", "닫기"/);
  assert.match(ui, /aria-label", "메시지·위치 검색"/);
  assert.match(ui, /_mintoolPaused/);
  assert.match(ui, /mintool-ct-search/);
  assert.match(ui, /isPanelOpen/);
  assert.match(ui, /mintool-ct-level-counts/);
  assert.match(ui, /levelFilter/);
  assert.match(ui, /mintool-ct-dock-close/);
  assert.match(ui, /request-disable/);
  assert.match(isolated, /request-disable/);
  assert.match(store, /counts\(\)/);
  assert.match(store, /matchesLevelFilter|levelFilter/);
}

function testDevtoolsPanelListsConsoleToast() {
  const html = readText("devtools/panel.html");
  const js = readText("devtools/panel.js");
  const devtools = readText("devtools/devtools.js");

  assert.match(html, /Console Toast/);
  assert.match(js, /consoleToast/);
  assert.match(devtools, /devtools\/panel\.html/);
}

testManifestWiresConsoleToast();
testConsoleToastIsOptIn();
testMainHooksConsoleAndUiFeatures();
testDevtoolsPanelListsConsoleToast();

console.log("console-toast-static.test.js: ok");
