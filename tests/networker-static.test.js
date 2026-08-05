const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function testDevtoolsRegistersNetworkerPanel() {
  const source = readText("devtools/devtools.js");
  assert.match(source, /panels\.create\("Networker"/);
  assert.match(source, /devtools\/networker\.html/);
}

function testNetworkerStep1Surface() {
  const html = readText("devtools/networker.html");
  const js = readText("devtools/networker.js");

  assert.match(html, /Networker · Step 1/);
  assert.match(html, /id="request-list"/);
  assert.match(html, /요약 JSON 복사/);
  assert.match(html, /networker\.css/);
  assert.match(html, /networker\.js/);
  assert.match(js, /devtools\.network\.getHAR/);
  assert.match(js, /onRequestFinished/);
  assert.match(js, /hasPostData/);
  assert.match(js, /postDataTextLength/);
  assert.doesNotMatch(js, /parseNdjson/);
}

testDevtoolsRegistersNetworkerPanel();
testNetworkerStep1Surface();

console.log("networker-static.test.js: ok");
