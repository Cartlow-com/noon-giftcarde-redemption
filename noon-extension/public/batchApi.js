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
