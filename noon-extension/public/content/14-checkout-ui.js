/**
 * Split from content.js — classic content script (shared isolated world).
 * Top-level function/var bindings are shared across content/*.js via manifest order.
 * Part: 14-checkout-ui.js — Checkout credits UI
 */
async function waitForCheckoutPageReady() {
  await pause(0.03);
  logStep("Waiting for checkout page…");
  await waitFor(
    function () {
      return isOnCheckoutPage();
    },
    12000,
    200,
  );
  logStep("Checkout page ready");
}

function findContinueToCheckoutButton() {
  return (
    findClickableByText("CONTINUE TO CHECKOUT") ||
    findClickableByText("Continue to checkout") ||
    queryByRole("button", { name: "CONTINUE TO CHECKOUT" })
  );
}

function isAddedToCartDrawerOpen() {
  if (findViewCartButton()) return true;
  const dialogs = document.querySelectorAll('[role="dialog"], [aria-modal="true"]');
  for (let i = 0; i < dialogs.length; i++) {
    const el = dialogs[i];
    if (!isVisible(el)) continue;
    const t = normalizeText(el.textContent).toLowerCase();
    if (t.indexOf("added to cart") !== -1 && t.indexOf("view cart") !== -1) return true;
  }
  return false;
}

function isNoonOnePopupOpen() {
  return !!findContinueToCheckoutButton();
}

function isUseMyCreditsText(text) {
  const t = normalizeText(text).toLowerCase();
  if (t.length > 60) return false;
  return (
    /use my\s+[\d.]+\s+credits?/.test(t) ||
    (t.indexOf("use my") !== -1 && t.indexOf("credit") !== -1)
  );
}

function findUseCreditsRow() {
  const nodes = document.querySelectorAll("label, span, p, div, li");
  let best = null;
  let bestLen = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isVisible(el)) continue;
    const t = normalizeText(el.textContent);
    const tl = t.toLowerCase();
    if (!/use my\s+[\d.]+\s+credits?/.test(tl) && !isUseMyCreditsText(t)) continue;
    if (tl.indexOf("google pay") !== -1 || tl.indexOf("tabby") !== -1) continue;
    if (t.length < bestLen) {
      best = el;
      bestLen = t.length;
    }
  }
  return best;
}

function isCreditsSufficientMessageVisible() {
  const text = normalizeText(document.body.textContent).toLowerCase();
  return (
    text.indexOf("credits are sufficient") !== -1 ||
    text.indexOf("sufficient to cover") !== -1 ||
    text.indexOf("credits cover") !== -1
  );
}

function isCheckoutTotalZero() {
  const nodes = document.querySelectorAll("div, span, p, li");
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isVisible(el)) continue;
    const t = normalizeText(el.textContent).toLowerCase();
    if (t !== "total" && t.indexOf("total") !== 0) continue;
    const block = el.parentElement;
    if (block && /\b0\.00\b/.test(block.textContent)) return true;
  }
  return false;
}

function isCreditsAppliedInSummary() {
  const bodyText = normalizeText(document.body.textContent).toLowerCase();
  if (/noon credits[\s\S]{0,40}-\s*[\d.]+/.test(bodyText)) return true;

  const nodes = document.querySelectorAll("div, span, li, p, td");
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isVisible(el)) continue;
    const t = normalizeText(el.textContent).toLowerCase();
    if (t.indexOf("noon credit") === -1) continue;
    if (/-\s*[\d.]+/.test(t)) return true;
    const block = el.parentElement;
    if (block) {
      const bt = block.textContent || "";
      if (/noon credit/i.test(bt) && /-\s*[\d.]+/.test(bt)) return true;
    }
  }
  return false;
}

function isUseMyCreditsAlreadyEnabled() {
  if (isCreditsAppliedInSummary()) return true;
  if (isCreditsSufficientMessageVisible()) return true;
  if (isCheckoutTotalZero() && findPlaceOrderButton()) return true;

  const row = findUseCreditsRow();
  if (row) {
    const sw = findCreditsSwitchNear(row);
    if (sw && isCreditsSwitchOn(sw)) return true;
  }
  return false;
}

function findCreditsSwitchNear(labelEl) {
  if (!labelEl) return null;
  let node = labelEl;
  for (let depth = 0; depth < 6 && node; depth++) {
    const switches = node.querySelectorAll(
      "input[type='checkbox'], [role='switch']",
    );
    for (let i = 0; i < switches.length; i++) {
      if (isVisible(switches[i])) return switches[i];
    }
    const parent = node.parentElement;
    if (parent) {
      for (let j = 0; j < parent.children.length; j++) {
        const child = parent.children[j];
        if (child === node || !(child instanceof Element)) continue;
        if (child.querySelector("input[type='checkbox'], [role='switch']")) {
          const sw = child.querySelector(
            "input[type='checkbox'], [role='switch']",
          );
          if (sw && isVisible(sw)) return sw;
        }
      }
    }
    node = parent;
  }
  return null;
}

function isCreditsSwitchOn(switchEl) {
  if (!switchEl) return false;
  if (switchEl.type === "checkbox") return switchEl.checked;
  if (switchEl.getAttribute("aria-checked") === "true") return true;
  if (switchEl.getAttribute("aria-pressed") === "true") return true;
  return false;
}

async function ensureUseMyCreditsEnabled() {
  await waitFor(
    function () {
      return (
        isOnCheckoutPage() &&
        (isUseMyCreditsAlreadyEnabled() ||
          findUseCreditsRow() ||
          findPlaceOrderButton())
      );
    },
    12000,
    200,
  );

  if (isUseMyCreditsAlreadyEnabled()) {
    logStep("Use my credits already enabled — no click needed");
    return;
  }

  const labelRow = findUseCreditsRow();
  if (!labelRow) {
    if (findPlaceOrderButton()) {
      logStep("Place Order ready — credits appear enabled");
      return;
    }
    throw new Error("Use my credits option not found");
  }

  const switchEl = findCreditsSwitchNear(labelRow);
  if (switchEl && isCreditsSwitchOn(switchEl)) {
    logStep("Use my credits toggle already on — no click needed");
    return;
  }

  if (!switchEl) {
    logStep("Credits switch not found — skipping click");
    return;
  }

  logStep("Enabling Use my credits…");
  await mouse().click(switchEl);
  await pause(0.8);

  if (isUseMyCreditsAlreadyEnabled()) {
    logStep("Use my credits enabled");
    return;
  }

  logStep("Credits toggle did not apply — not retrying to avoid wrong clicks");
}

function findPlaceOrderButton() {
  const buttons = document.querySelectorAll("button, [role='button']");
  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    if (!isVisible(btn)) continue;
    const t = normalizeText(btn.textContent).toUpperCase();
    if (t === "PLACE ORDER" || t.indexOf("PLACE ORDER") === 0) return btn;
  }
  return null;
}

function findSelectPaymentMethodButton() {
  const buttons = document.querySelectorAll("button, [role='button']");
  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    if (!isVisible(btn)) continue;
    const t = normalizeText(btn.textContent).toUpperCase();
    if (
      t === "SELECT PAYMENT METHOD" ||
      t.indexOf("SELECT PAYMENT METHOD") === 0
    ) {
      return btn;
    }
  }
  return null;
}

function hasCheckoutPaymentIssue() {
  return !!findSelectPaymentMethodButton() && !findPlaceOrderButton();
}

function detectCartState() {
  if (isOnCheckoutPage()) return "CHECKOUT_PAGE";
  if (isNoonOnePopupOpen()) return "NOON_ONE_POPUP";
  if (isOnCartPage()) return "CART_PAGE";
  if (isAddedToCartDrawerOpen()) return "ADDED_DRAWER";
  if (isOnProductPage()) return "PRODUCT_PAGE";
  if (hasNoonSession()) return "LOGGED_IN";
  return "NOT_LOGGED_IN";
}

