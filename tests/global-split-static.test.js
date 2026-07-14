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

function testManifestLoadsMainNavigationAndIsolatedGlobal() {
  const manifest = readJson("manifest.json");
  const mainWorld = manifest.content_scripts.find(
    (entry) => entry.world === "MAIN",
  );
  const isolatedWorld = manifest.content_scripts.find((entry) =>
    entry.js?.includes("utils/content-isolated/global.global.js"),
  );

  assert.ok(mainWorld);
  assert.ok(isolatedWorld);
  assert.equal(mainWorld.world, "MAIN");
  assert.ok(mainWorld.js.includes("utils/content-main/navigation.global.js"));
  assert.ok(!mainWorld.js.includes("utils/content-main/global.global.js"));

  assert.ok(isolatedWorld.js.includes("utils/content-isolated/global.global.js"));
  assert.ok(!isolatedWorld.js.includes("utils/content-main/global.global.js"));
}

function testMainNavigationOwnsHistoryMonkeyPatch() {
  const source = readText("utils/content-main/navigation.global.js");

  assert.match(source, /history\.pushState/);
  assert.match(source, /history\.replaceState/);
  assert.match(source, /custom-push-state/);
  assert.match(source, /custom-replace-state/);
}

function testIsolatedGlobalOwnsHelpersOnly() {
  const source = readText("utils/content-isolated/global.global.js");

  assert.match(source, /Object\.assign\(globalThis/);
  assert.match(source, /observeUrlChange/);
  assert.match(source, /createElement/);
  assert.match(source, /templateToElement/);
  assert.doesNotMatch(source, /history\.pushState/);
  assert.doesNotMatch(source, /history\.replaceState/);
  assert.doesNotMatch(source, /monkeyPatchPushState/);
  assert.doesNotMatch(source, /monkeyPatchReplaceState/);
}

function testReadmeMentionsSplitGlobalFiles() {
  const readme = readText("README.md");

  assert.match(readme, /utils\/content-main\/navigation\.global\.js/);
  assert.match(readme, /utils\/content-isolated\/global\.global\.js/);
}

testManifestLoadsMainNavigationAndIsolatedGlobal();
testMainNavigationOwnsHistoryMonkeyPatch();
testIsolatedGlobalOwnsHelpersOnly();
testReadmeMentionsSplitGlobalFiles();

console.log("global split static checks passed");
