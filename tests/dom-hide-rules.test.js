const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

function setup() {
  let data = {};
  let receive;
  let rejectWrite = false;
  const context = vm.createContext({
    URL, crypto,
    chrome: {
      runtime: { id: "mintool-test", getURL: () => "chrome-extension://mintool-test/", onMessage: { addListener(fn) { receive = fn; } } },
      storage: { local: {
        async get() { return structuredClone(data); },
        async set(next) {
          await new Promise((resolve) => setImmediate(resolve));
          if (rejectWrite) throw new Error("storage failure");
          data = structuredClone(next);
        },
      } },
      webNavigation: { onHistoryStateUpdated: { addListener() {} }, onReferenceFragmentUpdated: { addListener() {} } },
    },
  });
  for (const file of ["configs/dom-hider.global.js", "services/dom-hider/rules.global.js", "services/dom-hider/storage.background.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  }
  const send = (message, sender = { id: "mintool-test", tab: { id: 1 }, url: "https://example.test/a" }) =>
    new Promise((resolve) => receive({ type: "mintool:dom-hide-rules", url: "https://example.test/a", ...message }, sender, resolve));
  return { api: context.mintoolDomHider, send, failWrites(value) { rejectWrite = value; } };
}

const add = (selector, scope = "page") => ({ operation: "add", selectors: [selector], scope });

test("page rules match exact path/query, site rules stay on their exact origin", () => {
  const { api } = setup();
  const rules = [
    { id: "page", origin: "https://example.test", page: "/a?id=1", selector: ".ad", enabled: true },
    { id: "site", origin: "https://example.test", page: null, selector: ".banner", enabled: true },
    { id: "off", origin: "https://example.test", page: null, selector: ".off", enabled: false },
  ];
  assert.deepEqual(Array.from(api.rulesForUrl(rules, "https://example.test/a?id=1#section"), (r) => r.id), ["page", "site"]);
  assert.deepEqual(Array.from(api.rulesForUrl(rules, "https://example.test/a?id=2"), (r) => r.id), ["site"]);
  assert.equal(api.rulesForUrl(rules, "https://example.test.evil/a?id=1").length, 0);
});

test("concurrent saves preserve both tabs' selections and duplicate saves reactivate one rule", async () => {
  const { send } = setup();
  await Promise.all([send(add(".ad")), send(add(".banner"))]);
  let response = await send({ operation: "list" });
  assert.equal(response.rules.length, 2);
  const id = response.rules.find((r) => r.selector === ".ad").id;
  await send({ operation: "toggle", id });
  await send(add(".ad"));
  response = await send({ operation: "list" });
  assert.equal(response.rules.length, 2);
  assert.equal(response.rules.find((r) => r.id === id).enabled, true);
});

test("site recovery disables rather than deletes rules; individual removal is scoped", async () => {
  const { send } = setup();
  await send(add(".ad", "site"));
  const sender = { id: "mintool-test", url: "chrome-extension://mintool-test/popup/popup.html" };
  const other = await send({ ...add(".other"), url: "https://other.test/" }, sender);
  await send({ operation: "disable-site" });
  const mine = await send({ operation: "list" });
  assert.equal(mine.rules.length, 1);
  assert.equal(mine.rules[0].enabled, false);
  await send({ operation: "remove", id: other.rules[0].id });
  const untouched = await send({ operation: "list", url: "https://other.test/" }, sender);
  assert.equal(untouched.rules[0].enabled, true);
});

test("failed storage writes return an error, leave data unchanged, and do not poison later saves", async () => {
  const { send, failWrites } = setup();
  failWrites(true);
  const failed = await send(add(".ad"));
  assert.equal(failed.ok, false);
  assert.equal((await send({ operation: "list" })).rules.length, 0);
  failWrites(false);
  assert.equal((await send(add(".ad"))).ok, true);
});

test("invalid scope, oversized rule and content-script cross-origin writes are rejected", async () => {
  const { send, api } = setup();
  for (const message of [add(".ad", "everywhere"), add("a".repeat(api.config.maxSelectorLength + 1)), { ...add(".ad"), url: "https://other.test/" }]) {
    assert.equal((await send(message)).ok, false);
  }
  assert.equal((await send({ operation: "list" })).rules.length, 0);
});
