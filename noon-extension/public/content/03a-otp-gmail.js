/**
 * Part: 03a-otp-gmail.js — Open OTP link, scrape code in-extension, paste on Noon.
 */

function findOtpInputs() {
  const scope = getLoginUiScope();
  return Array.from(
    scope.querySelectorAll(
      'input[autocomplete="one-time-code"], input[inputmode="numeric"], input[maxlength="1"], input[maxlength="6"], input[name*="otp" i], input[id*="otp" i]',
    ),
  ).filter(function (input) {
    if (!isVisible(input)) return false;
    const type = (input.getAttribute("type") || "").toLowerCase();
    return type !== "password" && type !== "email" && type !== "hidden";
  });
}

function findOtpSubmitButton() {
  return (
    queryByRole("button", { name: "Verify" }) ||
    queryByRole("button", { name: "Continue" }) ||
    queryByRole("button", { name: "Submit" }) ||
    queryByRole("button", { name: "Log in" }) ||
    findClickableByText("Verify") ||
    findClickableByText("Continue") ||
    findClickableByText("Submit") ||
    findClickableByText("Log in")
  );
}

function setInputValue(input, value, inputType) {
  const proto = window.HTMLInputElement && window.HTMLInputElement.prototype;
  const descriptor = proto && Object.getOwnPropertyDescriptor(proto, "value");
  if (descriptor && descriptor.set) descriptor.set.call(input, value);
  else input.value = value;
  input.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      data: value,
      inputType: inputType || "insertText",
    }),
  );
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function readOtpInputValue(input) {
  return String((input && input.value) || "").replace(/\D/g, "");
}

function requestNoonOtpFromGmail(email) {
  return new Promise(function (resolve, reject) {
    chrome.runtime.sendMessage(
      {
        type: "FETCH_NOON_OTP_FROM_GMAIL",
        email: email || "",
        requestedAt: window.__noonOtpRequestedAt || 0,
      },
      function (response) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || "Could not reach extension background"));
          return;
        }
        if (!response || response.ok === false || !response.otp) {
          if (response && response.useClipboard) {
            resolve({ otp: "", useClipboard: true });
            return;
          }
          reject(new Error((response && response.error) || "Could not fetch OTP from Gmail"));
          return;
        }
        const otp = String(response.otp).replace(/\D/g, "");
        resolve({ otp: otp.length === 6 ? otp : "", useClipboard: response.useClipboard === true });
      },
    );
  });
}

async function pasteOtpIntoNoon(otp) {
  const code = String(otp || "").replace(/\D/g, "");
  if (code.length !== 6) throw new Error("Noon OTP must be 6 digits");
  const inputs = await waitFor(function () {
    const found = findOtpInputs();
    return found.length ? found : null;
  }, 10000, 50);
  if (!inputs || !inputs.length) throw new Error("Noon OTP inputs not found");

  logStep("Pasting Noon OTP...");
  try {
    for (let i = 0; i < inputs.length && i < code.length; i++) {
      inputs[i].focus();
      setInputValue(inputs[i], code[i], "insertText");
      await pause(0.02);
    }
    await pause(0.1);
    if (inputs.map(readOtpInputValue).join("").slice(0, 6) === code) return;
  } catch (_) {}

  for (let i = 0; i < inputs.length; i++) setInputValue(inputs[i], "", "deleteContentBackward");
  if (inputs.length === 1) {
    await mouse().type(inputs[0], code, { paste: true, fast: true });
    return;
  }
  for (let i = 0; i < inputs.length && i < code.length; i++) {
    await mouse().type(inputs[i], code[i], { fast: true });
  }
}

const OTP_RATE_LIMIT_COOLDOWN_S = 30;

async function submitNoonOtpAndWait(email) {
  const required = String(email || "").trim().toLowerCase();
  let success = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const button = await waitUntilEnabled(function () {
      return findOtpSubmitButton();
    }, 8000);
    if (button) {
      logStep(attempt === 1 ? "Submitting Noon OTP..." : "Re-submitting the same OTP after cooldown…");
      await mouse().click(button, { fast: true });
    }

    success = await waitFor(function () {
      if (getProxyWorthyMessage()) return "proxy";
      const profileEmail = readEmailFromProfilePage();
      if (profileEmail) return profileEmail;
      if (getByText("Hi,")) return required || true;
      return null;
    }, 20000, 100);
    if (success !== "proxy") break;
    // Noon briefly rate-limits the OTP check after many logins. Retrying the SAME
    // code later does not request a new OTP, so it cannot extend the block.
    if (attempt === 1 && /too many requests/i.test(String(getProxyWorthyMessage() || ""))) {
      logStep("Noon rate-limited the OTP check — waiting " + OTP_RATE_LIMIT_COOLDOWN_S + "s, then retrying the same code once");
      for (let i = 0; i < OTP_RATE_LIMIT_COOLDOWN_S; i++) {
        flow().check();
        await pause(1);
      }
      continue;
    }
    break;
  }
  if (success === "proxy") throwIfProxyWorthyUi();
  if (!success) throw new Error("OTP login did not complete");
  logStep("OTP login completed");
}

async function loginWithGmailOtp(email) {
  if (!isOtpOnlyLogin()) return false;
  logStep("OTP-only login detected — opening OTP link…");
  let otp = "";
  try {
    const result = await requestNoonOtpFromGmail(email);
    otp = result.otp || "";
  } catch (err) {
    const wrapped = new Error(
      (err instanceof Error ? err.message : "Could not fetch OTP from Gmail") +
        " — manual login required",
    );
    wrapped.terminal = true;
    throw wrapped;
  }
  if (!otp) throw new Error("Could not read OTP from OTP page");
  logStep("OTP read from OTP page — pasting on Noon…");
  await pasteOtpIntoNoon(otp);
  await submitNoonOtpAndWait(email);
  return true;
}
