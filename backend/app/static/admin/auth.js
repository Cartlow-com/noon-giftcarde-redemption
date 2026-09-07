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
    role: "user",
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

  function renderSession(email, role) {
    state.email = email || "";
    state.role = role || "user";
    if (el.sessionEmail) {
      if (state.email) {
        const roleLabel = state.role === "super_admin" ? " · super admin" : "";
        el.sessionEmail.textContent = `${state.email}${roleLabel}`;
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
    if (window.AdminUsers && typeof window.AdminUsers.setVisible === "function") {
      window.AdminUsers.setVisible(state.role === "super_admin");
    }
    document.querySelector(".layout")?.classList.toggle(
      "super-admin",
      state.role === "super_admin",
    );
  }

  function emitAuthChange(authenticated, email, role) {
    window.dispatchEvent(
      new CustomEvent("noon-auth-changed", {
        detail: {
          authenticated: !!authenticated,
          email: email || "",
          role: role || "user",
          extensionConnected: state.extensionConnected,
        },
      }),
    );
  }

  function showLogin(message) {
    setBodyLocked(true);
    if (el.overlay) el.overlay.classList.remove("hidden");
    renderSession("", "user");
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
    renderSession("", "user");
  }

  const extension = window.NoonAuthExtension.attach({
    state,
    setConnectStatus,
    emitAuthChange,
    connectTimeoutMs: CONNECT_TIMEOUT_MS,
  });
  const {
    detectExtensionInstalled,
    connectExtension,
    clearExtensionTokens,
  } = extension;

  async function loadSession() {
    if (!state.accessToken) {
      emitAuthChange(false, "", "user");
      showLogin();
      return false;
    }
    try {
      const me = await window.AdminUtil.api("/login/me");
      renderSession(me.email, me.role || "user");
      hideLogin();
      detectExtensionInstalled();
      setConnectStatus(
        state.extensionInstalled ? "idle" : "missing",
        state.extensionInstalled
          ? "Extension ready — click Connect"
          : "Extension not found in this Chrome",
      );
      emitAuthChange(true, me.email, me.role || "user");
      return true;
    } catch (err) {
      clearTokens();
      await clearExtensionTokens();
      emitAuthChange(false, "", "user");
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
    emitAuthChange(false, "", "user");
    showLogin("Signed out.");
  }

  async function handleUnauthorized() {
    clearTokens();
    await clearExtensionTokens();
    emitAuthChange(false, "", "user");
    showLogin("Session expired. Sign in again.");
  }

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
    getRole() {
      return state.role || "user";
    },
    isSuperAdmin() {
      return state.role === "super_admin";
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
