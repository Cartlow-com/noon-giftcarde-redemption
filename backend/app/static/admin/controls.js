(() => {
  const U = window.AdminUtil;
  const state = () => window.AdminState;
  const ui = () => window.AdminUI;

  const fileInput = document.getElementById("file-upload");
  const btnRun = document.getElementById("btn-run");
  const btnStop = document.getElementById("btn-stop");
  const btnDelete = document.getElementById("btn-delete-batch");
  const optLoginOnly = document.getElementById("opt-login-only");
  const optPlace = document.getElementById("opt-place-order");
  const optHideWindow = document.getElementById("opt-hide-window");
  const optRedeem = document.getElementById("opt-redeem-email");
  const optOrder = document.getElementById("opt-order-email");

  // When Login only is toggled on, disable/uncheck the options that are
  // irrelevant for a login test. Re-enable them when it is unchecked.
  const LOGIN_ONLY_INCOMPATIBLE = [optPlace, optRedeem, optOrder];
  optLoginOnly.addEventListener("change", () => {
    const on = optLoginOnly.checked;
    for (const el of LOGIN_ONLY_INCOMPATIBLE) {
      if (on) {
        el.checked = false;
        el.disabled = true;
        el.closest("label").style.opacity = "0.4";
      } else {
        el.disabled = false;
        el.closest("label").style.opacity = "";
      }
    }
  });

  async function refreshActiveRun() {
    if (window.AdminAuth && !window.AdminAuth.isAuthenticated()) {
      ui().setActiveRun(null);
      return;
    }
    try {
      const run = await U.api("/runs/active");
      ui().setActiveRun(run);
    } catch (_) {
      ui().setActiveRun(null);
    }
  }

  async function refreshExtensionStatus() {
    if (window.AdminAuth && !window.AdminAuth.isAuthenticated()) {
      ui().setExtensionOnline(false);
      return;
    }
    try {
      const status = await U.api("/runs/extension/status");
      ui().setExtensionOnline(!!status.online);
    } catch (_) {
      ui().setExtensionOnline(false);
    }
  }

  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    try {
      const data = await U.api("/batches/upload", { method: "POST", body: form });
      ui().showOk(`Uploaded ${data.batch.total_rows} rows — ${data.batch.filename}`);
      state().selectedBatchId = data.batch.id;
      state().selectedIds = new Set();
      await ui().loadBatches({ keepSelection: true });
    } catch (err) {
      ui().showError(err.message);
    }
  });

  btnDelete.addEventListener("click", async () => {
    const batchId = state().selectedBatchId;
    if (!batchId) return;
    const ask = window.AdminConfirm?.ask;
    const ok = ask
      ? await ask({
          title: "Delete batch?",
          message: "This permanently deletes the batch and all of its rows.",
          okLabel: "Delete batch",
          danger: true,
        })
      : false;
    if (!ok) return;
    try {
      await U.api(`/batches/${encodeURIComponent(batchId)}`, { method: "DELETE" });
      ui().showOk("Batch deleted");
      state().selectedBatchId = null;
      state().selectedIds = new Set();
      await ui().loadBatches({ keepSelection: false });
    } catch (err) {
      ui().showError(err.message);
    }
  });

  async function runSelectedRowsFromDashboard() {
    const s = state();
    if (window.AdminAuth && !window.AdminAuth.isAuthenticated()) return;
    const rowIds = [...s.selectedIds];
    if (!s.selectedBatchId || rowIds.length === 0) return;
    const extensionReady =
      s.extensionOnline ||
      !!(window.AdminAuth && window.AdminAuth.isExtensionConnected());
    if (!extensionReady) {
      ui().showError("Extension is offline — keep Chrome open with Noon Automation loaded");
      return;
    }
    try {
      if (!s.extensionOnline && window.AdminAuth && window.AdminAuth.isExtensionConnected()) {
        await U.api("/runs/extension/heartbeat", { method: "POST" });
        ui().setExtensionOnline(true);
      }
      const run = await U.api("/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batch_id: s.selectedBatchId,
          row_ids: rowIds,
          place_order: optLoginOnly.checked ? false : optPlace.checked,
          hide_window: optHideWindow.checked,
          login_only: optLoginOnly.checked,
          send_redeem_emails: optLoginOnly.checked ? false : optRedeem.checked,
          send_order_emails: optLoginOnly.checked ? false : optOrder.checked,
        }),
      });
      ui().setActiveRun(run);
      const modeBits = [];
      if (optLoginOnly.checked) modeBits.push("login only");
      if (optHideWindow.checked) modeBits.push("hidden window");
      ui().showOk(
        `Queued ${rowIds.length} row(s)` +
          (modeBits.length ? ` (${modeBits.join(", ")})` : "") +
          ". Extension will claim the run.",
      );
    } catch (err) {
      ui().showError(err.message);
      refreshExtensionStatus();
    }
  }

  btnRun.addEventListener("click", runSelectedRowsFromDashboard);

  document.addEventListener("click", (event) => {
    const run = event.target.closest && event.target.closest("#btn-run");
    if (!run || run.disabled) return;
    if (event.target === btnRun) return;
    event.preventDefault();
    runSelectedRowsFromDashboard();
  });

  btnStop.addEventListener("click", async () => {
    if (window.AdminAuth && !window.AdminAuth.isAuthenticated()) return;
    const run = state().activeRun;
    if (!run) return;
    try {
      const updated = await U.api(`/runs/${encodeURIComponent(run.id)}/stop`, { method: "POST" });
      ui().setActiveRun(updated.status === "stopped" ? null : updated);
      ui().showOk(updated.message || "Stopped");
      await ui().loadBatches({ keepSelection: true });
    } catch (err) {
      ui().showError(err.message);
    }
  });

  async function bootControls() {
    if (window.AdminAuth && typeof window.AdminAuth.ready === "function") {
      await window.AdminAuth.ready();
    }
    if (window.AdminAuth && !window.AdminAuth.isAuthenticated()) return;
    refreshActiveRun();
    refreshExtensionStatus();
  }

  window.addEventListener("noon-auth-changed", (event) => {
    if (event.detail && event.detail.authenticated) {
      if (event.detail.extensionConnected) ui().setExtensionOnline(true);
      refreshActiveRun();
      refreshExtensionStatus();
    } else {
      ui().setActiveRun(null);
      ui().setExtensionOnline(false);
    }
  });

  bootControls();
})();
