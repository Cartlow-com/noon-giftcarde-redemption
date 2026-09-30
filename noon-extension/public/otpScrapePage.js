/**
 * otpScrapePage.js — DOM scrape for Noon get-otp page.
 * Loaded in the service worker (importScripts) and injected into OTP tabs.
 */
function otpScrapeInPage() {
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
      if (match) return sixDigits(match[1]);
    }
    return "";
  }

  function otpFromOtpInputs() {
    const inputs = Array.from(document.querySelectorAll("input.otp-input, .otp-section input[type='text']"));
    if (inputs.length !== 6) return "";
    const code = inputs
      .map(function (input) {
        return String(input.value || "").replace(/\D/g, "").slice(0, 1);
      })
      .join("");
    return sixDigits(code);
  }

  const body = document.body;
  if (!body) {
    return { otp: null, debug: "no_body", bodyLen: 0, href: location.href.slice(0, 80) };
  }

  const raw = String(body.innerText || body.textContent || "");
  const collapsed = textOf(body);
  const meta = { bodyLen: collapsed.length, href: location.href.slice(0, 80) };

  const fromScript = otpFromScriptConst();
  if (fromScript) return Object.assign({ otp: fromScript, debug: "script_const_otp" }, meta);

  const fromInputs = otpFromOtpInputs();
  if (fromInputs) return Object.assign({ otp: fromInputs, debug: "otp_input_values" }, meta);

  const copies = Array.from(document.querySelectorAll("a, button, [role='button'], span, div, p, label")).filter(
    function (el) {
      if (!isVisible(el)) return false;
      const t = textOf(el);
      return /^copy$/i.test(t) || (/\bcopy\b/i.test(t) && t.length <= 24);
    },
  );
  for (let c = 0; c < copies.length; c++) {
    let node = copies[c];
    for (let i = 0; node && i < 10; i++) {
      const code = digitsBeforeCopy(textOf(node)) || spacedSix(textOf(node));
      if (code) return Object.assign({ otp: code, debug: "copy_ancestor" }, meta);
      node = node.parentElement;
    }
    const prev = copies[c].previousElementSibling;
    if (prev) {
      const code = sixDigits(textOf(prev)) || spacedSix(textOf(prev));
      if (code) return Object.assign({ otp: code, debug: "copy_prev_sibling" }, meta);
    }
  }

  const leaves = Array.from(document.querySelectorAll("span, div, p, td, li, b, strong, label")).filter(function (el) {
    if (el.children.length > 0) return false;
    if (!isVisible(el)) return false;
    return /^\d$/.test((el.textContent || "").trim());
  });
  if (leaves.length === 6) {
    return Object.assign({
      otp: leaves.map(function (el) { return el.textContent.trim(); }).join(""),
      debug: "dom_digits_6",
    }, meta);
  }

  const byParent = new Map();
  for (let i = 0; i < leaves.length; i++) {
    const parent = leaves[i].parentElement;
    if (!parent) continue;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(leaves[i]);
  }
  for (const group of byParent.values()) {
    if (group.length === 6) {
      return Object.assign({
        otp: group.map(function (el) { return el.textContent.trim(); }).join(""),
        debug: "dom_digits_parent",
      }, meta);
    }
  }

  const fromCopy = digitsBeforeCopy(collapsed) || digitsBeforeCopy(raw);
  if (fromCopy) return Object.assign({ otp: fromCopy, debug: "body_before_copy" }, meta);

  const spaced = spacedSix(raw) || spacedSix(collapsed);
  if (spaced) return Object.assign({ otp: spaced, debug: "body_spaced" }, meta);

  const near = collapsed.match(
    /(?:otp|verification|verify|login|account)[^0-9]{0,80}((?:\d[^\dA-Za-z]*){6})/i,
  );
  if (near) {
    const code = sixDigits(near[1]);
    if (code) return Object.assign({ otp: code, debug: "body_near_keyword" }, meta);
  }

  return Object.assign({ otp: null, debug: "no_match" }, meta);
}
