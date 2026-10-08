/**
 * PDP guard — a dead product link must fail fast with a clear reason, never
 * fall through to "already in cart" → empty cart → "Checkout button not found".
 * Run: node --test tests/cartPdpGuard.test.cjs
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load({ href, pathname, addBtn, badge }) {
  const steps = [];
  const opened = [];
  const ctx = {
    location: { href, pathname },
    logStep: (m) => steps.push(m),
    // Instant waitFor: one probe, no real timers.
    waitFor: async (fn) => fn() || null,
    getCartPhase: async () => "",
    setCartPhase: async () => {},
    isOnProductPage: () => pathname.indexOf("/p/") !== -1,
    isOnCartPage: () => false,
    isAddedToCartDrawerOpen: () => false,
    findAddToCartButton: () => addBtn || null,
    getCartBadgeCount: () => badge,
    openCartFromProductPage: async () => { opened.push("cart"); return { navigated: true }; },
    document: { querySelectorAll: () => [] },
  };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "content", "13-cart-nav.js"), "utf8");
  vm.runInContext(src, ctx);
  return { ctx, steps, opened };
}

test("redirected away from the product page → clear error with the landing URL", async () => {
  const { ctx } = load({ href: "https://www.noon.com/uae-en/", pathname: "/uae-en/", badge: 0 });
  await assert.rejects(
    ctx.handleProductPageStep("https://www.noon.com/uae-en/x/N123/p/"),
    /Product page did not open — Noon showed https:\/\/www\.noon\.com\/uae-en\//,
  );
});

test("no Add to Cart + empty cart → fails as unavailable, does not open the cart", async () => {
  const { ctx, opened } = load({ href: "https://www.noon.com/uae-en/x/N1/p/", pathname: "/uae-en/x/N1/p/", badge: 0 });
  await assert.rejects(ctx.handleProductPageStep("https://www.noon.com/uae-en/x/N1/p/"), /cart is empty — product may be out of stock/);
  assert.deepEqual(opened, []);
});

test("no Add to Cart + cart has items → still opens the cart (already-in-cart case)", async () => {
  const { ctx, opened, steps } = load({ href: "https://www.noon.com/uae-en/x/N1/p/", pathname: "/uae-en/x/N1/p/", badge: 2 });
  const navigated = await ctx.handleProductPageStep("https://www.noon.com/uae-en/x/N1/p/");
  assert.equal(navigated, true);
  assert.deepEqual(opened, ["cart"]);
  assert.ok(steps.some((s) => /cart has 2 item\(s\)/.test(s)));
});

test("empty cart page reports 'never added' instead of a bare Checkout error", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "content", "15-cart-flow.js"), "utf8");
  assert.ok(/if \(!findCartRemoveButtons\(\)\.length\) \{\s*throw new Error\("Cart is empty — the product was never added/.test(src));
});
