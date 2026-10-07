/**
 * gmailTab.js — read Noon emails straight from the Gmail web UI in this Chrome.
 * Fallback when the backend Gmail API is not connected (e.g. local dev): the
 * row's inbox is usually already signed in to Chrome.
 *  - OTP: Gmail's unread Atom feed (exact timestamps, no tab, fast to poll).
 *  - Unlock link: the feed has no links, so open the search in a background tab.
 * Loaded into the service worker via importScripts from background.js.
 */

const GMAIL_TAB_LOAD_TIMEOUT_MS = 30000;

function isGmailNotConnectedError(error) {
  return /gmail not connected/i.test(String((error && error.message) || error || ""));
}

/** Noon mails the account's base address: y.w.x+shop@gmail.com → y.w.x@gmail.com. */
function gmailBaseAddress(email) {
  const raw = String(email || "").trim().toLowerCase();
  const at = raw.lastIndexOf("@");
  if (at < 1) return raw;
  return raw.slice(0, at).split("+")[0] + raw.slice(at);
}

function waitForGmailTab(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    function finish(result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      resolve(result);
    }
    function onUpdated(updatedTabId, info, tab) {
      if (updatedTabId === tabId && info.status === "complete") finish(tab && tab.url);
    }
    function onRemoved(removedTabId) {
      if (removedTabId === tabId) finish(null);
    }
    const timer = setTimeout(() => finish("timeout"), timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}

/**
 * Runs inside the Gmail page. (Re)runs `query`, waits for results, returns the
 * first row's text; with openFirst, opens it and returns the newest expanded
 * message body plus its links (Gmail's google.com/url?q= wrapper removed).
 */
async function gmailPageSearchFirstResult(query, openFirst) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => !!(el && el.offsetParent);
  const unwrap = (href) => {
    try {
      const u = new URL(href);
      if (/(^|\.)google\.com$/.test(u.hostname) && u.pathname === "/url") {
        return u.searchParams.get("q") || href;
      }
    } catch (_) {}
    return href;
  };
  if (/accounts\.google\.com/.test(location.host)) return { signedOut: true };

  // The tab is opened directly on the search URL, so no other view (e.g. the
  // inbox list) can be on screen and be mistaken for results.
  const target = "#search/" + encodeURIComponent(query);
  if (location.hash !== target) return { empty: true, wrongView: true };

  let row = null;
  for (let i = 0; i < 40 && !row; i++) {
    const empty = document.querySelector("td.TC");
    if (empty && visible(empty)) return { empty: true }; // "No messages matched your search"
    row = Array.from(document.querySelectorAll("tr.zA")).find(visible) || null;
    if (!row) await sleep(200);
  }
  if (!row) return { empty: true };
  const rowText = String(row.textContent || "").replace(/\s+/g, " ").trim();
  if (!openFirst) return { rowText: rowText };

  row.click();
  let body = null;
  for (let i = 0; i < 40 && !body; i++) {
    const bodies = Array.from(document.querySelectorAll("div.a3s")).filter(visible);
    body = bodies.length ? bodies[bodies.length - 1] : null;
    if (!body) await sleep(200);
  }
  if (!body) return { rowText: rowText, noBody: true };
  return {
    rowText: rowText,
    bodyText: String(body.innerText || "").replace(/\s+/g, " ").slice(0, 2000),
    links: Array.from(body.querySelectorAll("a[href]")).map((a) => ({
      text: String(a.innerText || "").replace(/\s+/g, " ").trim(),
      href: unwrap(a.href),
    })),
  };
}

/** Open the row's Gmail (base address) directly on a search, in a background tab. */
async function openGmailSearchTab(email, query) {
  const tab = await chrome.tabs.create({
    url:
      "https://mail.google.com/mail/u/" +
      encodeURIComponent(gmailBaseAddress(email)) +
      "/#search/" +
      encodeURIComponent(query),
    active: false,
  });
  if (tab.id == null) throw new Error("Could not open Gmail tab");
  const loaded = await waitForGmailTab(tab.id, GMAIL_TAB_LOAD_TIMEOUT_MS);
  if (loaded === null) throw new Error("Gmail tab was closed");
  return tab.id;
}

async function closeGmailTab(tabId) {
  if (tabId == null) return;
  try { await chrome.tabs.remove(tabId); } catch (_) {}
}

async function searchGmailTab(tabId, email, query, openFirst) {
  const results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: gmailPageSearchFirstResult,
    args: [query, !!openFirst],
  });
  const result = (results && results[0] && results[0].result) || { empty: true };
  if (result.signedOut) {
    throw new Error(
      "Gmail not signed in for " + gmailBaseAddress(email) + " in this Chrome — sign in or connect Gmail",
    );
  }
  return result;
}

/** Newest Noon unlock link for this account from the Gmail web UI, or "". */
/**
 * Wait until Noon's unlock email for this lockout has arrived (unread feed has
 * exact timestamps). Noon sends it a few seconds AFTER showing the lockout, and an
 * older unlock email's link is usually already used.
 */
async function waitForUnlockEmailInFeed(email, sinceMs, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 45000);
  while (Date.now() < deadline) {
    const entries = await fetchGmailFeed(email);
    const fresh = entries.some(
      (e) =>
        /(^|[.@])noon\.com$/.test(e.from) &&
        /unlock more sign in attempts/i.test(e.title) &&
        e.issuedMs >= sinceMs - 15000,
    );
    if (fresh) return true;
    await delay(2000);
  }
  return false;
}

async function findUnlockLinkInGmailTab(email, sinceMs) {
  if (sinceMs && !(await waitForUnlockEmailInFeed(email, sinceMs))) return "";
  const query =
    'from:noon.com subject:"Unlock more sign in attempts" to:' + gmailBaseAddress(email) + " newer_than:1d";
  const tabId = await openGmailSearchTab(email, query);
  try {
    const result = await searchGmailTab(tabId, email, query, true);
    if (result.empty || !result.links) return "";
    const verify = result.links.find(
      (link) =>
        /verify\s+(my\s+)?account|unlock/i.test(link.text) &&
        /^https?:\/\/([a-z0-9-]+\.)*noon\.com\//i.test(link.href),
    );
    return verify ? verify.href : "";
  } finally {
    await closeGmailTab(tabId);
  }
}

/** 6-digit code from a Noon OTP subject/body ("845989 is the OTP…" / "OTP is 845989"). */
function extractNoonOtp(text) {
  const raw = String(text || "");
  const subject = raw.match(/\b(\d{6})\b\s+is\s+the\s+otp\b/i);
  if (subject) return subject[1];
  const inline = raw.match(/(?:one[\s-]*time[\s-]*password|otp)\s*(?:\(otp\))?\s*(?:is|:)\s*(\d{6})\b/i);
  return inline ? inline[1] : "";
}

function decodeXmlText(text) {
  return String(text || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Parse Gmail's Atom feed (service workers have no DOMParser). */
function parseGmailAtom(xml) {
  return String(xml || "")
    .split("<entry>")
    .slice(1)
    .map((entry) => {
      const pick = (tag) => decodeXmlText((entry.match(new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">")) || [])[1]);
      return {
        title: pick("title"),
        summary: pick("summary"),
        issuedMs: Date.parse(pick("issued")) || 0,
        from: pick("email").toLowerCase(),
      };
    });
}

/** Unread inbox entries for the row's Gmail (base address) via the Atom feed. */
async function fetchGmailFeed(email) {
  const url = "https://mail.google.com/mail/u/" + encodeURIComponent(gmailBaseAddress(email)) + "/feed/atom";
  const resp = await fetch(url, { credentials: "include", cache: "no-store" });
  const text = await resp.text();
  if (!resp.ok || /accounts\.google\.com/.test(resp.url) || text.indexOf("<feed") === -1) {
    throw new Error(
      "Gmail not signed in for " + gmailBaseAddress(email) + " in this Chrome — sign in or connect Gmail",
    );
  }
  return parseGmailAtom(text);
}

/**
 * Newest Noon OTP that arrived after sinceMs (small slack: Noon may send it a few
 * seconds before we start looking) → { otp, url: "" } or null if not there yet.
 */
async function checkGmailFeedForOtp(email, sinceMs, graceMs) {
  const grace = typeof graceMs === "number" ? graceMs : 20000;
  const entries = await fetchGmailFeed(email);
  const fresh = entries
    .filter((e) => /(^|[.@])noon\.com$/.test(e.from) && e.issuedMs >= sinceMs - grace)
    .sort((a, b) => b.issuedMs - a.issuedMs);
  for (const entry of fresh) {
    const otp = extractNoonOtp(entry.title) || extractNoonOtp(entry.summary);
    if (otp) return { otp: otp, url: "", issuedMs: entry.issuedMs };
  }
  return null;
}
