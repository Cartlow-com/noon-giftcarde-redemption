(() => {
  // Admin "Reset password" dialog: generates a strong password the admin copies
  // and sends to the user; optionally requires a change at next sign-in.
  const U = window.AdminUtil;
  const el = {
    modal: document.getElementById("reset-pw-modal"),
    email: document.getElementById("reset-pw-email"),
    value: document.getElementById("reset-pw-value"),
    toggle: document.getElementById("reset-pw-toggle"),
    generate: document.getElementById("reset-pw-generate"),
    copy: document.getElementById("reset-pw-copy"),
    hint: document.getElementById("reset-pw-hint"),
    force: document.getElementById("reset-pw-force"),
    forceLabel: document.querySelector(".reset-pw-force"),
    error: document.getElementById("reset-pw-error"),
    done: document.getElementById("reset-pw-done"),
    cancel: document.getElementById("reset-pw-cancel"),
    ok: document.getElementById("reset-pw-ok"),
  };

  // No look-alikes (0/O, 1/l/I) so the password survives being read aloud or retyped.
  const SETS = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    "!@#$%^&*-_=+?",
  ];
  const LENGTH = 16;

  let current = null; // { id, email, onDone }
  let busy = false;
  let finished = false;

  // Unbiased index in [0, max) from the browser CSPRNG.
  function randomIndex(max) {
    const limit = Math.floor(0x100000000 / max) * max;
    const buf = new Uint32Array(1);
    do {
      crypto.getRandomValues(buf);
    } while (buf[0] >= limit);
    return buf[0] % max;
  }

  function generatePassword() {
    const all = SETS.join("");
    const chars = SETS.map((set) => set[randomIndex(set.length)]);
    while (chars.length < LENGTH) chars.push(all[randomIndex(all.length)]);
    for (let i = chars.length - 1; i > 0; i -= 1) {
      const j = randomIndex(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join("");
  }

  function setError(message) {
    el.error.textContent = message || "";
    el.error.classList.toggle("hidden", !message);
  }

  function setVisible(show) {
    el.value.type = show ? "text" : "password";
    el.toggle.textContent = show ? "Hide" : "Show";
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(el.value.value);
      el.copy.textContent = "Copied";
      setTimeout(() => (el.copy.textContent = "Copy"), 1500);
      return true;
    } catch (_) {
      el.value.select();
      return false;
    }
  }

  function open({ id, email, isSelf, onDone }) {
    if (!el.modal) return;
    current = { id, email, onDone };
    finished = false;
    busy = false;
    el.email.textContent = `Set a new password for ${email}. Send it to them privately.`;
    el.value.value = generatePassword();
    el.value.readOnly = false;
    setVisible(true);
    // Forcing your own change would lock you out of this page (server refuses it too).
    el.force.checked = !isSelf;
    el.force.disabled = !!isSelf;
    el.forceLabel.classList.toggle("hidden", !!isSelf);
    el.generate.classList.remove("hidden");
    el.hint.classList.remove("hidden");
    el.done.classList.add("hidden");
    el.cancel.classList.remove("hidden");
    el.ok.textContent = "Reset password";
    el.ok.disabled = false;
    setError("");
    el.modal.classList.remove("hidden");
    el.modal.setAttribute("aria-hidden", "false");
    void el.modal.offsetWidth; // commit the closed state so the open transition runs
    el.modal.classList.add("modal-open");
    el.ok.focus();
  }

  function close() {
    if (!el.modal || busy) return;
    el.modal.classList.remove("modal-open");
    el.modal.setAttribute("aria-hidden", "true");
    setTimeout(() => {
      el.modal.classList.add("hidden");
      el.value.value = "";
    }, 220);
    const done = finished && current && current.onDone;
    current = null;
    if (done) done();
  }

  async function submit() {
    if (finished) return close();
    if (!current || busy) return;
    const password = el.value.value;
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    const force = el.force.checked && !el.force.disabled;
    busy = true;
    el.ok.disabled = true;
    setError("");
    try {
      await U.api(`/users/${encodeURIComponent(current.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, must_change_password: force }),
      });
      finished = true;
      const copied = await copyPassword();
      el.value.readOnly = true;
      el.generate.classList.add("hidden");
      el.hint.classList.add("hidden");
      el.forceLabel.classList.add("hidden");
      el.cancel.classList.add("hidden");
      el.done.textContent =
        `Password reset${copied ? " and copied to your clipboard" : ""}. ` +
        (force
          ? "They will be asked to choose their own at next sign-in."
          : "They can keep using it.") +
        " It won't be shown again.";
      el.done.classList.remove("hidden");
      el.ok.textContent = "Done";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      busy = false;
      el.ok.disabled = false;
    }
  }

  if (el.modal) {
    el.toggle.addEventListener("click", () => setVisible(el.value.type === "password"));
    el.generate.addEventListener("click", () => {
      el.value.value = generatePassword();
      setError("");
    });
    el.copy.addEventListener("click", copyPassword);
    el.cancel.addEventListener("click", close);
    el.ok.addEventListener("click", submit);
    el.value.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submit();
    });
    el.modal.addEventListener("click", (event) => {
      if (event.target === el.modal) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && el.modal.classList.contains("modal-open")) close();
    });
  }

  window.AdminResetPassword = { open, generatePassword };
})();
