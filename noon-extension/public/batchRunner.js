const BATCH_RUN_KEY = "noon_batch_run_active";

let batchRunCancelled = false;
let batchRunActive = false;
let currentBatchRow = null;
let sessionEmail = null;
let batchPlaceOrder = true;
let batchSendRedeemEmails = false;
let batchSendOrderEmails = false;
let batchHideWindow = false;
let batchLoginOnly = false;
let activeBatchRunId = null;
let pendingAttemptMeta = null;
let activeAttemptId = null;

const NOON_CREDITS_URL = "https://account.noon.com/uae-en/credits/";
const NOON_PROFILE_URL = "https://account.noon.com/uae-en/profile/";

async function openCreditsPage(tabId) {
  await chrome.tabs.update(tabId, { url: NOON_CREDITS_URL });
  await waitForTabComplete(tabId);
}

async function captureRedeemScreenshot(tabId, row, kind) {
  // Always land on credits and wait for Available Balance before capturing.
  await chrome.tabs.update(tabId, { url: NOON_CREDITS_URL, active: true });
  await waitForTabComplete(tabId);

  let prepared = null;
  try {
    throwIfCancelled();
    prepared = await prepareCreditsScreenshotOnTab(tabId, "ready");
    if (prepared && prepared.ok === false) {
      throw new Error(prepared.error || "Credits page not ready for screenshot");
    }
    if (!prepared || prepared.balance == null) {
      throw new Error("Credits balance not visible — skipping inaccurate screenshot");
    }
    emitStageProgress(
      row,
      "redeem",
      "info",
      `Row ${row.row_number}: credits balance ${prepared.balance} AED — capturing ${kind.replace(/_/g, " ")}`,
    );
  } catch (error) {
    emitStageProgress(
      row,
      "system",
      "info",
      `Row ${row.row_number}: credits prepare for ${kind} — ${
        error instanceof Error ? error.message : "skipping screenshot"
      }`,
    );
    return;
  }

  // Ensure we still own the Noon credits tab (never capture dashboard/other windows).
  let tab = await chrome.tabs.get(tabId);
  if (!tab.url || tab.url.indexOf("account.noon.com") === -1 || tab.url.indexOf("/credits") === -1) {
    await chrome.tabs.update(tabId, { url: NOON_CREDITS_URL, active: true });
    await waitForTabComplete(tabId);
    prepared = await prepareCreditsScreenshotOnTab(tabId, "ready");
    if (!prepared || prepared.ok === false || prepared.balance == null) return;
    tab = await chrome.tabs.get(tabId);
  }

  await safeCaptureScreenshot(tabId, row, kind);
}

async function safeCaptureScreenshot(tabId, row, kind) {
  // on_failure: one shot only — row already failed (e.g. too many login attempts);
  // a second capture just delays moving on and rarely helps.
  const maxAttempts = kind === "on_failure" ? 1 : 2;
  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await captureAndUploadScreenshot(tabId, row.id, kind);
      emitStageProgress(
        row,
        kind === "on_failure" ? "system" : kind.indexOf("order") !== -1 ? "order" : "redeem",
        "info",
        `Row ${row.row_number}: saved ${kind.replace(/_/g, " ")} screenshot`,
      );
      return;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < maxAttempts) await delay(150);
    }
  }
  emitStageProgress(
    row,
    "system",
    "info",
    `Row ${row.row_number}: screenshot ${kind} failed — ${
      lastError instanceof Error ? lastError.message : "unknown error"
    }`,
  );
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
  // Backend already finalizes rows on Stop — skip late stage writes.
  if (batchRunCancelled) return null;
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
    // Wait for content script instead of reloading — refresh mid-flow breaks automation.
    await delay(150);
  }
}

async function resetTabForNewRow(tabId, rowNumber) {
  if (tabId == null) return;
  // Keep sessionEmail for the next row's switch logic — caller passes previousEmail.
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
    await chrome.tabs.update(tabId, { url: NOON_PROFILE_URL });
    await waitForTabComplete(tabId);
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

async function skipFailedRow(row, stage, errMsg, tabId) {
  // Capture failure page first (before any further navigation/patch side effects).
  if (tabId != null) {
    try {
      // Temporarily un-hide so captureVisibleTab can see the page.
      const wasHidden = !!batchHideWindow;
      batchHideWindow = false;
      await safeCaptureScreenshot(tabId, row, "on_failure");
      batchHideWindow = wasHidden;
    } catch (_) {}
  }
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

async function processLoginOnlyRow(row, tabId) {
  row = await getBatchRow(row.id);
  const rowNum = row.row_number;
  currentBatchRow = row;
  emitStageProgress(
    row,
    "login",
    "active",
    `Row ${rowNum}: login-only test — forcing login as ${row.email}`,
    row.email,
  );
  try {
    // Always run account switch/login regardless of stored login_status.
    await ensureRowAccount(tabId, row, sessionEmail);
    emitBatch({
      type: "BATCH_ROW_DONE",
      batchId: row.batch_id,
      rowId: row.id,
      rowNumber: rowNum,
      success: true,
      stage: "login",
      message: `Row ${rowNum} login-only OK — ${row.email}`,
      detail: row.email,
    });
  } catch (error) {
    if (error.cancelled) {
      await markRowStopped(row, "login");
      return;
    }
    const errMsg = error instanceof Error ? error.message : "Login failed";
    await skipFailedRow(row, "login", errMsg, tabId);
  }
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
  if (result && result.ok === false) {
    const err = new Error(result.error || "Account switch failed");
    if (result.cancelled) err.cancelled = true;
    throw err;
  }

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

async function beginRowAttempt(row) {
  if (!row || !row.id) return null;
  const created = await batchApiRequest(`/batches/rows/${encodeURIComponent(row.id)}/attempts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      batch_run_id: activeBatchRunId || null,
      outcome: "started",
      message: "Row attempt started",
      login_status: row.login_status || "pending",
      redeem_status: row.redeem_status || "pending",
      purchase_status: row.purchase_status || "pending",
      status: "in_progress",
    }),
  });
  activeAttemptId = created && created.id ? created.id : null;
  return created;
}

async function finishRowAttempt(row, meta) {
  if (!row || !row.id) return null;
  const info = meta || {};
  const body = {
    outcome: info.outcome || row.status || "unknown",
    message: info.message || null,
    login_status: row.login_status,
    redeem_status: row.redeem_status,
    purchase_status: row.purchase_status,
    status: row.status,
    login_error: row.login_error || null,
    redeem_error: row.redeem_error || null,
    purchase_error: row.purchase_error || null,
    order_id: row.order_id || null,
    duration_ms: row.duration_ms != null ? row.duration_ms : null,
  };
  if (activeAttemptId) {
    const updated = await batchApiRequest(
      `/batches/attempts/${encodeURIComponent(activeAttemptId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    activeAttemptId = null;
    return updated;
  }
  // Fallback if start failed: still record a completion attempt (and surface errors).
  return batchApiRequest(`/batches/rows/${encodeURIComponent(row.id)}/attempts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      batch_run_id: activeBatchRunId || null,
      ...body,
    }),
  });
}

function noteAttempt(meta) {
  pendingAttemptMeta = meta || null;
}

async function syncSessionForRow(row, tabId, previousEmail) {
  // CRITICAL: never trust DB login_status or in-memory sessionEmail alone.
  // Always open profile; logout+login when browser session != row email.
  return ensureRowAccount(tabId, row, previousEmail || sessionEmail);
}

async function processBatchRow(row, tabId, previousEmail) {
  row = await getBatchRow(row.id);
  const rowNum = row.row_number;
  const now = isoNow();
  currentBatchRow = row;
  pendingAttemptMeta = null;

  if (batchLoginOnly) {
    await processLoginOnlyRow(row, tabId);
    return;
  }

  if (
    stageRedeemDone(row.redeem_status) &&
    stageOrderDone(row.purchase_status)
  ) {
    emitStageProgress(
      row,
      "system",
      "skipped",
      `Row ${rowNum}: redeem+order already done — skipping entire row`,
      row.email,
    );
    await patchStage(row.id, { status: "completed" });
    noteAttempt({
      message: "Skipped — redeem and order already successful",
      outcome: "skipped_complete",
    });
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

  // One account ensure per row: logout if needed → login → verify profile email.
  try {
    row = await syncSessionForRow(row, tabId, previousEmail || sessionEmail);
  } catch (error) {
    if (error.cancelled) {
      await markRowStopped(row, "login");
      return;
    }
    const errMsg = error instanceof Error ? error.message : "Login failed";
    await skipFailedRow(row, "login", errMsg, tabId);
    row = await getBatchRow(row.id);
    noteAttempt({ message: errMsg, outcome: "failed_login" });
    return;
  }

  emitStageProgress(
    row,
    "login",
    "done",
    `Row ${rowNum}: session confirmed as ${row.email}`,
    row.email,
  );

  row = await getBatchRow(row.id);

  if (!stageRedeemDone(row.redeem_status)) {
    throwIfCancelled();
    // Always re-verify live Noon email == row email before redeem (never trust prior login alone).
    try {
      await assertSessionEmailOnTab(tabId, row.email);
    } catch (error) {
      if (error.cancelled) {
        await markRowStopped(row, "login");
        return;
      }
      const errMsg = error instanceof Error ? error.message : "Session email mismatch";
      await skipFailedRow(row, "login", errMsg, tabId);
      noteAttempt({ message: errMsg, outcome: "failed_login" });
      return;
    }
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
      await captureRedeemScreenshot(tabId, row, "before_redeem");
      const result = await runFlowStep(tabId, function () {
        return sendBatchRedeemToTab(tabId, {
          email: row.email,
          password: row.password,
          giftCardNumber: row.gift_card_number,
          giftCardPin: row.gift_card_pin,
          accountVerified: false,
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
      await captureRedeemScreenshot(tabId, row, "after_redeem");
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
        await captureRedeemScreenshot(tabId, row, "after_redeem");
        row = await getBatchRow(row.id);
        await safeNotifyRedeem(row);
      } else {
        await skipFailedRow(row, "redeem", errMsg, tabId);
        row = await getBatchRow(row.id);
        noteAttempt({ message: errMsg, outcome: "failed_redeem" });
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
    // Always re-verify before placing order.
    try {
      await assertSessionEmailOnTab(tabId, row.email);
    } catch (error) {
      if (error.cancelled) {
        await markRowStopped(row, "login");
        return;
      }
      const errMsg = error instanceof Error ? error.message : "Session email mismatch";
      await skipFailedRow(row, "login", errMsg, tabId);
      noteAttempt({ message: errMsg, outcome: "failed_login" });
      return;
    }
    const product = shortUrl(row.product_url);
    const orderRetry =
      row.status === "partial" ||
      row.purchase_status === "skipped" ||
      row.purchase_status === "payment_issue" ||
      row.purchase_status === "failed";
    emitStageProgress(
      row,
      "order",
      "active",
      orderRetry
        ? row.purchase_status === "payment_issue"
          ? `Row ${rowNum}: re-running order (previous payment issue)`
          : row.status === "partial"
            ? `Row ${rowNum}: re-running order (row was partial)`
            : `Row ${rowNum}: re-running order (previously ${row.purchase_status || "incomplete"})`
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
        row = await getBatchRow(row.id);
        noteAttempt({ message: "Payment issue", outcome: "partial" });
        return;
      }
      if (result && result.orderSkipped) {
        await markOrderSkippedRow(row, row.product_url);
        row = await getBatchRow(row.id);
        noteAttempt({ message: "Place order skipped", outcome: "partial" });
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
      noteAttempt({
        message: orderId ? `Order ${orderId}` : "Order placed",
        outcome: "completed",
      });
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
      await skipFailedRow(row, "order", errMsg, tabId);
      row = await getBatchRow(row.id);
      noteAttempt({ message: errMsg, outcome: "failed_order" });
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
  row = await getBatchRow(row.id);
  noteAttempt({
    message: "Skipped — order already successful",
    outcome: "skipped_complete",
  });
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
  batchPlaceOrder = opts.placeOrder === true;
  batchSendRedeemEmails = !!opts.sendRedeemEmails;
  batchSendOrderEmails = !!opts.sendOrderEmails;
  batchHideWindow = !!opts.hideWindow;
  batchLoginOnly = !!opts.loginOnly;
  activeBatchRunId = opts.runId || null;
  await chrome.storage.local.set({
    [BATCH_RUN_KEY]: {
      batchId: batchId,
      rowIds: rowIds,
      active: true,
      placeOrder: batchPlaceOrder,
      sendRedeemEmails: batchSendRedeemEmails,
      sendOrderEmails: batchSendOrderEmails,
      hideWindow: batchHideWindow,
      loginOnly: batchLoginOnly,
      runId: opts.runId || null,
    },
  });

  emitBatch({
    type: "BATCH_PROGRESS",
    batchId: batchId,
    stage: "system",
    status: "info",
    message:
      `Starting ${rowIds.length} selected row(s)` +
      (batchLoginOnly ? " — LOGIN ONLY" : "") +
      (batchPlaceOrder ? " — place order on" : " — place order off") +
      (batchHideWindow ? " — Noon window hidden" : " — Noon window visible") +
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

    const startedAt = isoNow();
    await patchStage(row.id, {
      status: "in_progress",
      run_started_at: startedAt,
      run_finished_at: null,
      duration_ms: null,
    });

    try {
      await beginRowAttempt(row);
    } catch (err) {
      console.warn("[noon] beginRowAttempt failed", err);
      emitBatch({
        type: "BATCH_ERROR",
        batchId: batchId,
        rowId: row.id,
        error: err instanceof Error ? err.message : "Failed to record attempt start",
      });
    }

    const tabId = await getOrCreateNoonTab({
      hideWindow: batchHideWindow,
    });
    activeLoginTabId = tabId;
    const previousEmail = sessionEmail;
    if (i > 0) {
      await resetTabForNewRow(tabId, row.row_number);
    } else {
      await recoverNoonTab(tabId);
    }
    await processBatchRow(row, tabId, previousEmail);
    const finishedAt = isoNow();
    const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
    await patchStage(row.id, {
      run_finished_at: finishedAt,
      duration_ms: durationMs,
    }).catch(function () {});
    try {
      const finalRow = await getBatchRow(row.id);
      await finishRowAttempt(finalRow, pendingAttemptMeta || { outcome: finalRow.status });
    } catch (err) {
      console.warn("[noon] finishRowAttempt failed", err);
      emitBatch({
        type: "BATCH_ERROR",
        batchId: batchId,
        rowId: row.id,
        error: err instanceof Error ? err.message : "Failed to record attempt finish",
      });
    }
    pendingAttemptMeta = null;
    activeAttemptId = null;
    activeLoginTabId = null;
    currentBatchRow = null;
    processed += 1;
  }

  batchRunActive = false;
  currentBatchRow = null;
  activeBatchRunId = null;
  pendingAttemptMeta = null;
  activeAttemptId = null;
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
