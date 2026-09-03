/**
 * Split from content.js — classic content script (shared isolated world).
 * Top-level function/var bindings are shared across content/*.js via manifest order.
 * Part: 02-dom-query.js — DOM query + login form finders
 */
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

function isOtpLoginScreen() {
  const text = normalizeText(document.body && document.body.textContent).toLowerCase();
  if (text.indexOf("enter the 6-digit otp") !== -1) return true;
  if (text.indexOf("6-digit otp") !== -1) return true;
  if (text.indexOf("resend otp") !== -1 && text.indexOf("otp verification") !== -1) {
    return true;
  }
  if (text.indexOf("resend otp") !== -1 && text.indexOf("otp") !== -1) return true;
  const otpBoxes = document.querySelectorAll(
    'input[autocomplete="one-time-code"], input[inputmode="numeric"], input[maxlength="1"]',
  );
  let visibleBoxes = 0;
  for (let i = 0; i < otpBoxes.length; i++) {
    if (isVisible(otpBoxes[i])) visibleBoxes += 1;
  }
  if (visibleBoxes >= 4 && !findPasswordInput()) return true;
  return false;
}

function findPasswordLoginOption() {
  if (findPasswordInput()) return null;
  const named =
    queryByRole("button", { name: "Log in with password" }) ||
    queryByRole("tab", { name: "Log in with password" }) ||
    queryByRole("link", { name: "Log in with password" });
  if (named && isVisible(named)) return named;
  return (
    findClickableByText("Log in with password") ||
    findClickableByText("Login with password") ||
    findClickableByText("Use password") ||
    findClickableByText("Sign in with password")
  );
}

/** OTP-only = OTP UI present AND no password field AND no password switch option. */
function isOtpOnlyLogin() {
  if (findPasswordInput()) return false;
  if (findPasswordLoginOption()) return false;
  return isOtpLoginScreen();
}

function throwIfOtpOnlyLogin() {
  if (isOtpOnlyLogin()) {
    throw new Error("OTP is required — manual login required");
  }
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

  // Prefer switching to password when OTP (or other) UI also offers it.
  const tab = findPasswordLoginOption();
  if (tab) {
    logStep("Moving to password login option…");
    await mouse().click(tab);
    logStep("Switched to password login");
    await pause(0.6);
    await waitFor(
      function () {
        return findPasswordInput();
      },
      6000,
      150,
    );
  }

  if (findPasswordInput()) return;

  // Only fail when OTP is the only option left.
  throwIfOtpOnlyLogin();
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

