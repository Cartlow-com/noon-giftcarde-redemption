async function getApiBaseUrl() {
  const base = typeof NOON_API_BASE_URL === "string" ? NOON_API_BASE_URL : "";
  if (!base.trim()) {
    throw new Error("NOON_API_BASE_URL is not configured — set VITE_API_BASE_URL in .env and rebuild");
  }
  return base.trim().replace(/\/$/, "");
}

async function batchApiRequest(path, options) {
  const base = await getApiBaseUrl();
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
  if (tab.windowId != null) {
    try {
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch (_) {}
  }
  await chrome.tabs.update(tabId, { active: true });
  await new Promise(function (resolve) {
    setTimeout(resolve, 400);
  });
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const blob = await (await fetch(dataUrl)).blob();
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
