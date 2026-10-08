(() => {
  const el = {
    overlay: document.getElementById("pw-overlay"),
    copy: document.getElementById("pw-copy"),
    form: document.getElementById("pw-form"),
    username: document.getElementById("pw-username"),
    current: document.getElementById("pw-current"),
    next: document.getElementById("pw-new"),
    confirm: document.getElementById("pw-confirm"),
    submit: document.getElementById("pw-submit"),
    cancel: document.getElementById("pw-cancel"),
    signout: document.getElementById("pw-signout"),
    error: document.getElementById("pw-error"),
    menuItem: document.getElementById("btn-change-password"),
    profileDropdown: document.getElementById("profile-dropdown"),
    profileBtn: document.getElementById("btn-profile"),
    profileEmail: document.getElementById("profile-email"),
  };

  const COPY_FORCED =
    "Your password was set by an admin. Choose your own password to continue.";
  const COPY_OPTIONAL =
    "Other signed-in sessions are signed out; the extension in this Chrome gets the new session.";

  let forced = false;
  let busy = false;

  function setError(message) {
    if (!el.error) return;
    el.error.textContent = message || "";
    el.error.classList.toggle("hidden", !message);
  }

  function isOpen() {
    return !!el.overlay && el.overlay.classList.contains("is-open");
  }

  function open(options) {
    if (!el.overlay || !el.form) return;
    forced = !!(options && options.forced);
    el.form.reset();
    setError("");
    if (el.username) el.username.value = (options && options.email) || "";
    if (el.copy) el.copy.textContent = forced ? COPY_FORCED : COPY_OPTIONAL;
    if (el.cancel) el.cancel.classList.toggle("hidden", forced);
    if (el.signout) el.signout.classList.toggle("hidden", !forced);
    el.overlay.classList.add("is-open");
    el.overlay.setAttribute("aria-hidden", "false");
    if (el.current) el.current.focus();
  }

  function close() {
    if (!el.overlay) return;
    el.overlay.classList.remove("is-open");
    el.overlay.setAttribute("aria-hidden", "true");
    if (el.form) el.form.reset();
    setError("");
    forced = false;
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const current = el.current ? el.current.value : "";
    const next = el.next ? el.next.value : "";
    const confirm = el.confirm ? el.confirm.value : "";
    if (next.length < 8) return setError("New password must be at least 8 characters.");
    if (next !== confirm) return setError("New passwords do not match.");
    if (next === current) return setError("New password must be different from the current one.");

    busy = true;
    if (el.submit) el.submit.disabled = true;
    setError("");
    try {
      const body = await window.AdminUtil.api("/login/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      close();
      await window.AdminAuth.applyTokens(body);
      if (window.AdminUI && window.AdminUI.showOk) window.AdminUI.showOk("Password changed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password");
    } finally {
      busy = false;
      if (el.submit) el.submit.disabled = false;
    }
  }

  if (el.form) el.form.addEventListener("submit", submit);
  if (el.cancel) el.cancel.addEventListener("click", () => close());
  if (el.signout) {
    el.signout.addEventListener("click", () => {
      close();
      window.AdminAuth.signOut();
    });
  }
  if (el.menuItem) {
    el.menuItem.addEventListener("click", () => {
      if (el.profileDropdown) el.profileDropdown.classList.add("hidden");
      if (el.profileBtn) el.profileBtn.setAttribute("aria-expanded", "false");
      open({ forced: false, email: el.profileEmail ? el.profileEmail.textContent : "" });
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen() && !forced) close();
  });

  window.AdminPassword = { open, close, isOpen };
})();
