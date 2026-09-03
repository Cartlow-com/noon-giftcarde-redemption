/**
 * Noon.com login automation — mirrors backend/scripts/noon_login_flow.py
 * Uses visible ghost cursor (mouse.js) for human-like interaction.
 */
(function () {
  const NOON_HOME = "https://www.noon.com/uae-en/";
  const NOON_CREDITS = "https://account.noon.com/uae-en/credits/";
  const NOON_PROFILE = "https://account.noon.com/uae-en/profile/";
  const NETWORK_ERROR = "Looks like you're offline";
  const PAGE_FETCH_ERROR_MARKERS = [
    "fail to fetch",
    "failed to fetch",
    "looks like you're offline",
    "something went wrong",
    "network error",
  ];
  const FLOW_STATE_KEY = "noon_flow_state";
  const FLOW_DONE_KEY = "noon_flow_done";
  const FLOW_RESULT_KEY = "noon_flow_result";
  const SESSION_EMAIL_KEY = "noon_batch_session_email";
  const CURSOR_ACTIVE_KEY = "noon_cursor_active";

  function setCursorActive(active) {
    return new Promise(function (resolve) {
      if (active) {
        chrome.storage.local.set({ [CURSOR_ACTIVE_KEY]: true }, resolve);
      } else {
        chrome.storage.local.remove(CURSOR_ACTIVE_KEY, resolve);
      }
    });
  }

  let keepAliveTimer = null;

  async function enableCursor() {
    await setCursorActive(true);
    await mouse().show();
    mouse().ensureVisible();
    if (keepAliveTimer) return;
    keepAliveTimer = setInterval(function () {
      chrome.storage.local.get(CURSOR_ACTIVE_KEY, function (data) {
        if (!data[CURSOR_ACTIVE_KEY]) {
          clearInterval(keepAliveTimer);
          keepAliveTimer = null;
          return;
        }
        try {
          mouse().ensureVisible();
        } catch (_) {}
      });
    }, 400);
  }

  async function disableCursor() {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
    await setCursorActive(false);
    await mouse().hide();
  }

  function mouse() {
    if (!window.__noonGhostMouse) {
      throw new Error("Ghost mouse not loaded");
    }
    return window.__noonGhostMouse;
  }

  window.__noonLoginFlow = {
    aborted: false,
    running: false,
    reset: function () {
      this.aborted = false;
    },
    abort: function () {
      this.aborted = true;
    },
    check: function () {
      if (this.aborted) {
        const err = new Error("Login cancelled by user");
        err.name = "LoginCancelledError";
        throw err;
      }
    },
  };

  function flow() {
    return window.__noonLoginFlow;
  }

  function pause(seconds) {
    return mouse().delay((seconds ?? 1.5) * 1000);
  }

  function emit(type, payload) {
    try {
      chrome.runtime.sendMessage({ type, ...payload });
    } catch (_) {}
  }

  function logStep(message) {
    emit("LOGIN_PROGRESS", { message });
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return (
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      style.opacity !== "0"
    );
  }

  function getAccessibleName(el) {
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) return (labelEl.textContent || "").trim();
    }
    return (
      el.getAttribute("aria-label") ||
      el.getAttribute("placeholder") ||
      el.getAttribute("name") ||
      el.getAttribute("title") ||
      (el.textContent || "").trim()
    );
  }

  function queryByRole(role, options, root) {
    const scope = root || document;
    const name = options && options.name ? String(options.name) : "";
    const exact = !!(options && options.exact);

    let selector;
    if (role === "button") selector = "button, [role='button']";
    else if (role === "textbox")
      selector = "input:not([type='hidden']), textarea, [role='textbox']";
    else if (role === "banner") selector = "header, [role='banner']";
    else selector = "[role='" + role + "']";

    const nodes = scope.querySelectorAll(selector);
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!isVisible(el)) continue;
      if (!name) return el;
      const accessible = getAccessibleName(el);
      const match = exact ? accessible === name : accessible.indexOf(name) !== -1;
      if (match) return el;
    }
    return null;
  }

  function queryAllByRole(role, options, root) {
    const scope = root || document;
    const name = options && options.name ? String(options.name) : "";
    const exact = !!(options && options.exact);
    let selector;
    if (role === "button") selector = "button, [role='button']";
    else selector = "[role='" + role + "']";

    const out = [];
    const nodes = scope.querySelectorAll(selector);
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!isVisible(el)) continue;
      if (!name) {
        out.push(el);
        continue;
      }
      const accessible = getAccessibleName(el);
      const match = exact ? accessible === name : accessible.indexOf(name) !== -1;
      if (match) out.push(el);
    }
    return out;
  }

  function getByPlaceholder(text) {
    const inputs = document.querySelectorAll("input, textarea");
    for (let i = 0; i < inputs.length; i++) {
      const el = inputs[i];
      const ph = el.getAttribute("placeholder") || "";
      if (ph === text && isVisible(el)) return el;
    }
    return null;
  }

  function findEmailInput() {
    const candidates = [
      getByPlaceholder("Please enter email or mobile number"),
      getByPlaceholder("Email address"),
      queryByRole("textbox", { name: "Email address" }),
      document.querySelector('input[type="email"]'),
    ];
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (el && isVisible(el)) return el;
    }
    return null;
  }

  function findPasswordInput() {
    const candidates = [
      getByPlaceholder("Please enter your password"),
      getByPlaceholder("Password"),
      queryByRole("textbox", { name: "Password" }),
      document.querySelector('input[type="password"]'),
    ];
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (el && isVisible(el)) return el;
    }
    return null;
  }

  function findLoginSubmitButton() {
    const exact = queryByRole("button", { name: "Log in", exact: true });
    if (exact) return exact;

    const buttons = document.querySelectorAll("button, [role='button']");
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      if (!isVisible(btn)) continue;
      const label = (btn.textContent || "").trim().toUpperCase();
      if (label === "LOG IN" || label === "LOGIN") return btn;
    }
    return null;
  }

  async function ensurePasswordTab() {
    if (findPasswordInput()) return;

    const tab = queryByRole("button", { name: "Log in with password" });
    if (!tab) return;

    logStep("Moving to password tab…");
    await mouse().click(tab);
    logStep("Switched to password login");
    await pause(1);

    await waitFor(function () {
      return findPasswordInput();
    }, 8000, 200);
  }

  function getByText(text, root) {
    const scope = root || document.body;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      if (node instanceof Element && isVisible(node)) {
        const t = (node.textContent || "").trim();
        if (t === text || t.indexOf(text) === 0) return node;
      }
      node = walker.nextNode();
    }
    return null;
  }

  function isDisabled(el) {
    return (
      el.hasAttribute("disabled") ||
      el.getAttribute("aria-disabled") === "true"
    );
  }

  async function waitFor(fn, timeoutMs, intervalMs) {
    const timeout = timeoutMs ?? 20000;
    const interval = intervalMs ?? 200;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      flow().check();
      const result = fn();
      if (result) return result;
      await pause(interval / 1000);
    }
    return null;
  }

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

  function hasNoonSession() {
    if (isLoggedIn()) return true;
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
    const nodes = scope.querySelectorAll("button, a, [role='button']");
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!isVisible(el)) continue;
      const t = (el.textContent || "").trim();
      if (/^Hi,\s/.test(t)) return el;
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

  function saveFlowState(state) {
    return new Promise(function (resolve) {
      chrome.storage.local.set({ [FLOW_STATE_KEY]: state }, resolve);
    });
  }

  function loadFlowState() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(FLOW_STATE_KEY, function (data) {
        resolve(data[FLOW_STATE_KEY] || null);
      });
    });
  }

  function markFlowDone() {
    return markFlowComplete({ ok: true });
  }

  function markFlowComplete(result) {
    return new Promise(function (resolve) {
      chrome.storage.local.set(
        {
          [FLOW_DONE_KEY]: true,
          [FLOW_RESULT_KEY]: result || { ok: true },
        },
        resolve,
      );
    });
  }

  function clearFlowComplete() {
    return new Promise(function (resolve) {
      chrome.storage.local.remove([FLOW_DONE_KEY, FLOW_RESULT_KEY], resolve);
    });
  }

  function clearFlowDone() {
    return clearFlowComplete();
  }

  function clearFlowState() {
    return new Promise(function (resolve) {
      chrome.storage.local.remove(FLOW_STATE_KEY, resolve);
    });
  }

  async function persistCartState(data) {
    const existing = await loadFlowState();
    const batchMode =
      data.batchMode != null ? !!data.batchMode : !!(existing && existing.batchMode);
    await saveFlowState({
      active: true,
      resumeOnLoad: true,
      flowType: "cart",
      productUrl: data.productUrl || existing?.productUrl || "",
      email: data.email || existing?.email || "",
      password: data.password || existing?.password || "",
      cartPhase:
        data.cartPhase !== undefined && data.cartPhase !== null
          ? data.cartPhase
          : existing?.cartPhase || "",
      batchMode: batchMode,
      rowNumber:
        data.rowNumber != null ? data.rowNumber : existing?.rowNumber ?? null,
      batchPlaceOrder:
        data.batchPlaceOrder != null
          ? !!data.batchPlaceOrder
          : existing?.batchPlaceOrder ?? null,
    });
  }

  async function restoreBatchCartContextFromState(state) {
    const s = state || (await loadFlowState());
    if (s && s.batchMode) {
      batchFlowMode = true;
      batchCartContext = {
        rowNumber: s.rowNumber,
        productUrl: s.productUrl,
      };
      if (s.batchPlaceOrder != null) {
        batchPlaceOrderPref = !!s.batchPlaceOrder;
      }
    }
  }

  async function getCartPhase() {
    const state = await loadFlowState();
    return (state && state.cartPhase) || "";
  }

  async function setCartPhase(phase) {
    const existing = await loadFlowState();
    await persistCartState({
      productUrl: existing?.productUrl,
      email: existing?.email,
      password: existing?.password,
      cartPhase: phase,
    });
  }

  async function persistFlow(step, payload) {
    const existing = await loadFlowState();
    await saveFlowState({
      active: true,
      resumeOnLoad: true,
      step: step,
      email: payload.email || existing?.email || "",
      password: payload.password || existing?.password || "",
      giftCardNumber: payload.giftCardNumber || existing?.giftCardNumber || "",
      giftCardPin: payload.giftCardPin || existing?.giftCardPin || "",
      waitForRedeemResult:
        payload.waitForRedeemResult != null
          ? !!payload.waitForRedeemResult
          : !!existing?.waitForRedeemResult,
      balanceBefore:
        payload.balanceBefore != null
          ? payload.balanceBefore
          : existing?.balanceBefore ?? null,
      redeemPopupMessage:
        payload.redeemPopupMessage || existing?.redeemPopupMessage || "",
    });
  }

  function findRedeemGiftcardsBar() {
    const main =
      document.querySelector("main") ||
      document.querySelector("[role='main']") ||
      document.body;
    return (
      findClickableByText("Redeem Giftcards", main) ||
      findClickableByText("Redeem Giftcard", main) ||
      findClickableByText("Redeem Giftcards") ||
      findClickableByText("Redeem Giftcard")
    );
  }

  async function waitForCreditsPageReady() {
    await pause(0.03);
    logStep("Waiting for credits page to load…");
    await waitFor(
      function () {
        return isOnCreditsPage() && findRedeemGiftcardsBar();
      },
      12000,
      150,
    );
    logStep("Credits page ready");
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
    await pause(0.03);
    logStep("Waiting for Add Credits popup…");
    await waitFor(
      function () {
        return findAddCreditsModal() || findGiftcardsVouchersOption();
      },
      8000,
      150,
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
    }, 10000, 200);
    if (!numberInput) throw new Error("Gift card number input not found");

    logStep("Typing gift card number (no spaces)…");
    await mouse().type(numberInput, cardDigits);
    logStep("Gift card number entered");

    const pinInput = await waitFor(function () {
      return findGiftCardPinInput();
    }, 8000, 200);
    if (!pinInput) throw new Error("Gift card PIN input not found");

    logStep("Typing PIN…");
    await mouse().type(pinInput, pinDigits, { masked: true });
    logStep("PIN entered");
    await pause(0.5);

    let redeemBtn = findRedeemSubmitButton();
    if (redeemBtn && isDisabled(redeemBtn)) await pause(1);
    redeemBtn = findRedeemSubmitButton();
    if (!redeemBtn) throw new Error("Redeem button not found");

    logStep("Clicking Redeem…");
    await mouse().click(redeemBtn);
    logStep("Gift card submitted");
    await pause(1);
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
      await pause(0.5);

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
      250,
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
      400,
    );
    return {
      orderId: extractOrderIdFromPage(),
      confirmationUrl: location.href,
    };
  }

  let batchFlowMode = false;
  let batchCartContext = null;
  let batchPlaceOrderPref = null;

  async function runGiftCardRedemption(payload) {
    payload.giftCardNumber = normalizeGiftCardDigits(payload.giftCardNumber);
    payload.giftCardPin = normalizeGiftCardDigits(payload.giftCardPin);
    if (!payload.giftCardNumber || !payload.giftCardPin) {
      throw new Error("Gift card number and PIN are required");
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      flow().check();
      const state = detectPageState();
      logStep("On " + pageStateLabel(state));

      if (state === "REDEEM_FORM") {
        if (payload.waitForRedeemResult && payload.balanceBefore == null && isOnCreditsPage()) {
          payload.balanceBefore = readCreditsBalance();
          logStep(
            "Credits before redeem: " +
              (payload.balanceBefore != null
                ? payload.balanceBefore + " AED"
                : "unknown"),
          );
        }
        logStep("Filling gift card and PIN…");
        const outcome = await fillAndRedeemGiftCard(
          payload.giftCardNumber,
          payload.giftCardPin,
          payload.waitForRedeemResult,
          payload.balanceBefore,
        );
        if (outcome && outcome.pendingBalanceCheck) {
          return { pending: true };
        }
        if (outcome && !outcome.redeemed) {
          if (outcome.alreadyRedeemed) {
            throw new Error("Already redeemed");
          }
          throw new Error(outcome.error || "Redeem failed");
        }
        return outcome || true;
      }

      if (state === "ADD_CREDITS_MODAL") {
        logStep("Clicking Giftcards & Vouchers…");
        const option = await waitFor(function () {
          return findGiftcardsVouchersOption();
        }, 8000, 150);
        if (!option) throw new Error("Giftcards & Vouchers option not found");
        await mouse().click(option);
        await pause(0.8);
        continue;
      }

      if (state === "CREDITS_PAGE") {
        if (findAddCreditsModal() || findGiftcardsVouchersOption()) {
          continue;
        }
        await waitForCreditsPageReady();
        if (payload.waitForRedeemResult && payload.balanceBefore == null) {
          payload.balanceBefore = readCreditsBalance();
          logStep(
            "Credits balance before redeem: " +
              (payload.balanceBefore != null
                ? payload.balanceBefore + " AED"
                : "unknown"),
          );
          await persistFlow("RESUME", payload);
        }
        logStep("Clicking Redeem Giftcards…");
        const redeemBar = findRedeemGiftcardsBar();
        if (!redeemBar) throw new Error("Redeem Giftcards not found");
        await mouse().click(redeemBar);
        await waitForAddCreditsModal();
        await pause(0.5);
        continue;
      }

      if (state === "LOGGED_IN") {
        const navigated = await goToCreditsPage(payload);
        if (navigated) return;
        continue;
      }

      throw new Error("Must be logged in to redeem gift card");
    }

    throw new Error("Gift card flow did not complete — try again");
  }

  async function runFromStep(state) {
    await enableCursor();
    await pause(0.3);

    if (state.flowType === "cart") {
      await restoreBatchCartContextFromState(state);
      const cartResult = await runCartFlow(state.productUrl);
      if (cartResult && cartResult.paymentIssue) {
        await disableCursor();
        await markFlowComplete({ ok: true, paymentIssue: true });
        await clearFlowState();
        batchFlowMode = false;
        batchCartContext = null;
        return;
      }
      if (cartResult && cartResult.orderSkipped) {
        await disableCursor();
        await markFlowComplete({ ok: true, orderSkipped: true });
        await clearFlowState();
        batchFlowMode = false;
        batchCartContext = null;
        return;
      }
      if (cartResult === true) return;
      const confirmation = await waitForOrderConfirmation();
      const orderId = confirmation && confirmation.orderId;
      await disableCursor();
      await markFlowComplete({
        ok: true,
        orderId: orderId || null,
        confirmationUrl: confirmation && confirmation.confirmationUrl,
      });
      await clearFlowState();
      batchFlowMode = false;
      batchCartContext = null;
      return;
    }

    if (state.step === "POST_REDEEM_BALANCE") {
      const result = await completePostRedeemBalanceCheck(state);
      await disableCursor();
      await markFlowComplete({
        ok: true,
        redeemed: true,
        verified: !!result.verified,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
        balanceDelta: result.balanceDelta,
        popupMessage: result.popupMessage,
      });
      await clearFlowState();
      return;
    }

    const payload = {
      email: state.email,
      password: state.password,
      giftCardNumber: state.giftCardNumber,
      giftCardPin: state.giftCardPin,
      waitForRedeemResult: !!state.waitForRedeemResult,
      balanceBefore: state.balanceBefore,
    };
    const result = await runGiftCardRedemption(payload);
    if (payload.waitForRedeemResult) {
      if (result && result.redeemed === false) {
        const errMsg = result.alreadyRedeemed
          ? result.error || "Already redeemed"
          : result.error || "Redeem failed";
        throw new Error(errMsg);
      }
    }
    await disableCursor();
    await markFlowComplete({
      ok: true,
      redeemed: true,
      verified: !!(result && result.verified),
      balanceBefore: result && result.balanceBefore,
      balanceAfter: result && result.balanceAfter,
      balanceDelta: result && result.balanceDelta,
      popupMessage: result && result.popupMessage,
    });
    await clearFlowState();
  }

  async function runNextStep(payload) {
    await runGiftCardRedemption(payload);
  }

  function hasPageFetchError() {
    const bodyText = (document.body && document.body.textContent) || "";
    const lower = bodyText.toLowerCase();
    for (let i = 0; i < PAGE_FETCH_ERROR_MARKERS.length; i++) {
      if (lower.indexOf(PAGE_FETCH_ERROR_MARKERS[i]) !== -1) return true;
    }
    const networkError = getByText(NETWORK_ERROR);
    return !!(networkError && isVisible(networkError));
  }

  async function recoverFromFetchErrorIfNeeded(maxAttempts) {
    const attempts = maxAttempts == null ? 2 : maxAttempts;
    for (let i = 0; i < attempts; i++) {
      if (!hasPageFetchError()) return false;
      logStep("Noon page error detected — hard refreshing…");
      await hardRefresh();
      await acceptCookies();
    }
    if (hasPageFetchError()) {
      throw new Error("Noon page failed to load after refresh");
    }
    return true;
  }

  async function waitForPageReady() {
    await recoverFromFetchErrorIfNeeded(2);
    logStep("Waiting for Noon homepage…");
    await waitFor(
      function () {
        return isLoggedIn() || queryByRole("button", { name: "Log in" });
      },
      15000,
      150,
    );
    await pause(0.4);
    logStep("Page loaded");
  }

  async function acceptCookies() {
    const btn = queryByRole("button", { name: "Accept All" });
    if (btn) {
      logStep("Moving to Accept cookies…");
      await mouse().click(btn);
      logStep("Cookies accepted");
      await pause();
    }
  }

  async function clickLogin() {
    const banner = queryByRole("banner");
    const locators = [
      banner ? queryByRole("button", { name: "Log in" }, banner) : null,
      queryAllByRole("button", { name: "Log in" })[0] || null,
      queryByRole("button", { name: "account" }),
    ];

    for (let i = 0; i < locators.length; i++) {
      const locator = locators[i];
      if (locator) {
        logStep("Moving to Log in button…");
        await mouse().click(locator);
        await pause();
        logStep("Clicked Log in");
        return;
      }
    }
    throw new Error("Log in button not found");
  }

  async function hardRefresh() {
    logStep("Refreshing page…");
    location.reload();
    await waitForPageReady();
  }

  async function openLoginModal() {
    for (let attempt = 0; attempt < 2; attempt++) {
      flow().check();
      await clickLogin();
      await pause(2);

      const networkError = getByText(NETWORK_ERROR);
      if ((networkError && isVisible(networkError)) || hasPageFetchError()) {
        logStep("Network error — refreshing");
        await hardRefresh();
        await acceptCookies();
        continue;
      }

      const emailInput = await waitFor(
        function () {
          return findEmailInput();
        },
        8000,
        200,
      );
      if (emailInput) {
        logStep("Login modal open");
        return;
      }

      if (attempt === 0) {
        logStep("Modal not open — retrying");
        await hardRefresh();
        await acceptCookies();
      }
    }
    throw new Error("Login modal did not open");
  }

  async function enterEmailAndContinue(email) {
    await ensurePasswordTab();

    const emailInput = findEmailInput();
    if (!emailInput) throw new Error("Email input not found");

    logStep("Typing email…");
    await mouse().type(emailInput, email);
    logStep("Email entered");

    await pause();

    if (findPasswordInput()) {
      logStep("Password form ready");
      return;
    }

    let continueBtn = queryByRole("button", { name: "Continue" });
    if (continueBtn && isDisabled(continueBtn)) await pause(2);
    continueBtn = queryByRole("button", { name: "Continue" });
    if (!continueBtn) throw new Error("Continue button not found");

    logStep("Moving to Continue…");
    await mouse().click(continueBtn);
    logStep("Clicked Continue");
    await pause(2);
    await ensurePasswordTab();
  }

  async function loginWithPassword(password) {
    await ensurePasswordTab();

    const passwordInput = await waitFor(
      function () {
        return findPasswordInput();
      },
      10000,
      200,
    );
    if (!passwordInput) throw new Error("Password input not found");

    logStep("Typing password…");
    await mouse().type(passwordInput, password, { masked: true });
    logStep("Password entered");
    await pause();

    let loginBtn = findLoginSubmitButton();
    if (loginBtn && isDisabled(loginBtn)) await pause(1.5);
    loginBtn = findLoginSubmitButton();
    if (!loginBtn) throw new Error("Log in submit button not found");

    logStep("Moving to Log in submit…");
    await mouse().click(loginBtn);
    logStep("Submitting login…");

    const success = await waitFor(
      function () {
        return getByText("Hi,");
      },
      30000,
      300,
    );
    if (!success) throw new Error("Login did not complete — Hi greeting not found");
    logStep("Logged in successfully");
  }

  function findEmailInText(text) {
    const match = (text || "").match(/[\w.+-]+@[\w.-]+\.\w+/);
    return match ? match[0].toLowerCase() : null;
  }

  function findSignOutButton() {
    const nodes = document.querySelectorAll(
      "button, a, [role='button'], [role='menuitem'], li, div, span",
    );
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!isVisible(el)) continue;
      const t = normalizeText(el.textContent).toLowerCase();
      if (t !== "sign out" && t !== "log out" && t !== "logout") continue;
      const clickable =
        el.closest("button, a, [role='button'], [role='menuitem']") ||
        (el.tagName && ["button", "a"].indexOf(el.tagName.toLowerCase()) !== -1 ? el : null) ||
        el;
      return clickable;
    }
    return null;
  }

  function readEmailFromProfilePage() {
    const scopes = [
      document.querySelector("main"),
      document.querySelector('[class*="profile" i]'),
      document.body,
    ];
    for (let s = 0; s < scopes.length; s++) {
      const scope = scopes[s];
      if (!scope) continue;
      const inputs = scope.querySelectorAll("input");
      for (let i = 0; i < inputs.length; i++) {
        const val = (inputs[i].value || "").trim().toLowerCase();
        if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(val)) return val;
      }
    }
    const main = document.querySelector("main") || document.body;
    return findEmailInText(main.textContent);
  }

  async function waitForProfilePageReady() {
    logStep("Waiting for profile page…");
    const ready = await waitFor(
      function () {
        if (location.href.indexOf("/profile") === -1) return null;
        if (readEmailFromProfilePage()) return "email";
        if (isLoggedIn()) return "logged_in";
        if (queryByRole("button", { name: "Log in" })) return "login";
        if (normalizeText(document.body.textContent).toLowerCase().indexOf("contact") !== -1) {
          return "profile";
        }
        return null;
      },
      20000,
      300,
    );
    if (!ready) throw new Error("Profile page did not load");
    await pause(0.5);
    logStep("Profile page ready");
  }

  async function openProfilePage() {
    const current = location.href.split("?")[0].replace(/\/$/, "");
    const target = NOON_PROFILE.replace(/\/$/, "");
    if (current !== target) {
      logStep("Opening profile page…");
      location.href = NOON_PROFILE;
      await waitForProfilePageReady();
      return;
    }
    await waitForProfilePageReady();
  }

  async function logoutFromNoon() {
    if (!isLoggedIn()) return;
    logStep("Logging out…");
    await acceptCookies();

    let signOut = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const profileBtn = findProfileButton();
      if (profileBtn) {
        await mouse().click(profileBtn);
        await pause(0.9);
      }
      signOut = findSignOutButton();
      if (signOut) break;
      if (location.href.indexOf("www.noon.com") === -1) {
        location.href = NOON_HOME;
        await waitForPageReady();
      }
    }

    if (!signOut) throw new Error("Sign out button not found");
    await mouse().click(signOut);
    await waitFor(
      function () {
        return !isLoggedIn();
      },
      15000,
      300,
    );
    await new Promise(function (resolve) {
      chrome.storage.local.remove(SESSION_EMAIL_KEY, resolve);
    });
    logStep("Logged out");
  }

  function getSessionEmail() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(SESSION_EMAIL_KEY, function (data) {
        resolve(data[SESSION_EMAIL_KEY] || null);
      });
    });
  }

  function setSessionEmail(email) {
    return new Promise(function (resolve) {
      chrome.storage.local.set({ [SESSION_EMAIL_KEY]: String(email).toLowerCase() }, resolve);
    });
  }

  async function loginOnHomepage(email, password) {
    await goToNoonHomeIfNeeded();
    await acceptCookies();
    await openLoginModal();
    await enterEmailAndContinue(email);
    await loginWithPassword(password);
    await pause(0.4);
  }

  async function runBatchAccount(payload) {
    if (!payload.email || !payload.password) {
      throw new Error("Email and password are required");
    }
    flow().reset();
    flow().running = true;
    try {
      await enableCursor();
      await recoverFromFetchErrorIfNeeded(1);
      const required = String(payload.email).trim().toLowerCase();
      const previous = payload.previousEmail
        ? String(payload.previousEmail).trim().toLowerCase()
        : null;

      await openProfilePage();
      const profileEmail = readEmailFromProfilePage();

      if (profileEmail === required) {
        await setSessionEmail(required);
        logStep("Profile email matches — already logged in as " + required);
        await disableCursor();
        return { ok: true, skipped: true, switched: false };
      }

      if (profileEmail && profileEmail !== required) {
        logStep(
          "Profile shows " + profileEmail + " — switching to " + required,
        );
        await logoutFromNoon();
      } else if (!profileEmail && isLoggedIn() && previous && previous !== required) {
        logStep("Switching account to " + required);
        await logoutFromNoon();
      }

      if (!isLoggedIn()) {
        logStep("Logging in as " + required + "…");
        await loginOnHomepage(payload.email, payload.password);
        await setSessionEmail(required);

        await openProfilePage();
        const afterEmail = readEmailFromProfilePage();
        if (afterEmail && afterEmail !== required) {
          throw new Error("Login completed but profile email mismatch");
        }

        await disableCursor();
        return {
          ok: true,
          skipped: false,
          switched: !!(profileEmail && profileEmail !== required) || !!(previous && previous !== required),
        };
      }

      await setSessionEmail(required);
      await disableCursor();
      return { ok: true, skipped: true, switched: false };
    } finally {
      flow().running = false;
    }
  }

  async function goToNoonHomeIfNeeded() {
    if (!location.href.includes("noon.com")) {
      location.href = NOON_HOME;
      await waitForPageReady();
      return;
    }
    if (location.href.indexOf("www.noon.com") === -1) {
      logStep("Going to Noon homepage…");
      location.href = NOON_HOME;
      await waitForPageReady();
      return;
    }
    await waitForPageReady();
  }

  async function ensureLoggedIn(payload) {
    await enableCursor();

    if (!location.href.includes("noon.com")) {
      logStep("Navigating to Noon…");
      location.href = NOON_HOME;
      await waitForPageReady();
    } else if (location.href.indexOf("www.noon.com") !== -1) {
      await waitForPageReady();
    } else if (location.href.indexOf("account.noon.com") !== -1) {
      logStep("On account page — going to homepage…");
      location.href = NOON_HOME;
      await waitForPageReady();
    } else {
      await pause(0.3);
    }

    await acceptCookies();

    if (isLoggedIn()) {
      logStep("Already logged in — skipping login");
      return true;
    }

    await openLoginModal();
    await enterEmailAndContinue(payload.email);
    await loginWithPassword(payload.password);
    await pause(0.4);
    logStep("Login complete");
    return false;
  }

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

  async function handleProductPageStep(productUrl) {
    logStep("Waiting for product page…");
    await waitFor(function () {
      return isOnProductPage();
    }, 15000, 200);
    await pause(0.8);

    let addBtn = findAddToCartButton();
    if (!addBtn) {
      addBtn = await waitFor(function () {
        return findAddToCartButton();
      }, 8000, 300);
    }

    if (addBtn) {
      await setCartPhase("");
      logStep("Add to Cart visible — clicking Add to Cart…");
      await mouse().click(addBtn);
      await setCartPhase("added");
      await pause(1);
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
    }, 10000, 200);
    if (!btn) throw new Error("View Cart not found");
    await mouse().click(btn);
    await setCartPhase("viewed_cart");
    await pause(1);
  }

  async function waitForProductPageReady() {
    await pause(0.03);
    logStep("Waiting for product page…");
    await waitFor(function () {
      return isOnProductPage();
    }, 15000, 200);
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
    await pause(0.03);
    logStep("Waiting for cart page…");
    await waitFor(
      function () {
        return isOnCartPage() && findCheckoutButton();
      },
      12000,
      200,
    );
    logStep("Cart page ready");
  }

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

  let placeOrderConfirmResolver = null;

  async function waitForPlaceOrderConfirmation(message) {
    await restoreBatchCartContextFromState();
    const ctx = batchCartContext;
    const state = await loadFlowState();
    const autoPlace =
      batchPlaceOrderPref != null
        ? batchPlaceOrderPref
        : state && state.batchPlaceOrder != null
          ? !!state.batchPlaceOrder
          : null;

    if (batchFlowMode && autoPlace !== null) {
      logStep(
        autoPlace
          ? "Place order enabled for batch — proceeding"
          : "Place order disabled for batch — skipping checkout submit",
      );
      return autoPlace;
    }

    const prompt =
      batchFlowMode && ctx
        ? `Row ${ctx.rowNumber}: ready to place order. Place order or skip?`
        : message || "Credits enabled. Place order?";
    return new Promise(function (resolve) {
      placeOrderConfirmResolver = resolve;
      emit("CART_AWAITING_CONFIRM", {
        message: prompt,
        batchMode: batchFlowMode,
        rowNumber: ctx && ctx.rowNumber,
        productUrl: ctx && ctx.productUrl,
      });
    });
  }

  async function runCartFlow(productUrl) {
    const normalizedUrl = (productUrl || "").trim();
    if (!normalizedUrl || normalizedUrl.indexOf("noon.com") === -1) {
      throw new Error("Valid Noon product URL is required");
    }

    for (let attempt = 0; attempt < 15; attempt++) {
      flow().check();
      await enableCursor();

      const phase = await getCartPhase();
      const onTargetProduct = isOnTargetProductPage(normalizedUrl);
      const pastProductStep =
        phase === "added" || phase === "viewed_cart" || phase === "checkout";

      if (
        !onTargetProduct &&
        !pastProductStep &&
        !isOnCartPage() &&
        !isOnCheckoutPage()
      ) {
        return goToProductPage(normalizedUrl);
      }

      const state = detectCartState();
      logStep("Cart step: " + state);

      if (state === "CHECKOUT_PAGE") {
        await waitForCheckoutPageReady();
        await ensureUseMyCreditsEnabled();

        if (hasCheckoutPaymentIssue()) {
          logStep(
            "Payment issue — credits do not cover total (Select Payment Method shown)",
          );
          await disableCursor();
          return { paymentIssue: true };
        }

        const confirmed = await waitForPlaceOrderConfirmation(
          "Credits enabled. Click Place Order in the panel when ready (no payment method selected).",
        );
        if (!confirmed) {
          logStep("Place order skipped by user");
          await disableCursor();
          return { orderSkipped: true };
        }

        logStep("Waiting for Place Order button…");
        const placeBtn = await waitFor(function () {
          if (hasCheckoutPaymentIssue()) return "PAYMENT_ISSUE";
          return findPlaceOrderButton();
        }, 15000, 400);
        if (placeBtn === "PAYMENT_ISSUE" || hasCheckoutPaymentIssue()) {
          logStep(
            "Payment issue — credits do not cover total (Select Payment Method shown)",
          );
          await disableCursor();
          return { paymentIssue: true };
        }
        if (!placeBtn) {
          if (hasCheckoutPaymentIssue()) {
            await disableCursor();
            return { paymentIssue: true };
          }
          throw new Error(
            "Place Order button not visible yet — complete payment manually if needed",
          );
        }

        logStep("Clicking Place Order…");
        await mouse().click(placeBtn);
        logStep("Place Order clicked");
        await pause(1);
        return;
      }

      if (state === "NOON_ONE_POPUP") {
        logStep("Clicking Continue to Checkout…");
        const btn = findContinueToCheckoutButton();
        if (!btn) throw new Error("Continue to Checkout not found");
        await mouse().click(btn);
        await pause(1);
        continue;
      }

      if (state === "CART_PAGE") {
        await waitForCartPageReady();
        if (isCartEmpty()) {
          return goToProductPage(normalizedUrl);
        }
        if (!pastProductStep) {
          await setCartPhase("viewed_cart");
        }
        logStep("Clicking Checkout…");
        const btn = findCheckoutButton();
        if (!btn) throw new Error("Checkout button not found");
        await mouse().click(btn);
        await setCartPhase("checkout");
        await pause(1);
        continue;
      }

      if (state === "ADDED_DRAWER") {
        const phase = await getCartPhase();
        if (phase === "viewed_cart") {
          await waitFor(function () {
            return isOnCartPage();
          }, 8000, 200);
          continue;
        }
        await clickViewCartButton();
        continue;
      }

      if (state === "PRODUCT_PAGE") {
        const phase = await getCartPhase();
        if (phase === "added") {
          await clickViewCartButton();
          continue;
        }
        const navigated = await handleProductPageStep(normalizedUrl);
        if (navigated) return true;
        continue;
      }

      if (state === "LOGGED_IN" || state === "NOT_LOGGED_IN") {
        if (state === "NOT_LOGGED_IN") {
          throw new Error("Must be logged in for cart flow");
        }
        if (!onTargetProduct) {
          return goToProductPage(normalizedUrl);
        }
        if (isOnProductPage()) {
          const navigated = await handleProductPageStep(normalizedUrl);
          if (navigated) return true;
          continue;
        }
        await waitForProductPageReady();
        continue;
      }
    }

    throw new Error("Cart flow did not complete — try again");
  }

  async function runCartAutomation(payload) {
    if (!payload.email || !payload.password) {
      throw new Error("Email and password are required");
    }
    if (!payload.productUrl) {
      throw new Error("Product URL is required");
    }

    flow().reset();
    flow().running = true;
    await clearFlowDone();
    await persistCartState(payload);

    try {
      await ensureLoggedIn(payload);
      logStep("Starting cart flow…");
      const navigated = await runCartFlow(payload.productUrl);
      if (navigated) return { ok: true, pending: true };
      await disableCursor();
      await markFlowDone();
      await clearFlowState();
      return { ok: true };
    } finally {
      flow().running = false;
    }
  }

  async function runBatchLogin(payload) {
    if (!payload.email || !payload.password) {
      throw new Error("Email and password are required");
    }
    flow().reset();
    flow().running = true;
    try {
      const skipped = await ensureLoggedIn(payload);
      await disableCursor();
      await markFlowDone();
      return { ok: true, skipped: skipped };
    } finally {
      flow().running = false;
    }
  }

  async function runBatchRedeem(payload) {
    if (!payload.giftCardNumber || !payload.giftCardPin) {
      throw new Error("Gift card number and PIN are required");
    }
    flow().reset();
    flow().running = true;
    await clearFlowState();
    await clearFlowDone();
    try {
      await enableCursor();
      if (!hasNoonSession()) throw new Error("Must be logged in before redeem");
      payload.waitForRedeemResult = true;
      await persistFlow("RESUME", payload);
      let result;
      try {
        result = await runGiftCardRedemption(payload);
      } catch (error) {
        await disableCursor();
        await clearFlowState();
        const errMsg = error instanceof Error ? error.message : "Redeem failed";
        const alreadyRedeemed = /already redeemed/i.test(errMsg);
        return { ok: false, alreadyRedeemed: alreadyRedeemed, error: errMsg };
      }
      const stillActive = await loadFlowState();
      if (stillActive && stillActive.active) {
        return { ok: true, pending: true };
      }
      if (!result || result.redeemed === false) {
        const errMsg = (result && result.error) || "Redeem failed";
        if (result && result.alreadyRedeemed) {
          return { ok: false, alreadyRedeemed: true, error: errMsg };
        }
        throw new Error(errMsg);
      }
      await disableCursor();
      await markFlowComplete({
        ok: true,
        redeemed: true,
        verified: !!(result && result.verified),
        balanceBefore: result && result.balanceBefore,
        balanceAfter: result && result.balanceAfter,
        balanceDelta: result && result.balanceDelta,
        popupMessage: result && result.popupMessage,
      });
      await clearFlowState();
      return {
        ok: true,
        redeemed: true,
        verified: !!(result && result.verified),
        balanceBefore: result && result.balanceBefore,
        balanceAfter: result && result.balanceAfter,
        balanceDelta: result && result.balanceDelta,
        popupMessage: result && result.popupMessage,
      };
    } finally {
      flow().running = false;
    }
  }

  async function runBatchCart(payload) {
    if (!payload.productUrl) throw new Error("Product URL is required");
    batchFlowMode = true;
    batchPlaceOrderPref = payload.placeOrder !== false;
    batchCartContext = {
      rowNumber: payload.rowNumber,
      productUrl: payload.productUrl,
    };
    flow().reset();
    flow().running = true;
    await clearFlowDone();
    await persistCartState({
      productUrl: payload.productUrl,
      email: payload.email,
      password: payload.password,
      batchMode: true,
      rowNumber: payload.rowNumber,
      cartPhase: "",
      batchPlaceOrder: batchPlaceOrderPref,
    });
    try {
      await enableCursor();
      if (!hasNoonSession() && !isOnAccountPage()) {
        throw new Error("Not logged in — login stage must succeed first");
      }
      logStep("Starting batch order flow…");
      const cartResult = await runCartFlow(payload.productUrl);
      if (cartResult && cartResult.paymentIssue) {
        await disableCursor();
        await markFlowComplete({ ok: true, paymentIssue: true });
        await clearFlowState();
        return { ok: true, paymentIssue: true };
      }
      if (cartResult && cartResult.orderSkipped) {
        await disableCursor();
        await markFlowComplete({ ok: true, orderSkipped: true });
        await clearFlowState();
        return { ok: true, orderSkipped: true };
      }
      if (cartResult === true) return { ok: true, pending: true };
      const confirmation = await waitForOrderConfirmation();
      const orderId = confirmation && confirmation.orderId;
      await disableCursor();
      await markFlowComplete({
        ok: true,
        orderId: orderId || null,
        confirmationUrl: confirmation && confirmation.confirmationUrl,
      });
      await clearFlowState();
      return {
        ok: true,
        orderId: orderId || null,
        confirmationUrl: confirmation && confirmation.confirmationUrl,
      };
    } finally {
      batchFlowMode = false;
      batchCartContext = null;
      batchPlaceOrderPref = null;
      flow().running = false;
    }
  }

  async function runAutomation(payload) {
    if (!payload.email || !payload.password) {
      throw new Error("Email and password are required");
    }
    if (!payload.giftCardNumber || !payload.giftCardPin) {
      throw new Error("Gift card number and PIN are required");
    }

    flow().reset();
    flow().running = true;
    await clearFlowState();
    await clearFlowDone();

    try {
      await enableCursor();
      const loginSkipped = await ensureLoggedIn(payload);

      logStep("Starting gift card flow");

      await runNextStep(payload);
      await disableCursor();
      await markFlowDone();
      await clearFlowState();
      return { skipped: loginSkipped };
    } finally {
      flow().running = false;
    }
  }

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (message.type === "CLEAR_BATCH_FLOW") {
      flow().abort();
      if (placeOrderConfirmResolver) {
        placeOrderConfirmResolver(false);
        placeOrderConfirmResolver = null;
      }
      clearFlowState()
        .catch(function () {})
        .then(function () {
          return clearFlowDone();
        })
        .then(function () {
          return disableCursor();
        })
        .catch(function () {})
        .finally(function () {
          sendResponse({ ok: true });
        });
      return true;
    }

    if (message.type === "RECOVER_PAGE_IF_NEEDED") {
      (async function () {
        try {
          await recoverFromFetchErrorIfNeeded(2);
          sendResponse({ ok: true, recovered: true });
        } catch (error) {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Page recovery failed",
          });
        }
      })();
      return true;
    }

    if (message.type === "CANCEL_LOGIN") {
      flow().abort();
      if (placeOrderConfirmResolver) {
        placeOrderConfirmResolver(false);
        placeOrderConfirmResolver = null;
      }
      emit("LOGIN_CANCELLED", { message: "Login cancelled" });
      disableCursor()
        .catch(function () {})
        .finally(function () {
          sendResponse({ ok: true });
        });
      return true;
    }

    if (message.type === "CONFIRM_PLACE_ORDER") {
      if (placeOrderConfirmResolver) {
        placeOrderConfirmResolver(!!message.confirmed);
        placeOrderConfirmResolver = null;
      }
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === "RUN_BATCH_ACCOUNT") {
      (async function () {
        try {
          const result = await runBatchAccount({
            email: message.email,
            password: message.password,
            previousEmail: message.previousEmail,
          });
          sendResponse(result);
        } catch (error) {
          try { await disableCursor(); } catch (_) {}
          if (error && error.name === "LoginCancelledError") {
            sendResponse({ ok: false, cancelled: true, error: error.message });
            return;
          }
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Account switch failed",
          });
        }
      })();
      return true;
    }

    if (message.type === "RUN_BATCH_LOGIN") {
      (async function () {
        try {
          const result = await runBatchLogin({
            email: message.email,
            password: message.password,
          });
          sendResponse(result);
        } catch (error) {
          try { await disableCursor(); } catch (_) {}
          if (error && error.name === "LoginCancelledError") {
            sendResponse({ ok: false, cancelled: true, error: error.message });
            return;
          }
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Login failed",
          });
        }
      })();
      return true;
    }

    if (message.type === "RUN_BATCH_REDEEM") {
      (async function () {
        try {
          const result = await runBatchRedeem({
            email: message.email,
            password: message.password,
            giftCardNumber: message.giftCardNumber,
            giftCardPin: message.giftCardPin,
          });
          sendResponse(result);
        } catch (error) {
          try { await disableCursor(); } catch (_) {}
          if (error && error.name === "LoginCancelledError") {
            sendResponse({ ok: false, cancelled: true, error: error.message });
            return;
          }
          const errMsg = error instanceof Error ? error.message : "Redeem failed";
          const alreadyRedeemed = /already redeemed/i.test(errMsg);
          sendResponse({
            ok: false,
            redeemed: false,
            alreadyRedeemed: alreadyRedeemed,
            error: errMsg,
          });
        }
      })();
      return true;
    }

    if (message.type === "RUN_BATCH_CART") {
      (async function () {
        try {
          const result = await runBatchCart({
            email: message.email,
            password: message.password,
            productUrl: message.productUrl,
            rowNumber: message.rowNumber,
            placeOrder: message.placeOrder,
          });
          sendResponse(result);
        } catch (error) {
          try { await disableCursor(); } catch (_) {}
          if (error && error.name === "LoginCancelledError") {
            sendResponse({ ok: false, cancelled: true, error: error.message });
            return;
          }
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Order failed",
          });
        }
      })();
      return true;
    }

    if (message.type === "RUN_CART") {
      (async function () {
        try {
          emit("LOGIN_PROGRESS", { message: "Starting cart flow…" });
          await runCartAutomation({
            email: message.email,
            password: message.password,
            productUrl: message.productUrl,
          });
          emit("LOGIN_SUCCESS", { message: "Cart flow complete" });
          sendResponse({ ok: true });
        } catch (error) {
        try {
          await disableCursor();
        } catch (_) {}
          if (error && error.name === "LoginCancelledError") {
            emit("LOGIN_CANCELLED", { message: error.message });
            sendResponse({ ok: false, cancelled: true });
            return;
          }
          const errMsg = error instanceof Error ? error.message : "Cart flow failed";
          emit("LOGIN_ERROR", { error: errMsg });
          sendResponse({ ok: false, error: errMsg });
        }
      })();
      return true;
    }

    if (message.type !== "RUN_LOGIN") return;

    (async function () {
      const existing = await loadFlowState();
      if (existing && existing.active) {
        sendResponse({ ok: true });
        return;
      }

      try {
        emit("LOGIN_PROGRESS", { message: "Starting…" });
        const result = await runAutomation({
          email: message.email,
          password: message.password,
          giftCardNumber: message.giftCardNumber,
          giftCardPin: message.giftCardPin,
        });
        emit("LOGIN_SUCCESS", {
          message: result && result.skipped
            ? "Already logged in — gift card redeemed"
            : "Login + gift card redemption complete",
        });
        sendResponse({ ok: true, skipped: !!(result && result.skipped) });
      } catch (error) {
        try {
          await disableCursor();
        } catch (_) {}

        if (error && error.name === "LoginCancelledError") {
          emit("LOGIN_CANCELLED", { message: error.message });
          sendResponse({ ok: false, cancelled: true });
          return;
        }

        const errMsg = error instanceof Error ? error.message : "Login failed";
        emit("LOGIN_ERROR", { error: errMsg });
        sendResponse({ ok: false, error: errMsg });
      }
    })();

    return true;
  });

  (async function resumePendingFlow() {
    const state = await loadFlowState();
    if (!state || !state.active || !state.resumeOnLoad || flow().running) return;

    flow().running = true;
    state.resumeOnLoad = false;
    await saveFlowState(state);

    try {
      emit("LOGIN_PROGRESS", { message: "Resuming after navigation…" });
      await runFromStep(state);
      const stillActive = await loadFlowState();
      if (!stillActive || !stillActive.active) {
        emit("LOGIN_SUCCESS", {
          message:
            state.flowType === "cart"
              ? "Cart flow complete"
              : "Gift card redemption complete",
        });
      }
    } catch (error) {
      try {
        await disableCursor();
      } catch (_) {}
      const errMsg = error instanceof Error ? error.message : "Flow failed";
      const alreadyRedeemed = /already redeemed/i.test(errMsg);
      if (state.waitForRedeemResult || state.flowType === "cart") {
        await markFlowComplete({
          ok: false,
          error: errMsg,
          alreadyRedeemed: alreadyRedeemed,
        });
      }
      if (error && error.name === "LoginCancelledError") {
        emit("LOGIN_CANCELLED", { message: error.message });
      } else {
        emit("LOGIN_ERROR", { error: errMsg });
      }
      await clearFlowState();
    } finally {
      flow().running = false;
    }
  })();

  (async function restoreCursorOnLoad() {
    const data = await new Promise(function (resolve) {
      chrome.storage.local.get(CURSOR_ACTIVE_KEY, resolve);
    });
    if (!data[CURSOR_ACTIVE_KEY]) return;
    for (let i = 0; i < 6; i++) {
      try {
        await enableCursor();
        return;
      } catch (_) {
        await new Promise(function (r) {
          setTimeout(r, 300);
        });
      }
    }
  })();
})();
