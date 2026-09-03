const PANEL_WIDTH = 560;
const PANEL_HEIGHT = 820;

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error(err));

importScripts("apiConfig.js", "batchApi.js", "batchRunner.js", "runPoller.js");

startDashboardRunPolling();

async function openWidePanelWindow() {
  const url = chrome.runtime.getURL("popup.html");
  await chrome.windows.create({
    url,
    type: "popup",
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    focused: true,
  });
}

const NOON_HOME = "https://www.noon.com/uae-en/";
const NOON_URL_PATTERN = "https://*.noon.com/*";
const NOON_PROFILE = "https://account.noon.com/uae-en/profile/";

let activeLoginTabId = null;

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, (tab) => {
      if (tab.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const FLOW_DONE_KEY = "noon_flow_done";

async function waitForFlowDone(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (typeof isBatchRunCancelled === "function" && isBatchRunCancelled()) {
      return { ok: false, cancelled: true };
    }
    const data = await chrome.storage.local.get([
      FLOW_DONE_KEY,
      "noon_flow_result",
      "noon_flow_state",
    ]);
    if (data[FLOW_DONE_KEY]) {
      const result = data.noon_flow_result || { ok: true };
      await chrome.storage.local.remove([FLOW_DONE_KEY, "noon_flow_result"]);
      return result;
    }
    if (!data.noon_flow_state?.active && Date.now() - start > 3000) {
      return null;
    }
    await delay(500);
  }
  return null;
}

async function hardRefreshTab(tabId) {
  await chrome.tabs.reload(tabId, { bypassCache: true });
  await waitForTabComplete(tabId);
  await delay(500);
}

async function sendMessageToTab(tabId, message, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    if (typeof isBatchRunCancelled === "function" && isBatchRunCancelled()) {
      return { ok: false, cancelled: true };
    }
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response;
    } catch (_) {
      if (i < attempts - 1) {
        try {
          await hardRefreshTab(tabId);
        } catch (_) {}
      }
      const resumed = await waitForFlowDone(90000);
      if (resumed && resumed.cancelled) return resumed;
      if (resumed) return resumed;
      await delay(800 + i * 400);
    }
  }
  try {
    await hardRefreshTab(tabId);
    const response = await chrome.tabs.sendMessage(tabId, message);
    return response;
  } catch (_) {}
  throw new Error("Could not reach Noon page after refresh — try again.");
}

async function sendLoginToTab(tabId, payload, attempts = 3) {
  return sendMessageToTab(
    tabId,
    {
      type: "RUN_LOGIN",
      email: payload.email,
      password: payload.password,
      giftCardNumber: payload.giftCardNumber,
      giftCardPin: payload.giftCardPin,
    },
    attempts,
  );
}

async function sendCartToTab(tabId, payload, attempts = 3) {
  return sendMessageToTab(
    tabId,
    {
      type: "RUN_CART",
      email: payload.email,
      password: payload.password,
      productUrl: payload.productUrl,
    },
    attempts,
  );
}

async function sendBatchLoginToTab(tabId, payload, attempts = 3) {
  return sendMessageToTab(
    tabId,
    { type: "RUN_BATCH_LOGIN", email: payload.email, password: payload.password },
    attempts,
  );
}

async function sendBatchRedeemToTab(tabId, payload, attempts = 3) {
  return sendMessageToTab(
    tabId,
    {
      type: "RUN_BATCH_REDEEM",
      email: payload.email,
      password: payload.password,
      giftCardNumber: payload.giftCardNumber,
      giftCardPin: payload.giftCardPin,
      accountVerified: payload.accountVerified === true,
    },
    attempts,
  );
}

async function prepareCreditsScreenshotOnTab(tabId, kind, attempts = 3) {
  return sendMessageToTab(
    tabId,
    {
      type: "PREPARE_CREDITS_SCREENSHOT",
      kind: kind === "after" ? "after" : "before",
    },
    attempts,
  );
}

async function assertSessionEmailOnTab(tabId, email, attempts = 3) {
  return sendMessageToTab(
    tabId,
    {
      type: "ASSERT_SESSION_EMAIL",
      email: email,
    },
    attempts,
  );
}

async function sendBatchAccountToTab(tabId, payload, attempts = 3) {
  return sendMessageToTab(
    tabId,
    {
      type: "RUN_BATCH_ACCOUNT",
      email: payload.email,
      password: payload.password,
      previousEmail: payload.previousEmail,
    },
    attempts,
  );
}

async function sendBatchCartToTab(tabId, payload, attempts = 3) {
  return sendMessageToTab(
    tabId,
    {
      type: "RUN_BATCH_CART",
      email: payload.email,
      password: payload.password,
      productUrl: payload.productUrl,
      rowNumber: payload.rowNumber,
      placeOrder: payload.placeOrder,
    },
    attempts,
  );
}

async function navigateTabToProfile(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || tab.url.indexOf("/profile") === -1) {
    await chrome.tabs.update(tabId, { url: NOON_PROFILE });
    await waitForTabComplete(tabId);
    await delay(800);
  }
  try {
    await chrome.tabs.sendMessage(tabId, { type: "RECOVER_PAGE_IF_NEEDED" });
  } catch (_) {}
}

async function getOrCreateNoonTab(options) {
  const opts = options || {};
  const hideWindow = !!opts.hideWindow;
  if (opts.forceNewWindow) {
    let width = 1280;
    let height = 900;
    let left = 40;
    let top = 40;
    try {
      const current = await chrome.windows.getCurrent();
      if (current.width && current.height) {
        width = Math.max(1100, current.width);
        height = Math.max(750, current.height);
        left = typeof current.left === "number" ? current.left : left;
        top = typeof current.top === "number" ? current.top : top;
      }
    } catch (_) {}

    const win = await chrome.windows.create({
      url: NOON_PROFILE,
      focused: !hideWindow,
      type: "normal",
      state: "normal",
      width: width,
      height: height,
      left: left,
      top: top,
    });
    try {
      if (win && win.id != null) {
        if (hideWindow) {
          await chrome.windows.update(win.id, { state: "minimized", focused: false });
        } else {
          await chrome.windows.update(win.id, { state: "maximized", focused: true });
        }
      }
    } catch (_) {}

    const tabId = win.tabs && win.tabs[0] && win.tabs[0].id;
    if (tabId == null) throw new Error("Failed to open Noon window");
    await waitForTabComplete(tabId);
    await delay(400);
    try {
      await chrome.tabs.sendMessage(tabId, { type: "RECOVER_PAGE_IF_NEEDED" });
    } catch (_) {}
    return tabId;
  }

  const tabs = await chrome.tabs.query({ url: NOON_URL_PATTERN });
  if (tabs.length > 0 && tabs[0].id != null) {
    const tabId = tabs[0].id;
    await chrome.tabs.update(tabId, { active: true });
    await waitForTabComplete(tabId);
    await delay(200);
    try {
      await chrome.tabs.sendMessage(tabId, { type: "RECOVER_PAGE_IF_NEEDED" });
    } catch (_) {
      try {
        await hardRefreshTab(tabId);
      } catch (_) {}
    }
    return tabId;
  }

  const tab = await chrome.tabs.create({ url: NOON_PROFILE, active: true });
  if (tab.id == null) throw new Error("Failed to open Noon tab");
  await waitForTabComplete(tab.id);
  await delay(400);
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "RECOVER_PAGE_IF_NEEDED" });
  } catch (_) {}
  return tab.id;
}

async function cancelLoginOnTab(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "CANCEL_LOGIN" });
    return true;
  } catch (_) {
    return false;
  }
}

/** Wipe Noon auth cookies so the next row cannot inherit the previous account. */
async function clearNoonSessionCookies() {
  const domains = [".noon.com", "noon.com", "www.noon.com", "account.noon.com", "login.noon.com"];
  let removed = 0;
  for (let d = 0; d < domains.length; d++) {
    const cookies = await chrome.cookies.getAll({ domain: domains[d] });
    for (let i = 0; i < cookies.length; i++) {
      const c = cookies[i];
      const host = (c.domain || "").replace(/^\./, "");
      if (!host) continue;
      const url = (c.secure ? "https://" : "http://") + host + (c.path || "/");
      try {
        await chrome.cookies.remove({ url: url, name: c.name });
        removed += 1;
      } catch (_) {}
    }
  }
  await chrome.storage.local.remove(["noon_batch_session_email"]);
  return { ok: true, removed: removed };
}

importScripts("messageRouter.js");
