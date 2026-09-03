/**
 * Split from content.js — classic content script (shared isolated world).
 * Top-level function/var bindings are shared across content/*.js via manifest order.
 * Part: 03-dom-nav.js — Session/nav finders + giftcard inputs
 */
function isLoggedIn() {
  const banner = queryByRole("banner") || document.querySelector("header");
  const scope = banner || document.body;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode;
  while (node) {
    if (node instanceof Element && isVisible(node)) {
      const t = (node.textContent || "").trim();
      if (/^Hi,\s/.test(t) || t.indexOf("Hi,") === 0) return true;
    }
    node = walker.nextNode();
  }
  return false;
}

function isAccountRequiredPage() {
  const text = normalizeText(document.body && document.body.textContent).toLowerCase();
  if (text.indexOf("account required") !== -1) return true;
  if (text.indexOf("please sign in or register") !== -1) return true;
  return !!findAccountRequiredLoginButton();
}

function findAccountRequiredLoginButton() {
  return (
    findClickableByText("LOGIN/SIGNUP") ||
    findClickableByText("Login/Signup") ||
    findClickableByText("LOGIN / SIGNUP") ||
    findClickableByText("Login / Signup")
  );
}

function hasNoonSession() {
  if (isLoggedIn()) return true;
  // Logged-out account gate must NOT count as a session.
  if (isAccountRequiredPage()) return false;
  if (isOnAccountPage()) return true;
  if (isOnCheckoutPage()) return true;
  if (isOnCartPage()) return true;
  if (isOnProductPage()) return true;
  return false;
}

function normalizeText(t) {
  return (t || "").replace(/\s+/g, " ").trim();
}

function findClickableByText(text, root) {
  const normalized = normalizeText(text).toLowerCase();
  const scope = root || document.body;
  const nodes = scope.querySelectorAll(
    "button, a, [role='button'], [role='link'], div, span, li",
  );
  let best = null;
  let bestLen = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isVisible(el)) continue;
    const t = normalizeText(el.textContent).toLowerCase();
    if (t !== normalized && t.indexOf(normalized) !== 0) continue;
    if (t.length > 40) continue;
    const clickable =
      el.closest("button, a, [role='button']") ||
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

function findMenuItemByText(text) {
  const normalized = normalizeText(text).toLowerCase();
  const sidebar =
    document.querySelector("nav") ||
    document.querySelector("aside") ||
    document.querySelector("[class*='sidebar' i], [class*='SideNav' i]") ||
    document.body;

  const anchors = sidebar.querySelectorAll("a[href]");
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    if (!isVisible(a)) continue;
    const t = normalizeText(a.textContent).toLowerCase();
    if (t === normalized || t.indexOf(normalized) === 0) return a;
  }

  const nodes = sidebar.querySelectorAll(
    "a, button, [role='menuitem'], [role='link'], li",
  );
  let best = null;
  let bestLen = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isVisible(el)) continue;
    const t = normalizeText(el.textContent).toLowerCase();
    if (t !== normalized && t.indexOf(normalized) !== 0) continue;
    if (t.length > 40) continue;
    const clickable =
      el.closest("a[href]") ||
      el.querySelector("a[href]") ||
      el.closest("a, button, [role='button'], [role='link']") ||
      el;
    if (t.length < bestLen) {
      best = clickable;
      bestLen = t.length;
    }
  }
  return best;
}

function findNoonCreditsLink() {
  const links = document.querySelectorAll('a[href*="/credits"]');
  for (let i = 0; i < links.length; i++) {
    const a = links[i];
    if (!isVisible(a)) continue;
    const t = normalizeText(a.textContent).toLowerCase();
    if (t.indexOf("credit") !== -1 || t.indexOf("noon") !== -1) return a;
  }
  for (let i = 0; i < links.length; i++) {
    if (isVisible(links[i])) return links[i];
  }
  return findMenuItemByText("noon Credits");
}

function resolveClickableLink(el) {
  if (!el) return null;
  if (el.tagName && el.tagName.toLowerCase() === "a" && el.href) return el;
  const inner = el.querySelector && el.querySelector("a[href]");
  if (inner && isVisible(inner)) return inner;
  const outer = el.closest && el.closest("a[href]");
  if (outer && isVisible(outer)) return outer;
  return el;
}

async function waitForAccountDashboard() {
  await pause(0.03);
  logStep("Waiting for dashboard to load…");
  await waitFor(
    function () {
      return (
        isOnAccountPage() &&
        (findNoonCreditsLink() || findMenuItemByText("Orders"))
      );
    },
    12000,
    150,
  );
  logStep("Dashboard loaded");
}

async function clickNavLink(el) {
  const link = resolveClickableLink(el);
  if (!link) throw new Error("Link not found");

  const href = link.href || link.getAttribute("href") || "";
  logStep("Clicking: " + normalizeText(link.textContent));
  await mouse().click(link);
  await pause(0.6);

  if (!href || href.indexOf("javascript:") === 0) return;

  const pathMatch = href.match(/\/uae-en\/[^?#]*/);
  const pathNeedle = pathMatch ? pathMatch[0].replace(/\/$/, "") : "";

  const navigated = await waitFor(function () {
    if (pathNeedle && location.pathname.replace(/\/$/, "").indexOf(pathNeedle) !== -1) {
      return true;
    }
    return isOnCreditsPage() && href.indexOf("/credits") !== -1;
  }, 4000, 150);

  if (!navigated && href) {
    logStep("Opening link directly…");
    location.href = href;
    await pause(1.2);
  }
}

function findHeaderOrdersLink() {
  const scope = queryByRole("banner") || document.querySelector("header");
  if (!scope) return null;

  const nodes = scope.querySelectorAll("a, button, [role='link'], [role='button']");
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isVisible(el)) continue;
    const t = (el.textContent || "").trim();
    if (t === "Orders") return el;
  }

  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isVisible(el)) continue;
    const t = (el.textContent || "").trim();
    if (/\bOrders\b/.test(t) && t.length < 20) return el;
  }
  return null;
}

function findProfileButton() {
  const scope = queryByRole("banner") || document.querySelector("header") || document.body;

  const controls = scope.querySelectorAll(
    "button, a, [role='button'], [aria-haspopup='true'], [aria-haspopup='menu']",
  );
  for (let i = 0; i < controls.length; i++) {
    const el = controls[i];
    if (!isVisible(el)) continue;
    const t = normalizeText(el.textContent);
    if (/^Hi,\s/.test(t) || t.indexOf("Hi,") === 0) return el;
  }

  const textNodes = scope.querySelectorAll("span, div, p");
  for (let i = 0; i < textNodes.length; i++) {
    const el = textNodes[i];
    if (!isVisible(el)) continue;
    const t = normalizeText(el.textContent);
    if (!/^Hi,\s/.test(t) && t.indexOf("Hi,") !== 0) continue;
    if (t.length > 32) continue;
    const clickable = el.closest("button, a, [role='button']");
    if (clickable && isVisible(clickable)) return clickable;
  }

  return null;
}

function findGiftCardNumberInput() {
  const candidates = [
    getByPlaceholder("16 character code"),
    queryByRole("textbox", { name: "Gift card number" }),
  ];
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i] && isVisible(candidates[i])) return candidates[i];
  }
  return null;
}

function findGiftCardPinInput() {
  const candidates = [
    getByPlaceholder("4 digit pin"),
    getByPlaceholder("4 digit PIN"),
    queryByRole("textbox", { name: "PIN" }),
  ];
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i] && isVisible(candidates[i])) return candidates[i];
  }
  return null;
}

function findRedeemSubmitButton() {
  const buttons = document.querySelectorAll("button, [role='button']");
  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    if (!isVisible(btn)) continue;
    const label = (btn.textContent || "").trim().toUpperCase();
    if (label === "REDEEM") return btn;
  }
  return null;
}

