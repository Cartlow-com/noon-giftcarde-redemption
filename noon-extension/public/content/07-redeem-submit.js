/**
 * Split from content.js — classic content script (shared isolated world).
 * Top-level function/var bindings are shared across content/*.js via manifest order.
 * Part: 07-redeem-submit.js — Fill/redeem + order confirmation + batch flags
 */
async function fillAndRedeemGiftCard(giftCardNumber, giftCardPin, waitForResult, balanceBefore) {
  const cardDigits = normalizeGiftCardDigits(giftCardNumber);
  const pinDigits = normalizeGiftCardDigits(giftCardPin);
  if (!cardDigits || cardDigits.length < 12) {
    throw new Error("Gift card number must be at least 12 digits");
  }
  if (!pinDigits || pinDigits.length < 4) {
    throw new Error("Gift card PIN must be at least 4 digits");
  }

  const numberInput = await waitFor(function () {
    return findGiftCardNumberInput();
  }, 10000, 50);
  if (!numberInput) throw new Error("Gift card number input not found");

  logStep("Typing gift card number (no spaces)…");
  await mouse().type(numberInput, cardDigits, { paste: true, fast: true });
  logStep("Gift card number entered");

  const pinInput = await waitFor(function () {
    return findGiftCardPinInput();
  }, 8000, 50);
  if (!pinInput) throw new Error("Gift card PIN input not found");

  logStep("Typing PIN…");
  await mouse().type(pinInput, pinDigits, { masked: true, paste: true, fast: true });
  logStep("PIN entered");

  const redeemBtn = await waitUntilEnabled(
    function () {
      return findRedeemSubmitButton();
    },
    6000,
  );
  if (!redeemBtn) throw new Error("Redeem button not found");

  logStep("Clicking Redeem…");
  await mouse().click(redeemBtn, { fast: true });
  logStep("Gift card submitted");
  if (waitForResult) {
    const outcome = await waitForRedeemOutcome();

    if (outcome.alreadyRedeemed) {
      logStep("Already redeemed — skipping balance check");
      await dismissRedeemModal();
      return outcome;
    }

    if (!outcome.redeemed) return outcome;

    logStep("Redeem success — " + (outcome.popupMessage || "popup confirmed"));

    if (balanceBefore == null) {
      return {
        redeemed: false,
        alreadyRedeemed: false,
        error: "Could not read credits balance before redeem",
        popupMessage: outcome.popupMessage,
      };
    }

    await dismissRedeemModal();

    let balanceAfter = readCreditsBalance();
    if (balanceAfter != null && balanceAfter > balanceBefore) {
      const balanceDelta =
        Math.round((balanceAfter - balanceBefore) * 100) / 100;
      logStep(
        "Credits after redeem: " +
          balanceAfter +
          " AED (+" +
          balanceDelta +
          ")",
      );
      return {
        redeemed: true,
        alreadyRedeemed: false,
        verified: true,
        balanceBefore: balanceBefore,
        balanceAfter: balanceAfter,
        balanceDelta: balanceDelta,
        popupMessage: outcome.popupMessage,
      };
    }

    logStep("Balance not updated on page — refreshing credits page…");
    await persistFlow("POST_REDEEM_BALANCE", {
      balanceBefore: balanceBefore,
      redeemPopupMessage: outcome.popupMessage,
      waitForRedeemResult: true,
    });
    await refreshCreditsPageForBalance();
    return { pendingBalanceCheck: true };
  }
}

function findFirstRedeemTransaction(cardDigits) {
  const lastFour = cardDigits.slice(-4);
  const rowSelectors = "table tbody tr, [class*='transaction' i], [class*='history' i] li, [class*='credit' i] [class*='row' i]";
  const rows = document.querySelectorAll(rowSelectors);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!isVisible(row)) continue;
    const text = normalizeText(row.textContent);
    if (!text || text.length < 4) continue;
    const hasCard =
      text.replace(/\s/g, "").indexOf(cardDigits) !== -1 ||
      text.indexOf(lastFour) !== -1;
    if (!hasCard) continue;
    const hasCredit = /\+\s*[\d,.]+/.test(text);
    if (hasCredit) return row;
  }
  return null;
}

async function waitForRedeemOutcome() {
  logStep("Waiting for redeem popup message…");
  const feedback = await waitFor(
    function () {
      return scanRedeemPopupFeedback();
    },
    15000,
    50,
  );

  if (!feedback) {
    return {
      redeemed: false,
      alreadyRedeemed: false,
      error: "No redeem popup message detected",
    };
  }

  logStep("Redeem popup: " + feedback.message);

  if (feedback.type === "already") {
    return {
      redeemed: false,
      alreadyRedeemed: true,
      error: feedback.message || "Already redeemed",
      popupMessage: feedback.message,
    };
  }
  if (feedback.type === "error") {
    return {
      redeemed: false,
      alreadyRedeemed: false,
      error: feedback.message || "Redeem error",
    };
  }
  if (feedback.type === "success") {
    return {
      redeemed: true,
      alreadyRedeemed: false,
      popupMessage: feedback.message,
    };
  }
  return { redeemed: false, alreadyRedeemed: false, error: "Unknown redeem popup" };
}

function extractOrderIdFromUrl(url) {
  const text = String(url || location.href || "");
  const patterns = [
    /[?&]order(?:[_-]?id|[_-]?number|No)?=([A-Z0-9-]{5,})/i,
    /\/orders?\/([A-Z0-9-]{5,})/i,
    /\/confirmation\/([A-Z0-9-]{5,})/i,
    /\/thank[_-]?you\/([A-Z0-9-]{5,})/i,
  ];
  for (let i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]);
    if (match && match[1]) return match[1].trim();
  }
  return null;
}

function extractOrderIdFromPage() {
  const fromUrl = extractOrderIdFromUrl(location.href);
  if (fromUrl) return fromUrl;
  const text = document.body.textContent || "";
  const patterns = [
    /order\s*(?:#|no\.?\s*|number\s*:?\s*)([A-Z0-9-]{5,})/i,
    /order\s*id\s*:?\s*([A-Z0-9-]{5,})/i,
    /(N[A-Z0-9]{8,})/,
  ];
  for (let i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]);
    if (match && match[1]) return match[1].trim();
  }
  return null;
}

async function waitForOrderConfirmation() {
  logStep("Waiting for order confirmation…");
  await waitFor(
    function () {
      if (/order.*confirmation|thank you|order placed/i.test(document.body.textContent)) {
        return true;
      }
      if (location.href.indexOf("/order") !== -1) return true;
      return !!extractOrderIdFromPage();
    },
    45000,
    50,
  );
  return {
    orderId: extractOrderIdFromPage(),
    confirmationUrl: location.href,
  };
}

var batchFlowMode = false;
var batchCartContext = null;
var batchPlaceOrderPref = null;

