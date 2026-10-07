/**
 * Classic content script (shared isolated world) — loaded after 07-redeem-submit.js.
 * Part: 07a-redeem-dryrun.js — Dry run: fill the redeem form, NEVER submit.
 *
 * Safety: this never calls fillAndRedeemGiftCard, never clicks the Redeem
 * button and never persists flow state (so a reload cannot resume it as a
 * real redeem). It only works on an already-open Credits page.
 */

function readInputDigits(input) {
  return normalizeGiftCardDigits(input && input.value);
}

async function openRedeemFormForDryRun() {
  for (let attempt = 0; attempt < 6; attempt++) {
    flow().check();
    const state = detectPageState();
    logStep("Dry run — on " + pageStateLabel(state));
    if (state === "REDEEM_FORM") return;
    if (state === "ADD_CREDITS_MODAL") {
      const option = await waitFor(findGiftcardsVouchersOption, 8000, 50);
      if (!option) throw new Error("Giftcards & Vouchers option not found");
      await mouse().click(option, { fast: true });
      await waitFor(function () {
        return findGiftCardNumberInput() || detectPageState() === "REDEEM_FORM";
      }, 6000, 50);
      continue;
    }
    if (state === "CREDITS_PAGE") {
      if (findAddCreditsModal() || findGiftcardsVouchersOption()) continue;
      await waitForCreditsPageReady();
      const redeemBar = await waitFor(findRedeemGiftcardsBar, 10000, 50);
      if (!redeemBar) throw new Error("Redeem Giftcards not found");
      await mouse().click(redeemBar, { fast: true });
      await waitForAddCreditsModal();
      continue;
    }
    // Never navigate here: navigation would need a persisted resume state.
    throw new Error("Dry run needs the Noon Credits page open (got " + pageStateLabel(state) + ")");
  }
  throw new Error("Redeem form did not open");
}

async function runRedeemFormDryRun(payload) {
  const cardDigits = normalizeGiftCardDigits(payload.giftCardNumber);
  const pinDigits = normalizeGiftCardDigits(payload.giftCardPin);
  if (!cardDigits || cardDigits.length < 12) throw new Error("Gift card number must be at least 12 digits");
  if (!pinDigits || pinDigits.length < 4) throw new Error("Gift card PIN must be at least 4 digits");
  if (!payload.email) throw new Error("Row email required — refusing for safety");

  flow().reset();
  flow().running = true;
  try {
    await enableCursor();
    // Session email is verified by the background (assertSessionEmailOnTab)
    // before it opens Credits — checking here would navigate away.
    await openRedeemFormForDryRun();

    const numberInput = await waitFor(findGiftCardNumberInput, 10000, 50);
    if (!numberInput) throw new Error("Gift card number input not found");
    logStep("Dry run — typing gift card number…");
    await mouse().type(numberInput, cardDigits, { paste: true, fast: true });

    const pinInput = await waitFor(findGiftCardPinInput, 8000, 50);
    if (!pinInput) throw new Error("Gift card PIN input not found");
    logStep("Dry run — typing PIN…");
    await mouse().type(pinInput, pinDigits, { masked: true, paste: true, fast: true });

    const numberOk = readInputDigits(findGiftCardNumberInput() || numberInput) === cardDigits;
    const pinOk = readInputDigits(findGiftCardPinInput() || pinInput) === pinDigits;
    const redeemBtn = await waitUntilEnabled(findRedeemSubmitButton, 6000);
    logStep(
      "Dry run — number " + (numberOk ? "OK" : "MISMATCH") +
        ", PIN " + (pinOk ? "OK" : "MISMATCH") +
        ", Redeem button " + (redeemBtn ? "enabled" : "not enabled") +
        " — NOT clicking Redeem",
    );

    await dismissRedeemModal();
    const closed = !findGiftCardNumberInput() && !findAddCreditsModal();
    if (!numberOk || !pinOk) {
      return { ok: false, error: "Redeem form values did not match (number " + numberOk + ", PIN " + pinOk + ")" };
    }
    if (!redeemBtn) return { ok: false, error: "Redeem button never became enabled" };
    return { ok: true, filled: true, submitted: false, modalClosed: closed };
  } finally {
    flow().running = false;
    try { await disableCursor(); } catch (_) {}
  }
}
