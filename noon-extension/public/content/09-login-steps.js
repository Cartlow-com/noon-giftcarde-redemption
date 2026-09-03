/**
 * Split from content.js — classic content script (shared isolated world).
 * Top-level function/var bindings are shared across content/*.js via manifest order.
 * Part: 09-login-steps.js — Cookies, login modal, email/password
 */
async function acceptCookies() {
  const btn = queryByRole("button", { name: "Accept All" });
  if (btn) {
    logStep("Moving to Accept cookies…");
    await mouse().click(btn);
    logStep("Cookies accepted");
    await pause();
  }
}

function findNavbarLogIn() {
  const header =
    queryByRole("banner") ||
    document.querySelector("header") ||
    document.querySelector("[class*='header' i]") ||
    document.body;

  // Prefer real interactive controls in the header first.
  const controls = header.querySelectorAll("a, button, [role='button'], [role='link']");
  for (let i = 0; i < controls.length; i++) {
    const el = controls[i];
    if (!isVisible(el)) continue;
    const label = normalizeText(
      el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent,
    ).toLowerCase();
    if (label === "log in" || label === "login") return el;
    if (/^log\s*in$/.test(label)) return el;
  }

  // Fallback: short text node that says Log In, then climb to clickable parent.
  const nodes = header.querySelectorAll("span, div, p, label");
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isVisible(el)) continue;
    const t = normalizeText(el.textContent).toLowerCase();
    if (t !== "log in" && t !== "login") continue;
    if ((el.textContent || "").trim().length > 24) continue;
    const parent =
      el.closest("a, button, [role='button'], [role='link']") || el.parentElement || el;
    return parent;
  }
  return null;
}

async function clickLogin() {
  const target = findNavbarLogIn();
  if (!target) throw new Error("Navbar Log In not found");

  logStep("Moving to navbar Log In…");
  await mouse().click(target);
  await pause(0.6);

  // Extra native fallbacks — Noon sometimes ignores synthetic events on nested text.
  try {
    target.focus();
  } catch (_) {}
  try {
    target.click();
  } catch (_) {}
  try {
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + Math.min(rect.height / 2, 18);
    const hit = document.elementFromPoint(x, y);
    if (hit) {
      const clickable =
        hit.closest("a, button, [role='button'], [role='link']") || hit;
      clickable.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y,
        }),
      );
      try {
        clickable.click();
      } catch (_) {}
    }
  } catch (_) {}

  logStep("Clicked navbar Log In");
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

  // After Continue: use password if available (even when OTP UI is also shown).
  if (findPasswordInput()) {
    logStep("Password form ready");
    return;
  }
  await ensurePasswordTab();
  if (findPasswordInput()) {
    logStep("Password form ready");
    return;
  }
  // OTP screen with no password option → manual login.
  throwIfOtpOnlyLogin();
  throw new Error("Password login not available — manual login required");
}

async function loginWithPassword(password) {
  await ensurePasswordTab();

  let passwordInput = findPasswordInput();
  if (!passwordInput) {
    passwordInput = await waitFor(
      function () {
        return findPasswordInput();
      },
      8000,
      200,
    );
  }
  if (!passwordInput) {
    throwIfOtpOnlyLogin();
    throw new Error("Password input not found — manual login required");
  }

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

