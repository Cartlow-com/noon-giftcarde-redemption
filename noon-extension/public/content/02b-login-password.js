/**
 * Split from content.js — classic content script (shared isolated world).
 * Part: 02b-login-password.js — OTP vs password preference on Noon login
 *
 * Rule:
 * - OTP + password on same screen → use password flow
 * - OTP only (no password field / switch) → stop (manual login)
 *
 * Loaded after 03-dom-nav.js (uses normalizeText / findClickableByText).
 */

function getLoginUiScope() {
  return (
    document.querySelector('[role="dialog"]') ||
    document.querySelector('[aria-modal="true"]') ||
    document.querySelector('[class*="modal" i]') ||
    document.querySelector('[class*="login" i]') ||
    document.querySelector('[class*="signin" i]') ||
    document.body
  );
}

function countVisibleOtpBoxes(scope) {
  const root = scope || document;
  const otpBoxes = root.querySelectorAll(
    'input[autocomplete="one-time-code"], input[inputmode="numeric"][maxlength="1"], input[maxlength="1"]',
  );
  let visibleBoxes = 0;
  for (let i = 0; i < otpBoxes.length; i++) {
    if (!isVisible(otpBoxes[i])) continue;
    const type = (otpBoxes[i].getAttribute("type") || "").toLowerCase();
    if (type === "password" || type === "email" || type === "hidden") continue;
    visibleBoxes += 1;
  }
  return visibleBoxes;
}

function isOtpUiVisible() {
  const scope = getLoginUiScope();
  if (countVisibleOtpBoxes(scope) >= 4) return true;
  const text = normalizeText(scope.textContent).toLowerCase();
  if (text.indexOf("enter the 6-digit otp") !== -1) return true;
  if (text.indexOf("6-digit otp") !== -1) return true;
  if (text.indexOf("otp verification") !== -1) return true;
  if (text.indexOf("resend otp") !== -1 && countVisibleOtpBoxes(scope) >= 1) return true;
  return false;
}

/**
 * Find "Log in with password" / Password tab even when OTP is on the same screen.
 * Returns null if password field is already visible (nothing to switch).
 */
function findPasswordLoginOption() {
  if (findPasswordInput()) return null;

  const named =
    queryByRole("button", { name: "Log in with password" }) ||
    queryByRole("tab", { name: "Log in with password" }) ||
    queryByRole("link", { name: "Log in with password" }) ||
    queryByRole("button", { name: "Login with password" }) ||
    queryByRole("tab", { name: "Password" });
  if (named && isVisible(named)) return named;

  const byText =
    findClickableByText("Log in with password") ||
    findClickableByText("Login with password") ||
    findClickableByText("Use password") ||
    findClickableByText("Sign in with password") ||
    findClickableByText("Continue with password");
  if (byText && isVisible(byText)) return byText;

  const scope = getLoginUiScope();
  const nodes = scope.querySelectorAll(
    "button, a, [role='button'], [role='tab'], [role='link'], [role='radio']",
  );
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isVisible(el)) continue;
    const t = normalizeText(el.textContent).toLowerCase();
    if (!t || t.length > 48) continue;
    if (t.indexOf("forgot") !== -1) continue;
    if (t.indexOf("otp") !== -1) continue;
    const isPasswordControl =
      t === "password" ||
      t.indexOf("with password") !== -1 ||
      t.indexOf("use password") !== -1 ||
      t.indexOf("password instead") !== -1 ||
      /^log\s*in with password$/.test(t) ||
      /^login with password$/.test(t);
    if (!isPasswordControl) continue;
    return el;
  }
  return null;
}

/** True only when OTP is showing AND there is no password field AND no password switch. */
function isOtpOnlyLogin() {
  if (findPasswordInput()) return false;
  if (findPasswordLoginOption()) return false;
  // Email step (before Continue) is never a final OTP-only decision.
  if (findEmailInput() && countVisibleOtpBoxes(getLoginUiScope()) < 4) return false;
  return isOtpUiVisible();
}

function throwIfOtpOnlyLogin() {
  if (isOtpOnlyLogin()) {
    throw new Error("OTP is required — manual login required");
  }
}

/**
 * Same screen may show OTP + password. Always prefer password when available.
 * Returns true when password field is ready; false if OTP-only (caller should stop).
 */
async function preferPasswordLogin(timeoutMs) {
  if (findPasswordInput()) {
    logStep("Password field available — using password login");
    return true;
  }

  const started = Date.now();
  const deadline = started + (timeoutMs == null ? 8000 : timeoutMs);
  let switchAttempts = 0;

  while (Date.now() < deadline) {
    flow().check();
    throwIfManualLoginRequired();
    if (findPasswordInput()) {
      logStep("Password field available — using password login");
      return true;
    }

    const opt = findPasswordLoginOption();
    if (opt && switchAttempts < 2) {
      switchAttempts += 1;
      logStep("OTP + password on same screen — switching to password…");
      await mouse().click(opt, { fast: true });
      try {
        opt.click();
      } catch (_) {}
      const ready = await waitFor(
        function () {
          return findPasswordInput();
        },
        5000,
        50,
      );
      if (ready) {
        logStep("Password field ready");
        return true;
      }
      continue;
    }

    // Wait longer before declaring OTP-only so a slow password tab can appear.
    if (!opt && isOtpOnlyLogin() && Date.now() - started > 3500) {
      break;
    }
    await pause(0.05);
  }

  if (findPasswordInput()) return true;
  return false;
}

async function ensurePasswordTab() {
  if (findPasswordInput()) return;

  // Email step comes before password/OTP choice — never fail OTP here.
  if (findEmailInput() && countVisibleOtpBoxes(getLoginUiScope()) < 4) return;

  const ok = await preferPasswordLogin(6000);
  if (ok) return;

  // Only fail when OTP is the only option left.
  throwIfOtpOnlyLogin();
}
