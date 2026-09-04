/**
 * Split from content.js — classic content script (shared isolated world).
 * Top-level function/var bindings are shared across content/*.js via manifest order.
 * Part: 09-login-steps.js — Cookies, login modal, email/password
 */
async function acceptCookies() {
  const btn = queryByRole("button", { name: "Accept All" });
  if (btn) {
    logStep("Moving to Accept cookies…");
    await mouse().click(btn, { fast: true });
    logStep("Cookies accepted");
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
  throwIfManualLoginRequired();
  const target = await waitFor(
    function () {
      throwIfManualLoginRequired();
      return findNavbarLogIn();
    },
    5000,
    50,
  );
  if (!target) throw new Error("Navbar Log In not found");

  throwIfManualLoginRequired();
  logStep("Moving to navbar Log In…");
  await mouse().click(target, { fast: true });
  logStep("Clicked navbar Log In");
}

async function hardRefresh() {
  logStep("Refreshing page…");
  // Do not call waitForPageReady here — that re-entered recover → hardRefresh
  // and reloaded the tab in a loop while this document was still alive.
  location.reload();
}

async function waitForLoginPopup(timeoutMs) {
  return waitFor(
    function () {
      return findEmailInput();
    },
    timeoutMs || 3500,
    50,
  );
}

async function openLoginModal() {
  if (findEmailInput()) {
    logStep("Login popup already open");
    return;
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    flow().check();
    if (attempt === 1) {
      await clickLogin();
    } else {
      logStep("Popup did not open — clicking Log In again");
      await clickLogin();
    }

    const networkError = getByText(NETWORK_ERROR);
    if ((networkError && isVisible(networkError)) || hasPageFetchError()) {
      logStep("Network error — refreshing");
      await hardRefresh();
      await new Promise(function () {});
    }

    if (await waitForLoginPopup(3500)) {
      logStep("Login popup open");
      return;
    }
  }
  throw new Error("Login popup did not open after 2 Log In clicks");
}

async function enterEmailAndContinue(email) {
  throwIfManualLoginRequired();

  const emailInput = await waitFor(
    function () {
      throwIfManualLoginRequired();
      return findEmailInput();
    },
    4000,
    50,
  );
  if (!emailInput) throw new Error("Email input not found");

  throwIfManualLoginRequired();
  logStep("Pasting email…");
  await mouse().type(emailInput, email, { paste: true, fast: true });
  logStep("Email entered");
  throwIfManualLoginRequired();

  if (findPasswordInput()) {
    logStep("Password form ready");
    return;
  }

  throwIfManualLoginRequired();
  const continueBtn = await waitUntilEnabled(
    function () {
      throwIfManualLoginRequired();
      return queryByRole("button", { name: "Continue" });
    },
    5000,
  );
  if (!continueBtn) throw new Error("Continue button not found");

  throwIfManualLoginRequired();
  logStep("Moving to Continue…");
  await mouse().click(continueBtn, { fast: true });
  logStep("Clicked Continue");

  // Stop on first lockout — never click Log In / email / Continue again.
  const afterContinue = await waitFor(
    function () {
      if (getManualLoginRequiredMessage()) return "lockout";
      if (findPasswordInput()) return "password";
      return null;
    },
    4000,
    50,
  );
  if (afterContinue === "lockout" || getManualLoginRequiredMessage()) {
    throwIfManualLoginRequired();
  }
  if (afterContinue === "password") {
    logStep("Password form ready");
    return;
  }

  throwIfManualLoginRequired();
  const passwordReady = await preferPasswordLogin(8000);
  throwIfManualLoginRequired();
  if (passwordReady) {
    logStep("Password form ready");
    return;
  }

  throwIfOtpOnlyLogin();
  throw new Error("Password login not available — manual login required");
}

async function loginWithPassword(password) {
  throwIfManualLoginRequired();
  await ensurePasswordTab();

  let passwordInput = findPasswordInput();
  if (!passwordInput) {
    passwordInput = await waitFor(
      function () {
        return findPasswordInput();
      },
      6000,
      50,
    );
  }
  if (!passwordInput) {
    throwIfOtpOnlyLogin();
    throw new Error("Password input not found — manual login required");
  }

  logStep("Pasting password…");
  await mouse().type(passwordInput, password, { masked: true, paste: true, fast: true });
  logStep("Password entered");
  throwIfManualLoginRequired();

  const loginBtn = await waitUntilEnabled(
    function () {
      return findLoginSubmitButton();
    },
    6000,
  );
  if (!loginBtn) throw new Error("Log in submit button not found");

  logStep("Moving to Log in submit…");
  await mouse().click(loginBtn, { fast: true });
  logStep("Submitting login…");

  const success = await waitFor(
    function () {
      const manualError = getManualLoginRequiredMessage();
      if (manualError) return "manual";
      if (getByText("Hi,")) return "success";
      if (readEmailFromProfilePage()) return "success";
      return null;
    },
    15000,
    100,
  );
  if (success === "manual") throwIfManualLoginRequired();
  if (!success) throw new Error("Login did not complete — manual login may be required");
  logStep("Logged in successfully");
}
