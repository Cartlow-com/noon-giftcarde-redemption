/**
 * noonProxy.js — apply/clear Chrome PAC proxy for Noon hosts only.
 * Loaded into the service worker via importScripts from background.js.
 */

const NOON_PROXY_STORAGE_KEY = "noon_active_proxy";
const MAX_PROXY_ERROR_ROTATIONS = 3;
const NOON_FLOW_STATE_KEY = "noon_flow_state"; // same key as content/01-core.js
const PROXY_RELOAD_SETTLE_MS = 15000;

let proxyErrorHandling = false;
let proxyErrorRotations = 0;

function buildNoonPacScript(host, port, scheme) {
  const h = String(host || "").replace(/[^a-zA-Z0-9.:_-]/g, "");
  const p = Number(port) || 0;
  if (!h || !p) throw new Error("Invalid proxy host/port");
  // Free-list "HTTPS://host:port" entries are usually HTTP CONNECT proxies.
  const s = String(scheme || "http").toLowerCase();
  const directive = s.indexOf("socks") === 0 ? "SOCKS5" : "PROXY";
  // No DIRECT fallback: a dead proxy must fail (→ rotate), not silently leak the real IP.
  return (
    "function FindProxyForURL(url, host) {\n" +
    "  host = host.toLowerCase();\n" +
    "  if (host === 'noon.com' || host === 'www.noon.com' || host === 'account.noon.com' ||\n" +
    "      dnsDomainIs(host, '.noon.com')) {\n" +
    "    return '" + directive + " " + h + ":" + p + "';\n" +
    "  }\n" +
    "  return 'DIRECT';\n" +
    "}\n"
  );
}

async function applyNoonProxy(proxy) {
  if (!proxy || !proxy.host || !proxy.port) {
    throw new Error("Proxy host/port required");
  }
  const pac = buildNoonPacScript(proxy.host, proxy.port, proxy.scheme);
  await chrome.proxy.settings.set({
    value: {
      mode: "pac_script",
      pacScript: { data: pac },
    },
    scope: "regular",
  });
  await chrome.storage.local.set({
    [NOON_PROXY_STORAGE_KEY]: {
      id: proxy.id,
      host: proxy.host,
      port: proxy.port,
      scheme: proxy.scheme || "http",
      raw: proxy.proxy || "",
    },
  });
  return {
    ok: true,
    id: proxy.id,
    host: proxy.host,
    port: proxy.port,
  };
}

async function clearNoonProxy() {
  proxyErrorRotations = 0;
  try {
    await chrome.proxy.settings.clear({ scope: "regular" });
  } catch (_) {}
  await chrome.storage.local.remove(NOON_PROXY_STORAGE_KEY);
  return { ok: true };
}

async function getActiveNoonProxy() {
  const stored = await chrome.storage.local.get(NOON_PROXY_STORAGE_KEY);
  return stored[NOON_PROXY_STORAGE_KEY] || null;
}

async function fetchNextProxyFromApi() {
  return batchApiRequest("/proxies/next");
}

async function blockProxyOnApi(proxyId) {
  if (proxyId == null) return null;
  return batchApiRequest(`/proxies/${encodeURIComponent(proxyId)}/block`, {
    method: "POST",
  });
}

/**
 * Mark current proxy blocked (if any), fetch a random new one, apply PAC.
 */
async function rotateNoonProxy() {
  const current = await getActiveNoonProxy();
  if (current && current.id != null) {
    try {
      await blockProxyOnApi(current.id);
    } catch (_) {}
  }
  const next = await fetchNextProxyFromApi();
  const applied = await applyNoonProxy(next);
  emitBatch({
    type: "BATCH_PROGRESS",
    stage: "login",
    status: "info",
    message: "Proxy rotate → " + applied.host + ":" + applied.port + " (id=" + applied.id + ")",
  });
  return applied;
}

/** Resolve when the tab finishes loading (or after timeoutMs / if it closes). */
function waitForTabSettled(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }
    function onUpdated(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === "complete") finish();
    }
    const timer = setTimeout(finish, timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

/** An in-flight login already consumed resumeOnLoad — re-arm it so the reload resumes. */
async function rearmFlowResume() {
  try {
    const data = await chrome.storage.local.get(NOON_FLOW_STATE_KEY);
    const state = data && data[NOON_FLOW_STATE_KEY];
    if (state && state.active && !state.resumeOnLoad) {
      await chrome.storage.local.set({
        [NOON_FLOW_STATE_KEY]: Object.assign({}, state, { resumeOnLoad: true }),
      });
    }
  } catch (_) {}
}

async function reloadNoonBotTab() {
  let tabIds = [];
  if (typeof activeLoginTabId === "number") {
    tabIds = [activeLoginTabId];
  } else {
    const tabs = await chrome.tabs.query({
      url: ["https://www.noon.com/*", "https://account.noon.com/*"],
    });
    tabIds = tabs.map((tab) => tab.id).filter((id) => id != null);
  }
  await rearmFlowResume();
  const settled = [];
  for (const tabId of tabIds) {
    try {
      const waiter = waitForTabSettled(tabId, PROXY_RELOAD_SETTLE_MS);
      await chrome.tabs.reload(tabId, { bypassCache: true });
      settled.push(waiter);
    } catch (_) {}
  }
  await Promise.all(settled);
}

/**
 * Chrome failed to use the applied proxy (e.g. ERR_TUNNEL_CONNECTION_FAILED).
 * The tab is now on a chrome-error page where content scripts never run, so the
 * login flow cannot notice or recover by itself. Block the dead proxy, rotate to
 * a working one during a run (bounded), otherwise go DIRECT, then reload Noon so
 * the saved flow state resumes.
 */
async function handleNoonProxyError(details) {
  // Fires once per failed subrequest — claim synchronously (before any await) so a
  // burst of events handles the dead proxy once and never blames its replacement.
  if (proxyErrorHandling) return;
  proxyErrorHandling = true;
  const active = await getActiveNoonProxy();
  if (!active) {
    proxyErrorHandling = false;
    return;
  }
  try {
    const reason = (details && details.error) || "proxy error";
    let next = null;
    const runActive = typeof isBatchRunActive === "function" && isBatchRunActive();
    if (runActive && proxyErrorRotations < MAX_PROXY_ERROR_ROTATIONS) {
      proxyErrorRotations += 1;
      try {
        next = await rotateNoonProxy(); // blocks the dead proxy, applies a probed one
      } catch (_) {
        next = null;
      }
    } else {
      try {
        await blockProxyOnApi(active.id);
      } catch (_) {}
    }
    if (!next) {
      const rotations = proxyErrorRotations;
      await clearNoonProxy();
      proxyErrorRotations = rotations;
    }
    if (typeof emitBatch === "function") {
      emitBatch({
        type: "BATCH_PROGRESS",
        stage: "login",
        status: "info",
        message:
          "Proxy " + active.host + ":" + active.port + " failed (" + reason + ") — " +
          (next ? "switched to " + next.host + ":" + next.port : "no working proxy, using direct connection") +
          ", reloading Noon",
      });
    }
    // Stay claimed until the reloaded page settles: late errors from the dead
    // proxy's in-flight subrequests must not be blamed on the new proxy.
    await reloadNoonBotTab();
  } finally {
    proxyErrorHandling = false;
  }
}

if (chrome.proxy && chrome.proxy.onProxyError) {
  chrome.proxy.onProxyError.addListener((details) => {
    handleNoonProxyError(details).catch((error) => {
      console.warn("[noon] proxy error handling failed", error);
    });
  });
}

// A freshly started service worker has no live run (run state is in memory), so
// any proxy still applied was left by a crashed/killed worker — clear it so Noon
// isn't stuck behind a dead proxy outside of runs.
if (chrome.proxy && chrome.proxy.settings) {
  clearNoonProxy().catch(() => {});
}
