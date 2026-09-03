/**
 * Split from content.js — classic content script (shared isolated world).
 * Top-level function/var bindings are shared across content/*.js via manifest order.
 * Part: 06-redeem-scan.js — Redeem feedback scanning
 */
function getRedeemFeedbackScopes() {
  const scopes = [];
  document.querySelectorAll('[role="dialog"], [aria-modal="true"]').forEach(function (el) {
    if (isVisible(el)) scopes.push(el);
  });
  document
    .querySelectorAll(
      '[class*="toast" i], [class*="Toast" i], [class*="snackbar" i], [class*="alert" i], [class*="notification" i]',
    )
    .forEach(function (el) {
      if (isVisible(el)) scopes.push(el);
    });
  return scopes;
}

function classifyRedeemFeedbackText(text) {
  const lower = normalizeText(text).toLowerCase();
  if (!lower || lower.length < 5) return null;
  if (
    lower.indexOf("already redeemed") !== -1 ||
    lower.indexOf("gift card is already") !== -1 ||
    lower.indexOf("already been redeemed") !== -1 ||
    lower.indexOf("already used") !== -1 ||
    lower.indexOf("card has already") !== -1 ||
    lower.indexOf("voucher has already") !== -1
  ) {
    return { type: "already", message: lower.slice(0, 140) };
  }
  if (
    lower.indexOf("successfully redeemed") !== -1 ||
    lower.indexOf("redeemed successfully") !== -1 ||
    lower.indexOf("gift card redeemed") !== -1 ||
    lower.indexOf("card redeemed successfully") !== -1 ||
    (lower.indexOf("success") !== -1 && lower.indexOf("redeem") !== -1) ||
    (lower.indexOf("added") !== -1 && lower.indexOf("credit") !== -1)
  ) {
    return { type: "success", message: lower.slice(0, 140) };
  }
  if (
    lower.indexOf("invalid") !== -1 ||
    lower.indexOf("incorrect") !== -1 ||
    lower.indexOf("expired") !== -1 ||
    (lower.indexOf("failed") !== -1 && lower.indexOf("redeem") !== -1)
  ) {
    return { type: "error", message: lower.slice(0, 140) };
  }
  return null;
}

function isRedeemFormContainer(el) {
  const text = normalizeText(el.textContent).toLowerCase();
  if (text.indexOf("gift card number") !== -1) return true;
  if (text.indexOf("redeem gift card") !== -1 && text.length > 90) return true;
  return false;
}

function scanVisibleRedeemToasts() {
  const nodes = document.querySelectorAll(
    "div, span, p, section, aside, [role='alert'], [role='status'], [aria-live]",
  );
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isVisible(el)) continue;
    if (isRedeemFormContainer(el)) continue;
    const text = normalizeText(el.textContent);
    if (text.length < 5 || text.length > 180) continue;
    const style = window.getComputedStyle(el);
    const fixed =
      style.position === "fixed" ||
      style.position === "sticky" ||
      el.closest('[class*="toast" i], [class*="snackbar" i], [class*="alert" i]');
    if (!fixed && text.length > 80) continue;
    const classified = classifyRedeemFeedbackText(text);
    if (classified) return classified;
  }
  return null;
}

function scanRedeemPopupFeedback() {
  const scopes = getRedeemFeedbackScopes();
  for (let s = 0; s < scopes.length; s++) {
    const classified = classifyRedeemFeedbackText(scopes[s].textContent);
    if (classified) return classified;
  }
  return scanVisibleRedeemToasts();
}

async function dismissRedeemModal() {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!findGiftCardNumberInput() && !findAddCreditsModal()) return;

    const dialog =
      document.querySelector('[role="dialog"][aria-modal="true"]') ||
      document.querySelector('[role="dialog"]') ||
      findAddCreditsModal();
    if (dialog) {
      const closeInDialog = dialog.querySelector(
        '[aria-label="Close"], [aria-label="close"], button[class*="close" i], [class*="CloseButton" i]',
      );
      if (closeInDialog && isVisible(closeInDialog)) {
        await mouse().click(closeInDialog);
        await pause(0.6);
        continue;
      }
    }

    const closeBtn = document.querySelector(
      '[aria-label="Close"], [aria-label="close"], button[class*="close" i]',
    );
    if (closeBtn && isVisible(closeBtn)) {
      await mouse().click(closeBtn);
      await pause(0.6);
      continue;
    }

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }),
    );
    await pause(0.5);
  }
}

async function waitForBalanceIncrease(balanceBefore, timeoutMs) {
  if (balanceBefore == null) return null;
  return waitFor(
    function () {
      const after = readCreditsBalance();
      if (after != null && after > balanceBefore) return after;
      return null;
    },
    timeoutMs || 15000,
    400,
  );
}

async function refreshCreditsPageForBalance() {
  logStep("Refreshing credits page to load updated balance…");
  const creditsUrl = NOON_CREDITS;
  if (location.href.split("?")[0] !== creditsUrl.split("?")[0]) {
    location.href = creditsUrl;
  } else {
    location.reload();
  }
  await waitForPageReady();
  await waitForCreditsPageReady();
}

async function completePostRedeemBalanceCheck(state) {
  await waitForCreditsPageReady();
  let balanceAfter = readCreditsBalance();
  if (balanceAfter == null || balanceAfter <= state.balanceBefore) {
    const waited = await waitForBalanceIncrease(state.balanceBefore, 12000);
    if (waited != null) balanceAfter = waited;
  }
  const balanceDelta =
    balanceAfter != null
      ? Math.round((balanceAfter - state.balanceBefore) * 100) / 100
      : null;
  const verified =
    balanceAfter != null && balanceAfter > state.balanceBefore;
  if (!verified && state.redeemPopupMessage) {
    logStep(
      "Balance unchanged after refresh — accepting popup confirmation: " +
        state.redeemPopupMessage,
    );
  } else {
    logStep(
      "Credits after redeem: " +
        (balanceAfter != null ? balanceAfter + " AED" : "unknown") +
        (balanceDelta != null && balanceDelta > 0 ? " (+" + balanceDelta + ")" : ""),
    );
  }
  return {
    redeemed: true,
    alreadyRedeemed: false,
    verified: verified,
    balanceBefore: state.balanceBefore,
    balanceAfter: balanceAfter,
    balanceDelta: balanceDelta,
    popupMessage: state.redeemPopupMessage,
  };
}

