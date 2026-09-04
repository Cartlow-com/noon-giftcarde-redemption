(() => {
  const RECONNECT_BASE_MS = 1000;
  const RECONNECT_MAX_MS = 15000;

  let abort = null;
  let batchId = null;
  let reconnectMs = RECONNECT_BASE_MS;
  let reconnectTimer = null;
  let running = false;

  function getToken() {
    if (window.AdminAuth && typeof window.AdminAuth.getAccessToken === "function") {
      return window.AdminAuth.getAccessToken() || "";
    }
    return localStorage.getItem("noon_access_token") || "";
  }

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function stop() {
    running = false;
    clearReconnect();
    if (abort) {
      abort.abort();
      abort = null;
    }
  }

  function scheduleReconnect() {
    if (!running) return;
    clearReconnect();
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectMs);
    reconnectMs = Math.min(RECONNECT_MAX_MS, Math.round(reconnectMs * 1.5));
  }

  function parseSseChunk(buffer, onEvent) {
    const parts = buffer.split("\n\n");
    const rest = parts.pop() || "";
    for (const block of parts) {
      let eventName = "message";
      const dataLines = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) continue;
      try {
        onEvent(eventName, JSON.parse(dataLines.join("\n")));
      } catch (_) {
        /* ignore malformed */
      }
    }
    return rest;
  }

  async function connect() {
    if (!running) return;
    if (window.AdminAuth && !window.AdminAuth.isAuthenticated()) {
      stop();
      return;
    }

    const token = getToken();
    if (!token && window.AdminAuth) {
      scheduleReconnect();
      return;
    }

    if (abort) abort.abort();
    abort = new AbortController();

    const params = new URLSearchParams();
    if (batchId) params.set("batch_id", batchId);
    const url = `/admin/events${params.toString() ? `?${params}` : ""}`;

    try {
      const headers = { Accept: "text/event-stream", "Cache-Control": "no-store" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(url, {
        headers,
        signal: abort.signal,
        cache: "no-store",
      });

      if (response.status === 401) {
        stop();
        if (window.AdminAuth && typeof window.AdminAuth.handleUnauthorized === "function") {
          window.AdminAuth.handleUnauthorized();
        }
        return;
      }
      if (!response.ok || !response.body) {
        scheduleReconnect();
        return;
      }

      reconnectMs = RECONNECT_BASE_MS;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (running) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = parseSseChunk(buffer, (eventName, data) => {
          if (eventName === "ping") return;
          if (eventName === "dashboard") {
            if (window.AdminUI && typeof window.AdminUI.applyDashboardSnapshot === "function") {
              window.AdminUI.applyDashboardSnapshot(data);
            }
            return;
          }
          if (eventName === "dashboard_delta") {
            if (window.AdminUI && typeof window.AdminUI.applyDashboardDelta === "function") {
              window.AdminUI.applyDashboardDelta(data);
            }
          }
        });
      }
      if (running) scheduleReconnect();
    } catch (err) {
      if (err && err.name === "AbortError") return;
      if (running) scheduleReconnect();
    }
  }

  function start(selectedBatchId) {
    batchId = selectedBatchId || null;
    running = true;
    clearReconnect();
    reconnectMs = RECONNECT_BASE_MS;
    connect();
  }

  function setBatchId(nextId) {
    const normalized = nextId || null;
    if (normalized === batchId) return;
    batchId = normalized;
    if (!running) return;
    clearReconnect();
    reconnectMs = RECONNECT_BASE_MS;
    connect();
  }

  window.AdminSSE = { start, stop, setBatchId };
})();
