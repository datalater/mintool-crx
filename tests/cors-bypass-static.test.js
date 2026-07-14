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

function testManifestDeclaresCorsBypassSurface() {
  const manifest = readJson("manifest.json");

  assert.equal(manifest.devtools_page, "devtools/devtools.html");
  assert.ok(manifest.permissions.includes("declarativeNetRequestWithHostAccess"));
  assert.ok(manifest.host_permissions.includes("<all_urls>"));
}

function testBackgroundImportsCorsRules() {
  const source = readText("background.js");
  assert.match(source, /services\/cors-bypass\/rules\.global\.js/);
  assert.match(source, /syncCorsBypassFromStorage/);
  assert.match(source, /storage\.onChanged/);
}

function testCorsBypassIsOptIn() {
  const source = readText("utils/content-isolated/feature-guard.global.js");
  assert.match(source, /key:\s*'corsBypass'/);
  assert.match(source, /defaultEnabled:\s*false/);
}

function testCorsRulesBuildExpectedHeaders() {
  const source = readText("services/cors-bypass/rules.global.js");
  const context = {
    chrome: {
      declarativeNetRequest: {
        updateDynamicRules: async () => {},
      },
      action: {
        setBadgeBackgroundColor: async () => {},
        setBadgeText: async () => {},
      },
      storage: {
        sync: {
          get: async () => ({ features: {} }),
        },
      },
    },
    console,
  };

  vm.runInNewContext(source, context);
  const rules = context.buildCorsBypassRules();
  const headers = rules[0].action.responseHeaders.map((item) => item.header);

  assert.equal(context.isCorsBypassEnabled({}), false);
  assert.equal(context.isCorsBypassEnabled({ corsBypass: true }), true);
  assert.ok(headers.includes("Access-Control-Allow-Origin"));
  assert.ok(headers.includes("Access-Control-Allow-Methods"));
  assert.ok(headers.includes("Access-Control-Allow-Headers"));
}

testManifestDeclaresCorsBypassSurface();
testBackgroundImportsCorsRules();
testCorsBypassIsOptIn();
testCorsRulesBuildExpectedHeaders();

console.log("cors-bypass-static.test.js: ok");
