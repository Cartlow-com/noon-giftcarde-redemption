/**
 * Split from content.js — classic content script (shared isolated world).
 * Top-level function/var bindings are shared across content/*.js via manifest order.
 * Part: 10-account.js — Profile email, logout, cookies
 */
function findEmailInText(text) {
  const match = (text || "").match(/[\w.+-]+@[\w.-]+\.\w+/);
  return match ? match[0].toLowerCase() : null;
}

function isLoggedOutState() {
  if (isAccountRequiredPage()) return true;
  if (isLoggedIn()) return false;
  if (readEmailFromProfilePage()) return false;
  if (location.href.indexOf("www.noon.com") !== -1 && findNavbarLogIn()) return true;
  return !hasActiveNoonSession();
}

function readEmailFromProfilePage() {
  const scopes = [
    document.querySelector("main"),
    document.querySelector('[class*="profile" i]'),
  ];
  for (let s = 0; s < scopes.length; s++) {
    const scope = scopes[s];
    if (!scope) continue;
    const inputs = scope.querySelectorAll("input");
    for (let i = 0; i < inputs.length; i++) {
      if (inputs[i].closest('[role="dialog"], [aria-modal="true"]')) continue;
      const val = (inputs[i].value || "").trim().toLowerCase();
      if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(val)) return val;
    }
  }
  const main = document.querySelector("main");
  return main ? findEmailInText(main.textContent) : null;
}

function hasActiveNoonSession() {
  if (isAccountRequiredPage()) return false;
  if (readEmailFromProfilePage()) return true;
  if (isLoggedIn()) return true;
  return false;
}

async function waitForReadableProfileEmail(timeoutMs) {
  const found = await waitFor(
    function () {
      return readEmailFromProfilePage();
    },
    timeoutMs || 8000,
    50,
  );
  return found || readEmailFromProfilePage();
}

/** Wait until profile email is readable, or the login-required gate is shown. Never treat navbar Log In alone as ready. */
async function waitForProfileAuthState(timeoutMs) {
  const found = await waitFor(
    function () {
      const email = readEmailFromProfilePage();
      if (email) return { kind: "email", email: email };
      if (isAccountRequiredPage()) return { kind: "logged_out" };
      if (findEmailInput()) return { kind: "login_modal" };
      return null;
    },
    timeoutMs || 10000,
    50,
  );
  if (found) return found;
  const email = readEmailFromProfilePage();
  if (email) return { kind: "email", email: email };
  if (isAccountRequiredPage() || findEmailInput()) return { kind: "logged_out" };
  if (
    location.href.indexOf("/profile") !== -1 &&
    !isLoggedIn() &&
    findNavbarLogIn &&
    findNavbarLogIn()
  ) {
    return { kind: "logged_out" };
  }
  return { kind: "unknown" };
}

async function waitForProfilePageReady() {
  logStep("Waiting for profile page…");
  const ready = await waitFor(
    function () {
      if (location.href.indexOf("/profile") === -1 && !isAccountRequiredPage()) {
        return null;
      }
      if (isAccountRequiredPage()) return "account_required";
      if (readEmailFromProfilePage()) return "email";
      if (findEmailInput()) return "login_modal";
      if (isLoggedIn() && readEmailFromProfilePage()) return "email";
      return null;
    },
    12000,
    50,
  );
  if (ready) {
    logStep("Profile page ready (" + ready + ")");
    return;
  }
  const fallback = await waitForProfileAuthState(2000);
  if (fallback && fallback.kind !== "unknown") {
    logStep("Profile page ready (" + fallback.kind + ")");
    return;
  }
  throw new Error("Profile page did not load");
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

async function clearSessionEmailStorage() {
  await new Promise(function (resolve) {
    chrome.storage.local.remove(SESSION_EMAIL_KEY, resolve);
  });
}

async function logoutFromNoon() {
  const beforeEmail = readEmailFromProfilePage();
  logStep("Logging out" + (beforeEmail ? " (" + beforeEmail + ")" : "") + "…");
  await acceptCookies();

  if (!findProfileButton() && location.href.indexOf("www.noon.com") === -1) {
    location.href = NOON_HOME;
    await waitForPageReady();
    await acceptCookies();
  }

  if (!(await openProfileDropdown())) {
    throw new Error("Account menu not found — cannot sign out");
  }

  const signOut = findSignOutButton();
  if (!signOut) {
    throw new Error("Sign out button not found");
  }

  await clickSignOut(signOut);

  const loggedOut = await waitFor(isLoggedOutState, 12000, 50);
  if (!loggedOut) {
    throw new Error("Sign out did not complete — still logged in");
  }

  await clearSessionEmailStorage();
  logStep("Logged out");
}
