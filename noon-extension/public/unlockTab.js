/**
 * unlockTab.js — recover from Noon's "Too many failed attempts" lockout.
 * Noon emails "Unlock more sign in attempts" with a "Verify my account" link;
 * we fetch that link via the backend Gmail API, open it in a background tab,
 * then let the caller retry login once.
 * Loaded into the service worker via importScripts from background.js.
 */

const UNLOCK_TAB_TIMEOUT_MS = 30000;

function isNoonLockoutError(message) {
  return /too many failed attempts/i.test(String(message || ""));
}

/** Like waitForTabComplete, but bounded and safe if the tab is closed. */
function waitForUnlockTab(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    function finish(reason) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      resolve(reason);
    }
    function isFinalNoonPage(tab) {
      const url = String((tab && tab.url) || "");
      // Skip the http://urlNNNN.noon.com click-tracker hop; wait for the real page.
      return /^https:\/\/([a-z0-9-]+\.)*noon\.com\//i.test(url) && !/\/ls\/click/i.test(url);
    }
    function onUpdated(updatedTabId, info, tab) {
      if (updatedTabId === tabId && info.status === "complete" && isFinalNoonPage(tab)) {
        finish("complete");
      }
    }
    function onRemoved(removedTabId) {
      if (removedTabId === tabId) finish("closed");
    }
    const timer = setTimeout(() => finish("timeout"), timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) return finish("closed");
      if (tab.status === "complete" && isFinalNoonPage(tab)) finish("complete");
    });
  });
}

async function readUnlockPageText(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => String((document.body && document.body.innerText) || "").slice(0, 400),
    });
    return String((results && results[0] && results[0].result) || "")
      .replace(/\s+/g, " ")
      .trim();
  } catch (_) {
    return "";
  }
}

/**
 * Open the newest unlock link addressed to row.email. Returns { url, pageText }.
 * Throws when Gmail is not connected or no unlock email exists for this account.
 */
async function unlockNoonAccountViaEmail(row) {
  const lockoutAt = Date.now();
  emitBatch({
    type: "BATCH_PROGRESS",
    stage: "login",
    status: "info",
    message: `Row ${row.row_number}: Noon lockout — looking for unlock email for ${row.email}…`,
  });

  let unlockUrl = "";
  try {
    const data = await batchApiRequest(
      `/gmail/unlock-link?email=${encodeURIComponent(row.email)}`,
    );
    unlockUrl = String((data && data.url) || "");
  } catch (error) {
    let fallbackError = error;
    if (isGmailNotConnectedError(error)) {
      // Backend Gmail not connected: read the unlock email from Gmail in this Chrome.
      try {
        unlockUrl = await findUnlockLinkInGmailTab(row.email, lockoutAt);
        fallbackError = unlockUrl ? null : new Error("no unlock email in Gmail for " + gmailBaseAddress(row.email));
      } catch (tabError) {
        fallbackError = tabError;
      }
    }
    if (fallbackError) {
      throw new Error(
        "Manual login required — Too many failed attempts; unlock email not available (" +
          (fallbackError instanceof Error ? fallbackError.message : "Gmail API error") +
          ")",
      );
    }
  }
  if (!/^https?:\/\/([a-z0-9-]+\.)*noon\.com\//i.test(unlockUrl)) {
    throw new Error("Manual login required — unlock link is not a noon.com URL");
  }

  const tab = await chrome.tabs.create({ url: unlockUrl, active: false });
  if (tab.id == null) throw new Error("Could not open Noon unlock link tab");
  try {
    const outcome = await waitForUnlockTab(tab.id, UNLOCK_TAB_TIMEOUT_MS);
    if (outcome === "closed") throw new Error("Unlock tab was closed before it loaded");
    await delay(2000);
    const pageText = await readUnlockPageText(tab.id);
    emitBatch({
      type: "BATCH_PROGRESS",
      stage: "login",
      status: "info",
      message:
        `Row ${row.row_number}: opened unlock link (${outcome})` +
        (pageText ? ` — "${pageText.slice(0, 120)}"` : "") +
        " — retrying login",
    });
    return { url: unlockUrl, pageText: pageText };
  } finally {
    // Opened inactive, so the Noon tab keeps focus (and "Hide Noon window" stays minimized).
    try { await chrome.tabs.remove(tab.id); } catch (_) {}
  }
}
