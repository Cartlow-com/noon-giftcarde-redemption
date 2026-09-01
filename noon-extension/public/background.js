chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error(err));

const NOON_HOME = "https://www.noon.com/uae-en/";
const NOON_URL_PATTERN = "https://*.noon.com/*";

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
    const data = await chrome.storage.local.get([FLOW_DONE_KEY, "noon_flow_state"]);
    if (data[FLOW_DONE_KEY]) {
      await chrome.storage.local.remove(FLOW_DONE_KEY);
      return { ok: true };
    }
    if (!data.noon_flow_state?.active && Date.now() - start > 3000) {
      return null;
    }
    await delay(500);
  }
  return null;
}

async function sendLoginToTab(tabId, payload, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "RUN_LOGIN",
        email: payload.email,
        password: payload.password,
        giftCardNumber: payload.giftCardNumber,
        giftCardPin: payload.giftCardPin,
      });
      return response;
    } catch (_) {
      const resumed = await waitForFlowDone(90000);
      if (resumed) return resumed;
      await delay(800 + i * 400);
    }
  }
  throw new Error("Could not reach Noon page. Refresh the tab and try again.");
}

async function getOrCreateNoonTab() {
  const tabs = await chrome.tabs.query({ url: NOON_URL_PATTERN });
  if (tabs.length > 0 && tabs[0].id != null) {
    const tabId = tabs[0].id;
    await chrome.tabs.update(tabId, { active: true });
    await waitForTabComplete(tabId);
    await delay(200);
    return tabId;
  }

  const tab = await chrome.tabs.create({ url: NOON_HOME, active: true });
  if (tab.id == null) throw new Error("Failed to open Noon tab");
  await waitForTabComplete(tab.id);
  await delay(200);
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "START_NOON_LOGIN") {
    (async () => {
      try {
        const tabId = await getOrCreateNoonTab();
        activeLoginTabId = tabId;
        const result = await sendLoginToTab(tabId, {
          email: message.email,
          password: message.password,
          giftCardNumber: message.giftCardNumber,
          giftCardPin: message.giftCardPin,
        });
        activeLoginTabId = null;
        sendResponse(result ?? { ok: true });
      } catch (error) {
        activeLoginTabId = null;
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Login failed",
        });
      }
    })();
    return true;
  }

  if (message.type === "CANCEL_NOON_LOGIN") {
    (async () => {
      let cancelled = false;
      if (activeLoginTabId != null) {
        cancelled = await cancelLoginOnTab(activeLoginTabId);
      } else {
        const tabs = await chrome.tabs.query({ url: NOON_URL_PATTERN });
        for (const tab of tabs) {
          if (tab.id != null && (await cancelLoginOnTab(tab.id))) {
            cancelled = true;
            break;
          }
        }
      }
      activeLoginTabId = null;
      sendResponse({ ok: true, cancelled });
    })();
    return true;
  }

  if (
    message.type === "LOGIN_PROGRESS" ||
    message.type === "LOGIN_SUCCESS" ||
    message.type === "LOGIN_ERROR" ||
    message.type === "LOGIN_CANCELLED"
  ) {
    chrome.runtime.sendMessage(message).catch(() => {});
  }
});
