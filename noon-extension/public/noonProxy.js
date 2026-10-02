/**
 * noonProxy.js — apply/clear Chrome PAC proxy for Noon hosts only.
 * Loaded into the service worker via importScripts from background.js.
 */

const NOON_PROXY_STORAGE_KEY = "noon_active_proxy";

function buildNoonPacScript(host, port) {
  const h = String(host || "").replace(/[^a-zA-Z0-9.:_-]/g, "");
  const p = Number(port) || 0;
  if (!h || !p) throw new Error("Invalid proxy host/port");
  // Free-list "HTTPS://host:port" entries are usually HTTP CONNECT proxies.
  return (
    "function FindProxyForURL(url, host) {\n" +
    "  host = host.toLowerCase();\n" +
    "  if (host === 'noon.com' || host === 'www.noon.com' || host === 'account.noon.com' ||\n" +
    "      dnsDomainIs(host, '.noon.com')) {\n" +
    "    return 'PROXY " + h + ":" + p + "'; DIRECT';\n" +
    "  }\n" +
    "  return 'DIRECT';\n" +
    "}\n"
  );
}

async function applyNoonProxy(proxy) {
  if (!proxy || !proxy.host || !proxy.port) {
    throw new Error("Proxy host/port required");
  }
  const pac = buildNoonPacScript(proxy.host, proxy.port);
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
