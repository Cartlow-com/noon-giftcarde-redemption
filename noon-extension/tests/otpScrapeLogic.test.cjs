/**
 * OTP scrape extractors — mirrors noon get-otp page patterns.
 * Run: node --test tests/otpScrapeLogic.test.cjs
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

function sixDigits(raw) {
  const code = String(raw || "").replace(/\D/g, "");
  return code.length === 6 ? code : "";
}

function otpFromScriptConst(html) {
  const match = String(html || "").match(/(?:const|let|var)\s+otp\s*=\s*['"](\d{6})['"]/);
  return match ? sixDigits(match[1]) : "";
}

function otpFromInputValues(values) {
  if (!values || values.length !== 6) return "";
  return sixDigits(values.map(function (v) { return String(v || "").replace(/\D/g, "").slice(0, 1); }).join(""));
}

function digitsBeforeCopy(text) {
  const match = String(text || "").match(/((?:\d[^\dA-Za-z]*){6})\s*copy\b/i);
  return match ? sixDigits(match[1]) : "";
}

describe("Noon get-otp page extractors", () => {
  it("reads const otp from inline script", () => {
    const html = "const otp = '953114';\nconst otpInputs = document.querySelectorAll('.otp-input');";
    assert.equal(otpFromScriptConst(html), "953114");
  });

  it("reads six otp-input values", () => {
    assert.equal(otpFromInputValues(["9", "0", "9", "7", "1", "1"]), "909711");
  });

  it("reads spaced digits before Copy", () => {
    assert.equal(digitsBeforeCopy("Use this OTP\n7 5 1 1 7 2 Copy"), "751172");
  });

  it("rejects invalid script otp", () => {
    assert.equal(otpFromScriptConst("const otp = '12345';"), "");
  });
});
