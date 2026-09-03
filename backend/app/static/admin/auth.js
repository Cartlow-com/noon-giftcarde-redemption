(() => {
  const ACCESS_KEY = "noon_access_token";
  const REFRESH_KEY = "noon_refresh_token";
  const CONNECT_TIMEOUT_MS = 4000;

  const el = {
    overlay: document.getElementById("auth-overlay"),
    form: document.getElementById("login-form"),
    email: document.getElementById("login-email"),
    password: document.getElementById("login-password"),
    error: document.getElementById("auth-error"),
    sessionEmail: document.getElementById("session-email"),
    signout: document.getElementById("btn-signout"),
    connect: document.getElementById("btn-connect-ext"),
    connectPill: document.getElementById("connect-pill"),
  };

  const state = {
    accessToken: localStorage.getItem(ACCESS_KEY) || "",
    refreshToken: localStorage.getItem(REFRESH_KEY) || "",
    email: "",
    ready: false,
    extensionInstalled: false,
    extensionConnected: false,
    pendingAuth: new Map(),
  };

  function setBodyLocked(locked) {
    document.body.classList.toggle("auth-locked", !!locked);
  }

  function setError(message) {
    if (!el.error) return;
    if (!message) {
      el.error.textContent = "";
      el.error.classList.add("hidden");
      return;
    }
    el.error.textContent = message;
    el.error.classList.remove("hidden");
  }

  function setConnectStatus(kind, label) {
    state.extensionConnected = kind === "connected";
    if (el.connectPill) {
      el.connectPill.textContent = label;
      el.connectPill.className = `pill ${
        kind === "connected" ? "pill-ok" : kind === "missing" ? "pill-bad" : "pill-muted"
      }`;
      el.connectPill.classList.toggle("hidden", !state.email);
    }
    if (el.connect) {
      const show = !!state.email;
      el.connect.classList.toggle("hidden", !show);
      el.connect.disabled = !show || kind === "connecting";
      el.connect.textContent =
        kind === "connected" ? "Reconnect extension" : "Connect extension";
    }
  }

  function renderSession(email) {
    state.email = email || "";
    if (el.sessionEmail) {
      if (state.email) {
        el.sessionEmail.textContent = state.email;
        el.sessionEmail.classList.remove("hidden");
      } else {
        el.sessionEmail.textContent = "";
        el.sessionEmail.classList.add("hidden");
      }
    }
    if (el.signout) {
      el.signout.classList.toggle("hidden", !state.email);
    }
    if (!state.email) {
      setConnectStatus("idle", "Extension not connected");
      if (el.connect) el.connect.classList.add("hidden");
      if (el.connectPill) el.connectPill.classList.add("hidden");
    }
  }

  function emitAuthChange(authenticated, email) {
    window.dispatchEvent(
      new CustomEvent("noon-auth-changed", {
        detail: {
          authenticated: !!authenticated,
          email: email || "",
          extensionConnected: state.extensionConnected,
        },
      }),
    );
  }

  function showLogin(message) {
    setBodyLocked(true);
    if (el.overlay) el.overlay.classList.remove("hidden");
    renderSession("");
    setError(message || "");
    if (el.email && !el.email.value) {
      el.email.focus();
    } else if (el.password) {
      el.password.focus();
    }
  }

  function hideLogin() {
    setBodyLocked(false);
    if (el.overlay) el.overlay.classList.add("hidden");
    setError("");
  }

  function persistTokens(tokens) {
    state.accessToken = tokens.accessToken || "";
    state.refreshToken = tokens.refreshToken || "";
    if (state.accessToken) {
      localStorage.setItem(ACCESS_KEY, state.accessToken);
    } else {
      localStorage.removeItem(ACCESS_KEY);
    }
    if (state.refreshToken) {
      localStorage.setItem(REFRESH_KEY, state.refreshToken);
    } else {
      localStorage.removeItem(REFRESH_KEY);
    }
  }

  function clearTokens() {
    persistTokens({ accessToken: "", refreshToken: "" });
    renderSession("");
  }

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
      }, CONNECT_TIMEOUT_MS);
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
      window.AdminUI.showOk("Extension onboarded — it can claim your runs on this PC");
    }
    if (window.AdminUI && typeof window.AdminUI.checkExtension === "function") {
      window.AdminUI.checkExtension();
    }
    emitAuthChange(true, state.email);
    return true;
  }

  async function clearExtensionTokens() {
    const requestId = `clear-${Date.now()}`;
    const resultPromise = waitForAuthResult(requestId);
    postToExtension("NOON_AUTH_CLEAR", { requestId });
    await resultPromise;
    state.extensionConnected = false;
  }

  async function loadSession() {
    if (!state.accessToken) {
      emitAuthChange(false, "");
      showLogin();
      return false;
    }
    try {
      const me = await window.AdminUtil.api("/login/me");
      renderSession(me.email);
      hideLogin();
      detectExtensionInstalled();
      setConnectStatus(
        state.extensionInstalled ? "idle" : "missing",
        state.extensionInstalled
          ? "Extension ready — click Connect"
          : "Extension not found in this Chrome",
      );
      emitAuthChange(true, me.email);
      return true;
    } catch (err) {
      clearTokens();
      await clearExtensionTokens();
      emitAuthChange(false, "");
      showLogin("Session expired. Sign in again.");
      return false;
    }
  }

  async function signIn(email, password) {
    setError("");
    const response = await fetch("/login", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email,
        password: password,
      }),
    });
    let body = {};
    try {
      body = await response.json();
    } catch (_) {}
    if (!response.ok) {
      throw new Error(body.detail || response.statusText || "Login failed");
    }
    persistTokens({
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
    });
    return loadSession();
  }

  async function signOut() {
    const refreshToken = state.refreshToken;
    try {
      if (refreshToken) {
        await fetch(
          `/login/session?refresh_token=${encodeURIComponent(refreshToken)}`,
          {
            method: "DELETE",
            cache: "no-store",
          },
        );
      }
    } catch (_) {}
    clearTokens();
    await clearExtensionTokens();
    emitAuthChange(false, "");
    showLogin("Signed out.");
  }

  async function handleUnauthorized() {
    clearTokens();
    await clearExtensionTokens();
    emitAuthChange(false, "");
    showLogin("Session expired. Sign in again.");
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

  async function boot() {
    setBodyLocked(true);
    if (el.form) {
      el.form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!el.email || !el.password) return;
        try {
          await signIn(el.email.value.trim(), el.password.value);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Login failed");
          showLogin(err instanceof Error ? err.message : "Login failed");
        }
      });
    }
    if (el.signout) {
      el.signout.addEventListener("click", async () => {
        await signOut();
      });
    }
    if (el.connect) {
      el.connect.addEventListener("click", async () => {
        await connectExtension();
      });
    }
    if (!state.accessToken) {
      showLogin();
      state.ready = true;
      return;
    }
    await loadSession();
    state.ready = true;
  }

  window.AdminAuth = {
    ready: boot(),
    getAccessToken() {
      return state.accessToken;
    },
    getRefreshToken() {
      return state.refreshToken;
    },
    isAuthenticated() {
      return !!state.accessToken;
    },
    isExtensionConnected() {
      return state.extensionConnected;
    },
    handleUnauthorized: handleUnauthorized,
    connectExtension: connectExtension,
    clearExtensionTokens: clearExtensionTokens,
  };
})();
