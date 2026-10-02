(() => {
  const U = window.AdminUtil;

  const STAGE_OPTIONS = [
    "pending",
    "running",
    "success",
    "failed",
    "skipped",
    "already_redeemed",
    "payment_issue",
  ];
  const ROW_OPTIONS = ["pending", "in_progress", "completed", "partial", "failed"];

  const el = {
    modal: document.getElementById("row-edit-modal"),
    form: document.getElementById("row-edit-form"),
    title: document.getElementById("row-edit-title"),
    error: document.getElementById("row-edit-error"),
    cancel: document.getElementById("row-edit-cancel"),
    save: document.getElementById("row-edit-save"),
    email: document.getElementById("row-edit-email"),
    password: document.getElementById("row-edit-password"),
    giftCard: document.getElementById("row-edit-gift-card"),
    pin: document.getElementById("row-edit-pin"),
    productUrl: document.getElementById("row-edit-product-url"),
    quantity: document.getElementById("row-edit-quantity"),
    couponCode: document.getElementById("row-edit-coupon-code"),
    faceValue: document.getElementById("row-edit-face-value"),
    loginStatus: document.getElementById("row-edit-login-status"),
    redeemStatus: document.getElementById("row-edit-redeem-status"),
    purchaseStatus: document.getElementById("row-edit-purchase-status"),
    status: document.getElementById("row-edit-status"),
  };

  let editingRowId = null;

  function fillSelect(select, options, current) {
    if (!select) return;
    const values = options.slice();
    if (current && !values.includes(current)) values.unshift(current);
    select.innerHTML = values
      .map((value) => {
        const selected = value === current ? "selected" : "";
        return `<option value="${U.escapeHtml(value)}" ${selected}>${U.escapeHtml(U.formatStatus(value))}</option>`;
      })
      .join("");
  }

  function setError(message) {
    if (!el.error) return;
    if (!message) {
      el.error.classList.add("hidden");
      el.error.textContent = "";
      return;
    }
    el.error.textContent = message;
    el.error.classList.remove("hidden");
  }

  function close() {
    if (!el.modal) return;
    el.modal.classList.remove("modal-open");
    el.modal.setAttribute("aria-hidden", "true");
    const end = () => {
      el.modal.classList.add("hidden");
      editingRowId = null;
      el.form?.reset();
      setError("");
    };
    const onEnd = (event) => {
      if (event.target !== el.modal) return;
      el.modal.removeEventListener("transitionend", onEnd);
      end();
    };
    el.modal.addEventListener("transitionend", onEnd);
    setTimeout(end, 280);
  }

  function fillFields(row) {
    el.email.value = row.email || "";
    el.giftCard.value = row.gift_card_number || "";
    el.productUrl.value = row.product_url || "";
    el.quantity.value = String(row.quantity || 1);
    if (el.couponCode) el.couponCode.value = row.coupon_code || "";
    el.faceValue.value = row.face_value == null ? "" : String(row.face_value);
    fillSelect(el.loginStatus, STAGE_OPTIONS, row.login_status || "pending");
    fillSelect(el.redeemStatus, STAGE_OPTIONS, row.redeem_status || "pending");
    fillSelect(el.purchaseStatus, STAGE_OPTIONS, row.purchase_status || "pending");
    fillSelect(el.status, ROW_OPTIONS, row.status || "pending");
  }

  async function open(row) {
    if (!el.modal || !row) return;
    editingRowId = row.id;
    setError("");
    if (el.title) el.title.textContent = `Edit row #${row.row_number}`;
    fillFields(row);
    el.password.value = "";
    el.pin.value = "";
    el.modal.classList.remove("hidden");
    el.modal.setAttribute("aria-hidden", "false");
    el.modal.classList.remove("modal-open");
    requestAnimationFrame(() => el.modal.classList.add("modal-open"));
    try {
      const full = await U.api(`/batches/rows/${encodeURIComponent(row.id)}`);
      if (editingRowId !== row.id) return;
      el.password.value = full.password || "";
      el.pin.value = full.gift_card_pin || "";
      fillFields(full);
    } catch (err) {
      setError(err.message || "Could not load credentials");
    }
    el.email?.focus();
  }

  async function save(event) {
    event.preventDefault();
    if (!editingRowId) return;
    const payload = {
      email: el.email.value.trim(),
      gift_card_number: el.giftCard.value.trim(),
      product_url: el.productUrl.value.trim(),
      quantity: Number(el.quantity.value || 1),
      login_status: el.loginStatus.value,
      redeem_status: el.redeemStatus.value,
      purchase_status: el.purchaseStatus.value,
      status: el.status.value,
    };
    const password = el.password.value;
    const pin = el.pin.value.trim();
    if (password) payload.password = password;
    if (pin) payload.gift_card_pin = pin;
    if (el.couponCode) {
      const couponRaw = el.couponCode.value.trim();
      payload.coupon_code = couponRaw === "" ? null : couponRaw;
    }
    const faceRaw = el.faceValue.value.trim();
    if (faceRaw === "") payload.face_value = null;
    else {
      const face = Number(faceRaw);
      if (Number.isNaN(face)) {
        setError("Face value must be a number");
        return;
      }
      payload.face_value = face;
    }
    el.save.disabled = true;
    setError("");
    try {
      await U.api(`/batches/rows/${encodeURIComponent(editingRowId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      close();
      if (window.AdminUI) {
        window.AdminUI.showOk("Row updated");
        await window.AdminUI.loadBatches({ keepSelection: true, silent: true });
      }
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      el.save.disabled = false;
    }
  }

  async function deleteRow(row) {
    if (!row) return;
    const ask = window.AdminConfirm?.ask;
    const ok = ask
      ? await ask({
          title: "Delete row?",
          message: `Delete row #${row.row_number} (${row.email})? This cannot be undone.`,
          okLabel: "Delete row",
          danger: true,
        })
      : false;
    if (!ok) return;
    try {
      await U.api(`/batches/rows/${encodeURIComponent(row.id)}`, { method: "DELETE" });
      const state = window.AdminState;
      if (state) {
        state.selectedIds.delete(row.id);
        if (state.selectedRowId === row.id) state.selectedRowId = null;
      }
      if (window.AdminUI) {
        window.AdminUI.showOk("Row deleted");
        await window.AdminUI.loadBatches({ keepSelection: true, silent: true });
      }
    } catch (err) {
      if (window.AdminUI) window.AdminUI.showError(err.message);
    }
  }

  if (el.form) el.form.addEventListener("submit", save);
  if (el.cancel) el.cancel.addEventListener("click", () => close());
  if (el.modal) {
    el.modal.addEventListener("click", (event) => {
      if (event.target === el.modal) close();
    });
  }
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") return;
      if (!el.modal?.classList.contains("modal-open")) return;
      event.stopImmediatePropagation();
      close();
    },
    true,
  );

  window.AdminRowEdit = { open, deleteRow };
})();
