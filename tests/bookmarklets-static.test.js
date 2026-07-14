const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function loadBookmarklets() {
  const viewGridSource = readText("services/bookmarklets/view-grid.global.js");
  const source = readText("services/bookmarklets/registry.global.js");
  const context = {};

  vm.createContext(context);
  vm.runInContext(
    `${viewGridSource}\n${source}\nthis.MINTOOL_BOOKMARKLETS = MINTOOL_BOOKMARKLETS;`,
    context,
  );

  return context.MINTOOL_BOOKMARKLETS;
}

function testManifestAllowsScriptExecution() {
  const manifest = readJson("manifest.json");

  assert.ok(
    manifest.permissions.includes("scripting"),
    "manifest should include scripting permission for bookmarklet execution",
  );
}

function testBackgroundLoadsAndWiresBookmarklets() {
  const background = readText("background.js");

  assert.match(
    background,
    /services\/bookmarklets\/view-grid\.global\.js/,
  );
  assert.match(
    background,
    /services\/bookmarklets\/registry\.global\.js/,
  );
  assert.match(background, /BOOKMARKLETS_PARENT/);
  assert.match(background, /북마클릿/);
  assert.match(background, /chrome\.scripting\.executeScript/);
  assert.match(
    background,
    /files:\s*\[\s*"utils\/content-isolated\/popup\.global\.js",\s*"services\/bookmarklets\/view-grid\.global\.js",\s*"services\/bookmarklets\/registry\.global\.js",\s*\]/,
  );
  assert.match(background, /args:\s*\[bookmarklet\.id\]/);
}

function testRegistryExposesBookmarklets() {
  const source = readText("services/bookmarklets/registry.global.js");
  const viewGridSource = readText("services/bookmarklets/view-grid.global.js");
  const bookmarklets = loadBookmarklets();
  const ids = bookmarklets.map((bookmarklet) => bookmarklet.id);

  assert.match(source, /var\s+MINTOOL_BOOKMARKLETS\s*=/);
  assert.match(source, /MINTOOL_VIEW_GRID_BOOKMARKLETS/);
  assert.match(viewGridSource, /var\s+MINTOOL_VIEW_GRID_BOOKMARKLETS\s*=/);
  assert.ok(ids.includes("outline"));
  assert.ok(ids.includes("outline-clear"));
  assert.ok(ids.includes("view-grid"));
  assert.ok(ids.includes("view-grid-clear"));
  assert.equal(new Set(ids).size, ids.length, "bookmarklet IDs should be unique");
  assert.match(
    viewGridSource,
    /pointer-events:\s*none/,
    "view-grid should not block page interaction",
  );
  assert.match(
    viewGridSource,
    /data-mintool-view-grid-panel/,
    "view-grid should expose a floating control panel",
  );
  assert.ok(
    bookmarklets.every((bookmarklet) => typeof bookmarklet.title === "string"),
  );
  assert.ok(
    bookmarklets.every((bookmarklet) => typeof bookmarklet.run === "function"),
  );
}

function testRegistryAvoidsTopLevelDomAccess() {
  const source = readText("services/bookmarklets/registry.global.js");
  const beforeFirstRun = source.split(/\brun:\s*function\b/)[0];

  assert.doesNotMatch(beforeFirstRun, /\bdocument\b/);
  assert.doesNotMatch(beforeFirstRun, /\bwindow\b/);
  assert.doesNotMatch(beforeFirstRun, /\bNodeFilter\b/);
}

function testContentPopupUtilIsGlobal() {
  const source = readText("utils/content-isolated/popup.global.js");

  assert.match(source, /var\s+MINTOOL_CONTENT_POPUP\s*=/);
  assert.match(source, /show:\s*function\s+show/);
}

function testReadmeDocumentsStructure() {
  const readme = readText("README.md");

  assert.match(readme, /## 실행 컨텍스트별 폴더 구조/);
  assert.match(readme, /## 전역 변수 선언 규칙/);
  assert.match(readme, /## 파일 로딩 방식/);
  assert.match(readme, /## 북마클릿 추가 방법/);
}

testManifestAllowsScriptExecution();
testBackgroundLoadsAndWiresBookmarklets();
testRegistryExposesBookmarklets();
testRegistryAvoidsTopLevelDomAccess();
testContentPopupUtilIsGlobal();
testReadmeDocumentsStructure();

console.log("bookmarklets static checks passed");
