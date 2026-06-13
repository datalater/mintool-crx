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
  const source = readText("lib/bookmarklets.js");
  const context = {};

  vm.createContext(context);
  vm.runInContext(
    `${source}\nthis.mtb.bookmarklets = mtb.bookmarklets;`,
    context,
  );

  return context.mtb.bookmarklets;
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

  assert.match(background, /importScripts\("lib\/bookmarklets\.js"\)/);
  assert.match(background, /BOOKMARKLETS_PARENT/);
  assert.match(background, /북마클릿/);
  assert.match(background, /chrome\.scripting\.executeScript/);
  assert.match(background, /files:\s*\["lib\/bookmarklets\.js"\]/);
  assert.match(background, /args:\s*\[bookmarklet\.id\]/);
}

function testBookmarkletsExposeOutlineActions() {
  const bookmarklets = loadBookmarklets();
  const ids = bookmarklets.map((bookmarklet) => bookmarklet.id);

  assert.ok(ids.includes("outline"));
  assert.ok(ids.includes("outline-clear"));
  assert.equal(new Set(ids).size, ids.length, "bookmarklet IDs should be unique");
  assert.ok(
    bookmarklets.every((bookmarklet) => typeof bookmarklet.title === "string"),
  );
  assert.ok(
    bookmarklets.every((bookmarklet) => typeof bookmarklet.run === "function"),
  );
}

testManifestAllowsScriptExecution();
testBackgroundLoadsAndWiresBookmarklets();
testBookmarkletsExposeOutlineActions();

console.log("bookmarklets static checks passed");
