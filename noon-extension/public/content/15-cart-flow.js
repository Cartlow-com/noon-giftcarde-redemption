/**
 * Split from content.js — classic content script (shared isolated world).
 * Top-level function/var bindings are shared across content/*.js via manifest order.
 * Part: 15-cart-flow.js — Place-order confirm + runCartFlow
 */
var placeOrderConfirmResolver = null;

async function waitForPlaceOrderConfirmation(message) {
  await restoreBatchCartContextFromState();
  const ctx = batchCartContext;
  const state = await loadFlowState();
  const autoPlace =
    batchPlaceOrderPref != null
      ? batchPlaceOrderPref
      : state && state.batchPlaceOrder != null
        ? !!state.batchPlaceOrder
        : null;

  if (batchFlowMode && autoPlace !== null) {
    logStep(
      autoPlace
        ? "Place order enabled for batch — proceeding"
        : "Place order disabled for batch — skipping checkout submit",
    );
    return autoPlace;
  }

  const prompt =
    batchFlowMode && ctx
      ? `Row ${ctx.rowNumber}: ready to place order. Place order or skip?`
      : message || "Credits enabled. Place order?";
  return new Promise(function (resolve) {
    placeOrderConfirmResolver = resolve;
    emit("CART_AWAITING_CONFIRM", {
      message: prompt,
      batchMode: batchFlowMode,
      rowNumber: ctx && ctx.rowNumber,
      productUrl: ctx && ctx.productUrl,
    });
  });
}

async function runCartFlow(productUrl) {
  const normalizedUrl = (productUrl || "").trim();
  if (!normalizedUrl || normalizedUrl.indexOf("noon.com") === -1) {
    throw new Error("Valid Noon product URL is required");
  }

  for (let attempt = 0; attempt < 15; attempt++) {
    flow().check();
    await enableCursor();

    const phase = await getCartPhase();
    const onTargetProduct = isOnTargetProductPage(normalizedUrl);
    const pastProductStep =
      phase === "added" || phase === "viewed_cart" || phase === "checkout";

    if (
      !onTargetProduct &&
      !pastProductStep &&
      !isOnCartPage() &&
      !isOnCheckoutPage()
    ) {
      return goToProductPage(normalizedUrl);
    }

    const state = detectCartState();
    logStep("Cart step: " + state);

    if (state === "CHECKOUT_PAGE") {
      await waitForCheckoutPageReady();
      await ensureUseMyCreditsEnabled();

      if (hasCheckoutPaymentIssue()) {
        logStep(
          "Payment issue — credits do not cover total (Select Payment Method shown)",
        );
        await disableCursor();
        return { paymentIssue: true };
      }

      const confirmed = await waitForPlaceOrderConfirmation(
        "Credits enabled. Click Place Order in the panel when ready (no payment method selected).",
      );
      if (!confirmed) {
        logStep("Place order skipped by user");
        await disableCursor();
        return { orderSkipped: true };
      }

      logStep("Waiting for Place Order button…");
      const placeBtn = await waitFor(function () {
        if (hasCheckoutPaymentIssue()) return "PAYMENT_ISSUE";
        return findPlaceOrderButton();
      }, 15000, 50);
      if (placeBtn === "PAYMENT_ISSUE" || hasCheckoutPaymentIssue()) {
        logStep(
          "Payment issue — credits do not cover total (Select Payment Method shown)",
        );
        await disableCursor();
        return { paymentIssue: true };
      }
      if (!placeBtn) {
        if (hasCheckoutPaymentIssue()) {
          await disableCursor();
          return { paymentIssue: true };
        }
        throw new Error(
          "Place Order button not visible yet — complete payment manually if needed",
        );
      }

      logStep("Clicking Place Order…");
      await mouse().click(placeBtn);
      logStep("Place Order clicked");
      await waitFor(function () {
        return detectCartState() !== "CHECKOUT_PAGE" ? true : null;
      }, 8000, 50);
      return;
    }

    if (state === "NOON_ONE_POPUP") {
      logStep("Clicking Continue to Checkout…");
      const btn = findContinueToCheckoutButton();
      if (!btn) throw new Error("Continue to Checkout not found");
      await mouse().click(btn);
      await waitFor(function () {
        return !findContinueToCheckoutButton() ? true : null;
      }, 8000, 50);
      continue;
    }

    if (state === "CART_PAGE") {
      await waitForCartPageReady();
      if (isCartEmpty()) {
        return goToProductPage(normalizedUrl);
      }
      if (!pastProductStep) {
        await setCartPhase("viewed_cart");
      }
      logStep("Clicking Checkout…");
      const btn = findCheckoutButton();
      if (!btn) throw new Error("Checkout button not found");
      await mouse().click(btn);
      await setCartPhase("checkout");
      await waitFor(function () {
        return isOnCheckoutPage() || findContinueToCheckoutButton() ? true : null;
      }, 8000, 50);
      continue;
    }

    if (state === "ADDED_DRAWER") {
      const phase = await getCartPhase();
      if (phase === "viewed_cart") {
        await waitFor(function () {
          return isOnCartPage();
        }, 8000, 50);
        continue;
      }
      await clickViewCartButton();
      continue;
    }

    if (state === "PRODUCT_PAGE") {
      const phase = await getCartPhase();
      if (phase === "added" || phase === "viewed_cart") {
        if (phase === "added" && findViewCartButton()) {
          await clickViewCartButton();
        } else if (phase === "viewed_cart" && !isOnCartPage()) {
          await waitFor(function () {
            return isOnCartPage();
          }, 8000, 50);
        } else if (phase === "added") {
          // Drawer may still be opening — wait, never click Add to Cart again.
          await waitFor(function () {
            return findViewCartButton() || isOnCartPage() || isAddedToCartDrawerOpen();
          }, 6000, 50);
          if (findViewCartButton()) await clickViewCartButton();
        }
        continue;
      }
      const navigated = await handleProductPageStep(normalizedUrl);
      if (navigated) return true;
      continue;
    }

    if (state === "LOGGED_IN" || state === "NOT_LOGGED_IN") {
      if (state === "NOT_LOGGED_IN") {
        throw new Error("Must be logged in for cart flow");
      }
      if (!onTargetProduct) {
        return goToProductPage(normalizedUrl);
      }
      if (isOnProductPage()) {
        const navigated = await handleProductPageStep(normalizedUrl);
        if (navigated) return true;
        continue;
      }
      await waitForProductPageReady();
      continue;
    }
  }

  throw new Error("Cart flow did not complete — try again");
}

async function runCartAutomation(payload) {
  if (!payload.email || !payload.password) {
    throw new Error("Email and password are required");
  }
  if (!payload.productUrl) {
    throw new Error("Product URL is required");
  }

  flow().reset();
  flow().running = true;
  await clearFlowDone();
  await persistCartState(payload);

  try {
    await ensureLoggedIn(payload);
    logStep("Starting cart flow…");
    const navigated = await runCartFlow(payload.productUrl);
    if (navigated) return { ok: true, pending: true };
    await disableCursor();
    await markFlowDone();
    await clearFlowState();
    return { ok: true };
  } finally {
    flow().running = false;
  }
}

