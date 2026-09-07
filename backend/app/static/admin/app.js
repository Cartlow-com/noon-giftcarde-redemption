(() => {
  const U = window.AdminUtil;
  const state = {
    batches: [],
    selectedBatchId: null,
    rows: [],
    selectedRowId: null,
    selectedAttemptId: null,
    detailEmails: [],
    detailAttempts: [],
    selectedIds: new Set(),
    statusFilter: "",
    ownerFilter: "",
    ownerFilterEmail: "",
    detailToken: 0,
    loading: false,
    expectedRowSeconds: 180,
    activeRun: null,
    extensionOnline: false,
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
    error: document.getElementById("global-error"),
    ok: document.getElementById("global-ok"),
    btnRun: document.getElementById("btn-run"),
    btnStop: document.getElementById("btn-stop"),
    btnDelete: document.getElementById("btn-delete-batch"),
  };

  window.AdminState = state;
  window.AdminUI = {
    showError, showOk, clearError, loadBatches, loadRows, renderBatches,
    renderRows,
    renderDetail(...args) {
      if (window.AdminDetail) return window.AdminDetail.renderDetail(...args);
    },
    updateActionButtons, setActiveRun,
    setExtensionOnline, checkHealth, checkExtension,
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

  function setExtensionOnline(online) {
    state.extensionOnline = !!online;
    updateActionButtons();
  }
  function setActiveRun(run) {
    state.activeRun = run;
    el.runPill.textContent = run ? `${run.status}: ${run.row_ids?.length || 0} rows` : "No active run";
    el.runPill.className = !run ? "pill pill-muted" : run.stop_requested ? "pill pill-bad" : "pill pill-ok";
    updateActionButtons();
  }

  function updateActionButtons() {
    const hasBatch = !!state.selectedBatchId;
    const hasSel = state.selectedIds.size > 0;
    const running = !!(state.activeRun && ["queued", "claimed", "running", "stopping"].includes(state.activeRun.status));
    const authed = !window.AdminAuth || window.AdminAuth.isAuthenticated();
    el.btnDelete.disabled = !hasBatch || running;
    el.btnRun.disabled = !authed || !hasBatch || !hasSel || running || !state.extensionOnline;
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
    if (el.batchCount) el.batchCount.textContent = `${state.batches.length} total`;
    if (!el.batchList) return;
    if (!state.batches.length) {
      el.batchList.innerHTML = "";
      if (el.batchEmpty) el.batchEmpty.classList.remove("hidden");
      updateActionButtons();
      return;
    }
    if (el.batchEmpty) el.batchEmpty.classList.add("hidden");
    const showOwner = window.AdminAuth && window.AdminAuth.isSuperAdmin();
    el.batchList.innerHTML = state.batches
      .map((batch) => {
        const active = batch.id === state.selectedBatchId ? "active" : "";
        const owner =
          showOwner && batch.owner_email
            ? `<div class="owner">${U.escapeHtml(batch.owner_email)}</div>`
            : "";
        return `<button type="button" class="batch-card ${active}" role="option" aria-selected="${active ? "true" : "false"}" data-batch-id="${U.escapeHtml(batch.id)}"><div class="name">${U.escapeHtml(batch.filename)}</div><div class="meta">${U.badge(batch.status)}<span class="pill">${batch.total_rows} rows</span>${countPills(batch)}</div>${owner}<div class="muted" style="margin-top:0.35rem">${U.escapeHtml(U.formatTime(batch.created_at))}</div></button>`;
      })
      .join("");
    updateActionButtons();
  }

  function renderRows() {
    const batch = state.batches.find((b) => b.id === state.selectedBatchId);
    const expected = U.formatDuration(state.expectedRowSeconds * 1000);
    el.expectedLabel.textContent = `Expected / row: ${expected}`;
    if (!batch) {
      if (el.rowsTitle) el.rowsTitle.textContent = "Select a batch";
      if (el.rowsSub) el.rowsSub.textContent = "";
      el.filters.hidden = true;
      el.rowActions.hidden = true;
      el.rowsBody.innerHTML = "";
      el.rowsEmpty.classList.remove("hidden");
      el.rowsEmpty.textContent = "Upload a CSV or select a batch above";
      updateActionButtons();
      return;
    }
    if (el.rowsTitle) el.rowsTitle.textContent = batch.filename;
    if (el.rowsSub) {
      el.rowsSub.textContent = `${batch.total_rows} rows · ${U.formatStatus(batch.status)} · Expected / row: ${expected}`;
    }
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
        return `<tr class="${active}" data-row-id="${U.escapeHtml(row.id)}"><td><input type="checkbox" data-check-row="${U.escapeHtml(row.id)}" ${checked} /></td><td>${row.row_number}</td><td>${U.escapeHtml(row.email)}</td><td>${U.badge(row.login_status)}</td><td>${U.badge(row.redeem_status)}</td><td>${U.badge(row.purchase_status)}</td><td>${U.badge(row.status)}</td><td>${U.escapeHtml(U.formatDuration(row.duration_ms))}</td><td>${U.escapeHtml(expected)}</td><td class="row-actions-cell"><button type="button" class="btn-text" data-view-row="${U.escapeHtml(row.id)}">View</button><button type="button" class="btn-text" data-edit-row="${U.escapeHtml(row.id)}">Edit</button><button type="button" class="btn-text btn-text-danger" data-delete-row="${U.escapeHtml(row.id)}">Delete</button></td></tr>`;
      })
      .join("");
    updateActionButtons();
  }

  async function loadRows({ silent = false } = {}) {
    if (!state.selectedBatchId) return;
    if (window.AdminAuth && !window.AdminAuth.isAuthenticated()) return;
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
  }

  async function loadBatches({ keepSelection = true, silent = false } = {}) {
    if (window.AdminAuth && !window.AdminAuth.isAuthenticated()) return;
    if (state.loading) return;
    state.loading = true;
    if (!silent) clearError();
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (state.ownerFilter) params.set("user_id", state.ownerFilter);
      const data = await U.api(`/batches?${params}`);
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
      }
      if (window.AdminSSE) {
        window.AdminSSE.setBatchId(state.selectedBatchId);
        if (typeof window.AdminSSE.setFilterUserId === "function") {
          window.AdminSSE.setFilterUserId(state.ownerFilter || null);
        }
      }
      if (window.AdminNav && typeof window.AdminNav.updateUserBanner === "function") {
        window.AdminNav.updateUserBanner();
      }
    } catch (err) {
      showError(err.message);
    } finally {
      state.loading = false;
    }
  }

  async function checkHealth() {
    await U.checkHealth(el.health);
  }

  async function checkExtension() {
    if (window.AdminAuth && !window.AdminAuth.isAuthenticated()) {
      setExtensionOnline(false);
      return;
    }
    try {
      setExtensionOnline(!!(await U.api("/runs/extension/status")).online);
    } catch (_) {
      setExtensionOnline(false);
    }
  }

  async function selectBatch(batchId) {
    if (!batchId || batchId === state.selectedBatchId) {
      renderBatches();
      return;
    }
    state.selectedBatchId = batchId;
    state.selectedRowId = null;
    state.selectedAttemptId = null;
    state.selectedIds = new Set();
    renderBatches();
    if (window.AdminSSE) window.AdminSSE.setBatchId(state.selectedBatchId);
    try {
      await loadRows();
    } catch (err) {
      showError(err.message);
    }
  }

  el.batchList?.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-batch-id]");
    if (!btn) return;
    await selectBatch(btn.getAttribute("data-batch-id"));
  });

  el.rowsBody.addEventListener("click", async (event) => {
    const viewBtn = event.target.closest("[data-view-row]");
    if (viewBtn) {
      event.stopPropagation();
      const id = viewBtn.getAttribute("data-view-row");
      const row = state.rows.find((r) => r.id === id);
      if (row && window.AdminRowModal) window.AdminRowModal.open(row);
      return;
    }
    const editBtn = event.target.closest("[data-edit-row]");
    if (editBtn) {
      event.stopPropagation();
      const id = editBtn.getAttribute("data-edit-row");
      const row = state.rows.find((r) => r.id === id);
      if (row && window.AdminRowEdit) window.AdminRowEdit.open(row);
      return;
    }
    const deleteBtn = event.target.closest("[data-delete-row]");
    if (deleteBtn) {
      event.stopPropagation();
      const id = deleteBtn.getAttribute("data-delete-row");
      const row = state.rows.find((r) => r.id === id);
      if (row && window.AdminRowEdit) window.AdminRowEdit.deleteRow(row);
      return;
    }
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
    state.selectedAttemptId = null;
    renderRows();
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
    checkExtension();
    const modalOpen = document.getElementById("view-batches")?.classList.contains("modal-open");
    if (modalOpen) {
      loadBatches({ silent: true });
    } else if (window.AdminNav && window.AdminNav.getView() === "users") {
      if (window.AdminUsers) window.AdminUsers.loadUsers();
    } else {
      loadBatches();
    }
    if (window.AdminLive) window.AdminLive.syncLiveStream();
  });
})();
