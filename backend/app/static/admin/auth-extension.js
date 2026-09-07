(() => {
  window.NoonAuthExtension = {
    attach({ state, setConnectStatus, emitAuthChange, connectTimeoutMs }) {
      function postToExtension(type, payload) {
        const message = Object.assign({ type: type }, payload || {});
        try {
          window.postMessage(message, window.location.origin);
        } catch (_) {}
      }

      function waitForAuthResult(requestId) {
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            state.pendingAuth.delete(requestId);
            resolve({
              ok: false,
              error:
                "No reply from extension — install/reload Noon Automation in this Chrome, then try again",
            });
          }, connectTimeoutMs);
          state.pendingAuth.set(requestId, (result) => {
            clearTimeout(timer);
            resolve(result);
          });
        });
      }

      function detectExtensionInstalled() {
        state.extensionInstalled = !!(
          window.__noonExtension && window.__noonExtension.online
        );
        return state.extensionInstalled;
      }

      async function pingExtension() {
        detectExtensionInstalled();
        const requestId = `ping-${Date.now()}`;
        const resultPromise = waitForAuthResult(requestId);
        postToExtension("NOON_EXT_PING", { requestId });
        const result = await resultPromise;
        state.extensionInstalled = !!(result && result.ok);
        return state.extensionInstalled;
      }

      async function connectExtension() {
        if (!state.accessToken) {
          setConnectStatus("missing", "Sign in first");
          return false;
        }
        setConnectStatus("connecting", "Connecting…");
        const installed = detectExtensionInstalled() || (await pingExtension());
        if (!installed) {
          setConnectStatus(
            "missing",
            "Extension not found — load unpacked in this Chrome",
          );
          if (window.AdminUI && window.AdminUI.showError) {
            window.AdminUI.showError(
              "Extension not detected in this Chrome. Load Noon Automation, then click Connect extension.",
            );
          }
          return false;
        }

        const requestId = `auth-${Date.now()}`;
        const resultPromise = waitForAuthResult(requestId);
        postToExtension("NOON_AUTH", {
          requestId,
          accessToken: state.accessToken,
          refreshToken: state.refreshToken || null,
        });
        const result = await resultPromise;
        if (!result.ok) {
          setConnectStatus("missing", "Connect failed");
          if (window.AdminUI && window.AdminUI.showError) {
            window.AdminUI.showError(result.error || "Could not onboard extension");
          }
          return false;
        }

        setConnectStatus("connected", "Extension connected");
        if (window.AdminUI && window.AdminUI.showOk) {
          window.AdminUI.showOk(
            "Extension onboarded — it can claim your runs on this PC",
          );
        }
        if (window.AdminUI && typeof window.AdminUI.checkExtension === "function") {
          window.AdminUI.checkExtension();
        }
        emitAuthChange(true, state.email, state.role);
        return true;
      }

      async function clearExtensionTokens() {
        const requestId = `clear-${Date.now()}`;
        const resultPromise = waitForAuthResult(requestId);
        postToExtension("NOON_AUTH_CLEAR", { requestId });
        await resultPromise;
        state.extensionConnected = false;
      }

      window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        if (event.origin !== window.location.origin) return;
        const data = event.data;
        if (!data || typeof data !== "object") return;
        if (data.type === "NOON_AUTH_RESULT" || data.type === "NOON_EXT_PONG") {
          const requestId = data.requestId;
          if (!requestId || !state.pendingAuth.has(requestId)) return;
          const resolve = state.pendingAuth.get(requestId);
          state.pendingAuth.delete(requestId);
          resolve({
            ok: !!data.ok,
            error: data.error || null,
            cleared: !!data.cleared,
          });
        }
      });

      return {
        detectExtensionInstalled,
        connectExtension,
        clearExtensionTokens,
      };
    },
  };
})();
