/**
 * cartTest.js — "Cart test" run mode (nothing is spent):
 *   login → add product to cart → apply coupon → checkout → "Use my credits"
 *   → STOP before Place order → empty the cart.
 * The gift card is NOT redeemed and no order is placed, so redeem/order stay
 * pending and a later real run still does them. Row purchase_status → "cart_ok".
 * Loaded into the service worker via importScripts (after batchRunner.js).
 */

const NOON_CART_URL = "https://www.noon.com/uae-en/cart/";
const CART_EMPTY_TIMEOUT_MS = 60000;

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
  emitStageProgress(row, "order", "active", `Row ${rowNum}: cart test — no redeem, no order`, row.product_url);
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
    else throw new Error("Cart test did not stop at checkout as expected");
  } catch (error) {
    if (error.cancelled) {
      await markRowStopped(row, "order");
      return;
    }
    const errMsg = error instanceof Error ? error.message : "Cart test failed";
    await safeCaptureScreenshot(tabId, row, "on_failure");
    await patchStage(row.id, { purchase_status: "failed", purchase_error: "Cart test: " + errMsg, status: "in_progress" });
    noteAttempt({ message: "Cart test failed: " + errMsg, outcome: "failed_order" });
    emitBatch({ type: "BATCH_ROW_DONE", batchId: row.batch_id, rowId: row.id, rowNumber: rowNum, success: false, stage: "order", message: `Row ${rowNum} cart test failed — ${errMsg}` });
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
  const note =
    "Cart test OK — reached " + reached + "; cart " +
    (cleanup && cleanup.ok ? "emptied" : "NOT emptied (" + ((cleanup && cleanup.error) || "unknown") + ")");
  await patchStage(row.id, {
    purchase_status: "cart_ok",
    purchase_error: cleanup && cleanup.ok ? null : note,
    status: "in_progress",
  });
  noteAttempt({ message: note, outcome: "cart_ok" });
  emitBatch({ type: "BATCH_ROW_DONE", batchId: row.batch_id, rowId: row.id, rowNumber: rowNum, success: true, stage: "order", detail: shortUrl(row.product_url), message: `Row ${rowNum} — ${note}` });
}
