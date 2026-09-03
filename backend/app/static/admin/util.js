window.AdminUtil = {
  async api(path) {
    const response = await fetch(path);
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = await response.json();
        if (body.detail) detail = body.detail;
      } catch (_) {}
      throw new Error(detail || `Request failed (${response.status})`);
    }
    return response.json();
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
};
