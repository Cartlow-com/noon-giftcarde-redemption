const NOON_HOME = "https://www.noon.com/uae-en/";
const NOON_URL_PATTERN = "https://*.noon.com/*";
const NOON_PROFILE = "https://account.noon.com/uae-en/profile/";
const NOON_BOT_WINDOW_KEY = "noon_bot_window_id";

let noonBotWindowId = null;

async function navigateTabToProfile(tabId) {
  await chrome.tabs.update(tabId, { url: NOON_PROFILE });
  await waitForTabComplete(tabId);
  try {
    await chrome.tabs.sendMessage(tabId, { type: "RECOVER_PAGE_IF_NEEDED" });
  } catch (_) {}
}

async function rememberNoonWindow(windowId) {
  if (windowId == null) return;
  noonBotWindowId = windowId;
  try {
    await chrome.storage.local.set({ [NOON_BOT_WINDOW_KEY]: windowId });
  } catch (_) {}
}

async function loadRememberedNoonWindowId() {
  if (noonBotWindowId != null) return noonBotWindowId;
  try {
    const data = await chrome.storage.local.get([NOON_BOT_WINDOW_KEY]);
    if (data[NOON_BOT_WINDOW_KEY] != null) noonBotWindowId = data[NOON_BOT_WINDOW_KEY];
  } catch (_) {}
  return noonBotWindowId;
}

async function getDashboardWindowId() {
  try {
    const current = await chrome.windows.getCurrent();
    if (current && current.id != null) return current.id;
  } catch (_) {}
  try {
    const adminTabs = await chrome.tabs.query({});
    const hit = adminTabs.find(function (t) {
      const u = t.url || "";
      return (
        t.windowId != null &&
        (/127\.0\.0\.1:8000|localhost:8000|redeem\.innovidio\.com/i.test(u) ||
          /\/admin\b/i.test(u))
      );
    });
    if (hit && hit.windowId != null) return hit.windowId;
  } catch (_) {}
  return null;
}

/**
 * Reuse any existing Noon tab. Open one normal tab only when none exists.
 */
async function getOrCreateNoonTab(options) {
  const opts = options || {};
  const hideWindow = !!opts.hideWindow;

  async function prepareExistingTab(tabId) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.windowId != null) {
      await rememberNoonWindow(tab.windowId);
      try {
        if (hideWindow) {
          await chrome.windows.update(tab.windowId, { state: "minimized", focused: false });
        } else {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
      } catch (_) {}
    }
    await chrome.tabs.update(tabId, { active: true });
    await waitForTabComplete(tabId);
    try {
      await chrome.tabs.sendMessage(tabId, { type: "RECOVER_PAGE_IF_NEEDED" });
    } catch (_) {
      await delay(150);
    }
    return tabId;
  }

  const tabs = await chrome.tabs.query({ url: NOON_URL_PATTERN });
  const existing = tabs
    .filter(function (t) {
      return t.id != null;
    })
    .sort(function (a, b) {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (b.lastAccessed || 0) - (a.lastAccessed || 0);
    });
  if (existing.length > 0 && existing[0].id != null) {
    return prepareExistingTab(existing[0].id);
  }

  let createProps = { url: NOON_PROFILE, active: !hideWindow };
  try {
    const dashboardWindowId = await getDashboardWindowId();
    if (dashboardWindowId != null) createProps.windowId = dashboardWindowId;
  } catch (_) {}

  const tab = await chrome.tabs.create(createProps);
  if (!tab || tab.id == null) throw new Error("Failed to open Noon tab");
  if (tab.windowId != null) await rememberNoonWindow(tab.windowId);
  try {
    if (tab.windowId != null && !hideWindow) await chrome.windows.update(tab.windowId, { focused: true });
  } catch (_) {}

  await waitForTabComplete(tab.id);
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "RECOVER_PAGE_IF_NEEDED" });
  } catch (_) {}
  return tab.id;
}
