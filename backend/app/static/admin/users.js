(() => {
  const U = window.AdminUtil;
  const state = {
    users: [],
    visible: false,
  };

  const el = {
    panel: document.getElementById("users-panel"),
    list: document.getElementById("users-list"),
    empty: document.getElementById("users-empty"),
    form: document.getElementById("users-create-form"),
    email: document.getElementById("users-email"),
    password: document.getElementById("users-password"),
    role: document.getElementById("users-role"),
    count: document.getElementById("users-count"),
    ownerFilterWrap: document.getElementById("owner-filter-wrap"),
    ownerFilter: document.getElementById("owner-filter"),
  };

  async function reloadOwnerFilter() {
    const adminState = window.AdminState;
    if (!el.ownerFilterWrap || !el.ownerFilter || !adminState) return;
    const isAdmin = window.AdminAuth && window.AdminAuth.isSuperAdmin();
    el.ownerFilterWrap.classList.toggle("hidden", !isAdmin);
    if (!isAdmin) {
      adminState.ownerFilter = "";
      if (window.AdminSSE && typeof window.AdminSSE.setFilterUserId === "function") {
        window.AdminSSE.setFilterUserId(null);
      }
      return;
    }
    try {
      const data = await U.api("/users?limit=200");
      const users = data.users || [];
      const current = adminState.ownerFilter;
      el.ownerFilter.innerHTML =
        `<option value="">All users</option>` +
        users
          .map(
            (u) =>
              `<option value="${U.escapeHtml(u.id)}">${U.escapeHtml(u.email)}</option>`,
          )
          .join("");
      el.ownerFilter.value = users.some((u) => u.id === current) ? current : "";
      adminState.ownerFilter = el.ownerFilter.value;
    } catch (_) {
      /* ignore */
    }
  }

  function setVisible(visible) {
    state.visible = !!visible;
    if (el.panel) el.panel.classList.toggle("hidden", !state.visible);
    if (state.visible) {
      loadUsers();
      reloadOwnerFilter();
    } else if (el.ownerFilterWrap) {
      el.ownerFilterWrap.classList.add("hidden");
    }
  }

  function showMsg(ok, message) {
    if (ok && window.AdminUI && window.AdminUI.showOk) window.AdminUI.showOk(message);
    if (!ok && window.AdminUI && window.AdminUI.showError) window.AdminUI.showError(message);
  }

  function render() {
    if (!el.list) return;
    if (el.count) el.count.textContent = `${state.users.length} users`;
    if (!state.users.length) {
      el.list.innerHTML = "";
      if (el.empty) el.empty.classList.remove("hidden");
      return;
    }
    if (el.empty) el.empty.classList.add("hidden");
    el.list.innerHTML = state.users
      .map((user) => {
        const active = user.is_active;
        return `<div class="user-item" data-user-id="${U.escapeHtml(user.id)}">
          <div class="user-main">
            <div class="name">${U.escapeHtml(user.email)}</div>
            <div class="counts">${U.badge(user.role)}${U.badge(active ? "active" : "inactive")}</div>
          </div>
          <div class="user-actions">
            <button type="button" class="btn-text" data-reset="${U.escapeHtml(user.id)}">Reset password</button>
            <button type="button" class="btn-text" data-toggle="${U.escapeHtml(user.id)}" data-active="${active ? "1" : "0"}">${
              active ? "Deactivate" : "Activate"
            }</button>
          </div>
        </div>`;
      })
      .join("");
  }

  async function loadUsers() {
    if (!state.visible) return;
    try {
      const data = await U.api("/users?limit=200");
      state.users = data.users || [];
      render();
    } catch (err) {
      showMsg(false, err.message);
    }
  }

  async function createUser(event) {
    event.preventDefault();
    if (!el.email || !el.password) return;
    try {
      await U.api("/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: el.email.value.trim(),
          password: el.password.value,
          role: (el.role && el.role.value) || "user",
        }),
      });
      el.form.reset();
      if (el.role) el.role.value = "user";
      showMsg(true, "User created");
      await loadUsers();
      await reloadOwnerFilter();
    } catch (err) {
      showMsg(false, err.message);
    }
  }

  async function resetPassword(userId) {
    const password = window.prompt("New password (min 6 chars)");
    if (!password) return;
    try {
      await U.api(`/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      showMsg(true, "Password updated");
    } catch (err) {
      showMsg(false, err.message);
    }
  }

  async function toggleActive(userId, currentlyActive) {
    try {
      if (currentlyActive) {
        await U.api(`/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
        showMsg(true, "User deactivated");
      } else {
        await U.api(`/users/${encodeURIComponent(userId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: true }),
        });
        showMsg(true, "User activated");
      }
      await loadUsers();
    } catch (err) {
      showMsg(false, err.message);
    }
  }

  if (el.form) el.form.addEventListener("submit", createUser);
  if (el.list) {
    el.list.addEventListener("click", (event) => {
      const resetBtn = event.target.closest("[data-reset]");
      if (resetBtn) {
        resetPassword(resetBtn.getAttribute("data-reset"));
        return;
      }
      const toggleBtn = event.target.closest("[data-toggle]");
      if (toggleBtn) {
        toggleActive(
          toggleBtn.getAttribute("data-toggle"),
          toggleBtn.getAttribute("data-active") === "1",
        );
      }
    });
  }
  if (el.ownerFilter) {
    el.ownerFilter.addEventListener("change", async () => {
      if (!window.AdminState) return;
      window.AdminState.ownerFilter = el.ownerFilter.value || "";
      if (window.AdminSSE && typeof window.AdminSSE.setFilterUserId === "function") {
        window.AdminSSE.setFilterUserId(window.AdminState.ownerFilter || null);
      }
      if (window.AdminUI && typeof window.AdminUI.loadBatches === "function") {
        await window.AdminUI.loadBatches({ keepSelection: false });
      }
    });
  }
  window.addEventListener("noon-auth-changed", async (event) => {
    const detail = event.detail || {};
    if (!detail.authenticated) {
      setVisible(false);
      if (window.AdminState) window.AdminState.ownerFilter = "";
      return;
    }
    setVisible(detail.role === "super_admin");
    if (detail.role === "super_admin") await reloadOwnerFilter();
  });

  window.AdminUsers = { setVisible, loadUsers, reloadOwnerFilter };
})();
