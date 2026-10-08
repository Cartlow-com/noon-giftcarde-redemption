/**
 * Split from content.js — classic content script (shared isolated world).
 * Top-level function/var bindings are shared across content/*.js via manifest order.
 * Part: 13-cart-nav.js — View cart / checkout buttons
 */
async function handleProductPageStep(productUrl) {
  logStep("Waiting for product page…");
  const onPdp = await waitFor(function () {
    return isOnProductPage();
  }, 15000, 50);
  if (!onPdp) {
    // Noon redirects a dead / undeliverable product link (e.g. to the home page).
    throw new Error(
      "Product page did not open — Noon showed " + location.href +
        " (check the row's product link)",
    );
  }

  const phase = await getCartPhase();
  if (
    phase === "added" ||
    phase === "viewed_cart" ||
    findViewCartButton() ||
    isAddedToCartDrawerOpen()
  ) {
    logStep("Item already added — skipping Add to Cart (click once only)");
    if (findViewCartButton() && phase !== "viewed_cart") {
      await clickViewCartButton();
      return false;
    }
    // No on-screen VIEW CART (the drawer closed): go to the cart via header / URL.
    if (!isOnCartPage()) {
      const opened = await openCartFromProductPage();
      return !!(opened && opened.navigated);
    }
    return false;
  }

  let addBtn = findAddToCartButton();
  if (!addBtn) {
    addBtn = await waitFor(function () {
      return findAddToCartButton();
    }, 8000, 50);
  }

  if (addBtn) {
    // Mark added BEFORE click so a loop resume cannot click a second time.
    await setCartPhase("added");
    const countBefore = getCartBadgeCount();
    // Only the cart count (or landing on the cart page) proves the item is in the
    // main cart. The "added" drawer alone is not enough: some products (e.g.
    // grocery / quick delivery) open it but go to a separate cart.
    const addRegistered = function () {
      return getCartBadgeCount() > countBefore || isOnCartPage() ? true : null;
    };
    logStep("Add to Cart visible — clicking once… (cart count " + countBefore + ")");
    // Full pointer/mouse sequence (exactly one click): a bare element.click()
    // ("once") was ignored by Noon's Add to Cart on some products.
    await mouse().click(addBtn, { fast: true });
    let added = await waitFor(addRegistered, 8000, 100);
    if (!added && getCartBadgeCount() <= countBefore) {
      // Nothing was added (count unchanged), so one more click cannot double-add.
      logStep("Add to Cart did not register — clicking once more…");
      const again = findAddToCartButton() || addBtn;
      await mouse().click(again, { fast: true });
      added = await waitFor(addRegistered, 8000, 100);
    }
    if (!added) {
      await setCartPhase("");
      throw new Error(
        "Item not added to the main cart (cart count stayed " + countBefore +
          ") — the product may be unavailable for this address or use a separate Noon cart",
      );
    }
    logStep("Added to cart (cart count " + getCartBadgeCount() + ")");
    return false;
  }

  // No Add to Cart only means "already in cart" when the cart really has items;
  // with an empty cart the product is out of stock / not deliverable here.
  const inCart = getCartBadgeCount();
  if (!inCart) {
    throw new Error(
      "Add to Cart not on the product page and the cart is empty — product may be out of stock or not deliverable to this address",
    );
  }
  logStep("Add to Cart not on page — cart has " + inCart + " item(s), opening cart…");
  if (isOnCartPage()) return false;
  const opened = await openCartFromProductPage();
  return !!(opened && opened.navigated);
}

function findViewCartButton() {
  // Only a VIEW CART that is really on screen: Noon keeps a collapsed (0-height)
  // quick-cart drawer with "Added to cart" + VIEW CART in every product page,
  // which made the bot think the item was added when the click had not registered.
  const nodes = document.querySelectorAll("button, a, [role='button']");
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (normalizeText(el.textContent).toLowerCase() !== "view cart") continue;
    if (isOnScreen(el)) return el;
  }
  return null;
}

async function clickViewCartButton() {
  logStep("Clicking View Cart…");
  const btn = await waitFor(function () {
    return findViewCartButton();
  }, 10000, 50);
  if (!btn) throw new Error("View Cart not found");
  await mouse().click(btn, { fast: true });
  await setCartPhase("viewed_cart");
  await waitFor(
    function () {
      return isOnCartPage() || findCheckoutButton();
    },
    8000,
    50,
  );
}

async function waitForProductPageReady() {
  logStep("Waiting for product page…");
  await waitFor(function () {
    return isOnProductPage();
  }, 15000, 50);
  logStep("Product page ready");
}

function navigateCartFlow(url) {
  persistCartState({ productUrl: url }).then(function () {
    location.href = url;
  });
  return true;
}

function findCheckoutButton() {
  const header = document.querySelector("header");
  const summaryAreas = document.querySelectorAll(
    "[class*='orderSummary' i], [class*='OrderSummary' i], [class*='cartSummary' i], [class*='summary' i], main, aside",
  );
  for (let a = 0; a < summaryAreas.length; a++) {
    const area = summaryAreas[a];
    if (!isVisible(area)) continue;
    if (header && header.contains(area)) continue;
    const buttons = area.querySelectorAll("button, [role='button']");
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      if (!isVisible(btn)) continue;
      const t = normalizeText(btn.textContent).toLowerCase();
      if (t === "checkout") return btn;
    }
  }
  const allButtons = document.querySelectorAll("button, [role='button']");
  for (let i = 0; i < allButtons.length; i++) {
    const btn = allButtons[i];
    if (!isVisible(btn)) continue;
    if (header && header.contains(btn)) continue;
    const t = normalizeText(btn.textContent).toLowerCase();
    if (t === "checkout") return btn;
  }
  return null;
}

function findCouponHeading() {
  const nodes = document.querySelectorAll("h1, h2, h3, h4, p, span, div, label");
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isVisible(el)) continue;
    const t = normalizeText(el.textContent).toLowerCase();
    if (t === "got a coupon?" || t === "got a coupon") return el;
  }
  return null;
}

function findCouponInput() {
  // Prefer explicit coupon placeholders anywhere on cart.
  const inputs = document.querySelectorAll("input");
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    if (!isVisible(input)) continue;
    const ph = String(input.getAttribute("placeholder") || "").toLowerCase();
    const aria = String(input.getAttribute("aria-label") || "").toLowerCase();
    const name = String(input.getAttribute("name") || "").toLowerCase();
    const id = String(input.getAttribute("id") || "").toLowerCase();
    if (
      ph.indexOf("coupon") !== -1 ||
      aria.indexOf("coupon") !== -1 ||
      name.indexOf("coupon") !== -1 ||
      id.indexOf("coupon") !== -1
    ) {
      return input;
    }
  }

  // Fallback: first text input under / near "Got a coupon?"
  const heading = findCouponHeading();
  if (heading) {
    let root = heading.parentElement;
    for (let depth = 0; root && depth < 6; depth++) {
      const near = root.querySelectorAll('input[type="text"], input:not([type]), input');
      for (let i = 0; i < near.length; i++) {
        if (isVisible(near[i])) return near[i];
      }
      root = root.parentElement;
    }
  }
  return null;
}

function findCouponApplyButton(input) {
  function isApplyEl(el) {
    if (!el || !isVisible(el)) return false;
    const t = normalizeText(el.textContent).toLowerCase();
    return t === "apply";
  }

  // Walk up from the input until APPLY is found in the same container.
  let node = input;
  for (let depth = 0; node && depth < 8; depth++) {
    const candidates = node.querySelectorAll(
      "button, [role='button'], a, span, div, p, label",
    );
    for (let i = 0; i < candidates.length; i++) {
      if (isApplyEl(candidates[i])) return candidates[i];
    }
    // Sibling APPLY next to input wrapper
    const sibling = node.nextElementSibling;
    if (isApplyEl(sibling)) return sibling;
    node = node.parentElement;
  }

  const heading = findCouponHeading();
  if (heading) {
    let root = heading.parentElement;
    for (let depth = 0; root && depth < 6; depth++) {
      const candidates = root.querySelectorAll(
        "button, [role='button'], a, span, div, p, label",
      );
      for (let i = 0; i < candidates.length; i++) {
        if (isApplyEl(candidates[i])) return candidates[i];
      }
      root = root.parentElement;
    }
  }
  return null;
}

async function applyCouponOnCartPage(code) {
  const coupon = String(code || "").trim();
  if (!coupon) return false;

  logStep("Applying coupon " + coupon + "…");
  const input = await waitFor(function () {
    return findCouponInput();
  }, 10000, 50);
  if (!input) throw new Error("Coupon code field not found on cart");

  try {
    input.scrollIntoView({ block: "center", inline: "nearest" });
  } catch (_) {}
  await pause(0.25);

  await mouse().click(input, { fast: true });
  await pause(0.2);
  try {
    input.focus();
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  } catch (_) {}
  await mouse().type(input, coupon, { paste: true, fast: true });
  // Ensure React/Noon sees the value
  try {
    if (String(input.value || "").trim() !== coupon) {
      const proto = window.HTMLInputElement && window.HTMLInputElement.prototype;
      const descriptor = proto && Object.getOwnPropertyDescriptor(proto, "value");
      if (descriptor && descriptor.set) descriptor.set.call(input, coupon);
      else input.value = coupon;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  } catch (_) {}
  await pause(0.4);

  const applyBtn = await waitFor(function () {
    return findCouponApplyButton(input);
  }, 8000, 50);
  if (!applyBtn) throw new Error("Coupon APPLY button not found");

  try {
    applyBtn.scrollIntoView({ block: "center", inline: "nearest" });
  } catch (_) {}
  logStep("Clicking APPLY for coupon " + coupon + "…");
  await mouse().click(applyBtn, { fast: true });
  await pause(1.5);
  logStep("Coupon APPLY clicked: " + coupon);
  return true;
}

async function applyCouponFromFlowStateIfNeeded() {
  const state = await loadFlowState();
  const code = String((state && state.couponCode) || "").trim();
  if (!code) {
    logStep("No coupon code on this row — skipping APPLY");
    return false;
  }
  if (state && state.couponApplied) {
    logStep("Coupon already applied earlier — skipping");
    return true;
  }
  await applyCouponOnCartPage(code);
  await persistCartState({
    productUrl: state && state.productUrl,
    couponCode: code,
    couponApplied: true,
  });
  return true;
}

async function waitForCartPageReady() {
  logStep("Waiting for cart page…");
  await waitFor(
    function () {
      // Ready when Checkout exists OR coupon field is visible (coupon is below Checkout).
      return isOnCartPage() && (findCheckoutButton() || findCouponInput());
    },
    12000,
    50,
  );
  logStep("Cart page ready");
}

