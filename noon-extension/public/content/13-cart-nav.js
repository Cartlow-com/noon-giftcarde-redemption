/**
 * Split from content.js — classic content script (shared isolated world).
 * Top-level function/var bindings are shared across content/*.js via manifest order.
 * Part: 13-cart-nav.js — View cart / checkout buttons
 */
async function handleProductPageStep(productUrl) {
  logStep("Waiting for product page…");
  await waitFor(function () {
    return isOnProductPage();
  }, 15000, 50);

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
    logStep("Add to Cart visible — clicking once…");
    await mouse().click(addBtn, { fast: true, once: true });
    await waitFor(
      function () {
        return findViewCartButton() || isOnCartPage() || isAddedToCartDrawerOpen();
      },
      6000,
      50,
    );
    return false;
  }

  logStep("Add to Cart not on page — item already in cart, opening cart…");
  if (isOnCartPage()) return false;
  const opened = await openCartFromProductPage();
  return !!(opened && opened.navigated);
}

function findViewCartButton() {
  const dialogScopes = document.querySelectorAll(
    '[role="dialog"], [aria-modal="true"], [class*="modal" i], [class*="Modal" i], [class*="drawer" i], [class*="Drawer" i]',
  );
  for (let i = 0; i < dialogScopes.length; i++) {
    const scope = dialogScopes[i];
    if (!isVisible(scope)) continue;
    const btn = findButtonByTextMatch(["view cart"], scope);
    if (btn && isVisible(btn)) return btn;
  }
  return (
    findButtonByTextMatch(["view cart"]) ||
    findClickableByText("VIEW CART") ||
    queryByRole("button", { name: "VIEW CART" })
  );
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

async function waitForCartPageReady() {
  logStep("Waiting for cart page…");
  await waitFor(
    function () {
      return isOnCartPage() && findCheckoutButton();
    },
    12000,
    50,
  );
  logStep("Cart page ready");
}

