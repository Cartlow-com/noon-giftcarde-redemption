(function () {
  const BRIDGE_FLAG = "__noonExtension";

  window[BRIDGE_FLAG] = { online: true, version: 1 };

  function reply(type, payload) {
    try {
      window.postMessage(Object.assign({ type: type }, payload || {}), window.location.origin);
    } catch (_) {}
  }

  function forwardToBackground(message) {
    return new Promise(function (resolve) {
      try {
        if (!chrome.runtime || !chrome.runtime.sendMessage) {
          resolve({ ok: false, error: "Extension runtime unavailable" });
          return;
        }
        chrome.runtime.sendMessage(message, function (response) {
          if (chrome.runtime.lastError) {
            resolve({
              ok: false,
              error: chrome.runtime.lastError.message || "Extension not reachable",
            });
            return;
          }
          resolve(response || { ok: false, error: "No response from extension" });
        });
      } catch (error) {
        resolve({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to reach extension",
        });
      }
    });
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "NOON_AUTH") {
      var requestId = data.requestId || null;
      forwardToBackground({
        type: "SET_AUTH_TOKENS",
        accessToken: data.accessToken || "",
        refreshToken: data.refreshToken || "",
      }).then(function (result) {
        reply("NOON_AUTH_RESULT", {
          requestId: requestId,
          ok: !!(result && result.ok),
          error: (result && result.error) || null,
        });
      });
    }

    if (data.type === "NOON_AUTH_CLEAR") {
      var clearId = data.requestId || null;
      forwardToBackground({ type: "CLEAR_AUTH_TOKENS" }).then(function (result) {
        reply("NOON_AUTH_RESULT", {
          requestId: clearId,
          ok: !!(result && result.ok),
          error: (result && result.error) || null,
          cleared: true,
        });
      });
    }

    if (data.type === "NOON_EXT_PING") {
      reply("NOON_EXT_PONG", {
        requestId: data.requestId || null,
        ok: true,
        installed: true,
      });
    }
  });
})();
