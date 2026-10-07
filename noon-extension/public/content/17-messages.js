/**
 * Split from content.js — classic content script (shared isolated world).
 * Top-level function/var bindings are shared across content/*.js via manifest order.
 * Part: 17-messages.js — chrome.runtime message listener
 */
chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
  if (message.type === "CLEAR_BATCH_FLOW") {
    // Reset — do NOT abort. Abort means user cancelled; prepareRowStage must not
    // poison the next redeem/login step with "Login cancelled by user".
    flow().reset();
    flow().running = false;
    if (placeOrderConfirmResolver) {
      placeOrderConfirmResolver(false);
      placeOrderConfirmResolver = null;
    }
    clearFlowState()
      .catch(function () {})
      .then(function () {
        return clearFlowDone();
      })
      .then(function () {
        return disableCursor();
      })
      .catch(function () {})
      .finally(function () {
        sendResponse({ ok: true });
      });
    return true;
  }

  if (message.type === "RECOVER_PAGE_IF_NEEDED") {
    (async function () {
      try {
        await recoverFromFetchErrorIfNeeded(2);
        sendResponse({ ok: true, recovered: true });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Page recovery failed",
        });
      }
    })();
    return true;
  }

  if (message.type === "PREPARE_CREDITS_SCREENSHOT") {
    (async function () {
      try {
        const result = await prepareCreditsForScreenshot(message.kind);
        sendResponse(result);
      } catch (error) {
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Credits screenshot prepare failed",
        });
      }
    })();
    return true;
  }

  if (message.type === "ASSERT_SESSION_EMAIL") {
    (async function () {
      try {
        const email = await assertSessionMatchesRowEmail(message.email);
        sendResponse({ ok: true, email: email });
      } catch (error) {
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Session email assertion failed",
        });
      }
    })();
    return true;
  }

  if (message.type === "RUN_BATCH_REDEEM_DRYRUN") {
    // Dry run: fill gift card + PIN on the open Credits page, never submit.
    if (flow().running) {
      sendResponse({ ok: false, error: "Another step is running in this page" });
      return true;
    }
    (async function () {
      try {
        sendResponse(
          await runRedeemFormDryRun({
            email: message.email,
            giftCardNumber: message.giftCardNumber,
            giftCardPin: message.giftCardPin,
          }),
        );
      } catch (error) {
        if (error && error.name === "LoginCancelledError") {
          sendResponse({ ok: false, cancelled: true, error: error.message });
          return;
        }
        sendResponse({ ok: false, error: (error && error.message) || "Dry-run redeem form failed" });
      }
    })();
    return true;
  }

  if (message.type === "RUN_BATCH_EMPTY_CART") {
    // Dry run clean-up: remove every item from the Noon cart page.
    (async function () {
      try {
        sendResponse(await emptyNoonCart());
      } catch (error) {
        sendResponse({ ok: false, error: (error && error.message) || "Could not empty cart" });
      }
    })();
    return true;
  }

  if (message.type === "RUN_BATCH_LOGOUT") {
    // End of run: sign the last account out (no-op when already signed out).
    (async function () {
      try {
        await logoutFromNoon();
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: (error && error.message) || "Logout failed" });
      }
    })();
    return true;
  }

  if (message.type === "CANCEL_LOGIN") {
    flow().abort();
    if (placeOrderConfirmResolver) {
      placeOrderConfirmResolver(false);
      placeOrderConfirmResolver = null;
    }
    emit("LOGIN_CANCELLED", { message: "Login cancelled" });
    disableCursor()
      .catch(function () {})
      .finally(function () {
        sendResponse({ ok: true });
      });
    return true;
  }

  if (message.type === "CONFIRM_PLACE_ORDER") {
    if (placeOrderConfirmResolver) {
      placeOrderConfirmResolver(!!message.confirmed);
      placeOrderConfirmResolver = null;
    }
    sendResponse({ ok: true });
    return true;
  }

  // A step is already running in this page (e.g. resumed after a navigation):
  // never start a second copy — a duplicate login clicks Continue again (another
  // OTP → "Too many requests" / lockout) and a duplicate cart can order twice.
  if (
    (message.type === "RUN_BATCH_ACCOUNT" ||
      message.type === "RUN_BATCH_LOGIN" ||
      message.type === "RUN_BATCH_REDEEM" ||
      message.type === "RUN_BATCH_CART") &&
    flow().running
  ) {
    sendResponse({ pending: true, duplicate: true });
    return true;
  }

  if (message.type === "RUN_BATCH_ACCOUNT") {
    (async function () {
      try {
        const result = await runBatchAccount({
          email: message.email,
          password: message.password,
          previousEmail: message.previousEmail,
        });
        sendResponse(result);
      } catch (error) {
        try { await disableCursor(); } catch (_) {}
        if (error && error.name === "LoginCancelledError") {
          sendResponse({ ok: false, cancelled: true, error: error.message });
          return;
        }
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Account switch failed",
        });
      }
    })();
    return true;
  }

  if (message.type === "RUN_BATCH_LOGIN") {
    (async function () {
      try {
        const result = await runBatchLogin({
          email: message.email,
          password: message.password,
        });
        sendResponse(result);
      } catch (error) {
        try { await disableCursor(); } catch (_) {}
        if (error && error.name === "LoginCancelledError") {
          sendResponse({ ok: false, cancelled: true, error: error.message });
          return;
        }
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Login failed",
        });
      }
    })();
    return true;
  }

  if (message.type === "RUN_BATCH_REDEEM") {
    (async function () {
      try {
        const result = await runBatchRedeem({
          email: message.email,
          password: message.password,
          giftCardNumber: message.giftCardNumber,
          giftCardPin: message.giftCardPin,
          accountVerified: message.accountVerified === true,
        });
        sendResponse(result);
      } catch (error) {
        try { await disableCursor(); } catch (_) {}
        if (error && error.name === "LoginCancelledError") {
          sendResponse({ ok: false, cancelled: true, error: error.message });
          return;
        }
        const errMsg = error instanceof Error ? error.message : "Redeem failed";
        const alreadyRedeemed = /already redeemed/i.test(errMsg);
        sendResponse({
          ok: false,
          redeemed: false,
          alreadyRedeemed: alreadyRedeemed,
          error: errMsg,
        });
      }
    })();
    return true;
  }

  if (message.type === "RUN_BATCH_CART") {
    (async function () {
      try {
        const result = await runBatchCart({
          email: message.email,
          password: message.password,
          productUrl: message.productUrl,
          couponCode: message.couponCode,
          rowNumber: message.rowNumber,
          placeOrder: message.placeOrder,
        });
        sendResponse(result);
      } catch (error) {
        try { await disableCursor(); } catch (_) {}
        if (error && error.name === "LoginCancelledError") {
          sendResponse({ ok: false, cancelled: true, error: error.message });
          return;
        }
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Order failed",
        });
      }
    })();
    return true;
  }

  if (message.type === "RUN_CART") {
    (async function () {
      try {
        emit("LOGIN_PROGRESS", { message: "Starting cart flow…" });
        await runCartAutomation({
          email: message.email,
          password: message.password,
          productUrl: message.productUrl,
          couponCode: message.couponCode,
        });
        emit("LOGIN_SUCCESS", { message: "Cart flow complete" });
        sendResponse({ ok: true });
      } catch (error) {
      try {
        await disableCursor();
      } catch (_) {}
        if (error && error.name === "LoginCancelledError") {
          emit("LOGIN_CANCELLED", { message: error.message });
          sendResponse({ ok: false, cancelled: true });
          return;
        }
        const errMsg = error instanceof Error ? error.message : "Cart flow failed";
        emit("LOGIN_ERROR", { error: errMsg });
        sendResponse({ ok: false, error: errMsg });
      }
    })();
    return true;
  }

  if (message.type !== "RUN_LOGIN") return;

  (async function () {
    const existing = await loadFlowState();
    if (existing && existing.active) {
      sendResponse({ ok: true });
      return;
    }

    try {
      emit("LOGIN_PROGRESS", { message: "Starting…" });
      const result = await runAutomation({
        email: message.email,
        password: message.password,
        giftCardNumber: message.giftCardNumber,
        giftCardPin: message.giftCardPin,
      });
      emit("LOGIN_SUCCESS", {
        message: result && result.skipped
          ? "Already logged in — gift card redeemed"
          : "Login + gift card redemption complete",
      });
      sendResponse({ ok: true, skipped: !!(result && result.skipped) });
    } catch (error) {
      try {
        await disableCursor();
      } catch (_) {}

      if (error && error.name === "LoginCancelledError") {
        emit("LOGIN_CANCELLED", { message: error.message });
        sendResponse({ ok: false, cancelled: true });
        return;
      }

      const errMsg = error instanceof Error ? error.message : "Login failed";
      emit("LOGIN_ERROR", { error: errMsg });
      sendResponse({ ok: false, error: errMsg });
    }
  })();

  return true;
});

