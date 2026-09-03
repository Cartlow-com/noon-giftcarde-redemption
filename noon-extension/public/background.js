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
  if (opts.forceNewWindow) {
    const win = await chrome.windows.create({
      url: NOON_HOME,
      focused: true,
      type: "normal",
    });
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

  const tab = await chrome.tabs.create({ url: NOON_HOME, active: true });
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

importScripts("messageRouter.js");
