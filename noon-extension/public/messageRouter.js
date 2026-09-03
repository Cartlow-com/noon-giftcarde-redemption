chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "START_NOON_CART") {
    (async () => {
      try {
        const tabId = await getOrCreateNoonTab();
        activeLoginTabId = tabId;
        const result = await sendCartToTab(tabId, {
          email: message.email,
          password: message.password,
          productUrl: message.productUrl,
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
