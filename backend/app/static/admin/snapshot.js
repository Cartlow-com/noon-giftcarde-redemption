(() => {
  const U = window.AdminUtil;

  function syncLiveStream() {
    const state = window.AdminState;
    if (!window.AdminSSE || !state) return;
    if (window.AdminAuth && !window.AdminAuth.isAuthenticated()) {
      window.AdminSSE.stop();
      return;
    }
    window.AdminSSE.start(state.selectedBatchId);
  }

  async function applyDashboardSnapshot(data) {
    const state = window.AdminState;
    const ui = window.AdminUI;
    if (!state || !ui || !data) return;
    if (window.AdminAuth && !window.AdminAuth.isAuthenticated()) return;

    const health = document.getElementById("health");
    const detailTitle = document.getElementById("detail-title");
    const detailBody = document.getElementById("detail-body");

    if (data.health === "ok" && health) {
      health.textContent = "API online";
      health.className = "pill pill-ok";
    } else if (data.health === "error" && health) {
      health.textContent = "API offline";
      health.className = "pill pill-bad";
    }

    if (data.extension) ui.setExtensionOnline(!!data.extension.online);
    ui.setActiveRun(data.active_run || null);

    if (Array.isArray(data.batches)) {
      state.batches = data.batches;
      if (!state.batches.some((b) => b.id === state.selectedBatchId)) {
        state.selectedBatchId = state.batches[0]?.id || null;
        state.selectedRowId = null;
        state.selectedIds = new Set();
        if (window.AdminSSE) window.AdminSSE.setBatchId(state.selectedBatchId);
      }
      ui.renderBatches();
    }

    const rowsPayload = data.rows;
    if (
      rowsPayload &&
      rowsPayload.batch_id === state.selectedBatchId &&
      Array.isArray(rowsPayload.rows)
    ) {
      let rows = rowsPayload.rows;
      if (state.statusFilter) {
        rows = rows.filter((r) => r.status === state.statusFilter);
      }
      state.rows = rows;
      const valid = new Set(state.rows.map((r) => r.id));
      state.selectedIds = new Set([...state.selectedIds].filter((id) => valid.has(id)));
      if (!state.rows.some((r) => r.id === state.selectedRowId)) {
        state.selectedRowId = state.rows[0]?.id || null;
      }
      ui.renderRows();
      // Table updates from SSE; detail/emails load only on row click or REST loadRows.
      const row = state.rows.find((r) => r.id === state.selectedRowId);
      if (!row && detailTitle && detailBody) {
        detailTitle.textContent = "Row detail";
        detailBody.innerHTML = `<p class="empty">Select a row</p>`;
      }
    } else if (!state.selectedBatchId) {
      state.rows = [];
      ui.renderRows();
      if (detailBody) detailBody.innerHTML = `<p class="empty">Select a row</p>`;
    }
  }

  function clearDashboard() {
    const state = window.AdminState;
    const ui = window.AdminUI;
    if (!state || !ui) return;
    if (window.AdminSSE) window.AdminSSE.stop();
    state.batches = [];
    state.rows = [];
    state.selectedBatchId = null;
    state.selectedRowId = null;
    state.selectedAttemptId = null;
    state.selectedIds = new Set();
    ui.setActiveRun(null);
    ui.setExtensionOnline(false);
    ui.renderBatches();
    ui.renderRows();
    const detailTitle = document.getElementById("detail-title");
    const detailBody = document.getElementById("detail-body");
    if (detailTitle) detailTitle.textContent = "Row detail";
    if (detailBody) detailBody.innerHTML = `<p class="empty">Select a row</p>`;
  }

  let bootStarted = false;

  window.addEventListener("noon-auth-changed", async (event) => {
    const ui = window.AdminUI;
    if (!ui) return;
    if (event.detail?.authenticated) {
      if (!bootStarted) return;
      await ui.checkHealth();
      await ui.checkExtension();
      await ui.loadBatches({ keepSelection: false });
      syncLiveStream();
      return;
    }
    clearDashboard();
  });

  async function boot() {
    const state = window.AdminState;
    const ui = window.AdminUI;
    if (!state || !ui) return;
    if (window.AdminAuth && window.AdminAuth.ready) {
      await window.AdminAuth.ready;
    }
    bootStarted = true;
    await ui.checkHealth();
    if (window.AdminAuth && !window.AdminAuth.isAuthenticated()) return;
    await ui.checkExtension();
    try {
      const cfg = await U.api("/runs/config");
      state.expectedRowSeconds = cfg.expected_row_seconds || 180;
    } catch (_) {}
    await ui.loadBatches({ keepSelection: false });
    syncLiveStream();
  }

  window.AdminLive = { applyDashboardSnapshot, syncLiveStream };
  if (window.AdminUI) {
    window.AdminUI.applyDashboardSnapshot = applyDashboardSnapshot;
    window.AdminUI.syncLiveStream = syncLiveStream;
  }

  boot();
})();
