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
    300,
  );
  return found || readEmailFromProfilePage();
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
  logStep("Profile page ready (" + ready + ")");
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

  const loggedOut = await waitFor(isLoggedOutState, 15000, 300);
  if (!loggedOut) {
    throw new Error("Sign out did not complete — still logged in");
  }

  await clearSessionEmailStorage();
  logStep("Logged out");
}
