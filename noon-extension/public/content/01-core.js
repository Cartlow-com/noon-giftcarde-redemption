/**
 * Split from content.js — classic content script (shared isolated world).
 * Top-level function/var bindings are shared across content/*.js via manifest order.
 * Part: 01-core.js — Constants, cursor, flow, emit/log
 */
var NOON_HOME = "https://www.noon.com/uae-en/";
var NOON_CREDITS = "https://account.noon.com/uae-en/credits/";
var NOON_PROFILE = "https://account.noon.com/uae-en/profile/";
var NETWORK_ERROR = "Looks like you're offline";
var PAGE_FETCH_ERROR_MARKERS = [
  "fail to fetch",
  "failed to fetch",
  "looks like you're offline",
  "something went wrong",
  "network error",
];
var FLOW_STATE_KEY = "noon_flow_state";
var FLOW_DONE_KEY = "noon_flow_done";
var FLOW_RESULT_KEY = "noon_flow_result";
var SESSION_EMAIL_KEY = "noon_batch_session_email";
var CURSOR_ACTIVE_KEY = "noon_cursor_active";

function setCursorActive(active) {
  return new Promise(function (resolve) {
    if (active) {
      chrome.storage.local.set({ [CURSOR_ACTIVE_KEY]: true }, resolve);
    } else {
      chrome.storage.local.remove(CURSOR_ACTIVE_KEY, resolve);
    }
  });
}

var keepAliveTimer = null;

async function enableCursor() {
  await setCursorActive(true);
  await mouse().show();
  mouse().ensureVisible();
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(function () {
    chrome.storage.local.get(CURSOR_ACTIVE_KEY, function (data) {
      if (!data[CURSOR_ACTIVE_KEY]) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
        return;
      }
      try {
        mouse().ensureVisible();
      } catch (_) {}
    });
  }, 400);
}

async function disableCursor() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
  await setCursorActive(false);
  await mouse().hide();
}

function mouse() {
  if (!window.__noonGhostMouse) {
    throw new Error("Ghost mouse not loaded");
  }
  return window.__noonGhostMouse;
}

window.__noonLoginFlow = {
  aborted: false,
  running: false,
  reset: function () {
    this.aborted = false;
  },
  abort: function () {
    this.aborted = true;
  },
  check: function () {
    if (this.aborted) {
      const err = new Error("Login cancelled by user");
      err.name = "LoginCancelledError";
      throw err;
    }
  },
};

function flow() {
  return window.__noonLoginFlow;
}

function pause(seconds) {
  return mouse().delay((seconds ?? 1.5) * 1000);
}

function emit(type, payload) {
  try {
    chrome.runtime.sendMessage({ type, ...payload });
  } catch (_) {}
}

function logStep(message) {
  emit("LOGIN_PROGRESS", { message });
}

