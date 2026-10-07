/**
 * Loads the shipped service-worker files (not copies) into a sandbox and checks
 * the PAC script and lockout detection.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function load(file) {
  const ctx = { chrome: {}, console, setTimeout, clearTimeout };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "public", file), "utf8"), ctx);
  return ctx;
}

function evalPac(pac, host) {
  const ctx = { dnsDomainIs: (h, d) => h.endsWith(d) };
  vm.createContext(ctx);
  vm.runInContext(pac, ctx);
  return ctx.FindProxyForURL("https://" + host + "/", host);
}

test("PAC script is valid JS and proxies only Noon hosts", () => {
  const { buildNoonPacScript } = load("noonProxy.js");
  const pac = buildNoonPacScript("1.2.3.4", 8080);
  assert.doesNotThrow(() => new Function(pac));
  assert.strictEqual(evalPac(pac, "www.noon.com"), "PROXY 1.2.3.4:8080");
  assert.strictEqual(evalPac(pac, "account.noon.com"), "PROXY 1.2.3.4:8080");
  assert.strictEqual(evalPac(pac, "localhost"), "DIRECT");
  assert.strictEqual(evalPac(pac, "mail.google.com"), "DIRECT");
});

test("PAC never falls back to DIRECT for Noon (no real-IP leak)", () => {
  const { buildNoonPacScript } = load("noonProxy.js");
  assert.ok(!/DIRECT/.test(evalPac(buildNoonPacScript("1.2.3.4", 80), "www.noon.com")));
});

test("PAC uses SOCKS5 for socks proxies", () => {
  const { buildNoonPacScript } = load("noonProxy.js");
  const pac = buildNoonPacScript("5.6.7.8", 1080, "socks5");
  assert.strictEqual(evalPac(pac, "www.noon.com"), "SOCKS5 5.6.7.8:1080");
});

test("PAC rejects bad host/port and strips injection characters", () => {
  const { buildNoonPacScript } = load("noonProxy.js");
  assert.throws(() => buildNoonPacScript("", 80));
  assert.throws(() => buildNoonPacScript("1.2.3.4", 0));
  const pac = buildNoonPacScript("1.2.3.4';alert(1);'", 80);
  assert.doesNotThrow(() => new Function(pac));
  assert.ok(!pac.includes("alert(1);'"));
});

test("isNoonLockoutError matches Noon lockout messages only", () => {
  const { isNoonLockoutError } = load("unlockTab.js");
  assert.ok(isNoonLockoutError("Manual login required — Too many failed attempts. Please use the email link"));
  assert.ok(isNoonLockoutError("TOO MANY FAILED ATTEMPTS"));
  assert.ok(!isNoonLockoutError("Gmail API: Gmail not connected"));
  assert.ok(!isNoonLockoutError(undefined));
});

function loadWithChrome(extra) {
  const calls = { cleared: 0, reloaded: [], blocked: [], applied: [], emitted: [] };
  let store = {};
  let errorListener = null;
  const tabListeners = new Set();
  const chrome = {
    proxy: {
      settings: {
        set: async (cfg) => { calls.applied.push(cfg); },
        clear: async () => { calls.cleared += 1; },
      },
      onProxyError: { addListener: (fn) => { errorListener = fn; } },
    },
    storage: {
      local: {
        get: async (key) => ({ [key]: store[key] }),
        _dump: () => store,
        set: async (obj) => { Object.assign(store, obj); },
        remove: async (key) => { delete store[key]; },
      },
    },
    tabs: {
      reload: async (id) => {
        calls.reloaded.push(id);
        setTimeout(() => tabListeners.forEach((fn) => fn(id, { status: "complete" })), 0);
      },
      query: async () => [{ id: 77 }],
      onUpdated: {
        addListener: (fn) => tabListeners.add(fn),
        removeListener: (fn) => tabListeners.delete(fn),
      },
    },
  };
  const ctx = Object.assign(
    {
      chrome, console, setTimeout, clearTimeout,
      emitBatch: (m) => calls.emitted.push(m.message),
      batchApiRequest: async (path) => {
        if (path === "/proxies/next") {
          if (extra && extra.noProxy) throw new Error("No working proxy found");
          return { id: 9, host: "9.9.9.9", port: 3128, scheme: "http" };
        }
        calls.blocked.push(path);
        return { ok: true };
      },
    },
    extra || {},
  );
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "public", "noonProxy.js"), "utf8"), ctx);
  return { ctx, calls, store, fire: (d) => errorListener(d), setStore: (s) => { store = s; } };
}

test("startup clears any proxy left by a dead service worker", async () => {
  const { calls } = loadWithChrome();
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(calls.cleared, 1);
});

test("proxy error during a run: blocks dead proxy, rotates, reloads bot tab once", async () => {
  const env = loadWithChrome({ isBatchRunActive: () => true, activeLoginTabId: 42 });
  await env.ctx.applyNoonProxy({ id: 5, host: "1.1.1.1", port: 80 });
  await env.ctx.handleNoonProxyError({ error: "net::ERR_TUNNEL_CONNECTION_FAILED" });
  assert.deepStrictEqual(env.calls.blocked, ["/proxies/5/block"]);
  assert.strictEqual((await env.ctx.getActiveNoonProxy()).id, 9);
  assert.deepStrictEqual(env.calls.reloaded, [42]);
  assert.ok(env.calls.emitted.some((m) => /failed .*switched to 9\.9\.9\.9/.test(m)));
});

test("proxy error with no working proxy left: goes DIRECT and reloads", async () => {
  const env = loadWithChrome({ isBatchRunActive: () => true, activeLoginTabId: 42, noProxy: true });
  await env.ctx.applyNoonProxy({ id: 5, host: "1.1.1.1", port: 80 });
  const before = env.calls.cleared;
  await env.ctx.handleNoonProxyError({ error: "net::ERR_TUNNEL_CONNECTION_FAILED" });
  assert.strictEqual(await env.ctx.getActiveNoonProxy(), null);
  assert.ok(env.calls.cleared > before);
  assert.deepStrictEqual(env.calls.reloaded, [42]);
});

test("proxy error outside a run: block + clear, no rotation", async () => {
  const env = loadWithChrome({ isBatchRunActive: () => false });
  await env.ctx.applyNoonProxy({ id: 5, host: "1.1.1.1", port: 80 });
  const appliedBefore = env.calls.applied.length;
  await env.ctx.handleNoonProxyError({ error: "net::ERR_PROXY_CONNECTION_FAILED" });
  assert.strictEqual(env.calls.applied.length, appliedBefore);
  assert.deepStrictEqual(env.calls.blocked, ["/proxies/5/block"]);
  assert.strictEqual(await env.ctx.getActiveNoonProxy(), null);
  assert.deepStrictEqual(env.calls.reloaded, [77]);
});

test("proxy error with no extension proxy applied is ignored", async () => {
  const env = loadWithChrome({ isBatchRunActive: () => true });
  await env.ctx.handleNoonProxyError({ error: "x" });
  assert.deepStrictEqual(env.calls.reloaded, []);
});

test("a burst of simultaneous proxy errors rotates once (no good proxy blocked)", async () => {
  const env = loadWithChrome({ isBatchRunActive: () => true, activeLoginTabId: 42 });
  await env.ctx.applyNoonProxy({ id: 5, host: "1.1.1.1", port: 80 });
  await Promise.all([1, 2, 3, 4].map(() => env.ctx.handleNoonProxyError({ error: "net::ERR_TUNNEL_CONNECTION_FAILED" })));
  assert.deepStrictEqual(env.calls.blocked, ["/proxies/5/block"]);
  assert.deepStrictEqual(env.calls.reloaded, [42]);
  assert.strictEqual((await env.ctx.getActiveNoonProxy()).id, 9);
});

test("reload re-arms an in-flight login so it resumes after the proxy switch", async () => {
  const env = loadWithChrome({ isBatchRunActive: () => true, activeLoginTabId: 42 });
  await env.ctx.chrome.storage.local.set({
    noon_flow_state: { active: true, resumeOnLoad: false, flowType: "batch_account", step: "login_profile" },
  });
  await env.ctx.applyNoonProxy({ id: 5, host: "1.1.1.1", port: 80 });
  await env.ctx.handleNoonProxyError({ error: "net::ERR_TUNNEL_CONNECTION_FAILED" });
  const state = env.ctx.chrome.storage.local._dump().noon_flow_state;
  assert.strictEqual(state.resumeOnLoad, true);
  assert.strictEqual(state.step, "login_profile");
});

test("content: rotation-off error is recognised", () => {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "public", "content", "02-dom-query.js"), "utf8"), ctx);
  assert.ok(ctx.isProxyRotationOffError(new Error("Proxy rotation is switched off (PROXY_ROTATION_ENABLED=false)")));
  assert.ok(!ctx.isProxyRotationOffError(new Error("No working proxy found")));
});

function loadOtpModules(api, gmailResults) {
  const calls = { api: 0, tabsOpened: 0, tabsClosed: 0, searches: 0 };
  const ctx = {
    console, setTimeout, clearTimeout, Date, URL,
    importScripts: () => {},
    delay: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))),
    emitBatch: () => {},
    throwIfCancelled: () => {},
    batchApiRequest: async () => { calls.api += 1; return api(calls.api); },
    chrome: {
      tabs: {
        create: async () => { calls.tabsOpened += 1; setTimeout(() => updated.forEach((f) => f(1, { status: "complete" }, { url: "https://mail.google.com/mail/" })), 0); return { id: 1 }; },
        remove: async () => { calls.tabsClosed += 1; },
        onUpdated: { addListener: (f) => updated.add(f), removeListener: (f) => updated.delete(f) },
        onRemoved: { addListener: () => {}, removeListener: () => {} },
      },
      scripting: {
        executeScript: async () => { calls.searches += 1; return [{ result: gmailResults(calls.searches) }]; },
      },
    },
  };
  const updated = new Set();
  vm.createContext(ctx);
  for (const f of ["gmailTab.js", "otpTab.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "public", f), "utf8"), ctx);
  }
  return { ctx, calls };
}

test("gmailBaseAddress strips +tag, keeps dots", () => {
  const { ctx } = loadOtpModules(() => ({}), () => ({}));
  assert.strictEqual(ctx.gmailBaseAddress("Y.W.Aly808+Shopping@Gmail.com"), "y.w.aly808@gmail.com");
  assert.strictEqual(ctx.gmailBaseAddress("plain@x.com"), "plain@x.com");
});

test("extractNoonOtp reads subject and inline forms only", () => {
  const { ctx } = loadOtpModules(() => ({}), () => ({}));
  assert.strictEqual(ctx.extractNoonOtp("noon 001254 is the OTP for your noon account verification"), "001254");
  assert.strictEqual(ctx.extractNoonOtp("Your one time password (OTP) is 288624 Please note"), "288624");
  assert.strictEqual(ctx.extractNoonOtp("Copyright 2023-2024 noon 202320"), "");
});

test("OTP poll returns as soon as the email arrives (no fixed 10s wait)", async () => {
  const { ctx, calls } = loadOtpModules(
    (n) => { if (n < 3) throw new Error("No fresh OTP found in recent Noon emails"); return { otp: "123456", url: "" }; },
    () => ({}),
  );
  const started = Date.now();
  const found = await ctx.pollForNoonOtpEmail("a@x.com", Date.now());
  assert.strictEqual(found.otp, "123456");
  assert.strictEqual(calls.api, 3);
  assert.ok(Date.now() - started < 1000);
});

function atomFeed(entries) {
  return '<?xml version="1.0"?><feed><title>Gmail - Inbox for ywaly808@gmail.com</title>' +
    entries.map((e) => `<entry><title>${e.title}</title><summary>${e.summary || ""}</summary><issued>${e.issued}</issued><author><name>noon</name><email>${e.from || "no-reply@noon.com"}</email></author></entry>`).join("") +
    "</feed>";
}

test("OTP poll falls back to Gmail feed when backend Gmail is not connected; picks newest fresh OTP", async () => {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  let feedCalls = 0;
  const feeds = [
    atomFeed([{ title: "111111 is the OTP for your noon account verification", issued: iso(now - 5 * 60000) }]), // old
    atomFeed([
      { title: "688734 is the OTP for your noon account verification", issued: iso(now + 3000) },
      { title: "445916 is the OTP for your noon account verification", issued: iso(now - 2000) },
      { title: "222222 is the OTP for your noon account verification", issued: iso(now + 9000), from: "attacker@evil.com" },
    ]),
  ];
  const { ctx, calls } = loadOtpModules(() => { throw new Error("Gmail not connected — connect Gmail first"); }, () => ({}));
  ctx.fetch = async (url) => {
    feedCalls += 1;
    assert.ok(url.startsWith("https://mail.google.com/mail/u/y.w.aly808%40gmail.com/feed/atom"));
    return { ok: true, url, text: async () => feeds[Math.min(feedCalls - 1, feeds.length - 1)] };
  };
  const found = await ctx.pollForNoonOtpEmail("y.w.aly808+shopping@gmail.com", now);
  assert.strictEqual(found.otp, "688734");
  assert.strictEqual(calls.api, 1);
  assert.strictEqual(calls.tabsOpened, 0);
  assert.strictEqual(feedCalls, 2);
});

test("Gmail feed signed out → clear error", async () => {
  const { ctx } = loadOtpModules(() => { throw new Error("Gmail not connected — connect Gmail first"); }, () => ({}));
  ctx.fetch = async () => ({ ok: true, url: "https://accounts.google.com/ServiceLogin", text: async () => "<html>" });
  await assert.rejects(ctx.pollForNoonOtpEmail("a@x.com", Date.now()), /Gmail not signed in for a@x\.com/);
});

test("OTP poll surfaces real Gmail API errors immediately", async () => {
  const { ctx } = loadOtpModules(() => { throw new Error("Gmail access denied — reconnect Gmail"); }, () => ({}));
  await assert.rejects(ctx.pollForNoonOtpEmail("a@x.com", Date.now()), /Gmail API: Gmail access denied/);
});

test("ghost mouse click fires exactly one click event (no double submit)", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "mouse.js"), "utf8");
  const dispatchBody = src
    .slice(src.indexOf('target.dispatchEvent(new MouseEvent("mouseup"'), src.indexOf("async function humanClick"))
    .replace(/\/\/.*$/gm, "");
  const nativeClicks = (dispatchBody.match(/target\.click\(\)/g) || []).length;
  const syntheticOutsideCatch = dispatchBody.replace(/catch \(_\) \{[\s\S]*?\}\n  \}/, "").match(/new MouseEvent\("click"/g) || [];
  assert.strictEqual(nativeClicks, 1);
  assert.strictEqual(syntheticOutsideCatch.length, 0);
});

// ---- background.js helpers (review fixes E3 / X7) ----
function loadBackground(chromeOverrides) {
  const listeners = { updated: new Set(), removed: new Set() };
  const chrome = Object.assign(
    {
      sidePanel: { setPanelBehavior: () => Promise.resolve() },
      runtime: { lastError: null },
      storage: { local: { get: async () => ({}), remove: async () => {} } },
      tabs: {
        onUpdated: { addListener: (f) => listeners.updated.add(f), removeListener: (f) => listeners.updated.delete(f) },
        onRemoved: { addListener: (f) => listeners.removed.add(f), removeListener: (f) => listeners.removed.delete(f) },
        get: (id, cb) => cb({ id, status: "loading" }),
      },
    },
    chromeOverrides || {},
  );
  const ctx = { chrome, console, setTimeout, clearTimeout, importScripts: () => {}, startDashboardRunPolling: () => {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "public", "background.js"), "utf8"), ctx);
  return { ctx, listeners };
}

test("E3: session-email check fails closed on {ok:false} (wrong account)", async () => {
  const { ctx } = loadBackground();
  ctx.sendMessageToTab = async () => ({ ok: false, error: "Wrong account: a@x.com" });
  await assert.rejects(ctx.assertSessionEmailOnTab(1, "b@x.com"), /Wrong account/);
  ctx.sendMessageToTab = async () => ({ pending: true });
  await assert.rejects(ctx.assertSessionEmailOnTab(1, "b@x.com"), /Could not verify/);
  ctx.sendMessageToTab = async () => ({ ok: true, email: "b@x.com" });
  assert.strictEqual((await ctx.assertSessionEmailOnTab(1, "b@x.com")).ok, true);
});

test("X7: waitForTabComplete rejects when the tab is closed and resolves on timeout", async () => {
  const { ctx, listeners } = loadBackground();
  const closed = ctx.waitForTabComplete(7, 5000);
  listeners.removed.forEach((f) => f(7));
  await assert.rejects(closed, /closed/);
  await ctx.waitForTabComplete(8, 10); // never completes → resolves after timeout
  const gone = loadBackground({ tabs: Object.assign({}, loadBackground().ctx.chrome.tabs, { get: (id, cb) => cb(undefined) }) });
  await assert.rejects(gone.ctx.waitForTabComplete(9, 5000), /closed/);
});

test("X11: auth bridge accepted only from own dashboard origins", () => {
  const manifest = {
    content_scripts: [
      { js: ["dashboardBridge.js"], matches: ["https://redeem.innovidio.com/*", "http://localhost:8000/*"] },
      { js: ["content.js"], matches: ["https://www.noon.com/*"] },
    ],
  };
  const ctx = { chrome: { runtime: { id: "me", getManifest: () => manifest, onMessage: { addListener() {} } } }, URL, console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "public", "messageRouter.js"), "utf8"), ctx);
  assert.strictEqual(ctx.dashboardSenderOrigin({ id: "me", url: "http://localhost:8000/x" }), "http://localhost:8000");
  assert.strictEqual(ctx.dashboardSenderOrigin({ id: "me", origin: "https://redeem.innovidio.com" }), "https://redeem.innovidio.com");
  assert.strictEqual(ctx.dashboardSenderOrigin({ id: "me", url: "https://www.noon.com/" }), "");
  assert.strictEqual(ctx.dashboardSenderOrigin({ id: "other-ext", url: "http://localhost:8000/" }), "");
});

test("E6: unconfirmed order is treated as done (never auto re-ordered)", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "batchRunner.js"), "utf8");
  const fn = src.slice(src.indexOf("function stageOrderDone"), src.indexOf("}", src.indexOf("function stageOrderDone")) + 1);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fn, ctx);
  assert.strictEqual(ctx.stageOrderDone("unconfirmed"), true);
  assert.strictEqual(ctx.stageOrderDone("success"), true);
  assert.strictEqual(ctx.stageOrderDone("failed"), false);
});

test("OTP feed: with the Continue-click time, a code from 20s earlier is never used", async () => {
  const clickedAt = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const { ctx } = loadOtpModules(() => { throw new Error("Gmail not connected — connect Gmail first"); }, () => ({}));
  let calls = 0;
  ctx.fetch = async (url) => {
    calls += 1;
    const entries = [{ title: "111111 is the OTP for your noon account verification", issued: iso(clickedAt - 20000) }];
    if (calls >= 2) entries.unshift({ title: "999999 is the OTP for your noon account verification", issued: iso(clickedAt + 1500) });
    return { ok: true, url, text: async () => atomFeed(entries) };
  };
  const found = await ctx.pollForNoonOtpEmail("a@x.com", clickedAt, 5000);
  assert.strictEqual(found.otp, "999999");
});

test("rate-limited login is not retried from profile (no extra OTP)", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "content", "11-session.js"), "utf8");
  const i = src.indexOf("retrying from profile");
  const before = src.slice(src.lastIndexOf("} catch (localErr) {", i), i);
  assert.ok(/too many requests\|proxy rotation is switched off/.test(before));
  assert.ok(before.indexOf("throw localErr") !== -1);
});

test("account menu toggle: clicked once, second click only if it did not open", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "content", "03b-signout.js"), "utf8");
  const fn = src.slice(src.indexOf("async function openProfileDropdown"), src.indexOf("async function clickSignOut"));
  assert.ok(fn.indexOf("dispatchNativeClick(") === -1, "no multi-click helper on a toggle");
  assert.ok(/await mouse\(\)\.click\(profileBtn\);\s*let opened = await waitFor/.test(fn));
  assert.ok(/if \(!opened\)/.test(fn));
});

test("unlock: waits for an unlock email that arrived after the lockout (ignores older ones)", async () => {
  const lockoutAt = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const { ctx } = loadOtpModules(() => ({}), () => ({}));
  let calls = 0;
  ctx.fetch = async (url) => {
    calls += 1;
    const entries = [{ title: "Unlock more sign in attempts", issued: iso(lockoutAt - 20 * 3600 * 1000) }];
    if (calls >= 3) entries.unshift({ title: "Unlock more sign in attempts", issued: iso(lockoutAt + 3000) });
    return { ok: true, url, text: async () => atomFeed(entries) };
  };
  assert.strictEqual(await ctx.waitForUnlockEmailInFeed("yw.aly808+newsletter@gmail.com", lockoutAt, 5000), true);
  assert.strictEqual(calls, 3);
  calls = -100; // only the old one ever
  assert.strictEqual(await ctx.waitForUnlockEmailInFeed("a@x.com", lockoutAt, 30), false);
});

// ---- serverSettings.js: lock during run + pin ----
function loadServerSettingsModule(opts) {
  const store = Object.assign({ noon_api_base_url: "http://localhost:8000", noon_access_token: "tok" }, opts.store || {});
  let listener = null;
  const ctx = {
    console, URL,
    isBatchRunActive: () => !!opts.runActive,
    getApiBaseUrl: async () => store.noon_api_base_url,
    setApiBaseUrl: async (v) => { store.noon_api_base_url = v; return v; },
    getConfiguredApiBaseUrl: () => "http://localhost:8000",
    getAuthToken: async () => store.noon_access_token || "",
    chrome: {
      runtime: { id: "me", onMessage: { addListener: (f) => { listener = f; } } },
      storage: { local: {
        get: async (k) => ({ [k]: store[k] }),
        set: async (o) => { Object.assign(store, o); },
        remove: async (ks) => { [].concat(ks).forEach((k) => delete store[k]); },
      } },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "public", "serverSettings.js"), "utf8"), ctx);
  return { ctx, store, listener: () => listener };
}

test("server: same dashboard always allowed; other dashboard allowed when not pinned and idle", async () => {
  const { ctx } = loadServerSettingsModule({});
  assert.strictEqual(await ctx.checkDashboardConnectAllowed("http://localhost:8000"), "");
  assert.strictEqual(await ctx.checkDashboardConnectAllowed("https://redeem.innovidio.com"), "");
});

test("server: locked to the current server while a run is active", async () => {
  const { ctx } = loadServerSettingsModule({ runActive: true });
  assert.match(await ctx.checkDashboardConnectAllowed("https://redeem.innovidio.com"), /run is in progress on http:\/\/localhost:8000/);
  const res = await ctx.saveServerSettings("https://redeem.innovidio.com", false);
  assert.strictEqual(res.ok, false);
});

test("server: pinned server ignores other dashboards", async () => {
  const { ctx } = loadServerSettingsModule({ store: { noon_api_base_url: "https://redeem.innovidio.com", noon_api_base_pinned: true } });
  assert.match(await ctx.checkDashboardConnectAllowed("http://localhost:8000"), /pinned to https:\/\/redeem\.innovidio\.com/);
  assert.strictEqual(await ctx.checkDashboardConnectAllowed("https://redeem.innovidio.com"), "");
});

test("server: switching server pins it and clears the old server's token; bad URL rejected", async () => {
  const { ctx, store } = loadServerSettingsModule({});
  const res = await ctx.saveServerSettings("https://redeem.innovidio.com/some/path", true);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.changed, true);
  assert.strictEqual(store.noon_api_base_url, "https://redeem.innovidio.com");
  assert.strictEqual(store.noon_api_base_pinned, true);
  assert.strictEqual(store.noon_access_token, undefined);
  assert.strictEqual((await ctx.saveServerSettings("javascript:alert(1)", false)).ok, false);
});

test("server: settings messages only accepted from the extension's own page", async () => {
  const { listener } = loadServerSettingsModule({});
  let reply = null;
  listener()({ type: "SET_SERVER_SETTINGS", apiBaseUrl: "https://evil.example", pinned: true },
    { id: "me", tab: { id: 3 }, url: "http://localhost:8000/" }, (r) => { reply = r; });
  assert.strictEqual(reply.ok, false);
  assert.strictEqual(reply.error, "Not allowed");
});

test("account switch trusts a clearly logged-out page over the remembered previous email", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "content", "11-session.js"), "utf8");
  const block = src.slice(src.indexOf("const clearlyLoggedOut"), src.indexOf("let didLogout"));
  assert.ok(/authState\.kind === "logged_out"/.test(block));
  assert.ok(/!clearlyLoggedOut && previous/.test(block));
  const acct = fs.readFileSync(path.join(__dirname, "..", "public", "content", "10-account.js"), "utf8");
  assert.ok(/Already signed out/.test(acct));
});

test("run ends with a best-effort sign-out; OTP screen is not padded with fixed waits", () => {
  const runner = fs.readFileSync(path.join(__dirname, "..", "public", "batchRunner.js"), "utf8");
  const fin = runner.slice(runner.indexOf("  } finally {\n    if (runTabId != null)"));
  assert.ok(/await logoutAtEndOfRun\(runTabId\)/.test(fin.slice(0, 200)));
  const msgs = fs.readFileSync(path.join(__dirname, "..", "public", "content", "17-messages.js"), "utf8");
  assert.ok(/RUN_BATCH_LOGOUT[\s\S]{0,200}logoutFromNoon\(\)/.test(msgs));
  const steps = fs.readFileSync(path.join(__dirname, "..", "public", "content", "09-login-steps.js"), "utf8");
  assert.ok(/if \(isOtpOnlyLogin\(\)\) return "otp";/.test(steps));
  assert.ok(/preferPasswordLogin\(afterContinue === "otp" \? 600 : 8000\)/.test(steps));
  const session = fs.readFileSync(path.join(__dirname, "..", "public", "content", "11-session.js"), "utf8");
  // the 1s post-sign-out pause is required (Noon's own redirect) — keep it
  assert.ok(/await pause\(1\);\s*logStep\("Opening profile page again…"\)/.test(session));
});

test("queued run wakes the extension immediately (dashboard → bridge → poll)", () => {
  const router = fs.readFileSync(path.join(__dirname, "..", "public", "messageRouter.js"), "utf8");
  assert.ok(/POLL_DASHBOARD_RUNS_NOW[\s\S]{0,250}dashboardSenderOrigin\(sender\)[\s\S]{0,150}pollDashboardRuns\(\)/.test(router));
  const bridge = fs.readFileSync(path.join(__dirname, "..", "public", "dashboardBridge.js"), "utf8");
  assert.ok(/NOON_POLL_RUNS[\s\S]{0,200}POLL_DASHBOARD_RUNS_NOW/.test(bridge));
  const controls = fs.readFileSync(path.join(__dirname, "..", "..", "backend", "app", "static", "admin", "controls.js"), "utf8");
  assert.ok(/postMessage\(\{ type: "NOON_POLL_RUNS" \}/.test(controls));
});

test("full-batch fixes: resume tolerates post-logout redirect; resume point saved before profile nav; one OTP cooldown retry", () => {
  const resume = fs.readFileSync(path.join(__dirname, "..", "public", "content", "18-resume.js"), "utf8");
  assert.ok(/isLoggedOutState\(\) && findNavbarLogIn\(\)/.test(resume));
  assert.ok(/profileRetry: true/.test(resume));
  const session = fs.readFileSync(path.join(__dirname, "..", "public", "content", "11-session.js"), "utf8");
  assert.ok(/persistBatchAccountLogin\(payload, "login_profile"\);\s*await openProfilePage\(\)/.test(session));
  const otp = fs.readFileSync(path.join(__dirname, "..", "public", "content", "03a-otp-gmail.js"), "utf8");
  assert.ok(/attempt <= 2/.test(otp) && /too many requests/i.test(otp));
  assert.ok(session.split("\n").length <= 350);
});

test("rate-limited rows are re-queued once after a cooldown; login step has a watchdog", () => {
  const r = fs.readFileSync(path.join(__dirname, "..", "public", "batchRunner.js"), "utf8");
  assert.ok(/queue\.push\(\{ id: row\.id, retry: true \}\)/.test(r));
  assert.ok(/!item\.retry &&[\s\S]{0,120}too many requests/.test(r));
  assert.ok(/if \(item\.retry && !cooledDown\)/.test(r));
  assert.ok((r.match(/withLoginTimeout\(runLogin\(\), tabId\)/g) || []).length === 2);
});

test("rows are paced (pause before every row after the first, skipped for the cooldown retry)", () => {
  const r = fs.readFileSync(path.join(__dirname, "..", "public", "batchRunner.js"), "utf8");
  assert.ok(/const ROW_PACING_MS = \d+;/.test(r));
  assert.ok(/\} else if \(i > 0\) \{\s*await paceBeforeNextRow\(batchId\);/.test(r));
});
