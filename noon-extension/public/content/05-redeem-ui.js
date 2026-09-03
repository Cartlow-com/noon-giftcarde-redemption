/**
 * Split from content.js — classic content script (shared isolated world).
 * Top-level function/var bindings are shared across content/*.js via manifest order.
 * Part: 05-redeem-ui.js — Credits page UI + balance read
 */
function findRedeemGiftcardsBar() {
  const main =
    document.querySelector("main") ||
    document.querySelector("[role='main']") ||
    document.body;
  const exact = findClickableByText("Redeem Giftcards", main);
  if (exact) return exact;

  const nodes = main.querySelectorAll("a, button, [role='button'], div, span, p");
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isVisible(el)) continue;
    const t = normalizeText(el.textContent).toLowerCase();
    if (t !== "redeem giftcards" && t !== "redeem giftcard") continue;
    return (
      el.closest("button, a, [role='button']") ||
      el.closest("div") ||
      el
    );
  }

  return (
    findClickableByText("Redeem Giftcard", main) ||
    findClickableByText("Redeem Giftcards") ||
    findClickableByText("Redeem Giftcard")
  );
}

async function waitForCreditsPageReady() {
  logStep("Waiting for credits page to load…");
  const ready = await waitFor(
    function () {
      return isCreditsBalanceScreenReady();
    },
    25000,
    50,
  );
  if (!ready) throw new Error("Credits page did not finish loading");
  await pause(0.4);
  logStep("Credits page ready — balance visible");
}

function hasCreditsSkeletonUi() {
  if (!document.body) return true;
  const root = document.querySelector("main") || document.body;
  const sel =
    '[class*="skeleton" i], [class*="Skeleton"], [class*="shimmer" i], [class*="Shimmer"], [data-testid*="skeleton" i]';
  const nodes = root.querySelectorAll(sel);
  for (let i = 0; i < nodes.length; i++) {
    if (isVisible(nodes[i])) return true;
  }
  return false;
}

function readAvailableBalanceLabel() {
  const main = document.querySelector("main") || document.body;
  const nodes = main.querySelectorAll("span, div, p, h1, h2, h3, label, strong");
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isVisible(el)) continue;
    const t = normalizeText(el.textContent).toLowerCase();
    if (t !== "available balance" && t.indexOf("available balance") === -1) continue;
    if (t.length > 80) continue;
    let scope = el.parentElement;
    for (let d = 0; d < 6 && scope; d++) {
      const val = parseMoneyValue(scope.textContent);
      if (val != null) return val;
      scope = scope.parentElement;
    }
  }
  return null;
}

function isCreditsBalanceScreenReady() {
  if (!isOnCreditsPage()) return false;
  if (document.readyState !== "complete") return false;
  if (hasCreditsSkeletonUi()) return false;
  if (isCreditsPageLoading()) return false;
  if (findGiftCardNumberInput()) return false;
  if (!findRedeemGiftcardsBar()) return false;
  return readAvailableBalanceLabel() != null;
}

function isCreditsPageLoading() {
  if (!document.body) return true;
  if (hasCreditsSkeletonUi()) return true;
  const scope = document.querySelector("main") || document.body;
  const spinners = scope.querySelectorAll(
    '[class*="spinner" i], [class*="loading" i], [class*="Loader" i], [aria-busy="true"], [data-testid*="loading" i]',
  );
  for (let i = 0; i < spinners.length; i++) {
    if (isVisible(spinners[i])) return true;
  }
  const main = document.querySelector("main");
  if (main && isVisible(main)) {
    const text = normalizeText(main.textContent || "").toLowerCase();
    if (text.indexOf("available balance") === -1) return true;
    if (text.length < 80 && readAvailableBalanceLabel() == null) return true;
  }
  return false;
}

async function prepareCreditsForScreenshot(_kind) {
  await recoverFromFetchErrorIfNeeded(2);
  try {
    if (typeof dismissRedeemModal === "function") {
      await dismissRedeemModal();
    }
  } catch (_) {}

  if (!isOnCreditsPage()) {
    location.href = NOON_CREDITS;
  }

  const ready = await waitFor(
    function () {
      return isCreditsBalanceScreenReady();
    },
    25000,
    50,
  );

  if (!ready) {
    return {
      ok: false,
      error: "Credits balance screen not ready — refusing skeleton/loading screenshot",
      balance: null,
    };
  }

  await pause(0.5);
  if (!isCreditsBalanceScreenReady()) {
    const again = await waitFor(isCreditsBalanceScreenReady, 8000, 50);
    if (!again) {
      return {
        ok: false,
        error: "Credits still loading after wait — refusing screenshot",
        balance: null,
      };
    }
  }

  const balance = readAvailableBalanceLabel();
  if (balance == null) {
    return { ok: false, error: "Available balance not visible", balance: null };
  }
  logStep("Credits balance ready for screenshot: " + balance + " AED");
  return { ok: true, balance: balance };
}

function findAddCreditsModal() {
  const selectors =
    '[role="dialog"], [aria-modal="true"], [class*="modal" i], [class*="Modal" i], [class*="drawer" i]';
  const nodes = document.querySelectorAll(selectors);
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isVisible(el)) continue;
    const t = normalizeText(el.textContent).toLowerCase();
    if (t.indexOf("add credits") !== -1) return el;
  }
  return null;
}

function findGiftcardsVouchersOption() {
  const modal = findAddCreditsModal();
  const scope = modal || document.body;
  return (
    findClickableByText("Giftcards & Vouchers", scope) ||
    findClickableByText("Giftcards and Vouchers", scope) ||
    findClickableByText("Giftcards & Vouchers") ||
    findClickableByText("Giftcards and Vouchers")
  );
}

function isAddCreditsModalOpen() {
  if (findGiftCardNumberInput()) return false;
  return !!(findAddCreditsModal() || findGiftcardsVouchersOption());
}

function isOnCreditsPage() {
  return location.href.indexOf("/credits") !== -1;
}

function isOnAccountPage() {
  return location.href.indexOf("account.noon.com") !== -1;
}

async function waitForAddCreditsModal() {
  logStep("Waiting for Add Credits popup…");
  await waitFor(
    function () {
      return findAddCreditsModal() || findGiftcardsVouchersOption();
    },
    8000,
    50,
  );
  logStep("Add Credits popup ready");
}

function detectPageState() {
  if (findGiftCardNumberInput()) return "REDEEM_FORM";
  if (isAddCreditsModalOpen()) return "ADD_CREDITS_MODAL";
  if (isOnCreditsPage()) return "CREDITS_PAGE";
  if (hasNoonSession()) return "LOGGED_IN";
  return "NOT_LOGGED_IN";
}

function pageStateLabel(state) {
  const labels = {
    REDEEM_FORM: "redeem form open",
    ADD_CREDITS_MODAL: "Add Credits popup open",
    CREDITS_PAGE: "noon Credits page",
    LOGGED_IN: "logged in",
    NOT_LOGGED_IN: "not logged in",
  };
  return labels[state] || state;
}

async function goToCreditsPage(payload) {
  if (isOnCreditsPage()) {
    await waitForCreditsPageReady();
    return false;
  }
  logStep("Opening noon Credits page…");
  if (payload) await persistFlow("RESUME", payload);
  location.href = NOON_CREDITS;
  return true;
}

function normalizeGiftCardDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function parseMoneyValue(text) {
  if (!text) return null;
  const match = text.match(/(?:aed\s*)?([\d,]+\.\d{2})/i) || text.match(/^([\d,]+\.\d{2})$/);
  if (!match) return null;
  const val = parseFloat(match[1].replace(/,/g, ""));
  return isNaN(val) ? null : val;
}

function readCreditsBalance() {
  const main = document.querySelector("main") || document.body;
  const nodes = main.querySelectorAll("span, div, p, h1, h2, h3, label");
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isVisible(el)) continue;
    const t = normalizeText(el.textContent).toLowerCase();
    if (t.indexOf("available balance") === -1) continue;
    let scope = el.parentElement;
    for (let d = 0; d < 5 && scope; d++) {
      const val = parseMoneyValue(scope.textContent);
      if (val != null) return val;
      scope = scope.parentElement;
    }
  }

  const candidates = [];
  const allNodes = main.querySelectorAll(
    "span, div, p, h1, h2, [class*='balance' i], [class*='credit' i], [class*='Credit' i]",
  );
  for (let i = 0; i < allNodes.length; i++) {
    const el = allNodes[i];
    if (!isVisible(el)) continue;
    const t = normalizeText(el.textContent);
    if (!t || t.length > 32) continue;
    const val = parseMoneyValue(t);
    if (val == null) continue;
    const ctx = normalizeText(
      (el.parentElement && el.parentElement.textContent) || "",
    ).toLowerCase();
    if (
      ctx.indexOf("credit") !== -1 ||
      ctx.indexOf("balance") !== -1 ||
      ctx.indexOf("aed") !== -1
    ) {
      candidates.push(val);
    }
  }
  if (candidates.length) return Math.max.apply(null, candidates);

  const body = document.body.textContent || "";
  const matches = body.match(/aed\s*[\d,]+\.\d{2}/gi);
  if (matches && matches.length) {
    const val = parseMoneyValue(matches[0]);
    if (val != null) return val;
  }
  const plain = body.match(/\b([\d,]+\.\d{2})\b/g);
  if (plain && plain.length) {
    const vals = plain.map(parseMoneyValue).filter(function (v) {
      return v != null && v > 0 && v < 100000;
    });
    if (vals.length) return Math.max.apply(null, vals);
  }
  return null;
}

