/**
 * Split from content.js — classic content script (shared isolated world).
 * Top-level function/var bindings are shared across content/*.js via manifest order.
 * Part: 11-session.js — Session helpers + ensureLoggedIn
 */
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
  await loginFromProfilePage(email, password);
}

async function loginFromProfilePage(email, password) {
  await openProfilePage();
  await loginFromCurrentPage(email, password);
}

async function waitForLoginRequiredScreen() {
  const gate = await waitFor(
    function () {
      if (findEmailInput()) return "popup";
      if (isAccountRequiredPage()) return "account_required";
      return null;
    },
    10000,
    50,
  );
  if (gate) {
    logStep("Login required (" + gate + ")");
    return gate;
  }
  if (location.href.indexOf("/profile") !== -1 && findNavbarLogIn && findNavbarLogIn()) {
    logStep("Login required (profile Log In)");
    return "login";
  }
  throw new Error("Login required screen did not appear");
}

async function loginFromCurrentPage(email, password) {
  await acceptCookies();
  if (!findEmailInput()) {
    await waitForLoginRequiredScreen();
  }
  if (!findEmailInput()) {
    await openLoginModal();
  }
  await enterEmailAndContinue(email);
  await loginWithPassword(password);
}

async function persistBatchAccountLogin(payload, step) {
  await saveFlowState({
    active: true,
    resumeOnLoad: true,
    flowType: "batch_account",
    email: payload.email || "",
    password: payload.password || "",
    step: step || "login_profile",
  });
}

async function reopenProfileAfterLogout(payload) {
  logStep("Waiting 1s after sign out…");
  await pause(1);
  logStep("Opening profile page again…");
  await persistBatchAccountLogin(payload, "after_logout");
  const current = location.href.split("?")[0].replace(/\/$/, "");
  const target = NOON_PROFILE.replace(/\/$/, "");
  if (current === target) {
    location.reload();
  } else {
    location.href = NOON_PROFILE;
  }
  return { navigated: true };
}

/** Profile first: match email, or sign out → wait → profile → Log In (retry once). */
async function matchOrLoginOnProfile(payload) {
  const required = String(payload.email).trim().toLowerCase();
  const previous = payload.previousEmail
    ? String(payload.previousEmail).trim().toLowerCase()
    : null;

  await openProfilePage();
  const authState = await waitForProfileAuthState(12000);
  let profileEmail =
    authState && authState.kind === "email" ? authState.email : null;
  logStep(
    "Profile check — required=" +
      required +
      " live=" +
      (profileEmail || "unknown") +
      " state=" +
      ((authState && authState.kind) || "unknown"),
  );

  if (profileEmail === required) {
    await setSessionEmail(required);
    logStep("Profile email matches — already logged in as " + required);
    return { ok: true, skipped: true, switched: false };
  }

  const needsLogout =
    (profileEmail && profileEmail !== required) ||
    (!profileEmail && isLoggedIn()) ||
    (previous && previous !== required && profileEmail !== required);

  let didLogout = false;
  if (needsLogout) {
    logStep(
      "Logged in as " +
        (profileEmail || previous || "unknown") +
        " — row is " +
        required +
        " — signing out",
    );
    await logoutFromNoon();
    didLogout = true;
    const afterNav = await reopenProfileAfterLogout(payload);
    if (afterNav.navigated) return { ok: true, pending: true };
    const afterLogout = await waitForProfileAuthState(12000);
    profileEmail =
      afterLogout && afterLogout.kind === "email" ? afterLogout.email : null;
  }

  if (profileEmail === required) {
    await setSessionEmail(required);
    return { ok: true, skipped: true, switched: didLogout };
  }

  if (profileEmail && profileEmail !== required) {
    throw new Error(
      "Still logged in as " +
        profileEmail +
        (didLogout ? " after logout" : " — logout never ran") +
        " — cannot switch to " +
        required,
    );
  }

  logStep("Logging in as " + required + "…");
  try {
    await loginFromCurrentPage(payload.email, payload.password);
    await openProfilePage();
    const afterState = await waitForProfileAuthState(12000);
    const afterEmail =
      afterState && afterState.kind === "email" ? afterState.email : null;
    if (afterEmail !== required) {
      throw new Error(
        "Login finished but profile is " +
          (afterEmail || "unknown") +
          " not " +
          required,
      );
    }
    await setSessionEmail(required);
    return { ok: true, skipped: false, switched: true };
  } catch (localErr) {
    if (
      localErr &&
      localErr.message &&
      (localErr.message.indexOf("OTP is required") !== -1 ||
        localErr.message.indexOf("Manual login required") !== -1 ||
        localErr.message.indexOf("Too many failed attempts") !== -1)
    ) {
      throw localErr;
    }
    logStep(
      "In-place login failed (" +
        (localErr instanceof Error ? localErr.message : "error") +
        ") — retrying from profile",
    );
  }

  await clearFlowDone();
  await persistBatchAccountLogin(payload, "login_profile");
  location.href = NOON_PROFILE;
  return { ok: true, pending: true };
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
    const result = await matchOrLoginOnProfile(payload);
    if (!result.pending) await disableCursor();
    return result;
  } finally {
    flow().running = false;
  }
}

async function ensureLoggedIn(payload) {
  await enableCursor();
  const required = payload && payload.email
    ? String(payload.email).trim().toLowerCase()
    : null;

  if (required) {
    const result = await matchOrLoginOnProfile(payload);
    if (result && result.pending) {
      await new Promise(function () {});
    }
    if (result && result.skipped) {
      logStep("Already logged in as " + required + " — skipping login");
      return true;
    }
    logStep("Login complete as " + required);
    return false;
  }

  await openProfilePage();
  await acceptCookies();
  const authState = await waitForProfileAuthState(12000);
  if (authState && authState.kind === "email") {
    logStep("Already logged in — skipping login");
    return true;
  }

  await loginFromCurrentPage(payload.email, payload.password);
  logStep("Login complete");
  return false;
}
