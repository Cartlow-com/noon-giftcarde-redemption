/**
 * cartTest.js — "Dry run" mode (backend field cart_test; nothing is spent):
 *   login → Credits → Redeem Giftcards → fill card + PIN → NOT submitted, modal
 *   closed → add product to cart → apply coupon → checkout → "Use my credits"
 *   → STOP before Place order → empty the cart.
 * The gift card is NOT redeemed and no order is placed, so redeem/order stay
 * pending and a later real run still does them. Row purchase_status → "cart_ok".
 * Loaded into the service worker via importScripts (after batchRunner.js).
 */

const NOON_CART_URL = "https://www.noon.com/uae-en/cart/";
const CART_EMPTY_TIMEOUT_MS = 60000;
const REDEEM_DRYRUN_TIMEOUT_MS = 60000;

/** Wait until the tab really shows a loaded Credits page (not the previous page). */
async function waitForCreditsTab(tabId, timeoutMs = 20000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const tab = await chrome.tabs.get(tabId);
    if (tab && tab.status === "complete" && /\/credits/.test(tab.url || "")) return true;
    await delay(250);
  }
  return false;
}

/** Fill the redeem form on Credits without submitting. Returns "" or an error. */
async function dryRunRedeemForm(tabId, row) {
  if (!row.gift_card_number || !row.gift_card_pin) return "no gift card on row — redeem form skipped";
  emitStageProgress(row, "redeem", "active", `Row ${row.row_number}: dry run — filling redeem form (not submitting)`, maskCardNumber(row.gift_card_number));
  try {
    await assertSessionEmailOnTab(tabId, row.email);
    await openCreditsPage(tabId);
    let result = null;
    // Safe to retry: the dry run only types into the form, it never submits.
    for (let attempt = 0; attempt < 2; attempt++) {
      throwIfCancelled();
      await waitForCreditsTab(tabId);
      try {
        result = await Promise.race([
          chrome.tabs.sendMessage(tabId, {
            type: "RUN_BATCH_REDEEM_DRYRUN",
            email: row.email,
            giftCardNumber: row.gift_card_number,
            giftCardPin: row.gift_card_pin,
          }),
          delay(REDEEM_DRYRUN_TIMEOUT_MS).then(function () {
            return { ok: false, error: "Redeem form timed out" };
          }),
        ]);
      } catch (error) {
        // The message reached the previous page (navigation still committing).
        result = { ok: false, retry: true, error: (error && error.message) || "Credits page not ready" };
      }
      if (result && (result.ok || result.cancelled)) break;
      if (!(result && (result.retry || /Credits page open/.test(result.error || "")))) break;
      await delay(1500);
    }
    if (result && result.cancelled) {
      const err = new Error(result.error || "Cancelled");
      err.cancelled = true;
      throw err;
    }
    if (!result || !result.ok) return (result && result.error) || "Redeem form failed";
    emitStageProgress(row, "redeem", "done", `Row ${row.row_number}: redeem form filled — NOT submitted`, maskCardNumber(row.gift_card_number));
    return "";
  } catch (error) {
    if (error.cancelled) throw error;
    return (error && error.message) || "Redeem form failed";
  }
}

async function emptyCartOnTab(tabId) {
  await chrome.tabs.update(tabId, { url: NOON_CART_URL });
  await waitForTabComplete(tabId);
  return Promise.race([
    chrome.tabs.sendMessage(tabId, { type: "RUN_BATCH_EMPTY_CART" }),
    delay(CART_EMPTY_TIMEOUT_MS).then(function () {
      return { ok: false, error: "Emptying the cart timed out" };
    }),
  ]);
}

async function processCartTestRow(row, tabId, previousEmail) {
  const rowNum = row.row_number;
  emitStageProgress(row, "order", "active", `Row ${rowNum}: dry run — no redeem submit, no order`, row.product_url);
  try {
    await ensureRowAccount(tabId, row, previousEmail || sessionEmail);
  } catch (error) {
    if (error.cancelled) {
      await markRowStopped(row, "login");
      return;
    }
    const errMsg = error instanceof Error ? error.message : "Login failed";
    await skipFailedRow(row, "login", errMsg, tabId);
    noteAttempt({ message: errMsg, outcome: "failed_login" });
    return;
  }

  throwIfCancelled();
  let redeemFormError = "";
  try {
    redeemFormError = await dryRunRedeemForm(tabId, row);
  } catch (error) {
    if (error.cancelled) {
      await markRowStopped(row, "redeem");
      return;
    }
    redeemFormError = (error && error.message) || "Redeem form failed";
  }
  const redeemNote = redeemFormError
    ? (/skipped/.test(redeemFormError) ? redeemFormError : "redeem form FAILED (" + redeemFormError + ")")
    : "redeem form filled (not submitted)";
  if (redeemFormError && !/skipped/.test(redeemFormError)) {
    await safeCaptureScreenshot(tabId, row, "on_failure");
  }

  throwIfCancelled();
  await patchStage(row.id, { purchase_status: "running", purchase_error: null, status: "in_progress" });
  let reached = "";
  try {
    const result = await runFlowStep(tabId, function () {
      return sendBatchCartToTab(tabId, {
        email: row.email,
        password: row.password,
        productUrl: row.product_url,
        couponCode: row.coupon_code || "",
        rowNumber: rowNum,
        placeOrder: false, // hard stop before the Place order click
      });
    });
    if (result && result.orderSkipped) reached = "checkout (stopped before Place order)";
    else if (result && result.paymentIssue) reached = "checkout (credits don't cover total — expected without redeem)";
    else throw new Error("Dry run did not stop at checkout as expected");
  } catch (error) {
    if (error.cancelled) {
      await markRowStopped(row, "order");
      return;
    }
    const errMsg = error instanceof Error ? error.message : "Dry run failed";
    await safeCaptureScreenshot(tabId, row, "on_failure");
    const failNote = "Dry run: " + redeemNote + "; checkout FAILED — " + errMsg;
    await patchStage(row.id, { purchase_status: "failed", purchase_error: failNote, status: "in_progress" });
    noteAttempt({ message: failNote, outcome: "failed_order" });
    emitBatch({ type: "BATCH_ROW_DONE", batchId: row.batch_id, rowId: row.id, rowNumber: rowNum, success: false, stage: "order", message: `Row ${rowNum} — ${failNote}` });
    // Still try to leave the cart empty.
    try { await emptyCartOnTab(tabId); } catch (_) {}
    return;
  }

  await safeCaptureScreenshot(tabId, row, "after_order");
  let cleanup = { ok: false, error: "not attempted" };
  try {
    cleanup = await emptyCartOnTab(tabId);
  } catch (error) {
    cleanup = { ok: false, error: (error && error.message) || "Could not empty cart" };
  }
  const redeemFailed = !!redeemFormError && !/skipped/.test(redeemFormError);
  const cartEmptied = !!(cleanup && cleanup.ok);
  const allOk = !redeemFailed && cartEmptied;
  const note =
    "Dry run " + (allOk ? "OK" : "PARTIAL") + " — " + redeemNote + "; reached " + reached + "; cart " +
    (cartEmptied ? "emptied" : "NOT emptied (" + ((cleanup && cleanup.error) || "unknown") + ")");
  await patchStage(row.id, {
    purchase_status: redeemFailed ? "failed" : "cart_ok",
    purchase_error: allOk ? null : note,
    status: "in_progress",
  });
  noteAttempt({ message: note, outcome: redeemFailed ? "failed_redeem" : "cart_ok" });
  emitBatch({ type: "BATCH_ROW_DONE", batchId: row.batch_id, rowId: row.id, rowNumber: rowNum, success: !redeemFailed, stage: "order", detail: shortUrl(row.product_url), message: `Row ${rowNum} — ${note}` });
}
