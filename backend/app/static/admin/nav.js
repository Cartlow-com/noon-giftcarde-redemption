(() => {
  const state = { view: "batches", closing: false };

  const el = {
    navBatches: document.getElementById("nav-batches"),
    navUsers: document.getElementById("nav-users"),
    viewBatches: document.getElementById("view-batches"),
    viewUsers: document.getElementById("view-users"),
    navItems: document.querySelectorAll(".nav-item[data-view]"),
    modalBar: document.getElementById("user-data-modal-bar"),
    modalTitle: document.getElementById("user-data-modal-title"),
    closeModal: document.getElementById("btn-close-user-data"),
  };

  function isSuper() {
    return !!(window.AdminAuth && window.AdminAuth.isSuperAdmin());
  }

  function setSuperAdminNav(isSuperAdmin) {
    if (el.navUsers) el.navUsers.classList.toggle("hidden", !isSuperAdmin);
    if (el.navBatches) el.navBatches.classList.toggle("hidden", !!isSuperAdmin);
    if (isSuperAdmin) {
      showView("users");
      closeUserDataModal(true);
    } else if (state.view === "users") {
      showView("batches");
    }
  }

  function showView(view) {
    if (isSuper() && view === "batches") return;
    state.view = view === "users" ? "users" : "batches";
    if (el.viewBatches && !isSuper()) {
      el.viewBatches.classList.toggle("hidden", state.view !== "batches");
      el.viewBatches.classList.remove("modal-open");
    }
    if (el.viewUsers) el.viewUsers.classList.toggle("hidden", state.view !== "users");
    el.navItems.forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-view") === state.view);
    });
    if (state.view === "users" && window.AdminUsers) window.AdminUsers.loadUsers();
    if (state.view === "batches" && window.AdminUI && window.AdminUI.loadBatches) {
      window.AdminUI.loadBatches({ silent: true });
    }
  }

  function updateUserBanner() {}

  function clearOwnerFilter() {
    if (window.AdminState) {
      window.AdminState.ownerFilter = "";
      window.AdminState.ownerFilterEmail = "";
    }
    if (window.AdminSSE && typeof window.AdminSSE.setFilterUserId === "function") {
      window.AdminSSE.setFilterUserId(null);
    }
  }

  function closeUserDataModal(immediate) {
    if (!el.viewBatches) return;
    if (!el.viewBatches.classList.contains("modal-open") && !el.viewBatches.classList.contains("hidden")) {
      if (isSuper()) clearOwnerFilter();
      return;
    }
    if (immediate || !isSuper()) {
      el.viewBatches.classList.remove("modal-open");
      if (isSuper()) el.viewBatches.classList.add("hidden");
      if (el.modalBar) el.modalBar.classList.add("hidden");
      clearOwnerFilter();
      state.closing = false;
      return;
    }
    if (state.closing) return;
    state.closing = true;
    el.viewBatches.classList.remove("modal-open");
    const finish = () => {
      if (state.closing !== true) return;
      state.closing = false;
      el.viewBatches.classList.add("hidden");
      if (el.modalBar) el.modalBar.classList.add("hidden");
      clearOwnerFilter();
    };
    const onEnd = (event) => {
      if (event.target !== el.viewBatches) return;
      el.viewBatches.removeEventListener("transitionend", onEnd);
      finish();
    };
    el.viewBatches.addEventListener("transitionend", onEnd);
    setTimeout(finish, 360);
  }

  async function openUserBatches(userId, email) {
    if (!window.AdminState || !el.viewBatches) return;
    state.closing = false;
    window.AdminState.ownerFilter = userId || "";
    window.AdminState.ownerFilterEmail = email || "";
    if (window.AdminSSE && typeof window.AdminSSE.setFilterUserId === "function") {
      window.AdminSSE.setFilterUserId(userId || null);
    }
    if (el.modalTitle) {
      el.modalTitle.textContent = email ? `Batches · ${email}` : "Batches";
    }
    if (el.modalBar) el.modalBar.classList.remove("hidden");
    el.viewBatches.classList.remove("hidden");
    el.viewBatches.classList.remove("modal-open");
    // Double rAF so the closed styles paint before animating open.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.viewBatches.classList.add("modal-open");
      });
    });
    if (window.AdminUI && typeof window.AdminUI.loadBatches === "function") {
      await window.AdminUI.loadBatches({ keepSelection: false });
    }
  }

  async function clearUserFilter() {
    closeUserDataModal();
  }

  el.navItems.forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.getAttribute("data-view")));
  });
  if (el.closeModal) el.closeModal.addEventListener("click", () => closeUserDataModal());
  if (el.viewBatches) {
    el.viewBatches.addEventListener("click", (event) => {
      if (!isSuper() || !el.viewBatches.classList.contains("modal-open")) return;
      if (event.target === el.viewBatches) closeUserDataModal();
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (document.getElementById("confirm-modal")?.classList.contains("modal-open")) return;
    if (document.getElementById("row-runs-modal")?.classList.contains("modal-open")) return;
    if (el.viewBatches && el.viewBatches.classList.contains("modal-open")) {
      closeUserDataModal();
    }
  });

  window.addEventListener("noon-auth-changed", (event) => {
    const detail = event.detail || {};
    setSuperAdminNav(!!detail.authenticated && detail.role === "super_admin");
    if (!detail.authenticated) {
      closeUserDataModal(true);
      showView("batches");
    }
  });

  window.AdminNav = {
    showView,
    openUserBatches,
    clearUserFilter,
    closeUserDataModal,
    updateUserBanner,
    setSuperAdminNav,
    getView() {
      return state.view;
    },
  };
})();
