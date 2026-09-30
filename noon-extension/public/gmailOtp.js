/**
 * gmailOtp.js — content script for Noon OTP landing pages.
 * Page: account.noon.com/_svc/mp-identity-api/auth/get-otp?token=...
 */
(function () {
  function textOf(el) {
    return String((el && (el.innerText || el.textContent)) || "").replace(/\s+/g, " ").trim();
  }

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    try {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    } catch (_) {}
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function sixDigits(raw) {
    const code = String(raw || "").replace(/\D/g, "");
    return code.length === 6 ? code : "";
  }

  function digitsBeforeCopy(text) {
    const match = String(text || "").match(/((?:\d[^\dA-Za-z]*){6})\s*copy\b/i);
    return match ? sixDigits(match[1]) : "";
  }

  function spacedSix(text) {
    const match = String(text || "").match(/(?:^|[^\d])(\d(?:[ \t\n\u00a0]+\d){5})(?=[^\d]|$)/);
    return match ? sixDigits(match[1]) : "";
  }

  function otpFromScriptConst() {
    const scripts = document.querySelectorAll("script");
    for (let i = 0; i < scripts.length; i++) {
      const text = scripts[i].textContent || "";
      const match = text.match(/(?:const|let|var)\s+otp\s*=\s*['"](\d{6})['"]/);
      if (match) return { otp: sixDigits(match[1]), debug: "script_const_otp" };
    }
    return null;
  }

  function otpFromOtpInputs() {
    const inputs = Array.from(document.querySelectorAll("input.otp-input, .otp-section input[type='text']"));
    if (inputs.length !== 6) return null;
    const code = sixDigits(inputs.map(function (input) {
      return String(input.value || "").replace(/\D/g, "").slice(0, 1);
    }).join(""));
    return code ? { otp: code, debug: "otp_input_values" } : null;
  }

  function otpNearCopy() {
    const copies = Array.from(document.querySelectorAll("a, button, [role='button'], span, div, p, label")).filter(
      function (el) {
        if (!isVisible(el)) return false;
        const t = textOf(el);
        return /^copy$/i.test(t) || (/\bcopy\b/i.test(t) && t.length <= 24);
      },
    );
    for (let c = 0; c < copies.length; c++) {
      let node = copies[c];
      for (let i = 0; node && i < 8; i++) {
        const code = digitsBeforeCopy(textOf(node)) || spacedSix(textOf(node));
        if (code) return { otp: code, debug: "copy_ancestor" };
        node = node.parentElement;
      }
    }
    return null;
  }

  function otpFromPageText() {
    const raw = String((document.body && (document.body.innerText || document.body.textContent)) || "");
    const collapsed = textOf(document.body);
    const fromCopy = digitsBeforeCopy(collapsed) || digitsBeforeCopy(raw);
    if (fromCopy) return { otp: fromCopy, debug: "body_before_copy" };
    const spaced = spacedSix(raw) || spacedSix(collapsed);
    if (spaced) return { otp: spaced, debug: "body_spaced" };
    return null;
  }

  function scrapeOnce() {
    return (
      otpFromScriptConst() ||
      otpFromOtpInputs() ||
      otpNearCopy() ||
      otpFromPageText() ||
      { otp: null, debug: "no_match" }
    );
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function readOtpFromCurrentPage() {
    const started = Date.now();
    let lastDebug = "no_match";
    while (Date.now() - started < 20000) {
      const hit = scrapeOnce();
      lastDebug = hit.debug || lastDebug;
      if (hit.otp && String(hit.otp).length === 6) {
        return { ok: true, otp: hit.otp, debug: hit.debug };
      }
      await delay(250);
    }
    return { ok: false, otp: "", debug: lastDebug, error: "Could not read OTP from Noon OTP page" };
  }

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (message.type === "READ_NOON_OTP_PAGE") {
      readOtpFromCurrentPage().then(sendResponse);
      return true;
    }
  });
})();
