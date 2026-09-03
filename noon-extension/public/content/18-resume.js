/**
 * Split from content.js — classic content script (shared isolated world).
 * Top-level function/var bindings are shared across content/*.js via manifest order.
 * Part: 18-resume.js — Resume pending flow + restore cursor
 */
(async function resumePendingFlow() {
  const state = await loadFlowState();
  if (!state || !state.active || !state.resumeOnLoad || flow().running) return;

  flow().running = true;
  state.resumeOnLoad = false;
  await saveFlowState(state);

  try {
    emit("LOGIN_PROGRESS", { message: "Resuming after navigation…" });

    if (
      state.flowType === "batch_account" &&
      (state.step === "login_profile" || state.step === "login_home")
    ) {
      await enableCursor();
      await loginFromProfilePage(state.email, state.password);
      const required = String(state.email || "").trim().toLowerCase();
      await openProfilePage();
      const profileEmail = await waitForReadableProfileEmail(8000);
      if (profileEmail !== required) {
        throw new Error(
          "Login finished but profile is " +
            (profileEmail || "unknown") +
            " not " +
            required,
        );
      }
      await setSessionEmail(required);
      await disableCursor();
      await markFlowComplete({ ok: true, skipped: false, switched: true });
      await clearFlowState();
      emit("LOGIN_SUCCESS", { message: "Account switch login complete" });
      return;
    }

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
    if (
      state.waitForRedeemResult ||
      state.flowType === "cart" ||
      state.flowType === "batch_account"
    ) {
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

