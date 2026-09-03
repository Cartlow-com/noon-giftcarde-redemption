/**
 * Split from content.js — classic content script (shared isolated world).
 * Top-level function/var bindings are shared across content/*.js via manifest order.
 * Part: 16-batch.js — Batch login/redeem/cart runners
 */
async function runBatchLogin(payload) {
  if (!payload.email || !payload.password) {
    throw new Error("Email and password are required");
  }
  flow().reset();
  flow().running = true;
  try {
    const skipped = await ensureLoggedIn(payload);
    await disableCursor();
    await markFlowDone();
    return { ok: true, skipped: skipped };
  } finally {
    flow().running = false;
  }
}

async function assertSessionMatchesRowEmail(email) {
  flow().reset();
  const required = String(email || "").trim().toLowerCase();
  if (!required) {
    throw new Error("Row email required — refusing action without account check");
  }
  logStep("Safety check — confirming browser session is " + required);
  await openProfilePage();
  if (isAccountRequiredPage()) {
    throw new Error("Not logged in — refusing action (session safety)");
  }
  // Prefer profile form email; Hi, greeting is often missing on account.noon.com.
  const profileEmail = await waitForReadableProfileEmail(8000);
  if (!profileEmail) {
    throw new Error("Could not read profile email — refusing action (session safety)");
  }
  if (profileEmail !== required) {
    throw new Error(
      "Wrong account: browser is " +
        profileEmail +
        " but row is " +
        required +
        " — refusing action",
    );
  }
  await setSessionEmail(required);
  logStep("Session safety OK — logged in as " + required);
  return profileEmail;
}

async function runBatchRedeem(payload) {
  if (!payload.giftCardNumber || !payload.giftCardPin) {
    throw new Error("Gift card number and PIN are required");
  }
  if (!payload.email) {
    throw new Error("Row email required before redeem — refusing for safety");
  }
  flow().reset();
  flow().running = true;
  await clearFlowState();
  await clearFlowDone();
  try {
    await enableCursor();
    // Do not re-open profile here during batch redeem; the row account stage has
    // just verified and stored the email before navigating to credits.
    const storedEmail = String((await getSessionEmail()) || "").toLowerCase();
    const requiredEmail = String(payload.email || "").trim().toLowerCase();
    const alreadyVerified =
      payload.accountVerified === true || storedEmail === requiredEmail;
    if (!alreadyVerified) {
      await assertSessionMatchesRowEmail(payload.email);
    }
    payload.waitForRedeemResult = true;
    await persistFlow("RESUME", payload);
    let result;
    try {
      result = await runGiftCardRedemption(payload);
    } catch (error) {
      await disableCursor();
      await clearFlowState();
      const errMsg = error instanceof Error ? error.message : "Redeem failed";
      const alreadyRedeemed = /already redeemed/i.test(errMsg);
      return { ok: false, alreadyRedeemed: alreadyRedeemed, error: errMsg };
    }
    const stillActive = await loadFlowState();
    if (stillActive && stillActive.active) {
      return { ok: true, pending: true };
    }
    if (!result || result.redeemed === false) {
      const errMsg = (result && result.error) || "Redeem failed";
      if (result && result.alreadyRedeemed) {
        return { ok: false, alreadyRedeemed: true, error: errMsg };
      }
      throw new Error(errMsg);
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
    return {
      ok: true,
      redeemed: true,
      verified: !!(result && result.verified),
      balanceBefore: result && result.balanceBefore,
      balanceAfter: result && result.balanceAfter,
      balanceDelta: result && result.balanceDelta,
      popupMessage: result && result.popupMessage,
    };
  } finally {
    flow().running = false;
  }
}

async function runBatchCart(payload) {
  if (!payload.productUrl) throw new Error("Product URL is required");
  batchFlowMode = true;
  batchPlaceOrderPref = payload.placeOrder === true;
  batchCartContext = {
    rowNumber: payload.rowNumber,
    productUrl: payload.productUrl,
  };
  flow().reset();
  flow().running = true;
  await clearFlowDone();
  await persistCartState({
    productUrl: payload.productUrl,
    email: payload.email,
    password: payload.password,
    batchMode: true,
    rowNumber: payload.rowNumber,
    cartPhase: "",
    batchPlaceOrder: batchPlaceOrderPref,
  });
  try {
    await enableCursor();
    if (!hasNoonSession() && !isOnAccountPage()) {
      throw new Error("Not logged in — login stage must succeed first");
    }
    logStep("Starting batch order flow…");
    const cartResult = await runCartFlow(payload.productUrl);
    if (cartResult && cartResult.paymentIssue) {
      await disableCursor();
      await markFlowComplete({ ok: true, paymentIssue: true });
      await clearFlowState();
      return { ok: true, paymentIssue: true };
    }
    if (cartResult && cartResult.orderSkipped) {
      await disableCursor();
      await markFlowComplete({ ok: true, orderSkipped: true });
      await clearFlowState();
      return { ok: true, orderSkipped: true };
    }
    if (cartResult === true) return { ok: true, pending: true };
    const confirmation = await waitForOrderConfirmation();
    const orderId = confirmation && confirmation.orderId;
    await disableCursor();
    await markFlowComplete({
      ok: true,
      orderId: orderId || null,
      confirmationUrl: confirmation && confirmation.confirmationUrl,
    });
    await clearFlowState();
    return {
      ok: true,
      orderId: orderId || null,
      confirmationUrl: confirmation && confirmation.confirmationUrl,
    };
  } finally {
    batchFlowMode = false;
    batchCartContext = null;
    batchPlaceOrderPref = null;
    flow().running = false;
  }
}

async function runAutomation(payload) {
  if (!payload.email || !payload.password) {
    throw new Error("Email and password are required");
  }
  if (!payload.giftCardNumber || !payload.giftCardPin) {
    throw new Error("Gift card number and PIN are required");
  }

  flow().reset();
  flow().running = true;
  await clearFlowState();
  await clearFlowDone();

  try {
    await enableCursor();
    const loginSkipped = await ensureLoggedIn(payload);

    logStep("Starting gift card flow");

    await runNextStep(payload);
    await disableCursor();
    await markFlowDone();
    await clearFlowState();
    return { skipped: loginSkipped };
  } finally {
    flow().running = false;
  }
}

