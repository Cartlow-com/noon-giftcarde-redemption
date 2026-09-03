/**
 * Split from content.js — classic content script (shared isolated world).
 * Top-level function/var bindings are shared across content/*.js via manifest order.
 * Part: 12-cart-product.js — Product/cart detection helpers
 */
function isOnCartPage() {
  return location.href.indexOf("/cart") !== -1;
}

function isOnTargetProductPage(productUrl) {
  const base = (productUrl || "").trim().split("?")[0];
  if (!base || !isOnProductPage()) return false;
  return location.href.split("?")[0] === base;
}

function isCartEmpty() {
  if (!isOnCartPage()) return false;
  const text = normalizeText(document.body.textContent).toLowerCase();
  if (text.indexOf("shopping cart is empty") !== -1) return true;
  if (text.indexOf("your cart is empty") !== -1) return true;
  if (text.indexOf("cart is empty") !== -1) return true;
  return false;
}

async function goToProductPage(productUrl) {
  const normalizedUrl = (productUrl || "").trim();
  logStep("Opening product page…");
  const existing = await loadFlowState();
  await persistCartState({
    productUrl: normalizedUrl,
    cartPhase: existing?.cartPhase || "",
  });
  location.href = normalizedUrl;
  return true;
}

function isOnCheckoutPage() {
  return location.href.indexOf("/checkout") !== -1;
}

function isOnProductPage() {
  return location.pathname.indexOf("/p/") !== -1;
}

function findButtonByTextMatch(patterns, root) {
  const scope = root || document.body;
  const buttons = scope.querySelectorAll("button, [role='button'], a, div, span");
  let best = null;
  let bestLen = Infinity;
  for (let i = 0; i < buttons.length; i++) {
    const el = buttons[i];
    if (!isVisible(el)) continue;
    const t = normalizeText(el.textContent).toLowerCase();
    if (t.length > 40) continue;
    let matched = false;
    for (let j = 0; j < patterns.length; j++) {
      if (t === patterns[j] || t.indexOf(patterns[j]) === 0) {
        matched = true;
        break;
      }
    }
    if (!matched) continue;
    const clickable =
      el.closest("button, [role='button'], a") ||
      (el.tagName &&
      ["button", "a"].indexOf(el.tagName.toLowerCase()) !== -1
        ? el
        : null) ||
      el;
    if (t.length < bestLen) {
      best = clickable;
      bestLen = t.length;
    }
  }
  return best;
}

function findAddToCartButton() {
  const header = document.querySelector("header");
  const scopes = [
    findProductBuyArea(),
    document.querySelector("main"),
    document.body,
  ];
  let best = null;
  let bestLen = Infinity;
  for (let s = 0; s < scopes.length; s++) {
    const scope = scopes[s];
    if (!scope) continue;
    const nodes = scope.querySelectorAll("button, [role='button'], a, div, span");
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!isVisible(el)) continue;
      if (header && header.contains(el)) continue;
      const t = normalizeText(el.textContent).toLowerCase();
      if (t.length > 36) continue;
      if (t !== "add to cart" && t.indexOf("add to cart") === -1) continue;
      const clickable =
        el.closest("button, a, [role='button']") ||
        (["button", "a"].indexOf(el.tagName.toLowerCase()) !== -1 ? el : null) ||
        el;
      if (header && header.contains(clickable)) continue;
      if (t.length < bestLen) {
        best = clickable;
        bestLen = t.length;
      }
    }
  }
  return best;
}

function isAddToCartVisible() {
  return !!findAddToCartButton();
}

function hasExplicitInYourCartBadge() {
  const buyArea = findProductBuyArea();
  const nodes = buyArea.querySelectorAll("span, div, p, label, h2, h3, button");
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isVisible(el)) continue;
    const t = normalizeText(el.textContent).toLowerCase();
    if (t.length > 24) continue;
    if (t === "in your cart" || t.indexOf("in your cart") === 0) return true;
  }
  return false;
}

function hasProductQuantityRemoveControls() {
  const buyArea = findProductBuyArea();
  const buyText = normalizeText(buyArea.textContent).toLowerCase();
  if (buyText.indexOf("add to cart") !== -1) return false;
  const hasQty = buyArea.querySelector(
    "input[type='number'], [class*='quantity' i], [class*='qty' i]",
  );
  if (!hasQty) return false;
  return !!buyArea.querySelector(
    "[class*='trash' i], [class*='delete' i], [class*='remove' i], [aria-label*='remove' i], [aria-label*='delete' i]",
  );
}

function isItemAddedToCart() {
  if (findViewCartButton()) return true;
  if (hasExplicitInYourCartBadge()) return true;
  const buyArea = findProductBuyArea();
  const nodes = buyArea.querySelectorAll("span, div, p, label, button");
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isVisible(el)) continue;
    const t = normalizeText(el.textContent).toLowerCase();
    if (t.length > 40) continue;
    if (t.indexOf("added to cart") !== -1) return true;
  }
  return false;
}

function isThisProductInCart() {
  if (!isOnProductPage()) return false;
  return !isAddToCartVisible();
}

function findProductBuyArea() {
  return (
    document.querySelector(
      "[class*='BuyBox' i], [class*='buyBox' i], [class*='ProductActions' i], [class*='productActions' i], [class*='atc' i]",
    ) || document.body
  );
}

function isProductInCartOnPage() {
  return isThisProductInCart();
}

function findCartNavElement() {
  const links = document.querySelectorAll('a[href*="/cart"]');
  let fallback = null;
  for (let i = 0; i < links.length; i++) {
    const el = links[i];
    if (!isVisible(el)) continue;
    if (!fallback) fallback = el;
    if (
      el.closest("header, nav, [class*='header' i], [class*='Header' i], [class*='toolbar' i]")
    ) {
      return el;
    }
  }
  if (fallback) return fallback;

  const header = queryByRole("banner") || document.querySelector("header") || document.body;
  const nodes = header.querySelectorAll("a, button, [role='button'], [role='link']");
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isVisible(el)) continue;
    const t = normalizeText(el.textContent).toLowerCase();
    const aria = (el.getAttribute("aria-label") || "").toLowerCase();
    if (t.indexOf("cart") !== -1 || aria.indexOf("cart") !== -1) {
      return el.closest("a, button, [role='button']") || el;
    }
  }
  return null;
}

function getHeaderCartCount() {
  const cartEl = findCartNavElement();
  if (!cartEl) return 0;
  const container = cartEl.closest("a, button, li") || cartEl;
  const badges = container.querySelectorAll(
    "[class*='badge' i], [class*='count' i], [class*='Count' i], [class*='indicator' i], span, div",
  );
  for (let i = 0; i < badges.length; i++) {
    const badge = badges[i];
    if (!isVisible(badge)) continue;
    const raw = normalizeText(badge.textContent);
    if (!/^\d{1,2}$/.test(raw)) continue;
    const n = parseInt(raw, 10);
    if (n > 0) return n;
  }
  const cartText = normalizeText(container.textContent);
  const cartOnly = cartText.replace(/cart/gi, "").trim();
  const match = cartOnly.match(/^(\d{1,2})$/);
  if (match) return parseInt(match[1], 10);
  return 0;
}

function findHeaderCartLink() {
  return findCartNavElement();
}

function isItemAlreadyInCart() {
  return isThisProductInCart();
}

function getCartPageUrl() {
  const match = location.href.match(/^(https:\/\/www\.noon\.com\/[^/]+)/);
  return (match ? match[1] : "https://www.noon.com/uae-en") + "/cart/";
}

async function openCartFromProductPage() {
  logStep("Opening cart page…");
  const cartLink = findHeaderCartLink();
  if (cartLink) {
    await mouse().click(cartLink);
    await setCartPhase("viewed_cart");
    const reached = await waitFor(function () {
      return isOnCartPage();
    }, 6000, 200);
    if (reached) return { clicked: true };
    logStep("Cart click did not navigate — opening cart URL…");
  }
  const cartUrl = getCartPageUrl();
  await persistCartState({ productUrl: location.href });
  location.href = cartUrl;
  return { navigated: true };
}

