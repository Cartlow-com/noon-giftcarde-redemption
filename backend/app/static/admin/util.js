window.AdminUtil = {
  async api(path, init) {
    const options = Object.assign({}, init || {}, { cache: "no-store" });
    const headers = new Headers(options.headers || {});
    const token =
      (window.AdminAuth && typeof window.AdminAuth.getAccessToken === "function"
        ? window.AdminAuth.getAccessToken()
        : localStorage.getItem("noon_access_token")) || "";
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    options.headers = headers;
    const response = await fetch(path, options);
    if (response.status === 401) {
      if (window.AdminAuth && typeof window.AdminAuth.handleUnauthorized === "function") {
        window.AdminAuth.handleUnauthorized();
      } else {
        localStorage.removeItem("noon_access_token");
        localStorage.removeItem("noon_refresh_token");
      }
    }
    if (response.status === 204) return null;
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = await response.json();
        if (body.detail) detail = body.detail;
      } catch (_) {}
      throw new Error(detail || `Request failed (${response.status})`);
    }
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text);
  },

  escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  },

  formatStatus(value) {
    return String(value || "—").replace(/_/g, " ");
  },

  formatTime(value) {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString();
    } catch (_) {
      return String(value);
    }
  },

  formatDuration(ms) {
    if (ms == null || Number.isNaN(Number(ms))) return "—";
    const total = Math.max(0, Math.round(Number(ms) / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  },

  badge(status) {
    const key = String(status || "pending").replace(/\s+/g, "_");
    return `<span class="badge ${key}">${this.escapeHtml(this.formatStatus(status))}</span>`;
  },

  kv(label, value) {
    if (value == null || value === "") return "";
    return `<div class="kv"><dt>${this.escapeHtml(label)}</dt><dd>${this.escapeHtml(value)}</dd></div>`;
  },

  shotBlock(row, kind, label, attemptId) {
    const field = {
      before_redeem: "screenshot_before_redeem",
      after_redeem: "screenshot_after_redeem",
      after_order: "screenshot_after_order",
      on_failure: "screenshot_on_failure",
    }[kind];
    if (!row[field]) {
      return `<div class="shot-card"><div class="label">${this.escapeHtml(label)}</div><div class="missing">No screenshot</div></div>`;
    }
    let src = `/batches/rows/${encodeURIComponent(row.id)}/screenshots/${encodeURIComponent(kind)}`;
    if (attemptId) {
      src += `?attempt_id=${encodeURIComponent(attemptId)}`;
    }
    return `<div class="shot-card"><div class="label">${this.escapeHtml(label)}</div><a href="${src}" data-shot-link="${src}" target="_blank" rel="noopener"><img data-shot-src="${src}" alt="${this.escapeHtml(label)}" loading="lazy" /></a></div>`;
  },

  async hydrateScreenshots(root) {
    if (!root) return;
    const imgs = root.querySelectorAll("img[data-shot-src]");
    for (const img of imgs) {
      const path = img.getAttribute("data-shot-src");
      if (!path) continue;
      try {
        const options = { cache: "no-store" };
        const headers = new Headers();
        const token =
          (window.AdminAuth && typeof window.AdminAuth.getAccessToken === "function"
            ? window.AdminAuth.getAccessToken()
            : localStorage.getItem("noon_access_token")) || "";
        if (token) headers.set("Authorization", `Bearer ${token}`);
        const response = await fetch(path, { ...options, headers });
        if (response.status === 401) {
          if (window.AdminAuth && typeof window.AdminAuth.handleUnauthorized === "function") {
            window.AdminAuth.handleUnauthorized();
          }
          throw new Error("Authentication required");
        }
        if (!response.ok) throw new Error(`Screenshot failed (${response.status})`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        img.src = url;
        img.removeAttribute("data-shot-src");
        const link = img.closest("a[data-shot-link]");
        if (link) {
          link.href = url;
          link.removeAttribute("data-shot-link");
        }
      } catch (_) {
        const card = img.closest(".shot-card");
        if (card) {
          const label = card.querySelector(".label");
          const labelText = label ? label.textContent : "Screenshot";
          card.innerHTML = `<div class="label">${this.escapeHtml(labelText)}</div><div class="missing">Could not load (auth)</div>`;
        }
      }
    }
  },

  renderEmails(items) {
    if (!items.length) {
      return `<p class="empty" style="padding:0.5rem 0">No emails sent for this row</p>`;
    }
    return items
      .map((item) => {
        const err = item.error
          ? `<div class="meta" style="color:var(--danger)">${this.escapeHtml(item.error)}</div>`
          : "";
        return `<article class="email-item"><div class="subject">${this.escapeHtml(item.subject)}</div><div class="meta">${this.badge(item.status)} · ${this.escapeHtml(item.template_key)} · to ${this.escapeHtml(item.to_email)} · ${this.escapeHtml(this.formatTime(item.created_at))}</div>${err}<pre>${this.escapeHtml(item.body_text || "")}</pre></article>`;
      })
      .join("");
  },

  stageBadge(label, status) {
    const key = String(status || "pending").replace(/\s+/g, "_");
    return `<span class="badge ${key}">${this.escapeHtml(label)}: ${this.escapeHtml(this.formatStatus(status))}</span>`;
  },

  overlayRowWithAttempt(row, attempt) {
    if (!row || !attempt) return row;
    return Object.assign({}, row, {
      login_status: attempt.login_status,
      redeem_status: attempt.redeem_status,
      purchase_status: attempt.purchase_status,
      status: attempt.status,
      login_error: attempt.login_error,
      redeem_error: attempt.redeem_error,
      purchase_error: attempt.purchase_error,
      order_id: attempt.order_id || row.order_id,
      duration_ms: attempt.duration_ms != null ? attempt.duration_ms : row.duration_ms,
      login_at: attempt.created_at,
      redeemed_at: null,
      purchased_at: null,
      balance_before: row.balance_before,
      balance_after: row.balance_after,
      balance_delta: row.balance_delta,
      screenshot_before_redeem:
        attempt.screenshot_before_redeem || null,
      screenshot_after_redeem: attempt.screenshot_after_redeem || null,
      screenshot_after_order: attempt.screenshot_after_order || null,
      screenshot_on_failure: attempt.screenshot_on_failure || null,
    });
  },

  buildRowDetailHtml(row, emails, expectedSeconds, attempts, selectedAttemptId) {
    const attemptItems = Array.isArray(attempts) ? attempts : [];
    const selected =
      attemptItems.find((a) => a.id === selectedAttemptId) || attemptItems[0] || null;
    const view = this.overlayRowWithAttempt(row, selected) || row;
    const viewingLabel = selected
      ? `Viewing Run #${selected.attempt_number}`
      : "Viewing latest row";
    const attemptsHtml = !attemptItems.length
      ? `<p class="empty" style="padding:0.5rem 0">No run history yet</p>`
      : attemptItems
          .map((a) => {
            const err =
              a.login_error || a.redeem_error || a.purchase_error || a.message || "";
            const active = selected && a.id === selected.id ? " active" : "";
            return `<button type="button" class="run-item${active}" data-attempt-id="${this.escapeHtml(a.id)}"><div class="subject">Run #${a.attempt_number} · ${this.escapeHtml(a.outcome || a.status)}</div><div class="meta">${this.badge(a.login_status)} ${this.badge(a.redeem_status)} ${this.badge(a.purchase_status)} ${this.badge(a.status)} · ${this.escapeHtml(this.formatTime(a.created_at))} · ${this.escapeHtml(this.formatDuration(a.duration_ms))}</div>${err ? `<pre>${this.escapeHtml(err)}</pre>` : ""}${a.order_id ? `<div class="meta">Order ${this.escapeHtml(a.order_id)}</div>` : ""}</button>`;
          })
          .join("");
    return `
      <div class="detail-section">
        <p class="run-viewing muted">${this.escapeHtml(viewingLabel)}</p>
        <div class="stage-row">
          ${this.stageBadge("login", view.login_status)}
          ${this.stageBadge("redeem", view.redeem_status)}
          ${this.stageBadge("order", view.purchase_status)}
          ${this.badge(view.status)}
        </div>
        ${this.kv("Email", row.email)}
        ${this.kv("Password", "••••••••")}
        ${this.kv("Gift card", row.gift_card_number)}
        ${this.kv("PIN", "••••")}
        ${this.kv("Face value", row.face_value)}
        ${this.kv("Product", row.product_url)}
        ${this.kv("Qty", row.quantity)}
        ${this.kv("Order ID", view.order_id)}
        ${this.kv("Time taken", this.formatDuration(view.duration_ms))}
        ${this.kv("Expected", this.formatDuration(expectedSeconds * 1000))}
      </div>
      <div class="detail-section">
        <h3>Stages</h3>
        ${this.kv("Run at", this.formatTime(selected ? selected.created_at : view.login_at))}
        ${this.kv("Login error", view.login_error)}
        ${this.kv("Redeem error", view.redeem_error)}
        ${this.kv("Balance before", row.balance_before)}
        ${this.kv("Balance after", row.balance_after)}
        ${this.kv("Balance delta", row.balance_delta)}
        ${this.kv("Value match", row.value_match == null ? "—" : row.value_match ? "yes" : "no")}
        ${this.kv("Order error", view.purchase_error)}
        ${selected && selected.message ? this.kv("Message", selected.message) : ""}
      </div>
      <div class="detail-section">
        <h3>Run history</h3>
        <p class="muted run-hint-small">Select a run to see its stages and errors</p>
        ${attemptsHtml}
      </div>
      <div class="detail-section">
        <h3>Screenshots</h3>
        <div class="shots">
          ${this.shotBlock(view, "before_redeem", "Before redeem", selected && selected.id)}
          ${this.shotBlock(view, "after_redeem", "After redeem", selected && selected.id)}
          ${this.shotBlock(view, "after_order", "After order", selected && selected.id)}
          ${this.shotBlock(view, "on_failure", "On failure", selected && selected.id)}
        </div>
      </div>
      <div class="detail-section">
        <h3>Emails</h3>
        ${this.renderEmails(emails)}
      </div>`;
  },

  async checkHealth(healthEl) {
    if (!healthEl) return;
    try {
      const data = await this.api("/health");
      const ok = data.status === "ok";
      healthEl.textContent = ok ? "API online" : "API offline";
      healthEl.className = `pill ${ok ? "pill-ok" : "pill-bad"}`;
    } catch (_) {
      healthEl.textContent = "API offline";
      healthEl.className = "pill pill-bad";
    }
  },

  async fetchRowDetailExtras(rowId) {
    let emails = [];
    let attempts = [];
    let error = null;
    try {
      const data = await this.api(`/emails/history?row_id=${encodeURIComponent(rowId)}&limit=20`);
      emails = data.items || [];
    } catch (err) {
      error = err;
    }
    try {
      const hist = await this.api(`/batches/rows/${encodeURIComponent(rowId)}/attempts?limit=50`);
      attempts = hist.attempts || [];
    } catch (_) {}
    return { emails: emails, attempts: attempts, error: error };
  },

  resolveAttemptId(attempts, selectedId) {
    const items = Array.isArray(attempts) ? attempts : [];
    if (selectedId && items.some((a) => a.id === selectedId)) return selectedId;
    return items[0] ? items[0].id : null;
  },

  async paintRowDetail(container, row, emails, attempts, selectedAttemptId, expectedSeconds) {
    container.innerHTML = this.buildRowDetailHtml(
      row,
      emails,
      expectedSeconds,
      attempts,
      selectedAttemptId,
    );
    await this.hydrateScreenshots(container);
  },
};
