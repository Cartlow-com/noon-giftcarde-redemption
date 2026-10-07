/** Origins where dashboardBridge.js is injected (from the built manifest). */
function allowedDashboardOrigins() {
  const scripts = (chrome.runtime.getManifest().content_scripts || []).filter(
    (cs) => (cs.js || []).includes("dashboardBridge.js"),
  );
  const origins = new Set();
  for (const cs of scripts) {
    for (const match of cs.matches || []) {
      try {
        origins.add(new URL(match.replace(/\/\*$/, "/")).origin);
      } catch (_) {}
    }
  }
  return origins;
}

function dashboardSenderOrigin(sender) {
  if (!sender || sender.id !== chrome.runtime.id) return "";
  let origin = sender.origin || "";
  if (!origin && sender.url) {
    try {
      origin = new URL(sender.url).origin;
    } catch (_) {
      origin = "";
    }
  }
  return origin && allowedDashboardOrigins().has(origin) ? origin : "";
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SET_AUTH_TOKENS") {
    (async () => {
      try {
        const access = typeof message.accessToken === "string" ? message.accessToken.trim() : "";
        if (!access) {
          sendResponse({ ok: false, error: "accessToken required" });
          return;
        }
        const refresh =
          typeof message.refreshToken === "string" ? message.refreshToken.trim() : "";
        // Trust only our own dashboard bridge, on a dashboard origin from the
        // manifest; take the API base from the sender's real origin, never from
        // the message body (a page could otherwise redirect runs to its server).
        const senderOrigin = dashboardSenderOrigin(sender);
        if (!senderOrigin) {
          sendResponse({ ok: false, error: "Not an allowed dashboard origin" });
          return;
        }
        // Never switch server mid-run, or away from a pinned server (serverSettings.js).
        const blocked = await checkDashboardConnectAllowed(senderOrigin);
        if (blocked) {
          sendResponse({ ok: false, error: blocked });
          return;
        }
        await setApiBaseUrl(senderOrigin);
        const configuredBase = await getApiBaseUrl();
        await chrome.storage.local.set({
          noon_access_token: access,
          noon_refresh_token: refresh,
        });
        const stored = await chrome.storage.local.get(["noon_access_token"]);
        const hasToken = stored.noon_access_token === access;
        if (!hasToken) {
          sendResponse({ ok: false, error: "Extension token storage verification failed" });
          return;
        }
        try {
          await postExtensionHeartbeat();
        } catch (error) {
          sendResponse({
            ok: false,
            hasToken: true,
            apiBaseUrl: configuredBase || null,
            error: error instanceof Error ? error.message : "Extension heartbeat failed",
          });
          return;
        }
        try {
          pollDashboardRuns();
        } catch (_) {}
        sendResponse({ ok: true, hasToken: true, apiBaseUrl: configuredBase || null });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to store auth tokens",
        });
      }
    })();
    return true;
  }

  if (message.type === "CLEAR_AUTH_TOKENS") {
    (async () => {
      try {
        await chrome.storage.local.remove(["noon_access_token", "noon_refresh_token"]);
        await clearApiBaseUrl();
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to clear auth tokens",
        });
      }
    })();
    return true;
  }

  if (message.type === "GET_AUTH_STATUS") {
    (async () => {
      try {
        const stored = await chrome.storage.local.get(["noon_access_token"]);
        let apiBaseUrl = null;
        try {
          apiBaseUrl = await getApiBaseUrl();
        } catch (_) {}
        sendResponse({
          ok: true,
          hasToken: typeof stored.noon_access_token === "string" && !!stored.noon_access_token,
          apiBaseUrl: apiBaseUrl,
        });
      } catch (error) {
        sendResponse({
          ok: false,
          hasToken: false,
          error: error instanceof Error ? error.message : "Failed to read extension auth status",
        });
      }
    })();
    return true;
  }

  if (message.type === "FETCH_NOON_OTP_FROM_GMAIL") {
    (async () => {
      try {
        const result = await fetchNoonOtpFromGmail(
          sender.tab && sender.tab.id,
          message.email,
          message.requestedAt,
        );
        if (typeof result === "string") {
          sendResponse({ ok: true, otp: result });
        } else {
          sendResponse({
            ok: true,
            otp: result && result.otp,
            useClipboard: result && result.useClipboard === true,
          });
        }
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Could not fetch Noon OTP from Gmail",
        });
      }
    })();
    return true;
  }

  if (message.type === "ROTATE_NOON_PROXY") {
    (async () => {
      try {
        const applied = await rotateNoonProxy();
        sendResponse({ ok: true, proxy: applied });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Could not rotate Noon proxy",
        });
      }
    })();
    return true;
  }

  if (message.type === "CLEAR_NOON_PROXY") {
    (async () => {
      try {
        const result = await clearNoonProxy();
        sendResponse(result);
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Could not clear Noon proxy",
        });
      }
    })();
    return true;
  }

  if (message.type === "GET_NOON_PROXY") {
    (async () => {
      try {
        const proxy = await getActiveNoonProxy();
        sendResponse({ ok: true, proxy: proxy });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Could not read Noon proxy",
        });
      }
    })();
    return true;
  }

  if (message.type === "START_NOON_CART") {
    (async () => {
      try {
        const tabId = await getOrCreateNoonTab();
        activeLoginTabId = tabId;
        const result = await sendCartToTab(tabId, {
          email: message.email,
          password: message.password,
          productUrl: message.productUrl,
          couponCode: message.couponCode,
        });
        activeLoginTabId = null;
        sendResponse(result ?? { ok: true });
      } catch (error) {
        activeLoginTabId = null;
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Cart flow failed",
        });
      }
    })();
    return true;
  }

  if (message.type === "CONFIRM_PLACE_ORDER") {
    (async () => {
      const tabId =
        activeLoginTabId ??
        (await chrome.tabs.query({ url: NOON_URL_PATTERN }))[0]?.id;
      if (tabId != null) {
        for (let i = 0; i < 4; i++) {
          try {
            await chrome.tabs.sendMessage(tabId, message);
            break;
          } catch (_) {
            await delay(250);
          }
        }
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

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

  if (message.type === "LOGIN_PROGRESS" || message.type === "LOGIN_ERROR") {
    if (typeof traceRow === "function") traceRow(message.message || message.error);
  }

  if (
    message.type === "LOGIN_PROGRESS" ||
    message.type === "LOGIN_SUCCESS" ||
    message.type === "LOGIN_ERROR" ||
    message.type === "LOGIN_CANCELLED" ||
    message.type === "CART_AWAITING_CONFIRM"
  ) {
    let outbound = message;
    if (message.type === "CART_AWAITING_CONFIRM" && isBatchRunActive()) {
      const row = getCurrentBatchRow();
      outbound = {
        ...message,
        batchMode: true,
        rowNumber: message.rowNumber ?? row?.row_number,
        productUrl: message.productUrl ?? row?.product_url,
        message:
          message.message ||
          (row
            ? `Row ${row.row_number}: ready to place order. Place order or skip?`
            : message.message),
      };
    }
    chrome.runtime.sendMessage(outbound).catch(() => {});
  }

  if (message.type === "START_BATCH_RUN") {
    (async () => {
      try {
        await runSelectedRows(message.batchId, message.rowIds || [], {
          placeOrder: message.placeOrder,
          sendRedeemEmails: message.sendRedeemEmails,
          sendOrderEmails: message.sendOrderEmails,
        });
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Batch run failed",
        });
      }
    })();
    return true;
  }

  if (message.type === "STOP_BATCH_RUN") {
    stopBatchRun();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "CLEAR_NOON_SESSION") {
    (async () => {
      try {
        const result = await clearNoonSessionCookies();
        sendResponse(result);
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to clear Noon session",
        });
      }
    })();
    return true;
  }

  if (message.type === "OPEN_WIDE_WINDOW") {
    (async () => {
      try {
        await openWidePanelWindow();
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to open window",
        });
      }
    })();
    return true;
  }

  if (
    message.type === "BATCH_PROGRESS" ||
    message.type === "BATCH_ROW_DONE" ||
    message.type === "BATCH_COMPLETE" ||
    message.type === "BATCH_ERROR"
  ) {
    chrome.runtime.sendMessage(message).catch(() => {});
  }
});
