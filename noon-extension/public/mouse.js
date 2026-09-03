/**
 * Ghost cursor in Shadow DOM — isolated from page CSS, always on top.
 */
(function () {
  const HOST_ID = "noon-ghost-cursor-host";

  const SVG = {
    default:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<path fill="#FEEE00" stroke="#111" stroke-width="1.5" d="M4 2l2 18 4-6 5 7 3-2-5-7h7z"/>' +
      "</svg>",
    text:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<path fill="#FEEE00" stroke="#111" stroke-width="1.5" stroke-linecap="round" d="M12 3v18M8 3h8M8 21h8"/>' +
      "</svg>",
  };

  const HOTSPOT = {
    default: { x: 5, y: 5 },
    text: { x: 12, y: 12 },
  };

  let hostEl = null;
  let shadowRoot = null;
  let cursorEl = null;
  let iconEl = null;
  let pos = { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) };
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

  function injectHost() {
    if (hostEl && document.documentElement.contains(hostEl)) {
      document.documentElement.appendChild(hostEl);
      return;
    }

    hostEl = document.createElement("div");
    hostEl.id = HOST_ID;
    hostEl.setAttribute("aria-hidden", "true");
    hostEl.style.cssText =
      "all:initial!important;position:fixed!important;top:0!important;left:0!important;" +
      "width:0!important;height:0!important;overflow:visible!important;" +
      "z-index:2147483647!important;pointer-events:none!important;margin:0!important;padding:0!important;";

    shadowRoot = hostEl.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent =
      ".cursor{position:fixed;left:0;top:0;pointer-events:none;opacity:1;visibility:visible;" +
      "filter:drop-shadow(0 3px 10px rgba(0,0,0,0.7));will-change:left,top;}" +
      ".cursor.hidden{opacity:0!important;visibility:hidden!important;}" +
      ".cursor.click .icon{transform:scale(0.82);}" +
      ".icon{display:block;width:40px;height:40px;transition:transform 0.08s ease;}" +
      ".cursor.text .icon{width:30px;height:32px;}" +
      ".ring{position:fixed;width:44px;height:44px;border:3px solid #FEEE00;border-radius:50%;" +
      "pointer-events:none;transform:translate(-50%,-50%) scale(0.4);opacity:0;" +
      "animation:noon-ring 0.45s ease-out forwards;}" +
      "@keyframes noon-ring{" +
      "0%{opacity:0.95;transform:translate(-50%,-50%) scale(0.4);}" +
      "100%{opacity:0;transform:translate(-50%,-50%) scale(1.8);}}";

    shadowRoot.appendChild(style);

    cursorEl = document.createElement("div");
    cursorEl.className = "cursor default";
    iconEl = document.createElement("div");
    iconEl.className = "icon";
    iconEl.innerHTML = SVG.default;
    cursorEl.appendChild(iconEl);
    shadowRoot.appendChild(cursorEl);

    document.documentElement.appendChild(hostEl);
  }

  function ensureVisible() {
    visible = true;
    injectHost();
    cursorEl.classList.remove("hidden");
    applyPosition(pos.x, pos.y);
  }

  function applyPosition(x, y) {
    if (!cursorEl) return;
    const hs = HOTSPOT[cursorMode] || HOTSPOT.default;
    cursorEl.style.left = Math.round(x - hs.x) + "px";
    cursorEl.style.top = Math.round(y - hs.y) + "px";
  }

  function setCursorMode(mode) {
    const next = mode === "text" ? "text" : "default";
    if (cursorMode === next && iconEl) return;
    cursorMode = next;
    ensureVisible();
    cursorEl.className = "cursor " + cursorMode;
    if (iconEl) iconEl.innerHTML = SVG[cursorMode];
    applyPosition(pos.x, pos.y);
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

  function scrollElementIntoView(el) {
    try {
      el.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
    } catch (_) {
      el.scrollIntoView(true);
    }
  }

  function elementCenter(el, doScroll) {
    if (doScroll !== false) {
      scrollElementIntoView(el);
    }
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 + randomBetween(-1, 1),
      y: rect.top + rect.height / 2 + randomBetween(-1, 1),
    };
  }

  function setPosition(x, y) {
    ensureVisible();
    pos = { x, y };
    applyPosition(x, y);
  }

  async function moveTo(x, y, durationMs) {
    ensureVisible();
    const from = { ...pos };
    const duration =
      durationMs ?? Math.min(900, Math.max(350, Math.hypot(x - from.x, y - from.y) * 1.2));
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
        setPosition(from.x + (x - from.x) * eased, from.y + (y - from.y) * eased);
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  async function moveToElement(el) {
    ensureVisible();
    setCursorMode(cursorModeForElement(el));
    await delay(80);
    checkAbort();
    scrollElementIntoView(el);
    await delay(120);
    checkAbort();
    const target = elementCenter(el, false);
    await moveTo(target.x, target.y);
    await delay(randomBetween(60, 120));
  }

  function showClickRing(x, y) {
    if (!shadowRoot) return;
    const ring = document.createElement("div");
    ring.className = "ring";
    ring.style.left = x + "px";
    ring.style.top = y + "px";
    shadowRoot.appendChild(ring);
    setTimeout(function () {
      ring.remove();
    }, 500);
  }

  async function clickPulse() {
    ensureVisible();
    cursorEl.classList.add("click");
    await delay(90);
    cursorEl.classList.remove("click");
    await delay(60);
  }

  function resolveClickableTarget(el) {
    if (!el || el.nodeType !== 1) return el;
    const semantic = el.closest("a, button, [role='button'], [role='link'], summary, label");
    if (semantic) return semantic;
    let node = el;
    for (let i = 0; i < 8 && node && node !== document.body; i++) {
      try {
        const style = window.getComputedStyle(node);
        if (
          style.cursor === "pointer" ||
          node.getAttribute("tabindex") != null ||
          typeof node.onclick === "function"
        ) {
          return node;
        }
      } catch (_) {}
      node = node.parentElement;
    }
    return el;
  }

  function dispatchPointerClick(el, clientX, clientY) {
    const target = resolveClickableTarget(el) || el;
    const opts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: clientX,
      clientY: clientY,
      screenX: clientX,
      screenY: clientY,
      button: 0,
      buttons: 1,
      detail: 1,
    };
    ["pointerover", "mouseover", "pointerenter", "mouseenter"].forEach(function (type) {
      try {
        target.dispatchEvent(new MouseEvent(type, opts));
      } catch (_) {}
    });
    try {
      if (typeof PointerEvent === "function") {
        target.dispatchEvent(
          new PointerEvent("pointerdown", Object.assign({}, opts, { pointerId: 1, pointerType: "mouse", isPrimary: true })),
        );
      }
    } catch (_) {}
    target.dispatchEvent(new MouseEvent("mousedown", opts));
    try {
      if (typeof PointerEvent === "function") {
        target.dispatchEvent(
          new PointerEvent("pointerup", Object.assign({}, opts, { pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 0 })),
        );
      }
    } catch (_) {}
    target.dispatchEvent(new MouseEvent("mouseup", Object.assign({}, opts, { buttons: 0 })));
    target.dispatchEvent(new MouseEvent("click", Object.assign({}, opts, { buttons: 0 })));
    try {
      target.click();
    } catch (_) {}
  }

  async function humanClick(el, options) {
    ensureVisible();
    const skipMove = options && options.skipMove;
    setCursorMode("default");
    const clickable = resolveClickableTarget(el) || el;
    scrollElementIntoView(clickable);
    await delay(120);
    checkAbort();
    const center = elementCenter(clickable, false);
    if (!skipMove) {
      await moveTo(center.x, center.y);
    } else {
      setPosition(center.x, center.y);
    }
    showClickRing(center.x, center.y);
    await clickPulse();
    // Click whatever is actually under the cursor (handles nested spans/icons).
    let hit = null;
    try {
      hit = document.elementFromPoint(center.x, center.y);
    } catch (_) {}
    if (hit && hit.id === HOST_ID) hit = null;
    const primary = resolveClickableTarget(hit) || hit || clickable;
    dispatchPointerClick(primary, center.x, center.y);
    if (primary !== clickable) {
      dispatchPointerClick(clickable, center.x, center.y);
    }
    await delay(randomBetween(120, 200));
  }

  async function humanType(el, text, options) {
    ensureVisible();
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
    await delay(masked ? 200 : randomBetween(150, 280));
  }

  async function hide() {
    if (!cursorEl) return;
    cursorEl.classList.add("hidden");
    visible = false;
    await delay(150);
  }

  async function show() {
    visible = true;
    ensureVisible();
    setCursorMode("default");
    pos = {
      x: Math.round(window.innerWidth / 2),
      y: Math.round(window.innerHeight / 2),
    };
    applyPosition(pos.x, pos.y);
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
    ensureVisible: ensureVisible,
  };
})();
