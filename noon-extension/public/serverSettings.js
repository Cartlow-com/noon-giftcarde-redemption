/**
 * serverSettings.js — which backend the extension talks to.
 *  - The side panel picks a server (Production / Local / Custom) and can PIN it.
 *  - While a run is active the server never changes (its updates must reach the
 *    server that owns the run).
 *  - When pinned, only a dashboard on that server can connect the extension.
 * Loaded into the service worker via importScripts from background.js
 * (before messageRouter.js, which calls checkDashboardConnectAllowed).
 */

const API_BASE_PINNED_KEY = "noon_api_base_pinned";

const SERVER_PRESETS = [
  { id: "production", label: "Production", url: "https://redeem.innovidio.com" },
  { id: "local", label: "Local (this PC)", url: "http://localhost:8000" },
];

function normalizeServerOrigin(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.origin;
  } catch (_) {
    return "";
  }
}

async function isServerPinned() {
  const data = await chrome.storage.local.get(API_BASE_PINNED_KEY);
  return data[API_BASE_PINNED_KEY] === true;
}

async function currentServerOrigin() {
  try {
    return normalizeServerOrigin(await getApiBaseUrl());
  } catch (_) {
    return "";
  }
}

/** "" if a dashboard on senderOrigin may connect, else a user-facing reason. */
async function checkDashboardConnectAllowed(senderOrigin) {
  const current = await currentServerOrigin();
  if (!current || current === senderOrigin) return "";
  const runActive = typeof isBatchRunActive === "function" && isBatchRunActive();
  if (runActive) {
    return (
      "A run is in progress on " + current +
      " — stop it or let it finish before connecting this dashboard"
    );
  }
  if (await isServerPinned()) {
    return (
      "Extension is pinned to " + current +
      " — change Server in the extension side panel to connect this dashboard"
    );
  }
  return "";
}

async function getServerSettings() {
  return {
    ok: true,
    apiBaseUrl: await currentServerOrigin(),
    defaultBase: normalizeServerOrigin(getConfiguredApiBaseUrl()),
    pinned: await isServerPinned(),
    runActive: typeof isBatchRunActive === "function" && isBatchRunActive(),
    hasToken: !!(await getAuthToken()),
    presets: SERVER_PRESETS,
  };
}

async function saveServerSettings(apiBaseUrl, pinned) {
  const next = normalizeServerOrigin(apiBaseUrl);
  if (!next) return { ok: false, error: "Enter a valid http(s) server address" };
  const current = await currentServerOrigin();
  const changed = next !== current;
  if (changed && typeof isBatchRunActive === "function" && isBatchRunActive()) {
    return { ok: false, error: "A run is in progress on " + current + " — stop it before switching server" };
  }
  await setApiBaseUrl(next);
  await chrome.storage.local.set({ [API_BASE_PINNED_KEY]: !!pinned });
  if (changed) {
    // A login token belongs to one server — reconnect from the new server's dashboard.
    await chrome.storage.local.remove(["noon_access_token", "noon_refresh_token"]);
  }
  return Object.assign(await getServerSettings(), { changed: changed });
}

function isFromOwnExtensionPage(sender) {
  return !!(
    sender &&
    sender.id === chrome.runtime.id &&
    String(sender.url || "").indexOf("chrome-extension://" + chrome.runtime.id + "/") === 0
  );
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || (message.type !== "GET_SERVER_SETTINGS" && message.type !== "SET_SERVER_SETTINGS")) {
    return false;
  }
  // Only the extension's own side panel may read/change the server.
  if (!isFromOwnExtensionPage(sender)) {
    sendResponse({ ok: false, error: "Not allowed" });
    return false;
  }
  (async () => {
    try {
      if (message.type === "GET_SERVER_SETTINGS") {
        sendResponse(await getServerSettings());
      } else {
        sendResponse(await saveServerSettings(message.apiBaseUrl, message.pinned));
      }
    } catch (error) {
      sendResponse({ ok: false, error: (error && error.message) || "Server settings failed" });
    }
  })();
  return true;
});
