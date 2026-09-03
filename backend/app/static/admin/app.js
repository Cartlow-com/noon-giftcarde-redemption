(() => {
  const U = window.AdminUtil;
  const state = {
    batches: [],
    selectedBatchId: null,
    rows: [],
    selectedRowId: null,
    selectedIds: new Set(),
    statusFilter: "",
    detailToken: 0,
    loading: false,
    expectedRowSeconds: 180,
    activeRun: null,
  };

  const el = {
    health: document.getElementById("health"),
    runPill: document.getElementById("run-pill"),
    refresh: document.getElementById("btn-refresh"),
    batchList: document.getElementById("batch-list"),
    batchCount: document.getElementById("batch-count"),
    batchEmpty: document.getElementById("batch-empty"),
    rowsTitle: document.getElementById("rows-title"),
    rowsSub: document.getElementById("rows-sub"),
    rowsBody: document.getElementById("rows-body"),
    rowsEmpty: document.getElementById("rows-empty"),
    filters: document.getElementById("status-filters"),
    rowActions: document.getElementById("row-actions"),
    selCount: document.getElementById("sel-count"),
    expectedLabel: document.getElementById("expected-label"),
    detailTitle: document.getElementById("detail-title"),
    detailBody: document.getElementById("detail-body"),
    error: document.getElementById("global-error"),
    ok: document.getElementById("global-ok"),
    btnRun: document.getElementById("btn-run"),
    btnStop: document.getElementById("btn-stop"),
    btnDelete: document.getElementById("btn-delete-batch"),
  };

  window.AdminState = state;
  window.AdminUI = {
    showError,
    showOk,
    clearError,
    loadBatches,
    loadRows,
    renderBatches,
    renderRows,
    updateActionButtons,
    setActiveRun,
  };

  function showError(message) {
    el.error.textContent = message;
    el.error.classList.remove("hidden");
    el.ok.classList.add("hidden");
  }

  function showOk(message) {
    el.ok.textContent = message;
    el.ok.classList.remove("hidden");
    el.error.classList.add("hidden");
  }

  function clearError() {
    el.error.classList.add("hidden");
    el.ok.classList.add("hidden");
  }

  function setActiveRun(run) {
    state.activeRun = run;
    if (!run) {
      el.runPill.textContent = "No active run";
      el.runPill.className = "pill pill-muted";
    } else {
      el.runPill.textContent = `${run.status}: ${run.row_ids?.length || 0} rows`;
      el.runPill.className = run.stop_requested ? "pill pill-bad" : "pill pill-ok";
    }
    updateActionButtons();
  }

  function updateActionButtons() {
    const hasBatch = !!state.selectedBatchId;
    const hasSel = state.selectedIds.size > 0;
    const running = !!(state.activeRun && ["queued", "claimed", "running", "stopping"].includes(state.activeRun.status));
    el.btnDelete.disabled = !hasBatch || running;
    el.btnRun.disabled = !hasBatch || !hasSel || running;
    el.btnStop.disabled = !running;
    el.selCount.textContent = `${state.selectedIds.size} selected`;
  }

  function countPills(batch) {
    return [
      ["P", batch.pending_count],
      ["R", batch.in_progress_count],
      ["OK", batch.completed_count],
      ["Part", batch.partial_count],
      ["Fail", batch.failed_count],
    ]
      .filter(([, n]) => n > 0)
      .map(([label, n]) => `<span class="pill">${label} ${n}</span>`)
      .join("");
  }

  function renderBatches() {
    el.batchCount.textContent = `${state.batches.length} total`;
    if (!state.batches.length) {
      el.batchList.innerHTML = "";
      el.batchEmpty.classList.remove("hidden");
      updateActionButtons();
      return;
    }
    el.batchEmpty.classList.add("hidden");
    el.batchList.innerHTML = state.batches
      .map((batch) => {
        const active = batch.id === state.selectedBatchId ? "active" : "";
        return `<button type="button" class="batch-item ${active}" data-batch-id="${U.escapeHtml(batch.id)}"><div class="name">${U.escapeHtml(batch.filename)}</div><div class="counts">${U.badge(batch.status)}<span class="pill">${batch.total_rows} rows</span>${countPills(batch)}</div><div class="muted" style="margin-top:0.35rem">${U.escapeHtml(U.formatTime(batch.created_at))}</div></button>`;
      })
      .join("");
    updateActionButtons();
  }

  function renderRows() {
    const batch = state.batches.find((b) => b.id === state.selectedBatchId);
    const expected = U.formatDuration(state.expectedRowSeconds * 1000);
    el.expectedLabel.textContent = `Expected / row: ${expected}`;
    if (!batch) {
      el.rowsTitle.textContent = "Select a batch";
      el.rowsSub.textContent = "";
      el.filters.hidden = true;
      el.rowActions.hidden = true;
      el.rowsBody.innerHTML = "";
      el.rowsEmpty.classList.remove("hidden");
      el.rowsEmpty.textContent = "Pick a batch to inspect rows";
      updateActionButtons();
      return;
    }
    el.rowsTitle.textContent = batch.filename;
    el.rowsSub.textContent = `${batch.total_rows} rows · ${U.formatStatus(batch.status)}`;
    el.filters.hidden = false;
    el.rowActions.hidden = false;
    if (!state.rows.length) {
      el.rowsBody.innerHTML = "";
      el.rowsEmpty.classList.remove("hidden");
      el.rowsEmpty.textContent = "No rows for this filter";
      updateActionButtons();
      return;
    }
    el.rowsEmpty.classList.add("hidden");
    el.rowsBody.innerHTML = state.rows
      .map((row) => {
        const active = row.id === state.selectedRowId ? "active" : "";
        const checked = state.selectedIds.has(row.id) ? "checked" : "";
        return `<tr class="${active}" data-row-id="${U.escapeHtml(row.id)}"><td><input type="checkbox" data-check-row="${U.escapeHtml(row.id)}" ${checked} /></td><td>${row.row_number}</td><td>${U.escapeHtml(row.email)}</td><td>${U.badge(row.login_status)}</td><td>${U.badge(row.redeem_status)}</td><td>${U.badge(row.purchase_status)}</td><td>${U.badge(row.status)}</td><td>${U.escapeHtml(U.formatDuration(row.duration_ms))}</td><td>${U.escapeHtml(expected)}</td></tr>`;
      })
      .join("");
    updateActionButtons();
  }

  async function renderDetail(row, { silent = false } = {}) {
    const token = ++state.detailToken;
    el.detailTitle.textContent = `Row ${row.row_number}`;
    if (!silent) el.detailBody.innerHTML = `<p class="muted">Loading detail…</p>`;
    let emails = [];
    try {
      const data = await U.api(`/emails/history?row_id=${encodeURIComponent(row.id)}&limit=20`);
      emails = data.items || [];
    } catch (err) {
      if (token !== state.detailToken) return;
      showError(err.message);
    }
    if (token !== state.detailToken || state.selectedRowId !== row.id) return;
    el.detailBody.innerHTML = `
      <div class="detail-section">
        <div class="stage-row">
          <span class="badge ${String(row.login_status).replace(/\s+/g, "_")}">login: ${U.escapeHtml(U.formatStatus(row.login_status))}</span>
          <span class="badge ${String(row.redeem_status).replace(/\s+/g, "_")}">redeem: ${U.escapeHtml(U.formatStatus(row.redeem_status))}</span>
          <span class="badge ${String(row.purchase_status).replace(/\s+/g, "_")}">order: ${U.escapeHtml(U.formatStatus(row.purchase_status))}</span>
          ${U.badge(row.status)}
        </div>
        ${U.kv("Email", row.email)}
        ${U.kv("Password", row.password)}
        ${U.kv("Gift card", row.gift_card_number)}
        ${U.kv("PIN", row.gift_card_pin)}
        ${U.kv("Product", row.product_url)}
        ${U.kv("Qty", row.quantity)}
        ${U.kv("Order ID", row.order_id)}
        ${U.kv("Time taken", U.formatDuration(row.duration_ms))}
        ${U.kv("Expected", U.formatDuration(state.expectedRowSeconds * 1000))}
      </div>
      <div class="detail-section">
        <h3>Stages</h3>
        ${U.kv("Login at", U.formatTime(row.login_at))}
        ${U.kv("Login error", row.login_error)}
        ${U.kv("Redeemed at", U.formatTime(row.redeemed_at))}
        ${U.kv("Redeem error", row.redeem_error)}
        ${U.kv("Balance before", row.balance_before)}
        ${U.kv("Balance after", row.balance_after)}
        ${U.kv("Balance delta", row.balance_delta)}
        ${U.kv("Purchased at", U.formatTime(row.purchased_at))}
        ${U.kv("Order error", row.purchase_error)}
      </div>
      <div class="detail-section">
        <h3>Screenshots</h3>
        <div class="shots">
          ${U.shotBlock(row, "before_redeem", "Before redeem")}
          ${U.shotBlock(row, "after_redeem", "After redeem")}
          ${U.shotBlock(row, "after_order", "After order")}
        </div>
      </div>
      <div class="detail-section">
        <h3>Emails</h3>
        ${U.renderEmails(emails)}
      </div>`;
  }

  async function loadRows({ silent = false } = {}) {
    if (!state.selectedBatchId) return;
    const params = new URLSearchParams({ limit: "500" });
    if (state.statusFilter) params.set("status", state.statusFilter);
    const data = await U.api(`/batches/${encodeURIComponent(state.selectedBatchId)}/rows?${params}`);
    state.rows = data.rows || [];
    const valid = new Set(state.rows.map((r) => r.id));
    state.selectedIds = new Set([...state.selectedIds].filter((id) => valid.has(id)));
    if (!state.rows.some((r) => r.id === state.selectedRowId)) {
      state.selectedRowId = state.rows[0]?.id || null;
    }
    renderRows();
    const row = state.rows.find((r) => r.id === state.selectedRowId);
    if (row) await renderDetail(row, { silent });
    else {
      el.detailTitle.textContent = "Row detail";
      el.detailBody.innerHTML = `<p class="empty">Select a row</p>`;
    }
  }

  async function loadBatches({ keepSelection = true, silent = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    if (!silent) clearError();
    try {
      const data = await U.api("/batches?limit=100");
      state.batches = data.batches || [];
      if (!keepSelection || !state.batches.some((b) => b.id === state.selectedBatchId)) {
        state.selectedBatchId = state.batches[0]?.id || null;
        state.selectedRowId = null;
        state.selectedIds = new Set();
      }
      renderBatches();
      if (state.selectedBatchId) await loadRows({ silent });
      else {
        state.rows = [];
        renderRows();
        el.detailBody.innerHTML = `<p class="empty">Select a row</p>`;
      }
    } catch (err) {
      showError(err.message);
    } finally {
      state.loading = false;
    }
  }

  async function checkHealth() {
    try {
      const data = await U.api("/health");
      const ok = data.status === "ok";
      el.health.textContent = ok ? "API online" : "API issue";
      el.health.className = `pill ${ok ? "pill-ok" : "pill-bad"}`;
    } catch (_) {
      el.health.textContent = "API offline";
      el.health.className = "pill pill-bad";
    }
  }

  el.batchList.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-batch-id]");
    if (!btn) return;
    state.selectedBatchId = btn.getAttribute("data-batch-id");
    state.selectedRowId = null;
    state.selectedIds = new Set();
    renderBatches();
    try {
      await loadRows();
    } catch (err) {
      showError(err.message);
    }
  });

  el.rowsBody.addEventListener("click", async (event) => {
    const check = event.target.closest("[data-check-row]");
    if (check) {
      event.stopPropagation();
      const id = check.getAttribute("data-check-row");
      if (check.checked) state.selectedIds.add(id);
      else state.selectedIds.delete(id);
      updateActionButtons();
      return;
    }
    const tr = event.target.closest("tr[data-row-id]");
    if (!tr) return;
    state.selectedRowId = tr.getAttribute("data-row-id");
    renderRows();
    const row = state.rows.find((r) => r.id === state.selectedRowId);
    if (row) await renderDetail(row);
  });

  el.filters.addEventListener("click", async (event) => {
    const chip = event.target.closest("[data-status]");
    if (!chip) return;
    state.statusFilter = chip.getAttribute("data-status") || "";
    el.filters.querySelectorAll(".chip").forEach((node) => node.classList.remove("active"));
    chip.classList.add("active");
    try {
      await loadRows();
    } catch (err) {
      showError(err.message);
    }
  });

  document.getElementById("btn-select-all").addEventListener("click", () => {
    state.rows.forEach((r) => state.selectedIds.add(r.id));
    renderRows();
  });
  document.getElementById("btn-clear-sel").addEventListener("click", () => {
    state.selectedIds = new Set();
    renderRows();
  });

  el.refresh.addEventListener("click", () => {
    checkHealth();
    loadBatches();
  });

  async function boot() {
    await checkHealth();
    try {
      const cfg = await U.api("/runs/config");
      state.expectedRowSeconds = cfg.expected_row_seconds || 180;
    } catch (_) {}
    await loadBatches({ keepSelection: false });
    setInterval(() => {
      checkHealth();
      loadBatches({ keepSelection: true, silent: true });
    }, 5000);
  }

  boot();
})();
