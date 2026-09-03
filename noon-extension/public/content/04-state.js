/**
 * Split from content.js — classic content script (shared isolated world).
 * Top-level function/var bindings are shared across content/*.js via manifest order.
 * Part: 04-state.js — Flow/cart state persistence
 */
function saveFlowState(state) {
  return new Promise(function (resolve) {
    chrome.storage.local.set({ [FLOW_STATE_KEY]: state }, resolve);
  });
}

function loadFlowState() {
  return new Promise(function (resolve) {
    chrome.storage.local.get(FLOW_STATE_KEY, function (data) {
      resolve(data[FLOW_STATE_KEY] || null);
    });
  });
}

function markFlowDone() {
  return markFlowComplete({ ok: true });
}

function markFlowComplete(result) {
  return new Promise(function (resolve) {
    chrome.storage.local.set(
      {
        [FLOW_DONE_KEY]: true,
        [FLOW_RESULT_KEY]: result || { ok: true },
      },
      resolve,
    );
  });
}

function clearFlowComplete() {
  return new Promise(function (resolve) {
    chrome.storage.local.remove([FLOW_DONE_KEY, FLOW_RESULT_KEY], resolve);
  });
}

function clearFlowDone() {
  return clearFlowComplete();
}

function clearFlowState() {
  return new Promise(function (resolve) {
    chrome.storage.local.remove(FLOW_STATE_KEY, resolve);
  });
}

async function persistCartState(data) {
  const existing = await loadFlowState();
  const batchMode =
    data.batchMode != null ? !!data.batchMode : !!(existing && existing.batchMode);
  await saveFlowState({
    active: true,
    resumeOnLoad: true,
    flowType: "cart",
    productUrl: data.productUrl || existing?.productUrl || "",
    email: data.email || existing?.email || "",
    password: data.password || existing?.password || "",
    cartPhase:
      data.cartPhase !== undefined && data.cartPhase !== null
        ? data.cartPhase
        : existing?.cartPhase || "",
    batchMode: batchMode,
    rowNumber:
      data.rowNumber != null ? data.rowNumber : existing?.rowNumber ?? null,
    batchPlaceOrder:
      data.batchPlaceOrder != null
        ? !!data.batchPlaceOrder
        : existing?.batchPlaceOrder ?? null,
  });
}

async function restoreBatchCartContextFromState(state) {
  const s = state || (await loadFlowState());
  if (s && s.batchMode) {
    batchFlowMode = true;
    batchCartContext = {
      rowNumber: s.rowNumber,
      productUrl: s.productUrl,
    };
    if (s.batchPlaceOrder != null) {
      batchPlaceOrderPref = !!s.batchPlaceOrder;
    }
  }
}

async function getCartPhase() {
  const state = await loadFlowState();
  return (state && state.cartPhase) || "";
}

async function setCartPhase(phase) {
  const existing = await loadFlowState();
  await persistCartState({
    productUrl: existing?.productUrl,
    email: existing?.email,
    password: existing?.password,
    cartPhase: phase,
  });
}

async function persistFlow(step, payload) {
  const existing = await loadFlowState();
  await saveFlowState({
    active: true,
    resumeOnLoad: true,
    step: step,
    email: payload.email || existing?.email || "",
    password: payload.password || existing?.password || "",
    giftCardNumber: payload.giftCardNumber || existing?.giftCardNumber || "",
    giftCardPin: payload.giftCardPin || existing?.giftCardPin || "",
    waitForRedeemResult:
      payload.waitForRedeemResult != null
        ? !!payload.waitForRedeemResult
        : !!existing?.waitForRedeemResult,
    accountVerified:
      payload.accountVerified != null
        ? !!payload.accountVerified
        : !!existing?.accountVerified,
    balanceBefore:
      payload.balanceBefore != null
        ? payload.balanceBefore
        : existing?.balanceBefore ?? null,
    redeemPopupMessage:
      payload.redeemPopupMessage || existing?.redeemPopupMessage || "",
  });
}

