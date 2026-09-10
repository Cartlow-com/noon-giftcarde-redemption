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
    profileMenu: document.getElementById("profile-menu"),
    profileBtn: document.getElementById("btn-profile"),
    profileDropdown: document.getElementById("profile-dropdown"),
    profileAvatar: document.getElementById("profile-avatar"),
    profileEmail: document.getElementById("profile-email"),
    profileRole: document.getElementById("profile-role"),
    signout: document.getElementById("btn-signout"),
    connect: document.getElementById("btn-connect-ext"),
    connectPill: document.getElementById("connect-pill"),
    extStatus: document.getElementById("ext-status"),
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
      el.connectPill.textContent =
        kind === "connected" ? "Extension connected" : label;
      el.connectPill.className = `profile-ext-status ${
        kind === "connected" ? "is-ok" : kind === "missing" ? "is-bad" : "is-muted"
      }`;
    }
    if (el.extStatus) {
      const showTop =
        !!state.email && state.role !== "super_admin" && kind === "connected";
      el.extStatus.classList.toggle("hidden", !showTop);
      if (showTop) {
        el.extStatus.textContent = "Extension connected";
        el.extStatus.className = "pill pill-ok";
      }
    }
    if (el.connect) {
      const show =
        !!state.email && state.role !== "super_admin" && kind !== "connected";
      el.connect.classList.toggle("hidden", !show);
      el.connect.disabled = !show || kind === "connecting";
      el.connect.textContent =
        kind === "connecting" ? "Connecting…" : "Connect extension";
    }
  }

  function setProfileOpen(open) {
    if (!el.profileDropdown || !el.profileBtn) return;
    el.profileDropdown.classList.toggle("hidden", !open);
    el.profileBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function renderSession(email, role) {
    state.email = email || "";
    state.role = role || "user";
    document.body.classList.toggle("is-super-admin", state.role === "super_admin");
    if (el.profileMenu) el.profileMenu.classList.toggle("hidden", !state.email);
    if (el.profileEmail) el.profileEmail.textContent = state.email || "";
    if (el.profileRole) {
      el.profileRole.textContent = state.role === "super_admin" ? "Super admin" : "User";
    }
    if (el.profileAvatar) {
      el.profileAvatar.textContent = state.email ? state.email.charAt(0).toUpperCase() : "?";
    }
    if (!state.email) {
      setProfileOpen(false);
      setConnectStatus("idle", "Extension not connected");
    }
    if (window.AdminNav && typeof window.AdminNav.setSuperAdminNav === "function") {
      window.AdminNav.setSuperAdminNav(state.role === "super_admin");
    }
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
    autoConnect,
    connectWithReload,
    clearExtensionTokens,
  } = extension;

  const RETRY_FLAG = "noon_retry_connect";

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

      // Auto-connect logic — only for non-super-admin.
      if ((me.role || "user") !== "super_admin") {
        let retrying = false;
        try {
          retrying = !!sessionStorage.getItem(RETRY_FLAG);
          if (retrying) sessionStorage.removeItem(RETRY_FLAG);
        } catch (_) {}

        if (retrying) {
          // Post-reload retry — use full connect so the user sees the result.
          await connectExtension();
        } else {
          // Normal page load — attempt silently, no noise on failure.
          autoConnect();
        }
      }

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
    if (el.profileBtn) {
      el.profileBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        const open = el.profileDropdown?.classList.contains("hidden");
        setProfileOpen(!!open);
      });
    }
    document.addEventListener("click", (event) => {
      if (!el.profileMenu || el.profileMenu.classList.contains("hidden")) return;
      if (el.profileMenu.contains(event.target)) return;
      setProfileOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      setProfileOpen(false);
    });
    if (el.signout) {
      el.signout.addEventListener("click", async () => {
        setProfileOpen(false);
        const ask = window.AdminConfirm?.ask;
        const ok = ask
          ? await ask({
              title: "Sign out?",
              message: "You will need to sign in again to use the dashboard.",
              okLabel: "Sign out",
            })
          : false;
        if (!ok) return;
        await signOut();
      });
    }
    if (el.connect) {
      el.connect.addEventListener("click", async () => {
        if (state.extensionConnected) return;
        setProfileOpen(false);
        await connectWithReload();
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
    autoConnect: autoConnect,
    connectWithReload: connectWithReload,
    clearExtensionTokens: clearExtensionTokens,
  };
})();
