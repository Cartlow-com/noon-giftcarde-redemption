const PANEL_WIDTH = 560;
const PANEL_HEIGHT = 820;

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error(err));

importScripts("apiConfig.js", "batchApi.js", "noonProxy.js", "batchRunner.js", "cartTest.js", "runPoller.js");

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

const TAB_COMPLETE_TIMEOUT_MS = 60000;

/**
 * Resolve when the tab finishes loading. Bounded: a page that never reports
 * "complete" resolves after 60s (callers' own checks take over); a closed tab
 * rejects instead of hanging the run forever.
 */
function waitForTabComplete(tabId, timeoutMs = TAB_COMPLETE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let done = false;
    function finish(error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      if (error) reject(error);
      else resolve();
    }
    function onUpdated(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === "complete") finish();
    }
    function onRemoved(removedTabId) {
      if (removedTabId === tabId) finish(new Error("Tab was closed while loading"));
    }
    const timer = setTimeout(() => finish(), timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        finish(new Error("Tab was closed while loading"));
        return;
      }
      if (tab.status === "complete") finish();
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
      // The page navigated mid-step: its content script resumes from the saved
      // flow state by itself. Re-sending would start a second copy of the step
      // (duplicate Continue → extra OTP emails → "Too many requests"; duplicate
      // place-order). Hand back "pending" so runFlowStep waits for that flow.
      const saved = await chrome.storage.local.get("noon_flow_state");
      if (saved && saved.noon_flow_state && saved.noon_flow_state.active) {
        return { pending: true };
      }
      // No flow started yet — content script may not be injected; wait, don't reload.
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
  // A previous step (e.g. redeem) can leave its "done" marker behind; never let
  // that stale {ok:true} stand in for this account check.
  await chrome.storage.local.remove(["noon_flow_done", "noon_flow_result"]);
  const result = await sendMessageToTab(
    tabId,
    {
      type: "ASSERT_SESSION_EMAIL",
      email: email,
    },
    attempts,
  );
  // Fail closed: the page answers {ok:false, error} on a wrong account (it does
  // not throw). Anything but an explicit ok must stop redeem / place-order.
  if (!result || result.ok !== true) {
    const err = new Error(
      (result && result.error) || "Could not verify the logged-in Noon account — refusing to continue",
    );
    if (result && result.cancelled) err.cancelled = true;
    throw err;
  }
  return result;
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

importScripts("noonTab.js", "gmailTab.js", "otpTab.js", "unlockTab.js", "serverSettings.js", "messageRouter.js");
