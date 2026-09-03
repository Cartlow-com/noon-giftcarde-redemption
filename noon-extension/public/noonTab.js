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
        (/127\.0\.0\.1:8000|localhost:8000|redeem\.cartlow\.com/i.test(u) ||
          /\/admin\b/i.test(u))
      );
    });
    if (hit && hit.windowId != null) return hit.windowId;
  } catch (_) {}
  return null;
}

/**
 * Dedicated Noon browser window (not the dashboard). Open once; reuse for all rows.
 */
async function getOrCreateNoonTab(options) {
  const opts = options || {};
  const hideWindow = !!opts.hideWindow;
  const dashboardWindowId = await getDashboardWindowId();

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

  async function findTabInWindow(windowId) {
    if (windowId == null) return null;
    try {
      const win = await chrome.windows.get(windowId, { populate: true });
      if (!win || !win.tabs) return null;
      const noonTab = win.tabs.find(function (t) {
        return t.id != null && t.url && /noon\.com/i.test(t.url);
      });
      if (noonTab && noonTab.id != null) return noonTab.id;
      const any = win.tabs.find(function (t) {
        return t.id != null;
      });
      if (any && any.id != null) {
        await chrome.tabs.update(any.id, { url: NOON_PROFILE, active: true });
        await waitForTabComplete(any.id);
        return any.id;
      }
    } catch (_) {
      if (noonBotWindowId === windowId) noonBotWindowId = null;
    }
    return null;
  }

  const rememberedId = await loadRememberedNoonWindowId();
  if (rememberedId != null && rememberedId !== dashboardWindowId) {
    const tabId = await findTabInWindow(rememberedId);
    if (tabId != null) return prepareExistingTab(tabId);
  }

  const tabs = await chrome.tabs.query({ url: NOON_URL_PATTERN });
  const other = tabs
    .filter(function (t) {
      return t.id != null && t.windowId != null && t.windowId !== dashboardWindowId;
    })
    .sort(function (a, b) {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (b.lastAccessed || 0) - (a.lastAccessed || 0);
    });
  if (other.length > 0 && other[0].id != null) {
    return prepareExistingTab(other[0].id);
  }

  let width = 1280;
  let height = 900;
  try {
    const current = await chrome.windows.getCurrent();
    if (current.width && current.height) {
      width = Math.max(1100, current.width);
      height = Math.max(750, current.height);
    }
  } catch (_) {}

  const win = await chrome.windows.create({
    url: NOON_PROFILE,
    focused: !hideWindow,
    type: "normal",
    state: hideWindow ? "minimized" : "normal",
    width: width,
    height: height,
  });
  if (!win || win.id == null) throw new Error("Failed to open Noon window");
  await rememberNoonWindow(win.id);
  try {
    if (hideWindow) {
      await chrome.windows.update(win.id, { state: "minimized", focused: false });
    } else {
      await chrome.windows.update(win.id, { state: "maximized", focused: true });
    }
  } catch (_) {}

  const tabId = win.tabs && win.tabs[0] && win.tabs[0].id;
  if (tabId == null) throw new Error("Failed to open Noon tab in new window");
  await waitForTabComplete(tabId);
  try {
    await chrome.tabs.sendMessage(tabId, { type: "RECOVER_PAGE_IF_NEEDED" });
  } catch (_) {}
  return tabId;
}
