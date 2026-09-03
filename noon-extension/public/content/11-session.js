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
  await goToNoonHomeIfNeeded();
  await acceptCookies();
  await openLoginModal();
  await enterEmailAndContinue(email);
  await loginWithPassword(password);
  await pause(0.4);
}

async function loginFromCurrentPage(email, password) {
  await acceptCookies();
  // On Account required (and any logged-out page): open navbar Log In popup — never the blue LOGIN/SIGNUP.
  if (!findEmailInput()) {
    await openLoginModal();
  }
  await enterEmailAndContinue(email);
  await loginWithPassword(password);
  await pause(0.4);
}

async function persistBatchAccountLogin(payload) {
  await saveFlowState({
    active: true,
    resumeOnLoad: true,
    flowType: "batch_account",
    email: payload.email || "",
    password: payload.password || "",
    step: "login_home",
  });
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
    let profileEmail = await waitForReadableProfileEmail(6000);
    logStep(
      "Profile check — required=" +
        required +
        " live=" +
        (profileEmail || "unknown") +
        " hiGreeting=" +
        isLoggedIn() +
        " session=" +
        hasActiveNoonSession(),
    );

    // Already the right account.
    if (profileEmail === required) {
      await setSessionEmail(required);
      logStep("Profile email matches — already logged in as " + required);
      await disableCursor();
      return { ok: true, skipped: true, switched: false };
    }

    // MUST logout when profile shows another email — do not require Hi, greeting.
    // If previous row email differs and we cannot prove we are already `required`, logout.
    const needsLogout =
      (profileEmail && profileEmail !== required) ||
      (!profileEmail && isLoggedIn()) ||
      (previous && previous !== required && profileEmail !== required);

    let didLogout = false;
    if (needsLogout) {
      logStep(
        "Switching account — logout required before " +
          required +
          " (live=" +
          (profileEmail || previous || "unknown") +
          ")",
      );
      await logoutFromNoon();
      didLogout = true;
      await pause(0.6);
      await openProfilePage();
      profileEmail = await waitForReadableProfileEmail(4000);
    }

    if (profileEmail === required) {
      await setSessionEmail(required);
      await disableCursor();
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

    // Logged out (or account-required) → login as row.
    logStep("Logging in as " + required + "…");
    try {
      if (!isAccountRequiredPage() && location.href.indexOf("www.noon.com") === -1) {
        location.href = NOON_HOME;
        await waitForPageReady();
      }
      await loginFromCurrentPage(payload.email, payload.password);
      await openProfilePage();
      const afterEmail = await waitForReadableProfileEmail(8000);
      if (afterEmail !== required) {
        throw new Error(
          "Login finished but profile is " +
            (afterEmail || "unknown") +
            " not " +
            required,
        );
      }
      await setSessionEmail(required);
      await disableCursor();
      return {
        ok: true,
        skipped: false,
        switched: true,
      };
    } catch (localErr) {
      if (localErr && localErr.message && localErr.message.indexOf("OTP is required") !== -1) {
        throw localErr;
      }
      logStep(
        "In-place login failed (" +
          (localErr instanceof Error ? localErr.message : "error") +
          ") — continuing on homepage",
      );
    }

    await clearFlowDone();
    await persistBatchAccountLogin(payload);
    location.href = NOON_HOME;
    return { ok: true, pending: true };
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
  const required = payload && payload.email
    ? String(payload.email).trim().toLowerCase()
    : null;

  // If we know the required account, always verify via profile (never trust Hi, alone).
  if (required) {
    try {
      await assertSessionMatchesRowEmail(required);
      logStep("Already logged in as " + required + " — skipping login");
      return true;
    } catch (_) {
      if (isLoggedIn()) {
        logStep("Logged in as someone else — logging out before " + required);
        await logoutFromNoon();
      }
    }
    await loginFromCurrentPage(payload.email, payload.password).catch(async function () {
      await loginOnHomepage(payload.email, payload.password);
    });
    await assertSessionMatchesRowEmail(required);
    logStep("Login complete as " + required);
    return false;
  }

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

