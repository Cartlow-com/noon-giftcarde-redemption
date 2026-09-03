let dashboardRunId = null;
let runPollBusy = false;

async function startDashboardRun(run) {
  if (!run || !run.id) return;
  if (isBatchRunActive()) {
    emitBatch({
      type: "BATCH_PROGRESS",
      stage: "system",
      status: "info",
      message: "Ignoring queued dashboard run — another run is active",
    });
    return;
  }

  let claimed;
  try {
    claimed = await claimBatchRun(run.id);
  } catch (error) {
    emitBatch({
      type: "BATCH_ERROR",
      batchId: run.batch_id,
      error: error instanceof Error ? error.message : "Failed to claim run",
    });
    return;
  }

  dashboardRunId = claimed.id;
  emitBatch({
    type: "BATCH_PROGRESS",
    batchId: claimed.batch_id,
    stage: "system",
    status: "info",
    message: `Dashboard run claimed — opening Noon window (${claimed.row_ids.length} row(s))`,
  });

  try {
    await runSelectedRows(claimed.batch_id, claimed.row_ids || [], {
      placeOrder: claimed.place_order,
      sendRedeemEmails: claimed.send_redeem_emails,
      sendOrderEmails: claimed.send_order_emails,
      forceNewWindow: true,
      runId: claimed.id,
    });
    await patchBatchRun(claimed.id, {
      status: isBatchRunCancelled() ? "stopped" : "completed",
      message: isBatchRunCancelled() ? "Stopped from dashboard/extension" : "Completed",
    });
  } catch (error) {
    await patchBatchRun(claimed.id, {
      status: "failed",
      message: error instanceof Error ? error.message : "Run failed",
    }).catch(function () {});
    emitBatch({
      type: "BATCH_ERROR",
      batchId: claimed.batch_id,
      error: error instanceof Error ? error.message : "Dashboard run failed",
    });
  } finally {
    dashboardRunId = null;
  }
}

async function pollDashboardRuns() {
  if (runPollBusy) return;
  runPollBusy = true;
  try {
    if (isBatchRunActive() && dashboardRunId) {
      const active = await getActiveRun();
      if (active && active.id === dashboardRunId && active.stop_requested) {
        stopBatchRun();
      }
      return;
    }
    if (isBatchRunActive()) return;

    const pending = await getPendingRun();
    if (pending && pending.id) {
      await startDashboardRun(pending);
    }
  } catch (_) {
    /* backend may be offline */
  } finally {
    runPollBusy = false;
  }
}

function startDashboardRunPolling() {
  pollDashboardRuns();
  setInterval(pollDashboardRuns, 2500);
}
