window.AdminUtil = {
  async api(path, init) {
    const options = Object.assign({}, init || {}, { cache: "no-store" });
    const response = await fetch(path, options);
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

  shotBlock(row, kind, label) {
    const field = {
      before_redeem: "screenshot_before_redeem",
      after_redeem: "screenshot_after_redeem",
      after_order: "screenshot_after_order",
      on_failure: "screenshot_on_failure",
    }[kind];
    if (!row[field]) {
      return `<div class="shot-card"><div class="label">${this.escapeHtml(label)}</div><div class="missing">No screenshot</div></div>`;
    }
    const src = `/batches/rows/${encodeURIComponent(row.id)}/screenshots/${encodeURIComponent(kind)}`;
    return `<div class="shot-card"><div class="label">${this.escapeHtml(label)}</div><a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="${this.escapeHtml(label)}" loading="lazy" /></a></div>`;
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

  buildRowDetailHtml(row, emails, expectedSeconds) {
    return `
      <div class="detail-section">
        <div class="stage-row">
          ${this.stageBadge("login", row.login_status)}
          ${this.stageBadge("redeem", row.redeem_status)}
          ${this.stageBadge("order", row.purchase_status)}
          ${this.badge(row.status)}
        </div>
        ${this.kv("Email", row.email)}
        ${this.kv("Password", row.password)}
        ${this.kv("Gift card", row.gift_card_number)}
        ${this.kv("PIN", row.gift_card_pin)}
        ${this.kv("Product", row.product_url)}
        ${this.kv("Qty", row.quantity)}
        ${this.kv("Order ID", row.order_id)}
        ${this.kv("Time taken", this.formatDuration(row.duration_ms))}
        ${this.kv("Expected", this.formatDuration(expectedSeconds * 1000))}
      </div>
      <div class="detail-section">
        <h3>Stages</h3>
        ${this.kv("Login at", this.formatTime(row.login_at))}
        ${this.kv("Login error", row.login_error)}
        ${this.kv("Redeemed at", this.formatTime(row.redeemed_at))}
        ${this.kv("Redeem error", row.redeem_error)}
        ${this.kv("Balance before", row.balance_before)}
        ${this.kv("Balance after", row.balance_after)}
        ${this.kv("Balance delta", row.balance_delta)}
        ${this.kv("Purchased at", this.formatTime(row.purchased_at))}
        ${this.kv("Order error", row.purchase_error)}
      </div>
      <div class="detail-section">
        <h3>Screenshots</h3>
        <div class="shots">
          ${this.shotBlock(row, "before_redeem", "Before redeem")}
          ${this.shotBlock(row, "after_redeem", "After redeem")}
          ${this.shotBlock(row, "after_order", "After order")}
          ${this.shotBlock(row, "on_failure", "On failure")}
        </div>
      </div>
      <div class="detail-section">
        <h3>Emails</h3>
        ${this.renderEmails(emails)}
      </div>`;
  },
};
