(() => {
  const RETRY_FLAG = "noon_retry_connect";

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
        state.extensionConnected = !!(result && result.hasToken);
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
        if (!result.ok || !result.hasToken) {
          setConnectStatus("missing", "Connect failed");
          if (window.AdminUI && window.AdminUI.showError) {
            window.AdminUI.showError(
              result.error || "Extension did not store the dashboard token",
            );
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

      // Silent auto-connect — called automatically after sign-in/page-load.
      // Never shows error toasts; callers check state.extensionConnected after.
      async function autoConnect() {
        if (!state.accessToken || state.role === "super_admin") return false;
        try {
          return await connectExtension();
        } catch (_) {
          return false;
        }
      }

      // Called by the "Connect extension" button.
      // If the bridge is not injected (extension not loaded in this Chrome yet),
      // sets a sessionStorage retry flag and reloads the page once so Chrome
      // injects dashboardBridge.js fresh, then auto-connect fires on boot.
      async function connectWithReload() {
        if (!state.accessToken) {
          setConnectStatus("missing", "Sign in first");
          return;
        }
        // Check whether the bridge content script is present at all.
        const installed = detectExtensionInstalled() || (await pingExtension());
        if (!installed) {
          // Extension truly not loaded in this Chrome — tell the user, no reload.
          setConnectStatus(
            "missing",
            "Extension not found — load unpacked in this Chrome",
          );
          if (window.AdminUI && window.AdminUI.showError) {
            window.AdminUI.showError(
              "Extension not detected. Load Noon Automation in chrome://extensions, then click Connect extension.",
            );
          }
          return;
        }
        // Bridge is present — try a normal connect first.
        const ok = await connectExtension();
        if (ok) return;
        // Reload once so Chrome re-injects the bridge fresh. Guard against a
        // second reload by checking if we already retried this session.
        let alreadyRetried = false;
        try { alreadyRetried = !!sessionStorage.getItem(RETRY_FLAG); } catch (_) {}
        if (alreadyRetried) {
          setConnectStatus("missing", "Connect failed — try reloading manually");
          return;
        }
        try {
          sessionStorage.setItem(RETRY_FLAG, "1");
        } catch (_) {}
        window.location.reload();
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
            hasToken: !!data.hasToken,
            apiBaseUrl: data.apiBaseUrl || null,
          });
        }
      });

      return {
        detectExtensionInstalled,
        pingExtension,
        connectExtension,
        autoConnect,
        connectWithReload,
        clearExtensionTokens,
      };
    },
  };
})();
