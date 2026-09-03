/**
 * Split from content.js — classic content script (shared isolated world).
 * Top-level function/var bindings are shared across content/*.js via manifest order.
 * Part: 08-login-flow.js — Giftcard runner + page ready/recover
 */
async function runGiftCardRedemption(payload) {
  payload.giftCardNumber = normalizeGiftCardDigits(payload.giftCardNumber);
  payload.giftCardPin = normalizeGiftCardDigits(payload.giftCardPin);
  if (!payload.giftCardNumber || !payload.giftCardPin) {
    throw new Error("Gift card number and PIN are required");
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    flow().check();
    const state = detectPageState();
    logStep("On " + pageStateLabel(state));

    if (state === "REDEEM_FORM") {
      if (payload.waitForRedeemResult && payload.balanceBefore == null && isOnCreditsPage()) {
        payload.balanceBefore = readCreditsBalance();
        logStep(
          "Credits before redeem: " +
            (payload.balanceBefore != null
              ? payload.balanceBefore + " AED"
              : "unknown"),
        );
      }
      logStep("Filling gift card and PIN…");
      const outcome = await fillAndRedeemGiftCard(
        payload.giftCardNumber,
        payload.giftCardPin,
        payload.waitForRedeemResult,
        payload.balanceBefore,
      );
      if (outcome && outcome.pendingBalanceCheck) {
        return { pending: true };
      }
      if (outcome && !outcome.redeemed) {
        if (outcome.alreadyRedeemed) {
          throw new Error("Already redeemed");
        }
        throw new Error(outcome.error || "Redeem failed");
      }
      return outcome || true;
    }

    if (state === "ADD_CREDITS_MODAL") {
      logStep("Clicking Giftcards & Vouchers…");
      const option = await waitFor(function () {
        return findGiftcardsVouchersOption();
      }, 8000, 150);
      if (!option) throw new Error("Giftcards & Vouchers option not found");
      await mouse().click(option);
      await pause(0.8);
      continue;
    }

    if (state === "CREDITS_PAGE") {
      if (findAddCreditsModal() || findGiftcardsVouchersOption()) {
        continue;
      }
      await waitForCreditsPageReady();
      if (payload.waitForRedeemResult && payload.balanceBefore == null) {
        payload.balanceBefore = readCreditsBalance();
        logStep(
          "Credits balance before redeem: " +
            (payload.balanceBefore != null
              ? payload.balanceBefore + " AED"
              : "unknown"),
        );
        await persistFlow("RESUME", payload);
      }
      logStep("Clicking Redeem Giftcards…");
      const redeemBar = await waitFor(function () {
        return findRedeemGiftcardsBar();
      }, 10000, 200);
      if (!redeemBar) throw new Error("Redeem Giftcards not found");
      await mouse().click(redeemBar);
      await waitForAddCreditsModal();
      await pause(0.5);
      continue;
    }

    if (state === "LOGGED_IN") {
      const navigated = await goToCreditsPage(payload);
      if (navigated) return;
      continue;
    }

    throw new Error("Must be logged in to redeem gift card");
  }

  throw new Error("Gift card flow did not complete — try again");
}

async function runFromStep(state) {
  await enableCursor();
  await pause(0.3);

  if (state.flowType === "cart") {
    await restoreBatchCartContextFromState(state);
    const cartResult = await runCartFlow(state.productUrl);
    if (cartResult && cartResult.paymentIssue) {
      await disableCursor();
      await markFlowComplete({ ok: true, paymentIssue: true });
      await clearFlowState();
      batchFlowMode = false;
      batchCartContext = null;
      return;
    }
    if (cartResult && cartResult.orderSkipped) {
      await disableCursor();
      await markFlowComplete({ ok: true, orderSkipped: true });
      await clearFlowState();
      batchFlowMode = false;
      batchCartContext = null;
      return;
    }
    if (cartResult === true) return;
    const confirmation = await waitForOrderConfirmation();
    const orderId = confirmation && confirmation.orderId;
    await disableCursor();
    await markFlowComplete({
      ok: true,
      orderId: orderId || null,
      confirmationUrl: confirmation && confirmation.confirmationUrl,
    });
    await clearFlowState();
    batchFlowMode = false;
    batchCartContext = null;
    return;
  }

  if (state.step === "POST_REDEEM_BALANCE") {
    const result = await completePostRedeemBalanceCheck(state);
    await disableCursor();
    await markFlowComplete({
      ok: true,
      redeemed: true,
      verified: !!result.verified,
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
      balanceDelta: result.balanceDelta,
      popupMessage: result.popupMessage,
    });
    await clearFlowState();
    return;
  }

  const payload = {
    email: state.email,
    password: state.password,
    giftCardNumber: state.giftCardNumber,
    giftCardPin: state.giftCardPin,
    waitForRedeemResult: !!state.waitForRedeemResult,
    accountVerified: state.accountVerified === true,
    balanceBefore: state.balanceBefore,
  };
  const result = await runGiftCardRedemption(payload);
  if (payload.waitForRedeemResult) {
    if (result && result.redeemed === false) {
      const errMsg = result.alreadyRedeemed
        ? result.error || "Already redeemed"
        : result.error || "Redeem failed";
      throw new Error(errMsg);
    }
  }
  await disableCursor();
  await markFlowComplete({
    ok: true,
    redeemed: true,
    verified: !!(result && result.verified),
    balanceBefore: result && result.balanceBefore,
    balanceAfter: result && result.balanceAfter,
    balanceDelta: result && result.balanceDelta,
    popupMessage: result && result.popupMessage,
  });
  await clearFlowState();
}

async function runNextStep(payload) {
  await runGiftCardRedemption(payload);
}

function hasPageFetchError() {
  const bodyText = (document.body && document.body.textContent) || "";
  const lower = bodyText.toLowerCase();
  for (let i = 0; i < PAGE_FETCH_ERROR_MARKERS.length; i++) {
    if (lower.indexOf(PAGE_FETCH_ERROR_MARKERS[i]) !== -1) return true;
  }
  const networkError = getByText(NETWORK_ERROR);
  return !!(networkError && isVisible(networkError));
}

async function recoverFromFetchErrorIfNeeded(maxAttempts) {
  const attempts = maxAttempts == null ? 2 : maxAttempts;
  for (let i = 0; i < attempts; i++) {
    if (!hasPageFetchError()) return false;
    logStep("Noon page error detected — hard refreshing…");
    await hardRefresh();
    await acceptCookies();
  }
  if (hasPageFetchError()) {
    throw new Error("Noon page failed to load after refresh");
  }
  return true;
}

async function waitForPageReady() {
  await recoverFromFetchErrorIfNeeded(2);
  logStep("Waiting for Noon homepage…");
  await waitFor(
    function () {
      return isLoggedIn() || queryByRole("button", { name: "Log in" });
    },
    15000,
    150,
  );
  await pause(0.4);
  logStep("Page loaded");
}

