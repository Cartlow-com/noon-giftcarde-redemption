(() => {
  // Profile menu (avatar, email, role) + extension connect status in the top bar.
  window.NoonAuthProfile = {
    attach({ state, onSignOut, onConnect }) {
      const el = {
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
          await onSignOut();
        });
      }
      if (el.connect) {
        el.connect.addEventListener("click", async () => {
          if (state.extensionConnected) return;
          setProfileOpen(false);
          await onConnect();
        });
      }

      return { setConnectStatus, setProfileOpen, renderSession };
    },
  };
})();
