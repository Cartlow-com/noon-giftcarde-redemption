let dashboardRunId = null;
let runPollBusy = false;
let dashboardStartBusy = false;
let stopWatchBusy = false;

const DASHBOARD_POLL_ALARM = "noon_dashboard_poll";
/** Chrome clamps alarm periods; ~30s is the practical minimum on modern Chrome. */
const DASHBOARD_POLL_PERIOD_MINUTES = 0.5;

async function startDashboardRun(run) {
  if (!run || !run.id) return;
  if (dashboardStartBusy || isBatchRunActive()) {
    emitBatch({
      type: "BATCH_PROGRESS",
      stage: "system",
      status: "info",
      message: "Ignoring queued dashboard run — another run is active",
    });
    return;
  }

  dashboardStartBusy = true;
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
  } finally {
    if (!claimed) {
      dashboardStartBusy = false;
      clearActiveApiBaseUrl();
    }
  }

  dashboardRunId = claimed.id;
  emitBatch({
    type: "BATCH_PROGRESS",
    batchId: claimed.batch_id,
    stage: "system",
    status: "info",
    message: `Dashboard run claimed — opening Noon window (${claimed.row_ids.length} row(s))` +
      (claimed.hide_window ? " — hidden" : ""),
  });

  try {
    await runSelectedRows(claimed.batch_id, claimed.row_ids || [], {
      placeOrder: claimed.place_order,
      sendRedeemEmails: claimed.send_redeem_emails,
      sendOrderEmails: claimed.send_order_emails,
      hideWindow: !!claimed.hide_window,
      loginOnly: !!claimed.login_only,
      forceNewWindow: true,
      runId: claimed.id,
    });
    await patchBatchRun(claimed.id, {
      status: isBatchRunCancelled() ? "stopped" : "completed",
      message: isBatchRunCancelled() ? "Stopped from dashboard/extension" : "Completed",
    });
  } catch (error) {
    await patchBatchRun(claimed.id, {
      status: isBatchRunCancelled() ? "stopped" : "failed",
      message: error instanceof Error ? error.message : "Run failed",
    }).catch(function () {});
    emitBatch({
      type: "BATCH_ERROR",
      batchId: claimed.batch_id,
      error: error instanceof Error ? error.message : "Dashboard run failed",
    });
  } finally {
    dashboardRunId = null;
    dashboardStartBusy = false;
    clearActiveApiBaseUrl();
  }
}

async function checkDashboardStop() {
  if (stopWatchBusy) return;
  if (!dashboardRunId || !isBatchRunActive()) return;
  stopWatchBusy = true;
  try {
    const active = await getActiveRun();
    let shouldStop = !!(active && active.id === dashboardRunId && active.stop_requested);
    if (!shouldStop) {
      // Stop API marks run stopped immediately → it drops out of /runs/active.
      try {
        const run = await batchApiRequest(`/runs/${encodeURIComponent(dashboardRunId)}`);
        shouldStop = !!(run && (run.stop_requested || run.status === "stopped"));
      } catch (_) {}
    }
    if (shouldStop) {
      stopBatchRun();
      emitBatch({
        type: "BATCH_PROGRESS",
        stage: "system",
        status: "info",
        message: "Stop received from dashboard — cancelling automation",
      });
    }
  } catch (_) {
    /* ignore */
  } finally {
    stopWatchBusy = false;
  }
}

async function pollDashboardRuns() {
  if (runPollBusy) return;
  runPollBusy = true;
  try {
    try {
      await postExtensionHeartbeat();
    } catch (_) {
      /* older backends may lack heartbeat */
    }

    await checkDashboardStop();
    if (dashboardStartBusy || isBatchRunActive()) return;

    const pending = await getPendingRun();
    if (pending && pending.id) {
      // Do not await — keep poller free so Stop can be checked while running.
      startDashboardRun(pending);
    }
  } catch (_) {
    /* backend may be offline */
  } finally {
    runPollBusy = false;
  }
}

function ensureDashboardPollAlarm() {
  chrome.alarms.create(DASHBOARD_POLL_ALARM, {
    delayInMinutes: DASHBOARD_POLL_PERIOD_MINUTES,
    periodInMinutes: DASHBOARD_POLL_PERIOD_MINUTES,
  });
}

function startDashboardRunPolling() {
  ensureDashboardPollAlarm();
  pollDashboardRuns();
  // Fast loops only while the service worker stays awake (active run / recent events).
  // When MV3 puts the SW to sleep, setInterval dies — chrome.alarms wakes it again.
  setInterval(pollDashboardRuns, 2500);
  setInterval(checkDashboardStop, 1000);
}

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === DASHBOARD_POLL_ALARM) {
    pollDashboardRuns();
  }
});

chrome.runtime.onInstalled.addListener(function () {
  ensureDashboardPollAlarm();
});

chrome.runtime.onStartup.addListener(function () {
  ensureDashboardPollAlarm();
});
