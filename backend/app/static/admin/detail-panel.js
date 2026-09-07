(() => {
  const U = window.AdminUtil;

  function getState() {
    return window.AdminState;
  }

  function els() {
    return {
      title: document.getElementById("detail-title"),
      body: document.getElementById("detail-body"),
    };
  }

  async function paintDetail(row, emails, attempts) {
    const state = getState();
    const el = els();
    if (!state || !el.body) return;
    state.detailEmails = emails || [];
    state.detailAttempts = attempts || [];
    state.selectedAttemptId = U.resolveAttemptId(state.detailAttempts, state.selectedAttemptId);
    await U.paintRowDetail(
      el.body,
      row,
      state.detailEmails,
      state.detailAttempts,
      state.selectedAttemptId,
      state.expectedRowSeconds,
    );
  }

  async function renderDetail(row, { silent = false } = {}) {
    if (window.AdminAuth && window.AdminAuth.isSuperAdmin()) return;
    if (window.AdminAuth && !window.AdminAuth.isAuthenticated()) return;
    const state = getState();
    const el = els();
    if (!state || !el.body) return;
    const token = ++state.detailToken;
    if (el.title) el.title.textContent = "Row detail";
    if (!silent) el.body.innerHTML = `<p class="muted">Loading detail…</p>`;
    try {
      const extra = await U.fetchRowDetailExtras(row.id);
      if (token !== state.detailToken || state.selectedRowId !== row.id) return;
      if (extra.error && window.AdminUI) window.AdminUI.showError(extra.error.message);
      await paintDetail(row, extra.emails, extra.attempts);
    } catch (err) {
      if (token !== state.detailToken) return;
      if (window.AdminUI) window.AdminUI.showError(err.message);
    }
  }

  const body = document.getElementById("detail-body");
  if (body) {
    body.addEventListener("change", async (event) => {
      const state = getState();
      if (!state || (window.AdminAuth && window.AdminAuth.isSuperAdmin())) return;
      const select = event.target.closest("[data-run-select]");
      if (!select) return;
      const id = select.value;
      if (!id || id === state.selectedAttemptId) return;
      state.selectedAttemptId = id;
      const row = state.rows.find((r) => r.id === state.selectedRowId);
      if (row) await paintDetail(row, state.detailEmails, state.detailAttempts);
    });
  }

  window.AdminDetail = { paintDetail, renderDetail };
})();
