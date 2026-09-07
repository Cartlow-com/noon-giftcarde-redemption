(() => {
  const U = window.AdminUtil;
  const el = {
    modal: document.getElementById("row-runs-modal"),
    title: document.getElementById("row-runs-title"),
    body: document.getElementById("row-runs-body"),
    close: document.getElementById("btn-close-row-runs"),
  };

  const state = {
    closing: false,
    row: null,
    emails: [],
    attempts: [],
    selectedAttemptId: null,
    token: 0,
  };

  function openShell() {
    if (!el.modal) return;
    state.closing = false;
    el.modal.classList.remove("hidden");
    el.modal.setAttribute("aria-hidden", "false");
    el.modal.classList.remove("modal-open");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.modal.classList.add("modal-open"));
    });
  }

  function close(immediate) {
    if (!el.modal) return;
    if (immediate) {
      el.modal.classList.remove("modal-open");
      el.modal.classList.add("hidden");
      el.modal.setAttribute("aria-hidden", "true");
      state.closing = false;
      return;
    }
    if (!el.modal.classList.contains("modal-open")) {
      el.modal.classList.add("hidden");
      return;
    }
    if (state.closing) return;
    state.closing = true;
    el.modal.classList.remove("modal-open");
    const finish = () => {
      if (!state.closing) return;
      state.closing = false;
      el.modal.classList.add("hidden");
      el.modal.setAttribute("aria-hidden", "true");
    };
    const onEnd = (event) => {
      if (event.target !== el.modal) return;
      el.modal.removeEventListener("transitionend", onEnd);
      finish();
    };
    el.modal.addEventListener("transitionend", onEnd);
    setTimeout(finish, 360);
  }

  async function paint() {
    if (!el.body || !state.row) return;
    state.selectedAttemptId = U.resolveAttemptId(state.attempts, state.selectedAttemptId);
    await U.paintRowDetail(
      el.body,
      state.row,
      state.emails,
      state.attempts,
      state.selectedAttemptId,
      (window.AdminState && window.AdminState.expectedRowSeconds) || 180,
    );
  }

  async function open(row) {
    if (!row || !el.modal) return;
    const token = ++state.token;
    state.row = row;
    state.emails = [];
    state.attempts = [];
    state.selectedAttemptId = null;
    if (el.title) {
      el.title.textContent = row.email
        ? `#${row.row_number} · ${row.email}`
        : `Row #${row.row_number}`;
    }
    if (el.body) el.body.innerHTML = `<p class="muted">Loading runs…</p>`;
    openShell();
    try {
      const extra = await U.fetchRowDetailExtras(row.id);
      if (token !== state.token) return;
      state.emails = extra.emails || [];
      state.attempts = extra.attempts || [];
      if (extra.error && window.AdminUI) window.AdminUI.showError(extra.error.message);
      await paint();
    } catch (err) {
      if (token !== state.token) return;
      if (el.body) el.body.innerHTML = `<p class="empty">${U.escapeHtml(err.message || "Failed to load")}</p>`;
    }
  }

  if (el.close) el.close.addEventListener("click", () => close());
  if (el.modal) {
    el.modal.addEventListener("click", (event) => {
      if (event.target === el.modal) close();
    });
  }
  if (el.body) {
    el.body.addEventListener("change", async (event) => {
      const select = event.target.closest("[data-run-select]");
      if (!select || !state.row) return;
      const id = select.value;
      if (!id || id === state.selectedAttemptId) return;
      state.selectedAttemptId = id;
      await paint();
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && el.modal && el.modal.classList.contains("modal-open")) {
      close();
    }
  });

  window.AdminRowModal = { open, close };
})();
