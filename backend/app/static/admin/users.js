(() => {
  const U = window.AdminUtil;
  const state = { users: [] };

  const el = {
    list: document.getElementById("users-list"),
    empty: document.getElementById("users-empty"),
    form: document.getElementById("users-create-form"),
    email: document.getElementById("users-email"),
    password: document.getElementById("users-password"),
    role: document.getElementById("users-role"),
    count: document.getElementById("users-count"),
  };

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
    const selfEmail = (document.getElementById("profile-email")?.textContent || "").toLowerCase();
    el.list.innerHTML = state.users
      .map((user) => {
        const active = user.is_active;
        const forced = !!user.must_change_password;
        const forceBtn =
          active && user.email.toLowerCase() !== selfEmail
            ? `<button type="button" class="btn-text" data-force="${U.escapeHtml(user.id)}" data-forced="${forced ? "1" : "0"}" data-email="${U.escapeHtml(user.email)}">${
                forced ? "Cancel forced change" : "Force password change"
              }</button>`
            : "";
        return `<tr data-user-id="${U.escapeHtml(user.id)}">
          <td>
            <button type="button" class="linkish" data-open-user="${U.escapeHtml(user.id)}" data-email="${U.escapeHtml(user.email)}">${U.escapeHtml(user.email)}</button>
          </td>
          <td>${U.badge(user.role)}</td>
          <td>${U.badge(active ? "active" : "inactive")}${
            active && user.must_change_password
              ? ` <span class="badge pending" title="Signs in with an admin-set password and must change it">Must change password</span>`
              : ""
          }</td>
          <td class="users-actions-cell">
            <button type="button" class="btn-text" data-open-user="${U.escapeHtml(user.id)}" data-email="${U.escapeHtml(user.email)}">View data</button>
            <button type="button" class="btn-text" data-reset="${U.escapeHtml(user.id)}" data-email="${U.escapeHtml(user.email)}">Reset password</button>
            ${forceBtn}
            <button type="button" class="btn-text" data-toggle="${U.escapeHtml(user.id)}" data-active="${active ? "1" : "0"}">${
              active ? "Deactivate" : "Activate"
            }</button>
          </td>
        </tr>`;
      })
      .join("");
  }

  async function loadUsers() {
    if (!(window.AdminAuth && window.AdminAuth.isSuperAdmin())) return;
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
    } catch (err) {
      showMsg(false, err.message);
    }
  }

  function resetPassword(userId, email) {
    const selfEmail = (document.getElementById("profile-email")?.textContent || "").toLowerCase();
    window.AdminResetPassword.open({
      id: userId,
      email,
      isSelf: email.toLowerCase() === selfEmail,
      onDone: loadUsers,
    });
  }

  async function setForcedChange(userId, email, force) {
    if (force) {
      const ask = window.AdminConfirm?.ask;
      const ok = ask
        ? await ask({
            title: "Force password change?",
            message: `${email} is signed out now and must choose a new password at next sign-in.`,
            okLabel: "Force change",
          })
        : false;
      if (!ok) return;
    }
    try {
      await U.api(`/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ must_change_password: force }),
      });
      showMsg(true, force ? "User must change password at next sign-in" : "Forced change cancelled");
      await loadUsers();
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
      const openBtn = event.target.closest("[data-open-user]");
      if (openBtn) {
        const id = openBtn.getAttribute("data-open-user");
        const email = openBtn.getAttribute("data-email") || "";
        if (window.AdminNav) window.AdminNav.openUserBatches(id, email);
        return;
      }
      const resetBtn = event.target.closest("[data-reset]");
      if (resetBtn) {
        resetPassword(resetBtn.getAttribute("data-reset"), resetBtn.getAttribute("data-email") || "");
        return;
      }
      const forceBtn = event.target.closest("[data-force]");
      if (forceBtn) {
        setForcedChange(
          forceBtn.getAttribute("data-force"),
          forceBtn.getAttribute("data-email") || "",
          forceBtn.getAttribute("data-forced") !== "1",
        );
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

  window.addEventListener("noon-auth-changed", (event) => {
    const detail = event.detail || {};
    if (detail.authenticated && detail.role === "super_admin") loadUsers();
  });

  // Compat stubs — nav owns visibility now
  function setVisible(visible) {
    if (window.AdminNav) window.AdminNav.setSuperAdminNav(!!visible);
  }
  function reloadOwnerFilter() {
    if (window.AdminNav) window.AdminNav.updateUserBanner();
  }

  window.AdminUsers = { setVisible, loadUsers, reloadOwnerFilter };
})();
