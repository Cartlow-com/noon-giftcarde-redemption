(() => {
  const el = {
    modal: document.getElementById("confirm-modal"),
    title: document.getElementById("confirm-title"),
    message: document.getElementById("confirm-message"),
    cancel: document.getElementById("confirm-cancel"),
    ok: document.getElementById("confirm-ok"),
  };

  let pendingResolve = null;
  let closing = false;

  function finish(result) {
    if (closing) return;
    closing = true;
    const resolve = pendingResolve;
    pendingResolve = null;
    if (el.modal) {
      el.modal.classList.remove("modal-open");
      el.modal.setAttribute("aria-hidden", "true");
      el.modal.classList.add("hidden");
    }
    closing = false;
    if (resolve) resolve(!!result);
  }

  function close(result) {
    if (!el.modal || !el.modal.classList.contains("modal-open")) {
      finish(result);
      return;
    }
    const resolve = pendingResolve;
    pendingResolve = null;
    el.modal.classList.remove("modal-open");
    el.modal.setAttribute("aria-hidden", "true");
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      el.modal.classList.add("hidden");
      if (resolve) resolve(!!result);
    };
    const onEnd = (event) => {
      if (event.target !== el.modal) return;
      el.modal.removeEventListener("transitionend", onEnd);
      end();
    };
    el.modal.addEventListener("transitionend", onEnd);
    setTimeout(end, 280);
  }

  function askConfirm({ title, message, okLabel, danger } = {}) {
    return new Promise((resolve) => {
      if (!el.modal) {
        resolve(false);
        return;
      }
      if (pendingResolve) pendingResolve(false);
      pendingResolve = resolve;
      if (el.title) el.title.textContent = title || "Confirm";
      if (el.message) el.message.textContent = message || "";
      if (el.ok) {
        el.ok.textContent = okLabel || "OK";
        el.ok.className = danger ? "btn-danger" : "btn-primary";
      }
      el.modal.classList.remove("hidden");
      el.modal.setAttribute("aria-hidden", "false");
      el.modal.classList.remove("modal-open");
      requestAnimationFrame(() => el.modal.classList.add("modal-open"));
      el.cancel?.focus();
    });
  }

  if (el.cancel) el.cancel.addEventListener("click", () => close(false));
  if (el.ok) el.ok.addEventListener("click", () => close(true));
  if (el.modal) {
    el.modal.addEventListener("click", (event) => {
      if (event.target === el.modal) close(false);
    });
  }
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") return;
      if (!el.modal?.classList.contains("modal-open")) return;
      event.stopImmediatePropagation();
      close(false);
    },
    true,
  );

  window.AdminConfirm = { ask: askConfirm };
})();
