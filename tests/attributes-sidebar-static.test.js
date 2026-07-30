const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function testDevtoolsRegistersAttributesSidebar() {
  const source = readText("devtools/devtools.js");
  assert.match(source, /panels\.elements\.createSidebarPane\("Attributes"/);
  assert.match(source, /devtools\/attributes-sidebar\.html/);
}

function testAttributesSidebarUiSurface() {
  const html = readText("devtools/attributes-sidebar.html");
  const js = readText("devtools/attributes-sidebar.js");

  assert.match(html, /id="attr-tbody"/);
  assert.match(html, /복사 \(JSON\)/);
  assert.match(js, /\$0/);
  assert.match(js, /onSelectionChanged/);
  assert.match(js, /navigator\.clipboard\.writeText/);
  assert.match(js, /JSON\.stringify/);
  assert.match(js, /ownerDocument !== document/);
  assert.match(js, /frameURL/);
  assert.match(js, /webNavigation\.getAllFrames/);
  assert.match(html, /id="filter-input"/);
  assert.match(js, /matchesFilter/);
  assert.match(js, /filterQuery/);
  assert.match(html, /🔄/);
  assert.match(js, /shouldCollapse/);
  assert.match(js, /expandedAttrNames/);
  assert.match(js, /JSON\.stringify\(payload/);
  assert.match(js, /복사 완료/);
}

testDevtoolsRegistersAttributesSidebar();
testAttributesSidebarUiSurface();

console.log("attributes-sidebar-static.test.js: ok");
