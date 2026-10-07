/**
 * Classic content script (shared isolated world) — loaded after 13-cart-nav.js.
 * Part: 13a-cart-empty.js — empty the Noon cart (Cart test mode clean-up).
 */

function isCouponControl(el) {
  // The applied-coupon chip can also say "Remove" — never treat it as a cart item.
  let node = el;
  for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
    const text = normalizeText(node.textContent).toLowerCase();
    if (text.length < 160 && /coupon|promo|voucher/.test(text)) return true;
    if (node.querySelector && node.querySelector("input[name*='coupon' i], input[placeholder*='coupon' i]")) {
      return true;
    }
  }
  return false;
}

/**
 * Per-item remove controls on Noon's cart page. Noon marks them precisely:
 * [data-qa="cart-remove_item"] ("Remove"), fallback the item trash icon
 * [data-qa="item-remove"]. Never a broad text/label scan — the cart page has no
 * <main>, and recommended products below the cart matched "remove" in labels.
 */
function findCartRemoveButtons() {
  const seen = new Set();
  const found = [];
  const add = function (el) {
    const clickable = el.closest("button, a, [role='button']") || el;
    if (seen.has(clickable) || !isOnScreenOrScrollable(clickable) || isCouponControl(clickable)) return;
    seen.add(clickable);
    found.push(clickable);
  };
  document.querySelectorAll("[data-qa='cart-remove_item']").forEach(add);
  if (!found.length) document.querySelectorAll("[data-qa='item-remove']").forEach(add);
  return found;
}

/** Laid out (non-zero size) — the item may be below the fold, mouse() scrolls to it. */
function isOnScreenOrScrollable(el) {
  if (!el || !el.getBoundingClientRect) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** Confirm prompt after clicking remove ("Remove" vs "Move to wishlist"). */
function findCartRemoveConfirmButton() {
  const dialogs = document.querySelectorAll("[role='dialog'], [aria-modal='true'], [class*='modal' i], [class*='popup' i]");
  for (let i = 0; i < dialogs.length; i++) {
    if (!isVisible(dialogs[i])) continue;
    const buttons = dialogs[i].querySelectorAll("button, [role='button']");
    for (let j = 0; j < buttons.length; j++) {
      const t = normalizeText(buttons[j].textContent).toLowerCase();
      if (isVisible(buttons[j]) && (t === "remove" || t === "yes, remove" || t === "remove item" || t === "delete")) {
        return buttons[j];
      }
    }
  }
  return null;
}

/** Short description of a control, logged so the real cart markup can be tuned. */
function describeControl(el) {
  const attr = function (name) {
    return el.getAttribute(name) ? name + "=" + String(el.getAttribute(name)).slice(0, 40) : "";
  };
  const holder = el.closest("[data-qa]");
  return [
    el.tagName.toLowerCase(),
    attr("data-qa"),
    attr("aria-label"),
    "text=" + normalizeText(el.textContent).slice(0, 30),
    holder && holder !== el ? "in=" + String(holder.getAttribute("data-qa")).slice(0, 40) : "",
  ].filter(Boolean).join(" ");
}

async function emptyNoonCart() {
  if (!isOnCartPage()) throw new Error("Not on the Noon cart page");
  await waitFor(function () {
    return isCartEmpty() || findCartRemoveButtons().length ? true : null;
  }, 10000, 100);
  if (isCartEmpty() && !findCartRemoveButtons().length) {
    logStep("Cart is already empty");
    return { ok: true, removed: 0, error: null };
  }
  const initial = findCartRemoveButtons();
  logStep("Cart remove controls found: " + initial.length);
  initial.slice(0, 8).forEach(function (el, idx) {
    logStep("  [" + idx + "] " + describeControl(el));
  });

  let removed = 0;
  for (let i = 0; i < 10; i++) {
    flow().check();
    const buttons = findCartRemoveButtons();
    if (!buttons.length) break;
    const before = buttons.length;
    logStep("Removing item " + (removed + 1) + " from cart…");
    await mouse().click(buttons[0], { fast: true });
    const confirm = await waitFor(findCartRemoveConfirmButton, 1500, 50);
    if (confirm) await mouse().click(confirm, { fast: true });
    const gone = await waitFor(function () {
      return findCartRemoveButtons().length < before ? true : null;
    }, 8000, 100);
    if (!gone) break;
    removed += 1;
  }

  const empty = findCartRemoveButtons().length === 0;
  logStep(empty ? "Cart is empty (" + removed + " item(s) removed)" : "Cart still has items after clean-up");
  return {
    ok: empty,
    removed: removed,
    error: empty ? null : "Cart still has items (" + findCartRemoveButtons().length + " remove control(s) left)",
  };
}
