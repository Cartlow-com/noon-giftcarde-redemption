async function getApiBaseUrl() {
  const data = await chrome.storage.local.get("noon_api_base_url");
  const stored = data.noon_api_base_url;
  return typeof stored === "string" && stored.trim()
    ? stored.trim().replace(/\/$/, "")
    : "http://127.0.0.1:8000";
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
