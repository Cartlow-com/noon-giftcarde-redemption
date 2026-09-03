let activeApiBaseUrl = null;

function clearActiveApiBaseUrl() {
  activeApiBaseUrl = null;
}

function configuredApiBaseUrls() {
  const bases = [];
  const primary = typeof NOON_API_BASE_URL === "string" ? NOON_API_BASE_URL : "";
  if (primary.trim()) bases.push(primary.trim().replace(/\/$/, ""));
  if (
    typeof NOON_EXTRA_API_BASE_URLS !== "undefined" &&
    Array.isArray(NOON_EXTRA_API_BASE_URLS)
  ) {
    NOON_EXTRA_API_BASE_URLS.forEach(function (base) {
      if (typeof base === "string" && base.trim()) {
        bases.push(base.trim().replace(/\/$/, ""));
      }
    });
  }
  return bases.filter(function (base, index, all) {
    return all.indexOf(base) === index;
  });
}

async function getApiBaseUrl() {
  const bases = configuredApiBaseUrls();
  if (!bases.length) {
    throw new Error("NOON_API_BASE_URL is not configured — set VITE_API_BASE_URL in .env and rebuild");
  }
  return activeApiBaseUrl || bases[0];
}

async function batchApiRequestFromBase(base, path, options) {
  const response = await fetch(`${base}${path}`, options);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      if (body.detail) detail = body.detail;
    } catch (_) {}
    const error = new Error(detail || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

async function batchApiRequest(path, options) {
  const base = await getApiBaseUrl();
  return batchApiRequestFromBase(base, path, options);
}

async function getBatchRow(rowId) {
  return batchApiRequest(`/batches/rows/${rowId}`);
}

async function patchBatchRow(rowId, body) {
  return batchApiRequest(`/batches/rows/${rowId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function uploadRowScreenshot(rowId, kind, blob) {
  const base = await getApiBaseUrl();
  const form = new FormData();
  form.append("file", blob, kind + ".png");
  const response = await fetch(
    `${base}/batches/rows/${encodeURIComponent(rowId)}/screenshots?kind=${encodeURIComponent(kind)}`,
    { method: "POST", body: form },
  );
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      if (body.detail) detail = body.detail;
    } catch (_) {}
    throw new Error(detail || `Screenshot upload failed (${response.status})`);
  }
  return response.json();
}

async function captureAndUploadScreenshot(tabId, rowId, kind) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.windowId == null) {
    throw new Error("Tab has no window — cannot capture screenshot");
  }
  const hideAfter =
    typeof batchHideWindow !== "undefined" ? !!batchHideWindow : false;
  try {
    const focusPatch = { focused: true };
    if (hideAfter) focusPatch.state = "normal";
    await chrome.windows.update(tab.windowId, focusPatch);
  } catch (_) {}
  await chrome.tabs.update(tabId, { active: true });
  await new Promise(function (resolve) {
    setTimeout(resolve, 400);
  });
  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      "captureVisibleTab failed (" +
        msg +
        "). Extension needs <all_urls> host permission — reload from dist after rebuild.",
    );
  } finally {
    if (hideAfter) {
      try {
        await chrome.windows.update(tab.windowId, { state: "minimized", focused: false });
      } catch (_) {}
    }
  }
  if (!dataUrl) {
    throw new Error("captureVisibleTab returned empty image");
  }
  const blob = await (await fetch(dataUrl)).blob();
  if (!blob || blob.size === 0) {
    throw new Error("Screenshot blob was empty");
  }
  return uploadRowScreenshot(rowId, kind, blob);
}

async function notifyRedeemEmail(rowId) {
  return batchApiRequest(`/batches/rows/${encodeURIComponent(rowId)}/notify/redeem`, {
    method: "POST",
  });
}

async function notifyOrderEmail(rowId) {
  return batchApiRequest(`/batches/rows/${encodeURIComponent(rowId)}/notify/order`, {
    method: "POST",
  });
}

async function createBatchRun(payload) {
  return batchApiRequest("/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function getPendingRun() {
  const bases = configuredApiBaseUrls();
  let firstEmpty = null;
  let lastError = null;
  for (let i = 0; i < bases.length; i++) {
    try {
      const run = await batchApiRequestFromBase(bases[i], "/runs/pending");
      if (run && run.id) {
        activeApiBaseUrl = bases[i];
        return run;
      }
      if (firstEmpty === null) firstEmpty = run;
    } catch (error) {
      lastError = error;
    }
  }
  if (firstEmpty !== null) return firstEmpty;
  if (lastError) throw lastError;
  return null;
}

async function getActiveRun() {
  return batchApiRequest("/runs/active");
}

async function claimBatchRun(runId) {
  return batchApiRequest(`/runs/${encodeURIComponent(runId)}/claim`, { method: "POST" });
}

async function stopBatchRunApi(runId) {
  return batchApiRequest(`/runs/${encodeURIComponent(runId)}/stop`, { method: "POST" });
}

async function patchBatchRun(runId, body) {
  return batchApiRequest(`/runs/${encodeURIComponent(runId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function getRunsConfig() {
  return batchApiRequest("/runs/config");
}

async function postExtensionHeartbeat() {
  const bases = configuredApiBaseUrls();
  let firstOk = null;
  let lastError = null;
  for (let i = 0; i < bases.length; i++) {
    try {
      const result = await batchApiRequestFromBase(bases[i], "/runs/extension/heartbeat", {
        method: "POST",
      });
      if (!firstOk) firstOk = result;
    } catch (error) {
      lastError = error;
    }
  }
  if (firstOk) return firstOk;
  if (lastError) throw lastError;
  return null;
}
