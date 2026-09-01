/**
 * Noon.com login automation — mirrors backend/scripts/noon_login_flow.py
 * Uses visible ghost cursor (mouse.js) for human-like interaction.
 */
(function () {
  const NOON_HOME = "https://www.noon.com/uae-en/";
  const NOON_CREDITS = "https://account.noon.com/uae-en/credits/";
  const NETWORK_ERROR = "Looks like you're offline";
  const FLOW_STATE_KEY = "noon_flow_state";
  const FLOW_DONE_KEY = "noon_flow_done";

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
    return new Promise(function (resolve) {
      chrome.storage.local.set({ [FLOW_DONE_KEY]: true }, resolve);
    });
  }

  function clearFlowDone() {
    return new Promise(function (resolve) {
      chrome.storage.local.remove(FLOW_DONE_KEY, resolve);
    });
  }

  function clearFlowState() {
    return new Promise(function (resolve) {
      chrome.storage.local.remove(FLOW_STATE_KEY, resolve);
    });
  }

  async function persistFlow(step, payload) {
    await saveFlowState({
      active: true,
      resumeOnLoad: true,
      step: step,
      email: payload.email,
      password: payload.password,
      giftCardNumber: payload.giftCardNumber,
      giftCardPin: payload.giftCardPin,
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
    if (isLoggedIn()) return "LOGGED_IN";
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
      return;
    }
    logStep("Opening noon Credits page…");
    if (payload) await persistFlow("RESUME", payload);
    location.href = NOON_CREDITS;
    const loaded = await waitFor(function () {
      return isOnCreditsPage();
    }, 15000, 200);
    if (!loaded) throw new Error("Could not open noon Credits page");
    await clearFlowState();
    await waitForCreditsPageReady();
  }

  async function fillAndRedeemGiftCard(giftCardNumber, giftCardPin) {
    const numberInput = await waitFor(function () {
      return findGiftCardNumberInput();
    }, 10000, 200);
    if (!numberInput) throw new Error("Gift card number input not found");

    logStep("Typing gift card number…");
    await mouse().type(numberInput, giftCardNumber);
    logStep("Gift card number entered");

    const pinInput = await waitFor(function () {
      return findGiftCardPinInput();
    }, 8000, 200);
    if (!pinInput) throw new Error("Gift card PIN input not found");

    logStep("Typing PIN…");
    await mouse().type(pinInput, giftCardPin, { masked: true });
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
  }

  async function runGiftCardRedemption(payload) {
    if (!payload.giftCardNumber || !payload.giftCardPin) {
      throw new Error("Gift card number and PIN are required");
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      flow().check();
      const state = detectPageState();
      logStep("On " + pageStateLabel(state));

      if (state === "REDEEM_FORM") {
        logStep("Filling gift card and PIN…");
        await fillAndRedeemGiftCard(payload.giftCardNumber, payload.giftCardPin);
        return;
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
        logStep("Clicking Redeem Giftcards…");
        const redeemBar = findRedeemGiftcardsBar();
        if (!redeemBar) throw new Error("Redeem Giftcards not found");
        await mouse().click(redeemBar);
        await waitForAddCreditsModal();
        await pause(0.5);
        continue;
      }

      if (state === "LOGGED_IN") {
        await goToCreditsPage(payload);
        continue;
      }

      throw new Error("Must be logged in to redeem gift card");
    }

    throw new Error("Gift card flow did not complete — try again");
  }

  async function runFromStep(state) {
    const payload = {
      email: state.email,
      password: state.password,
      giftCardNumber: state.giftCardNumber,
      giftCardPin: state.giftCardPin,
    };

    await mouse().show();
    await pause(0.5);
    await clearFlowState();
    await runGiftCardRedemption(payload);
  }

  async function runNextStep(payload) {
    await runGiftCardRedemption(payload);
  }

  async function waitForPageReady() {
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
      if (networkError && isVisible(networkError)) {
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
      if (!location.href.includes("noon.com")) {
        logStep("Navigating to Noon…");
        location.href = NOON_HOME;
        await waitForPageReady();
      } else if (location.href.indexOf("www.noon.com") !== -1) {
        await waitForPageReady();
      } else {
        logStep("On account page — continuing");
        await pause(0.3);
      }

      await acceptCookies();

      let loginSkipped = false;
      if (isLoggedIn() || isOnAccountPage()) {
        logStep("Already logged in — skipping login");
        loginSkipped = true;
      } else {
        await mouse().show();
        await openLoginModal();
        await enterEmailAndContinue(payload.email);
        await loginWithPassword(payload.password);
        await pause(0.4);
      }

      if (!loginSkipped) {
        logStep("Login complete — starting gift card flow");
      } else {
        logStep("Starting gift card flow");
      }

      await mouse().show();
      await runNextStep(payload);
      await mouse().hide();
      await markFlowDone();
      return { skipped: loginSkipped };
    } finally {
      flow().running = false;
      await clearFlowState();
    }
  }

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (message.type === "CANCEL_LOGIN") {
      flow().abort();
      emit("LOGIN_CANCELLED", { message: "Login cancelled" });
      mouse()
        .hide()
        .catch(function () {})
        .finally(function () {
          sendResponse({ ok: true });
        });
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
          await mouse().hide();
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
      await mouse().hide();
      await markFlowDone();
      emit("LOGIN_SUCCESS", { message: "Gift card redemption complete" });
    } catch (error) {
      try {
        await mouse().hide();
      } catch (_) {}
      if (error && error.name === "LoginCancelledError") {
        emit("LOGIN_CANCELLED", { message: error.message });
      } else {
        const errMsg = error instanceof Error ? error.message : "Flow failed";
        emit("LOGIN_ERROR", { error: errMsg });
      }
    } finally {
      flow().running = false;
      await clearFlowState();
    }
  })();
})();
