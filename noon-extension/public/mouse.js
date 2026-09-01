/**
 * Visible ghost cursor — arrow default, I-beam on inputs.
 */
(function () {
  const CURSOR_ID = "noon-ghost-cursor";
  const RING_ID = "noon-ghost-click-ring";
  const STYLE_ID = "noon-ghost-cursor-styles";

  const SVG = {
    default:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<path fill="#fff" stroke="#111" stroke-width="1.2" d="M4 2l2 18 4-6 5 7 3-2-5-7h7z"/>' +
      "</svg>",
    text:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<path fill="#fff" stroke="#111" stroke-width="1.4" stroke-linecap="round" d="M12 3v18M8 3h8M8 21h8"/>' +
      "</svg>",
  };

  const HOTSPOT = {
    default: { x: 4, y: 4 },
    text: { x: 12, y: 12 },
  };

  let cursorEl = null;
  let iconEl = null;
  let pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let visible = false;
  let cursorMode = "default";

  function flow() {
    return window.__noonLoginFlow;
  }

  function checkAbort() {
    if (flow() && typeof flow().check === "function") {
      flow().check();
    }
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${CURSOR_ID} {
        position: fixed;
        top: 0;
        left: 0;
        pointer-events: none;
        z-index: 2147483646;
        transition: opacity 0.4s ease;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.45));
        will-change: transform;
      }
      #${CURSOR_ID}.noon-cursor-hidden { opacity: 0; }
      #${CURSOR_ID}.noon-cursor-click { transform: scale(0.82); }
      #${CURSOR_ID} .noon-cursor-icon {
        display: block;
        width: 28px;
        height: 28px;
        transition: width 0.12s ease, height 0.12s ease;
      }
      #${CURSOR_ID}.noon-mode-text .noon-cursor-icon {
        width: 22px;
        height: 24px;
      }
      #${RING_ID} {
        position: fixed;
        width: 36px;
        height: 36px;
        border: 2px solid rgba(254, 238, 0, 0.85);
        border-radius: 50%;
        pointer-events: none;
        z-index: 2147483645;
        transform: translate(-50%, -50%) scale(0.4);
        opacity: 0;
        animation: noon-click-ring 0.45s ease-out forwards;
      }
      @keyframes noon-click-ring {
        0% { opacity: 0.9; transform: translate(-50%, -50%) scale(0.4); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(1.6); }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function cursorModeForElement(el) {
    if (!el) return "default";
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (
      tag === "input" ||
      tag === "textarea" ||
      el.isContentEditable ||
      el.getAttribute("role") === "textbox"
    ) {
      return "text";
    }
    return "default";
  }

  function getElementAtPoint(x, y) {
    const stack = document.elementsFromPoint(x, y);
    for (let i = 0; i < stack.length; i++) {
      const el = stack[i];
      if (el.closest && el.closest("#" + CURSOR_ID)) continue;
      return el;
    }
    return null;
  }

  function getCursorModeAtPoint(x, y) {
    const hit = getElementAtPoint(x, y);
    if (!hit) return "default";

    let node = hit;
    while (node && node !== document.documentElement) {
      if (!(node instanceof Element)) break;
      const mode = cursorModeForElement(node);
      if (mode === "text") return "text";
      node = node.parentElement;
    }
    return "default";
  }

  function setNativeValue(el, value) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value");
    if (setter && setter.set) {
      setter.set.call(el, value);
    } else if ("value" in el) {
      el.value = value;
    }
  }

  function setCursorMode(mode) {
    const next = mode === "text" ? "text" : "default";
    if (cursorMode === next && iconEl) return;
    cursorMode = next;
    const el = ensureCursor();
    el.classList.remove("noon-mode-default", "noon-mode-text");
    el.classList.add("noon-mode-" + cursorMode);
    if (iconEl) iconEl.innerHTML = SVG[cursorMode];
    applyTransform(pos.x, pos.y);
  }

  function applyTransform(x, y) {
    const hs = HOTSPOT[cursorMode] || HOTSPOT.default;
    if (!cursorEl) return;
    const clickScale = cursorEl.classList.contains("noon-cursor-click") ? " scale(0.82)" : "";
    cursorEl.style.transform =
      "translate(" + (x - hs.x) + "px, " + (y - hs.y) + "px)" + clickScale;
  }

  function ensureCursor() {
    injectStyles();
    if (!cursorEl) {
      cursorEl = document.createElement("div");
      cursorEl.id = CURSOR_ID;
      iconEl = document.createElement("div");
      iconEl.className = "noon-cursor-icon";
      cursorEl.appendChild(iconEl);
      setCursorMode("default");
    }
    const root = document.body || document.documentElement;
    if (!root.contains(cursorEl)) {
      root.appendChild(cursorEl);
    }
    applyTransform(pos.x, pos.y);
    return cursorEl;
  }

  function setPosition(x, y, updateHover) {
    if (updateHover !== false) {
      setCursorMode(getCursorModeAtPoint(x, y));
    }
    pos = { x, y };
    ensureCursor();
    applyTransform(x, y);
    if (!visible) {
      visible = true;
      cursorEl.classList.remove("noon-cursor-hidden");
    }
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  async function delay(ms) {
    const step = 40;
    let elapsed = 0;
    while (elapsed < ms) {
      checkAbort();
      const chunk = Math.min(step, ms - elapsed);
      await new Promise(function (resolve) {
        setTimeout(resolve, chunk);
      });
      elapsed += chunk;
    }
    checkAbort();
  }

  function elementCenter(el) {
    el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 + randomBetween(-3, 3),
      y: rect.top + rect.height / 2 + randomBetween(-3, 3),
    };
  }

  async function moveTo(x, y, durationMs) {
    ensureCursor();
    const from = { ...pos };
    const duration =
      durationMs ?? Math.min(900, Math.max(350, distance(from.x, from.y, x, y) * 1.2));
    const start = performance.now();

    return new Promise(function (resolve, reject) {
      function frame(now) {
        try {
          checkAbort();
        } catch (err) {
          reject(err);
          return;
        }
        const t = Math.min(1, (now - start) / duration);
        const eased = easeOutCubic(t);
        const cx = from.x + (x - from.x) * eased;
        const cy = from.y + (y - from.y) * eased;
        setPosition(cx, cy);
        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  function distance(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  }

  async function moveToElement(el) {
    setCursorMode(cursorModeForElement(el));
    await delay(120);
    checkAbort();
    const target = elementCenter(el);
    await moveTo(target.x, target.y);
    setCursorMode(cursorModeForElement(el));
    await delay(randomBetween(80, 180));
  }

  function showClickRing(x, y) {
    const ring = document.createElement("div");
    ring.id = RING_ID;
    ring.style.left = x + "px";
    ring.style.top = y + "px";
    document.body.appendChild(ring);
    setTimeout(function () {
      ring.remove();
    }, 500);
  }

  async function clickPulse() {
    const el = ensureCursor();
    el.classList.add("noon-cursor-click");
    applyTransform(pos.x, pos.y);
    showClickRing(pos.x, pos.y);
    await delay(90);
    el.classList.remove("noon-cursor-click");
    applyTransform(pos.x, pos.y);
    await delay(60);
  }

  function dispatchPointerClick(el, clientX, clientY) {
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: clientX,
      clientY: clientY,
      button: 0,
      buttons: 1,
    };
    ["pointerover", "mouseover", "pointerenter", "mouseenter"].forEach(function (type) {
      try {
        el.dispatchEvent(new MouseEvent(type, opts));
      } catch (_) {}
    });
    ["pointerdown", "mousedown"].forEach(function (type) {
      el.dispatchEvent(new MouseEvent(type, opts));
    });
    ["pointerup", "mouseup", "click"].forEach(function (type) {
      el.dispatchEvent(new MouseEvent(type, opts));
    });
    try {
      el.click();
    } catch (_) {}
  }

  async function humanClick(el, options) {
    const skipMove = options && options.skipMove;
    setCursorMode("default");
    if (!skipMove) await moveToElement(el);
    const center = elementCenter(el);
    await clickPulse();
    dispatchPointerClick(el, center.x, center.y);
    await delay(randomBetween(120, 220));
  }

  async function humanType(el, text, options) {
    const masked = options && options.masked;
    const skipMove = options && options.skipMove;

    setCursorMode("text");
    if (!skipMove) await moveToElement(el);
    await humanClick(el, { skipMove: true });
    setCursorMode("text");

    el.focus();
    try {
      el.select();
    } catch (_) {}

    setNativeValue(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));

    let current = "";
    for (let i = 0; i < text.length; i++) {
      checkAbort();
      const char = text[i];
      current += char;
      setNativeValue(el, current);

      el.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: char,
          inputType: "insertText",
        }),
      );

      await delay(randomBetween(35, 90));
    }

    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Unidentified" }));

    await delay(masked ? 200 : randomBetween(150, 300));
  }

  async function hide() {
    if (!cursorEl) return;
    cursorEl.classList.add("noon-cursor-hidden");
    visible = false;
    await delay(400);
  }

  async function show() {
    visible = true;
    ensureCursor();
    setCursorMode("default");
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    pos = { x: cx, y: cy };
    if (cursorEl) {
      cursorEl.classList.remove("noon-cursor-hidden");
      cursorEl.style.opacity = "1";
    }
    applyTransform(cx, cy);
  }

  window.__noonGhostMouse = {
    moveTo: moveTo,
    moveToElement: moveToElement,
    click: humanClick,
    type: humanType,
    hide: hide,
    show: show,
    delay: delay,
    setCursorMode: setCursorMode,
    cursorModeForElement: cursorModeForElement,
  };
})();
