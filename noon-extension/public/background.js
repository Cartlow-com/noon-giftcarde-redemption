const PANEL_WIDTH = 560;
const PANEL_HEIGHT = 820;

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error(err));

importScripts("apiConfig.js", "batchApi.js", "noonProxy.js", "batchRunner.js", "runPoller.js");

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
      // Content script may not be injected yet after navigation — wait, don't reload.
      const resumed = await waitForFlowDone(i === 0 ? 2500 : 8000);
      if (resumed && resumed.cancelled) return resumed;
      if (resumed) return resumed;
      await delay(200 + i * 200);
    }
  }
  // Last resort only — one refresh if the page never answered.
  try {
    await hardRefreshTab(tabId);
    await delay(200);
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
      couponCode: payload.couponCode,
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
      couponCode: payload.couponCode,
      rowNumber: payload.rowNumber,
      placeOrder: payload.placeOrder,
    },
    attempts,
  );
}

async function cancelLoginOnTab(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "CANCEL_LOGIN" });
    return true;
  } catch (_) {
    return false;
  }
}

const GMAIL_SEARCH_URL =
  "https://mail.google.com/mail/u/0/#search/" +
  encodeURIComponent("noon OTP OR verification OR login newer_than:1d");

// Gmail is a SPA — navigating to a hash URL often doesn't trigger a real page
// load, so waitForTabComplete fires immediately before results render.
// After any Gmail tab navigation we inject an extra settle delay.
async function navigateGmailTab(tabId, url) {
  await chrome.tabs.update(tabId, { url, active: true });
  // Wait for the tab to signal "complete" (may be instant on SPA navigation)
  await waitForTabComplete(tabId);
  // Extra settle: Gmail needs time to re-render search results after hash change
  await delay(1800);
}

async function getOrCreateGmailTab() {
  const tabs = await chrome.tabs.query({ url: "https://mail.google.com/*" });
  const existing = tabs.find((tab) => tab.id != null);

  if (existing && existing.id != null) {
    // Tab already open — focus its window then navigate to search URL
    if (existing.windowId != null) {
      try { await chrome.windows.update(existing.windowId, { focused: true }); } catch (_) {}
    }
    await navigateGmailTab(existing.id, GMAIL_SEARCH_URL);
    return existing.id;
  }

  // No Gmail tab — open one and wait for it to fully load
  const created = await chrome.tabs.create({ url: GMAIL_SEARCH_URL, active: true });
  if (created.windowId != null) {
    try { await chrome.windows.update(created.windowId, { focused: true }); } catch (_) {}
  }
  if (created.id == null) throw new Error("Could not open Gmail tab");
  await waitForTabComplete(created.id);
  // Newly opened tabs need extra time for Gmail's full boot
  await delay(2500);
  return created.id;
}

async function sendMessageToAnyTab(tabId, message, attempts = 10) {
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      lastError = error;
      // Exponential backoff — content script may still be initializing
      await delay(400 + i * 200);
    }
  }
  throw lastError || new Error("Tab did not respond after retries");
}


// OTP tab helpers live in otpTab.js (importScripts below).

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

importScripts("noonTab.js", "otpTab.js", "messageRouter.js");
