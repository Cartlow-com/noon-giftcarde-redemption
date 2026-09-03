(() => {
  const U = window.AdminUtil;
  const state = () => window.AdminState;
  const ui = () => window.AdminUI;

  const fileInput = document.getElementById("file-upload");
  const btnRun = document.getElementById("btn-run");
  const btnStop = document.getElementById("btn-stop");
  const btnDelete = document.getElementById("btn-delete-batch");
  const optPlace = document.getElementById("opt-place-order");
  const optRedeem = document.getElementById("opt-redeem-email");
  const optOrder = document.getElementById("opt-order-email");

  async function refreshActiveRun() {
    try {
      const run = await U.api("/runs/active");
      ui().setActiveRun(run);
    } catch (_) {
      ui().setActiveRun(null);
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
    if (!confirm("Delete this batch and all rows?")) return;
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

  btnRun.addEventListener("click", async () => {
    const s = state();
    const rowIds = [...s.selectedIds];
    if (!s.selectedBatchId || rowIds.length === 0) return;
    try {
      const run = await U.api("/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batch_id: s.selectedBatchId,
          row_ids: rowIds,
          place_order: optPlace.checked,
          send_redeem_emails: optRedeem.checked,
          send_order_emails: optOrder.checked,
        }),
      });
      ui().setActiveRun(run);
      ui().showOk(
        `Queued ${rowIds.length} row(s). Keep Chrome open with the Noon extension — it will claim the run and open a Noon window.`,
      );
    } catch (err) {
      ui().showError(err.message);
    }
  });

  btnStop.addEventListener("click", async () => {
    const run = state().activeRun;
    if (!run) return;
    try {
      const updated = await U.api(`/runs/${encodeURIComponent(run.id)}/stop`, { method: "POST" });
      ui().setActiveRun(updated);
      ui().showOk("Stop requested — extension will halt after the current step");
    } catch (err) {
      ui().showError(err.message);
    }
  });

  refreshActiveRun();
  setInterval(refreshActiveRun, 2500);
})();
