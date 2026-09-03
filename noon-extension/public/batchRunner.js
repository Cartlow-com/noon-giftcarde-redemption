const BATCH_RUN_KEY = "noon_batch_run_active";

let batchRunCancelled = false;
let batchRunActive = false;
let currentBatchRow = null;
let sessionEmail = null;
let batchPlaceOrder = true;
let batchSendRedeemEmails = false;
let batchSendOrderEmails = false;

const NOON_CREDITS_URL = "https://account.noon.com/uae-en/credits/";

async function openCreditsPage(tabId) {
  await chrome.tabs.update(tabId, { url: NOON_CREDITS_URL });
  await waitForTabComplete(tabId);
  await delay(900);
}

async function safeCaptureScreenshot(tabId, row, kind) {
  try {
    await captureAndUploadScreenshot(tabId, row.id, kind);
    emitStageProgress(
      row,
      kind.indexOf("order") !== -1 ? "order" : "redeem",
      "info",
      `Row ${row.row_number}: saved ${kind.replace(/_/g, " ")} screenshot`,
    );
  } catch (error) {
    emitStageProgress(
      row,
      "system",
      "info",
      `Row ${row.row_number}: screenshot ${kind} failed — ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
}

async function safeNotifyRedeem(row) {
  if (!batchSendRedeemEmails) return;
  try {
    const result = await notifyRedeemEmail(row.id);
    if (result && result.history && result.history.status === "sent") {
      emitStageProgress(
        row,
        "redeem",
        "info",
        `Row ${row.row_number}: redeem email sent to ${row.email}`,
      );
      return;
    }
    const err =
      (result && result.history && result.history.error) ||
      (result && result.message) ||
      "unknown error";
    emitStageProgress(
      row,
      "redeem",
      "info",
      `Row ${row.row_number}: redeem email failed — ${err}`,
    );
  } catch (error) {
    emitStageProgress(
      row,
      "redeem",
      "info",
      `Row ${row.row_number}: redeem email failed — ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
}

async function safeNotifyOrder(row) {
  if (!batchSendOrderEmails) return;
  try {
    const result = await notifyOrderEmail(row.id);
    if (result && result.history && result.history.status === "sent") {
      emitStageProgress(
        row,
        "order",
        "info",
        `Row ${row.row_number}: order email sent to ${row.email}`,
      );
      return;
    }
    const err =
      (result && result.history && result.history.error) ||
      (result && result.message) ||
      "unknown error";
    emitStageProgress(
      row,
      "order",
      "info",
      `Row ${row.row_number}: order email failed — ${err}`,
    );
  } catch (error) {
    emitStageProgress(
      row,
      "order",
      "info",
      `Row ${row.row_number}: order email failed — ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
}

function orderIdFromUrl(url) {
  const text = String(url || "");
  const patterns = [
    /[?&]order(?:[_-]?id|[_-]?number|No)?=([A-Z0-9-]{5,})/i,
    /\/orders?\/([A-Z0-9-]{5,})/i,
    /\/confirmation\/([A-Z0-9-]{5,})/i,
    /\/thank[_-]?you\/([A-Z0-9-]{5,})/i,
  ];
  for (let i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]);
    if (match && match[1]) return match[1].trim();
  }
  return null;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function emitBatch(message) {
  chrome.runtime.sendMessage(message).catch(function () {});
}

function isoNow() {
  return new Date().toISOString();
}

function maskCardNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length <= 4) return digits || "****";
  return "****" + digits.slice(-4);
}

function shortUrl(url) {
  const text = String(url || "").trim();
  if (text.length <= 72) return text;
  return text.slice(0, 69) + "…";
}

function emitStageProgress(row, stage, status, message, detail) {
  emitBatch({
    type: "BATCH_PROGRESS",
    batchId: row.batch_id,
    rowId: row.id,
    rowNumber: row.row_number,
    stage: stage,
    status: status,
    message: message,
    detail: detail,
  });
}

function throwIfCancelled() {
  if (batchRunCancelled) {
    const err = new Error("Stopped by user");
    err.cancelled = true;
    throw err;
  }
}

async function patchStage(rowId, fields) {
  return patchBatchRow(rowId, fields);
}

async function prepareRowStage(tabId) {
  await chrome.storage.local.remove(["noon_flow_done", "noon_flow_state"]);
  try {
    await chrome.tabs.sendMessage(tabId, { type: "CLEAR_BATCH_FLOW" });
  } catch (_) {}
}

async function recoverNoonTab(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "RECOVER_PAGE_IF_NEEDED" });
  } catch (_) {
    try {
      await hardRefreshTab(tabId);
      await waitForTabComplete(tabId);
      await delay(600);
    } catch (_) {}
  }
}

async function resetTabForNewRow(tabId, rowNumber) {
  if (tabId == null) return;
  sessionEmail = null;
  emitBatch({
    type: "BATCH_PROGRESS",
    stage: "system",
    status: "info",
    message: rowNumber
      ? `Row ${rowNumber}: resetting browser for new row…`
      : "Resetting browser for new row…",
  });
  await chrome.storage.local.remove([
    "noon_flow_done",
    "noon_flow_result",
    "noon_flow_state",
    "noon_cursor_active",
  ]);
  try {
    await chrome.tabs.sendMessage(tabId, { type: "CLEAR_BATCH_FLOW" });
  } catch (_) {}
  try {
    await chrome.tabs.update(tabId, { url: NOON_HOME });
    await waitForTabComplete(tabId);
    await delay(700);
    await hardRefreshTab(tabId);
    await waitForTabComplete(tabId);
    await delay(900);
  } catch (_) {}
}

async function runFlowStep(tabId, runFn) {
  throwIfCancelled();
  await prepareRowStage(tabId);
  await recoverNoonTab(tabId);
  const result = await runFn();
  if (result && result.pending) {
    const done = await waitForFlowDone(120000);
    if (done && done.cancelled) {
      const err = new Error("Stopped by user");
      err.cancelled = true;
      throw err;
    }
    if (!done) throw new Error("Automation timed out");
    if (done.ok === false) {
      const err = new Error(done.error || "Automation failed");
      if (done.alreadyRedeemed) err.alreadyRedeemed = true;
      throw err;
    }
    return done;
  }
  if (result && result.ok === false) {
    if (result.cancelled) {
      const err = new Error("Stopped by user");
      err.cancelled = true;
      throw err;
    }
    const err = new Error(result.error || "Automation failed");
    if (result.alreadyRedeemed) err.alreadyRedeemed = true;
    throw err;
  }
  return result;
}

async function markRowStopped(row, stage) {
  const now = isoNow();
  const fields = { status: "failed" };
  const errMsg = "Stopped by user";
  if (stage === "login") {
    fields.login_status = "failed";
    fields.login_at = now;
    fields.login_error = errMsg;
  } else if (stage === "redeem") {
    fields.redeem_status = "failed";
    fields.redeemed_at = now;
    fields.redeem_error = errMsg;
  } else if (stage === "order") {
    fields.purchase_status = "failed";
    fields.purchased_at = now;
    fields.purchase_error = errMsg;
  }
  await patchStage(row.id, fields);
  emitBatch({
    type: "BATCH_ROW_DONE",
    batchId: row.batch_id,
    rowId: row.id,
    rowNumber: row.row_number,
    success: false,
    stage: stage,
    message: `Row ${row.row_number} stopped during ${stage}`,
  });
}

async function skipFailedRow(row, stage, errMsg) {
  const now = isoNow();
  const fields = { status: "failed" };
  if (stage === "login") {
    fields.login_status = "failed";
    fields.login_at = now;
    fields.login_error = errMsg;
  } else if (stage === "redeem") {
    fields.redeem_status = "failed";
    fields.redeemed_at = now;
    fields.redeem_error = errMsg;
  } else if (stage === "order") {
    fields.purchase_status = "failed";
    fields.purchased_at = now;
    fields.purchase_error = errMsg;
  }
  await patchStage(row.id, fields);
  emitBatch({
    type: "BATCH_ROW_DONE",
    batchId: row.batch_id,
    rowId: row.id,
    rowNumber: row.row_number,
    success: false,
    stage: stage,
    message: `Row ${row.row_number} failed at ${stage}: ${errMsg}`,
    detail:
      stage === "redeem"
        ? maskCardNumber(row.gift_card_number)
        : stage === "order"
          ? shortUrl(row.product_url)
          : row.email,
  });
}

async function markOrderSkippedRow(row, productUrl) {
  const now = isoNow();
  await patchStage(row.id, {
    purchase_status: "skipped",
    purchased_at: now,
    purchase_error: "Place order skipped by user",
    status: "partial",
  });
  emitBatch({
    type: "BATCH_ROW_DONE",
    batchId: row.batch_id,
    rowId: row.id,
    rowNumber: row.row_number,
    success: true,
    stage: "order",
    detail: shortUrl(productUrl),
    message: `Row ${row.row_number} — place order skipped`,
  });
}

async function markPaymentIssueRow(row, productUrl) {
  const now = isoNow();
  await patchStage(row.id, {
    purchase_status: "payment_issue",
    purchased_at: now,
    purchase_error: "Insufficient credits — Select Payment Method required",
    status: "partial",
  });
  emitBatch({
    type: "BATCH_ROW_DONE",
    batchId: row.batch_id,
    rowId: row.id,
    rowNumber: row.row_number,
    success: true,
    stage: "order",
    detail: shortUrl(productUrl),
    message: `Row ${row.row_number} — payment issue, skipped`,
  });
}

async function ensureRowAccount(tabId, row, previousEmail) {
  const rowEmail = normalizeEmail(row.email);
  emitStageProgress(
    row,
    "login",
    "active",
    previousEmail
      ? `Row ${row.row_number}: switching account to ${row.email}`
      : `Row ${row.row_number}: logging in as ${row.email}`,
    row.email,
  );
  await patchStage(row.id, { login_status: "running", status: "in_progress" });
  await navigateTabToProfile(tabId);
  const result = await runFlowStep(tabId, function () {
    return sendBatchAccountToTab(tabId, {
      email: row.email,
      password: row.password,
      previousEmail: previousEmail || null,
    });
  });
  await patchStage(row.id, {
    login_status: "success",
    login_at: isoNow(),
    login_error: null,
  });
  if (result && result.switched) {
    emitStageProgress(
      row,
      "login",
      "done",
      `Row ${row.row_number}: switched to ${row.email}`,
      row.email,
    );
  } else if (result && result.skipped) {
    emitStageProgress(
      row,
      "login",
      "skipped",
      `Row ${row.row_number}: already logged in as ${row.email}`,
      row.email,
    );
  } else {
    emitStageProgress(
      row,
      "login",
      "done",
      `Row ${row.row_number}: login successful`,
      row.email,
    );
  }
  sessionEmail = rowEmail;
  row = await getBatchRow(row.id);
  return row;
}

async function markAlreadyRedeemedRow(row, errMsg) {
  const now = isoNow();
  const cardLabel = maskCardNumber(row.gift_card_number);
  const message = errMsg || "Already redeemed";
  await patchStage(row.id, {
    redeem_status: "already_redeemed",
    redeemed_at: now,
    redeem_error: message,
  });
  emitStageProgress(
    row,
    "redeem",
    "skipped",
    `Row ${row.row_number}: gift card already redeemed`,
    cardLabel,
  );
}

function stageSuccess(status) {
  return status === "success";
}

function stageRedeemDone(status) {
  return status === "success" || status === "already_redeemed";
}

function stageOrderDone(status) {
  return status === "success";
}

async function syncSessionForRow(row, tabId, previousEmail) {
  const rowEmail = normalizeEmail(row.email);
  const loginDone = stageSuccess(row.login_status);

  if (loginDone) {
    if (previousEmail != null && previousEmail !== rowEmail) {
      return ensureRowAccount(tabId, row, previousEmail);
    }
    sessionEmail = rowEmail;
    return row;
  }

  if (previousEmail != null && previousEmail !== rowEmail) {
    return ensureRowAccount(tabId, row, previousEmail);
  }

  await navigateTabToProfile(tabId);
  return row;
}

async function processBatchRow(row, tabId) {
  row = await getBatchRow(row.id);
  const rowNum = row.row_number;
  const now = isoNow();
  currentBatchRow = row;

  if (
    stageSuccess(row.login_status) &&
    stageRedeemDone(row.redeem_status) &&
    stageOrderDone(row.purchase_status)
  ) {
    emitStageProgress(
      row,
      "system",
      "skipped",
      `Row ${rowNum}: all stages already successful — skipping row`,
      row.email,
    );
    await patchStage(row.id, { status: "completed" });
    emitBatch({
      type: "BATCH_ROW_DONE",
      batchId: row.batch_id,
      rowId: row.id,
      rowNumber: rowNum,
      success: true,
      message: `Row ${rowNum} already completed — skipped`,
    });
    return;
  }

  try {
    row = await syncSessionForRow(row, tabId, sessionEmail);
  } catch (error) {
    if (error.cancelled) {
      await markRowStopped(row, "login");
      return;
    }
    const errMsg = error instanceof Error ? error.message : "Login failed";
    await skipFailedRow(row, "login", errMsg);
    return;
  }

  if (!stageSuccess(row.login_status)) {
    throwIfCancelled();
    emitStageProgress(
      row,
      "login",
      "active",
      `Row ${rowNum}: logging in as ${row.email}`,
      row.email,
    );
    await patchStage(row.id, { login_status: "running", status: "in_progress" });
    try {
      await navigateTabToProfile(tabId);
      const result = await runFlowStep(tabId, function () {
        return sendBatchLoginToTab(tabId, {
          email: row.email,
          password: row.password,
        });
      });
      await patchStage(row.id, {
        login_status: "success",
        login_at: now,
        login_error: null,
      });
      sessionEmail = normalizeEmail(row.email);
      if (result && result.skipped) {
        emitStageProgress(
          row,
          "login",
          "skipped",
          `Row ${rowNum}: already logged in — skipped login`,
          row.email,
        );
      } else {
        emitStageProgress(
          row,
          "login",
          "done",
          `Row ${rowNum}: login successful`,
          row.email,
        );
      }
    } catch (error) {
      if (error.cancelled) {
        await markRowStopped(row, "login");
        return;
      }
      const errMsg = error instanceof Error ? error.message : "Login failed";
      await skipFailedRow(row, "login", errMsg);
      return;
    }
  } else {
    sessionEmail = normalizeEmail(row.email);
    emitStageProgress(
      row,
      "login",
      "skipped",
      `Row ${rowNum}: login already successful — skipping`,
      row.email,
    );
  }

  row = await getBatchRow(row.id);

  if (!stageRedeemDone(row.redeem_status)) {
    throwIfCancelled();
    const cardLabel = maskCardNumber(row.gift_card_number);
    emitStageProgress(
      row,
      "redeem",
      "active",
      `Row ${rowNum}: redeeming gift card ${cardLabel}`,
      row.gift_card_number,
    );
    await patchStage(row.id, { redeem_status: "running" });
    try {
      await openCreditsPage(tabId);
      await safeCaptureScreenshot(tabId, row, "before_redeem");
      const result = await runFlowStep(tabId, function () {
        return sendBatchRedeemToTab(tabId, {
          email: row.email,
          password: row.password,
          giftCardNumber: row.gift_card_number,
          giftCardPin: row.gift_card_pin,
        });
      });
      const redeemedAt = isoNow();
      const patch = {
        redeem_status: "success",
        redeemed_at: redeemedAt,
        redeem_error: null,
      };
      if (result && result.balanceBefore != null) patch.balance_before = result.balanceBefore;
      if (result && result.balanceAfter != null) patch.balance_after = result.balanceAfter;
      if (result && result.balanceDelta != null) patch.balance_delta = result.balanceDelta;
      await patchStage(row.id, patch);
      await safeCaptureScreenshot(tabId, row, "after_redeem");
      row = await getBatchRow(row.id);
      await safeNotifyRedeem(row);
      const popupMsg = result && result.popupMessage ? ` — ${result.popupMessage}` : "";
      const balanceMsg =
        result && result.balanceBefore != null && result.balanceAfter != null
          ? ` (${result.balanceBefore} → ${result.balanceAfter} AED)`
          : "";
      emitStageProgress(
        row,
        "redeem",
        "done",
        `Row ${rowNum}: gift card redeemed${popupMsg}${balanceMsg}`,
        cardLabel,
      );
    } catch (error) {
      if (error.cancelled) {
        await markRowStopped(row, "redeem");
        return;
      }
      const errMsg = error instanceof Error ? error.message : "Redeem failed";
      const alreadyRedeemed =
        error.alreadyRedeemed ||
        /already redeemed|gift card is already/i.test(errMsg);
      if (alreadyRedeemed) {
        await markAlreadyRedeemedRow(row, errMsg);
        await safeCaptureScreenshot(tabId, row, "after_redeem");
        row = await getBatchRow(row.id);
        await safeNotifyRedeem(row);
      } else {
        await skipFailedRow(row, "redeem", errMsg);
        return;
      }
    }
  } else {
    emitStageProgress(
      row,
      "redeem",
      "skipped",
      row.redeem_status === "already_redeemed"
        ? `Row ${rowNum}: gift card already redeemed — skipping redeem`
        : `Row ${rowNum}: redeem already successful — skipping`,
      maskCardNumber(row.gift_card_number),
    );
  }

  row = await getBatchRow(row.id);

  if (!stageOrderDone(row.purchase_status)) {
    throwIfCancelled();
    const product = shortUrl(row.product_url);
    const orderRetry =
      row.purchase_status === "skipped" || row.purchase_status === "payment_issue";
    emitStageProgress(
      row,
      "order",
      "active",
      orderRetry
        ? row.purchase_status === "payment_issue"
          ? `Row ${rowNum}: re-running order (previous payment issue)`
          : `Row ${rowNum}: re-running order (previously skipped)`
        : `Row ${rowNum}: purchasing item`,
      row.product_url,
    );
    await patchStage(row.id, {
      purchase_status: "running",
      purchase_error: null,
      status: "in_progress",
    });
    try {
      const result = await runFlowStep(tabId, function () {
        return sendBatchCartToTab(tabId, {
          email: row.email,
          password: row.password,
          productUrl: row.product_url,
          rowNumber: rowNum,
          placeOrder: batchPlaceOrder,
        });
      });
      if (result && result.paymentIssue) {
        await markPaymentIssueRow(row, row.product_url);
        return;
      }
      if (result && result.orderSkipped) {
        await markOrderSkippedRow(row, row.product_url);
        return;
      }
      const orderId =
        (result && result.orderId) ||
        orderIdFromUrl(result && result.confirmationUrl) ||
        null;
      await patchStage(row.id, {
        purchase_status: "success",
        purchased_at: now,
        purchase_error: null,
        order_id: orderId,
        status: "completed",
      });
      await safeCaptureScreenshot(tabId, row, "after_order");
      row = await getBatchRow(row.id);
      await safeNotifyOrder(row);
      emitBatch({
        type: "BATCH_ROW_DONE",
        batchId: row.batch_id,
        rowId: row.id,
        rowNumber: rowNum,
        success: true,
        stage: "order",
        detail: product,
        message: orderId
          ? `Row ${rowNum} completed — order ${orderId}`
          : `Row ${rowNum} completed — purchase placed`,
      });
    } catch (error) {
      if (error.cancelled) {
        await markRowStopped(row, "order");
        return;
      }
      const errMsg = error instanceof Error ? error.message : "Order failed";
      await skipFailedRow(row, "order", errMsg);
    }
    return;
  }

  emitStageProgress(
    row,
    "order",
    "skipped",
    `Row ${rowNum}: order already successful — skipping`,
    shortUrl(row.product_url),
  );
  await patchStage(row.id, { status: "completed" });
  emitBatch({
    type: "BATCH_ROW_DONE",
    batchId: row.batch_id,
    rowId: row.id,
    rowNumber: rowNum,
    success: true,
    message: `Row ${rowNum} already completed — all stages successful`,
  });
}

async function runSelectedRows(batchId, rowIds, options) {
  if (!rowIds || rowIds.length === 0) {
    throw new Error("No rows selected");
  }

  const opts = options || {};
  batchRunCancelled = false;
  batchRunActive = true;
  currentBatchRow = null;
  sessionEmail = null;
  batchPlaceOrder = opts.placeOrder !== false;
  batchSendRedeemEmails = !!opts.sendRedeemEmails;
  batchSendOrderEmails = !!opts.sendOrderEmails;
  await chrome.storage.local.set({
    [BATCH_RUN_KEY]: {
      batchId: batchId,
      rowIds: rowIds,
      active: true,
      placeOrder: batchPlaceOrder,
      sendRedeemEmails: batchSendRedeemEmails,
      sendOrderEmails: batchSendOrderEmails,
    },
  });

  emitBatch({
    type: "BATCH_PROGRESS",
    batchId: batchId,
    stage: "system",
    status: "info",
    message:
      `Starting ${rowIds.length} selected row(s)` +
      (batchPlaceOrder ? " — place order on" : " — place order off") +
      (batchSendRedeemEmails ? " — redeem emails on" : " — redeem emails off") +
      (batchSendOrderEmails ? " — order emails on" : " — order emails off"),
  });

  let processed = 0;

  for (let i = 0; i < rowIds.length; i++) {
    if (batchRunCancelled) break;
    const rowId = rowIds[i];

    let row;
    try {
      row = await getBatchRow(rowId);
    } catch (error) {
      emitBatch({
        type: "BATCH_ERROR",
        batchId: batchId,
        error: error instanceof Error ? error.message : "Failed to load row",
      });
      break;
    }

    if (row.batch_id !== batchId) continue;

    await patchStage(row.id, { status: "in_progress" });

    const tabId = await getOrCreateNoonTab();
    activeLoginTabId = tabId;
    if (i > 0) {
      await resetTabForNewRow(tabId, row.row_number);
    } else {
      await recoverNoonTab(tabId);
    }
    await processBatchRow(row, tabId);
    activeLoginTabId = null;
    currentBatchRow = null;
    processed += 1;
  }

  batchRunActive = false;
  currentBatchRow = null;
  await chrome.storage.local.remove(BATCH_RUN_KEY);

  emitBatch({
    type: "BATCH_COMPLETE",
    batchId: batchId,
    processed: processed,
    cancelled: batchRunCancelled,
    message: batchRunCancelled
      ? `Stopped after ${processed} row(s)`
      : `Finished — ${processed} row(s) processed`,
  });
}

function stopBatchRun() {
  batchRunCancelled = true;
  batchRunActive = false;
  chrome.storage.local.remove(BATCH_RUN_KEY);
  if (activeLoginTabId != null) {
    cancelLoginOnTab(activeLoginTabId).catch(function () {});
  }
  if (currentBatchRow) {
    emitBatch({
      type: "BATCH_PROGRESS",
      batchId: currentBatchRow.batch_id,
      rowId: currentBatchRow.id,
      rowNumber: currentBatchRow.row_number,
      stage: "system",
      status: "info",
      message: `Stopping row ${currentBatchRow.row_number}…`,
    });
  }
}

function isBatchRunActive() {
  return batchRunActive;
}

function isBatchRunCancelled() {
  return batchRunCancelled;
}

function getCurrentBatchRow() {
  return currentBatchRow;
}
