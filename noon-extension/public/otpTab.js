/**
 * otpTab.js — open Noon OTP link tab, scrape visible 6-digit code, return to Noon.
 * Loaded into the service worker via importScripts from background.js.
 */
importScripts("otpScrapePage.js");

function pickBestOtpFrameResults(results) {
  if (!results || !results.length) return null;
  const hits = [];
  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    const res = item && item.result;
    const otp = String((res && res.otp) || "").replace(/\D/g, "");
    if (otp.length === 6) {
      hits.push({
        otp: otp,
        debug: res.debug || "frame",
        frameId: item.frameId ?? 0,
        meta: res,
      });
    }
  }
  if (hits.length) {
    hits.sort(function (a, b) { return (a.frameId ?? 0) - (b.frameId ?? 0); });
    return hits[0];
  }
  const first = results[0] && results[0].result;
  return first ? { otp: "", debug: first.debug, meta: first } : null;
}

async function executeOtpScrapeAllFrames(tabId) {
  return chrome.scripting.executeScript({
    target: { tabId: tabId, allFrames: true },
    func: otpScrapeInPage,
  });
}

/**
 * Read OTP from every frame in the OTP tab (primary) + content-script message (fallback).
 */
async function scrapeOtpFromTab(tabId) {
  const deadline = Date.now() + 20000;
  let injected = false;
  while (Date.now() < deadline) {
    try {
      const frameResults = await executeOtpScrapeAllFrames(tabId);
      const picked = pickBestOtpFrameResults(frameResults);
      if (picked && picked.otp) {
        emitBatch({
          type: "BATCH_PROGRESS",
          stage: "login",
          status: "info",
          message:
            `OTP scrape [${picked.debug}] frame=${picked.frameId ?? 0} ` +
            `frames=${frameResults.length} bodyLen=${picked.meta && picked.meta.bodyLen || 0} found=yes`,
        });
        return picked.otp;
      }
      if (picked) {
        emitBatch({
          type: "BATCH_PROGRESS",
          stage: "login",
          status: "info",
          message:
            `OTP scrape [${picked.debug}] frames=${frameResults.length} ` +
            `bodyLen=${picked.meta && picked.meta.bodyLen || 0} found=no`,
        });
      }
    } catch (err) {
      emitBatch({
        type: "BATCH_PROGRESS",
        stage: "login",
        status: "info",
        message: "OTP allFrames scrape error: " + (err instanceof Error ? err.message : String(err)),
      });
    }

    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: "READ_NOON_OTP_PAGE" });
      if (res) {
        const otp = String(res.otp || "").replace(/\D/g, "");
        emitBatch({
          type: "BATCH_PROGRESS",
          stage: "login",
          status: "info",
          message: `OTP scrape [${res.debug || "message"}] found=${otp.length === 6 ? "yes" : "no"}`,
        });
        if (otp.length === 6) return otp;
      }
    } catch (err) {
      if (!injected) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: true },
            files: ["gmailOtp.js"],
          });
          injected = true;
        } catch (injectErr) {
          emitBatch({
            type: "BATCH_PROGRESS",
            stage: "login",
            status: "info",
            message:
              "OTP scrape inject error: " +
              (injectErr instanceof Error ? injectErr.message : String(injectErr)),
          });
        }
      }
    }

    await delay(400);
  }
  return null;
}

async function focusTab(tabId) {
  if (tabId == null) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.windowId != null) {
      try { await chrome.windows.update(tab.windowId, { focused: true }); } catch (_) {}
    }
    await chrome.tabs.update(tabId, { active: true });
    await delay(250);
  } catch (_) {}
}

/** Last-resort Copy-row read in the frame that owns the Copy control (main frame first). */
async function copyOtpFromTab(tabId) {
  const copyFunc = async function () {
    function textOf(el) {
      return String((el && (el.innerText || el.textContent)) || "").replace(/\s+/g, " ").trim();
    }
    function sixDigits(raw) {
      const code = String(raw || "").replace(/\D/g, "");
      return code.length === 6 ? code : "";
    }
    function otpFromScriptConst() {
      const scripts = document.querySelectorAll("script");
      for (let i = 0; i < scripts.length; i++) {
        const text = scripts[i].textContent || "";
        const match = text.match(/(?:const|let|var)\s+otp\s*=\s*['"](\d{6})['"]/);
        if (match) return sixDigits(match[1]);
      }
      return "";
    }
    function otpFromOtpInputs() {
      const inputs = Array.from(document.querySelectorAll("input.otp-input, .otp-section input[type='text']"));
      if (inputs.length !== 6) return "";
      return sixDigits(inputs.map(function (input) {
        return String(input.value || "").replace(/\D/g, "").slice(0, 1);
      }).join(""));
    }
    function digitsBeforeCopy(text) {
      const match = String(text || "").match(/((?:\d[^\dA-Za-z]*){6})\s*copy\b/i);
      return match ? sixDigits(match[1]) : "";
    }
    function spacedSix(text) {
      const match = String(text || "").match(/(?:^|[^\d])(\d(?:[ \t\n\u00a0]+\d){5})(?=[^\d]|$)/);
      return match ? sixDigits(match[1]) : "";
    }
    function findCopy() {
      return Array.from(document.querySelectorAll("a, button, [role='button'], span, div, p, label")).find(
        function (el) {
          const t = textOf(el);
          return /^copy$/i.test(t) || (/\bcopy\b/i.test(t) && t.length <= 24);
        },
      );
    }

    const fromScript = otpFromScriptConst();
    if (fromScript) return { otp: fromScript, debug: "copy_script_const_otp" };

    const fromInputs = otpFromOtpInputs();
    if (fromInputs) return { otp: fromInputs, debug: "copy_otp_input_values" };

    const clickable = findCopy();
    if (!clickable) return { otp: null, debug: "copy_button_missing", bodyLen: textOf(document.body).length };

    let node = clickable;
    for (let i = 0; node && i < 10; i++) {
      const code = digitsBeforeCopy(textOf(node)) || spacedSix(textOf(node));
      if (code) return { otp: code, debug: "copy_row_before_click" };
      node = node.parentElement;
    }

    clickable.scrollIntoView({ block: "center", inline: "center" });
    await new Promise(function (resolve) { requestAnimationFrame(resolve); });
    try {
      clickable.click();
    } catch (_) {}
    await new Promise(function (resolve) { setTimeout(resolve, 400); });

    node = clickable;
    for (let i = 0; node && i < 10; i++) {
      const code = digitsBeforeCopy(textOf(node)) || spacedSix(textOf(node));
      if (code) return { otp: code, debug: "copy_row_after_click" };
      node = node.parentElement;
    }

    const bodyText = textOf(document.body);
    const spaced = spacedSix(bodyText) || digitsBeforeCopy(bodyText);
    if (spaced) return { otp: spaced, debug: "copy_frame_body" };

    try {
      const clip = await navigator.clipboard.readText();
      const match = String(clip || "").match(/\b(\d{6})\b/);
      if (match) return { otp: match[1], debug: "clipboard" };
    } catch (_) {}

    return { otp: null, debug: "copy_no_otp", bodyLen: bodyText.length };
  };

  const probe = await chrome.scripting.executeScript({
    target: { tabId: tabId, allFrames: true },
    func: function () {
      function textOf(el) {
        return String((el && (el.innerText || el.textContent)) || "").replace(/\s+/g, " ").trim();
      }
      const hasCopy = Array.from(document.querySelectorAll("a, button, [role='button'], span, div, p, label")).some(
        function (el) {
          const t = textOf(el);
          return /^copy$/i.test(t) || (/\bcopy\b/i.test(t) && t.length <= 24);
        },
      );
      return hasCopy;
    },
  });

  const frameIds = [];
  if (probe.some(function (p) { return (p.frameId ?? 0) === 0 && p.result; })) frameIds.push(0);
  for (let i = 0; i < probe.length; i++) {
    const fid = probe[i].frameId ?? 0;
    if (probe[i].result && frameIds.indexOf(fid) === -1) frameIds.push(fid);
  }
  if (!frameIds.length) frameIds.push(0);

  for (let f = 0; f < frameIds.length; f++) {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId, frameIds: [frameIds[f]] },
      world: "MAIN",
      func: copyFunc,
    });
    const res = results && results[0] && results[0].result;
    if (!res) continue;
    emitBatch({
      type: "BATCH_PROGRESS",
      stage: "login",
      status: "info",
      message: `OTP copy [${res.debug}] frame=${frameIds[f]} found=${res.otp ? "yes" : "no"}`,
    });
    const otp = String(res.otp || "").replace(/\D/g, "");
    if (otp.length === 6) return otp;
  }
  return "";
}

const OTP_POLL_FIRST_MS = 1500;
const OTP_POLL_INTERVAL_MS = 2000;
const OTP_POLL_TIMEOUT_MS = 60000;
const OTP_FRESH_GRACE_MS = 5000;

function isOtpNotArrivedYetError(error) {
  return /no recent noon otp email|no fresh otp|no otp code/i.test(
    String((error && error.message) || error || ""),
  );
}

/**
 * Poll for the OTP email instead of a fixed wait: first check after ~1.5s, then
 * every 2s, return as soon as it arrives. Backend Gmail API first; if Gmail is
 * not connected there, read this Chrome's Gmail unread feed (no tab).
 */
async function pollForNoonOtpEmail(email, otpRequestedAt, graceMs) {
  const grace = typeof graceMs === "number" ? graceMs : 30000;
  const deadline = otpRequestedAt + OTP_POLL_TIMEOUT_MS;
  let useGmailFeed = false;
  let checks = 0;
  await delay(OTP_POLL_FIRST_MS);
  while (Date.now() < deadline) {
    checks += 1;
    if (!useGmailFeed) {
      try {
        const data = await batchApiRequest(
          `/gmail/otp-link?after_ms=${encodeURIComponent(otpRequestedAt)}&grace_ms=${grace}`,
        );
        const otp = String((data && data.otp) || "").replace(/\D/g, "");
        const url = (data && data.url) || "";
        if (otp.length === 6 || url) return { otp: otp, url: url, checks: checks };
      } catch (error) {
        if (isGmailNotConnectedError(error)) {
          emitBatch({
            type: "BATCH_PROGRESS",
            stage: "login",
            status: "info",
            message: "Backend Gmail not connected — reading OTP from Gmail in this Chrome…",
          });
          useGmailFeed = true;
          continue;
        }
        if (!isOtpNotArrivedYetError(error)) {
          throw new Error("Gmail API: " + ((error && error.message) || "could not get OTP link"));
        }
      }
    } else {
      const found = await checkGmailFeedForOtp(email, otpRequestedAt, grace);
      if (found) return Object.assign({ checks: checks }, found);
    }
    throwIfCancelled();
    await delay(OTP_POLL_INTERVAL_MS);
  }
  throw new Error(
    "Could not fetch OTP — no Noon OTP email within " + OTP_POLL_TIMEOUT_MS / 1000 + "s (" + checks + " checks)",
  );
}

/**
 * Get the Noon OTP from email → if the email only has a Click Here link, open it,
 * scrape the visible code, return focus to Noon and close the OTP tab.
 */
async function fetchNoonOtpFromGmail(noonTabId, email, requestedAt) {
  if (noonTabId == null) throw new Error("No active Noon tab to navigate for OTP");
  // When the page tells us when Continue was clicked, only accept OTP emails from
  // ~5s before that (never a previous attempt's code). Otherwise keep the old 30s.
  const clickedAt = Number(requestedAt) || 0;
  const precise = clickedAt > 0 && Date.now() - clickedAt < 5 * 60000;
  const otpRequestedAt = precise ? clickedAt : Date.now();
  const graceMs = precise ? OTP_FRESH_GRACE_MS : 30000;

  emitBatch({
    type: "BATCH_PROGRESS",
    stage: "login",
    status: "info",
    message: "OTP requested — checking email every 2s…",
  });

  const found = await pollForNoonOtpEmail(email, otpRequestedAt, graceMs);
  const emailOtp = String(found.otp || "");
  const otpLink = found.url || "";
  const waitedSec = ((Date.now() - otpRequestedAt) / 1000).toFixed(1);

  if (emailOtp.length === 6) {
    emitBatch({
      type: "BATCH_PROGRESS",
      stage: "login",
      status: "info",
      message: "OTP found in email after " + waitedSec + "s — pasting on Noon…",
    });
    return { otp: emailOtp, useClipboard: false };
  }

  if (!otpLink) throw new Error("No OTP code or Click Here link in Gmail");
  // The page is scripted in every frame (MAIN world) — only ever open Noon's OTP page.
  if (!/^https:\/\/([a-z0-9-]+\.)*noon\.com\//i.test(otpLink) && !/^https?:\/\/url\d+\.noon\.com\//i.test(otpLink)) {
    throw new Error("OTP link is not a noon.com URL — refusing to open it");
  }

  emitBatch({
    type: "BATCH_PROGRESS",
    stage: "login",
    status: "info",
    message: "No inline OTP — opening Click Here page to read code…",
  });

  const otpTab = await chrome.tabs.create({ url: otpLink, active: true });
  if (otpTab.id == null) throw new Error("Could not open OTP link tab");

  try {
    await waitForTabComplete(otpTab.id);
    await delay(2000);

    let otp = await scrapeOtpFromTab(otpTab.id);
    if (!otp) {
      emitBatch({
        type: "BATCH_PROGRESS",
        stage: "login",
        status: "info",
        message: "OTP text scrape failed — trying Copy row…",
      });
      otp = await copyOtpFromTab(otpTab.id);
    }
    if (!otp) throw new Error("Could not read OTP from the Noon OTP page");

    return { otp: otp, useClipboard: false };
  } finally {
    await focusTab(noonTabId);
    try { await chrome.tabs.remove(otpTab.id); } catch (_) {}
  }
}
