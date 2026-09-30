(() => {
  const el = {
    btnConnect:      document.getElementById("btn-gmail-connect"),
    btnDisconnect:   document.getElementById("btn-gmail-disconnect"),
    btnInbox:        document.getElementById("btn-gmail-inbox"),
    // inbox modal
    inboxModal:      document.getElementById("gmail-inbox-modal"),
    inboxBody:       document.getElementById("gmail-inbox-body"),
    inboxSubtitle:   document.getElementById("gmail-inbox-subtitle"),
    btnInboxRefresh: document.getElementById("btn-gmail-inbox-refresh"),
    btnInboxClose:   document.getElementById("btn-gmail-inbox-close"),
    // detail modal
    detailModal:     document.getElementById("gmail-detail-modal"),
    detailBody:      document.getElementById("gmail-detail-body"),
    detailTitle:     document.getElementById("gmail-detail-title"),
    btnDetailClose:  document.getElementById("btn-gmail-detail-close"),
  };

  let _booted = false;

  // -------------------------------------------------------------------------
  // Connection state
  // -------------------------------------------------------------------------

  function setConnected(isConnected, gmailEmail) {
    if (el.btnConnect)    el.btnConnect.classList.toggle("hidden", isConnected);
    if (el.btnInbox)      el.btnInbox.classList.toggle("hidden", !isConnected);
    if (el.btnDisconnect) {
      el.btnDisconnect.classList.toggle("hidden", !isConnected);
      el.btnDisconnect.textContent = isConnected && gmailEmail
        ? `Gmail: ${gmailEmail} — Disconnect`
        : "Gmail ✓ Disconnect";
    }
    if (el.inboxSubtitle && gmailEmail) {
      el.inboxSubtitle.textContent = gmailEmail;
    }
  }

  // -------------------------------------------------------------------------
  // Inbox modal
  // -------------------------------------------------------------------------

  function renderEmails(emails) {
    if (!el.inboxBody) return;
    if (!emails || !emails.length) {
      el.inboxBody.innerHTML = "<p class='empty'>No emails found</p>";
      return;
    }
    el.inboxBody.innerHTML = `
      <table class="data-table gmail-table" style="width:100%;table-layout:fixed">
        <colgroup>
          <col style="width:22%">
          <col style="width:28%">
          <col style="width:18%">
          <col style="width:24%">
          <col style="width:8%">
        </colgroup>
        <thead>
          <tr>
            <th>From</th>
            <th>Subject</th>
            <th>Date</th>
            <th>Preview</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${emails.map((e) => `
            <tr>
              <td title="${window.AdminUtil.escapeHtml(e.from_email)}">${window.AdminUtil.escapeHtml(e.from_email)}</td>
              <td title="${window.AdminUtil.escapeHtml(e.subject)}">${window.AdminUtil.escapeHtml(e.subject)}</td>
              <td>${window.AdminUtil.escapeHtml(e.date)}</td>
              <td title="${window.AdminUtil.escapeHtml(e.snippet)}">${window.AdminUtil.escapeHtml(e.snippet)}</td>
              <td><button class="btn-text gmail-view-btn" data-id="${window.AdminUtil.escapeHtml(e.message_id)}" data-subject="${window.AdminUtil.escapeHtml(e.subject)}">View</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>`;

    el.inboxBody.querySelectorAll(".gmail-view-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        openDetail(btn.dataset.id, btn.dataset.subject);
      });
    });
  }

  function openInbox() {
    if (!el.inboxModal) return;
    el.inboxModal.classList.remove("hidden");
    requestAnimationFrame(() => el.inboxModal.classList.add("modal-open"));
    el.inboxModal.setAttribute("aria-hidden", "false");
    el.inboxBody.innerHTML = "<p class='empty'>Loading…</p>";
    loadEmails();
  }

  function closeInbox() {
    if (!el.inboxModal) return;
    el.inboxModal.classList.remove("modal-open");
    el.inboxModal.setAttribute("aria-hidden", "true");
    setTimeout(() => el.inboxModal.classList.add("hidden"), 250);
  }

  // -------------------------------------------------------------------------
  // Detail modal
  // -------------------------------------------------------------------------

  function renderDetail(email) {
    if (!el.detailBody) return;

    const plain = email.body_plain || "";
    const html  = email.body_html  || "";

    // Prefer HTML but render inside a sandboxed iframe so styles don't leak.
    // Fall back to plain text in a <pre>.
    let bodyHtml;
    if (html) {
      const safe = html
        .replace(/&/g, "&amp;")  // will be set via srcdoc so we need literal HTML
        .replace(/"/g, "&quot;");
      bodyHtml = `<iframe class="gmail-detail-iframe" srcdoc="${safe}" sandbox="allow-same-origin" title="Email body"></iframe>`;
    } else if (plain) {
      bodyHtml = `<pre class="gmail-detail-plain">${window.AdminUtil.escapeHtml(plain)}</pre>`;
    } else {
      bodyHtml = `<p class="empty">No body content</p>`;
    }

    el.detailBody.innerHTML = `
      <div class="gmail-detail-meta">
        <div class="gmail-detail-row"><span class="gmail-detail-label">From</span><span>${window.AdminUtil.escapeHtml(email.from_email)}</span></div>
        <div class="gmail-detail-row"><span class="gmail-detail-label">To</span><span>${window.AdminUtil.escapeHtml(email.to)}</span></div>
        <div class="gmail-detail-row"><span class="gmail-detail-label">Date</span><span>${window.AdminUtil.escapeHtml(email.date)}</span></div>
        <div class="gmail-detail-row"><span class="gmail-detail-label">Subject</span><span>${window.AdminUtil.escapeHtml(email.subject)}</span></div>
      </div>
      <div class="gmail-detail-body-wrap">${bodyHtml}</div>`;
  }

  async function openDetail(messageId, subject) {
    if (!el.detailModal) return;
    if (el.detailTitle) el.detailTitle.textContent = subject || "Email";
    el.detailBody.innerHTML = "<p class='empty'>Loading…</p>";
    el.detailModal.classList.remove("hidden");
    requestAnimationFrame(() => el.detailModal.classList.add("modal-open"));
    el.detailModal.setAttribute("aria-hidden", "false");

    try {
      const data = await window.AdminUtil.api(`/gmail/emails/${encodeURIComponent(messageId)}`);
      renderDetail(data);
    } catch (err) {
      el.detailBody.innerHTML = `<p class='empty' style='color:var(--danger)'>Failed to load email: ${window.AdminUtil.escapeHtml(err.message)}</p>`;
    }
  }

  function closeDetail() {
    if (!el.detailModal) return;
    el.detailModal.classList.remove("modal-open");
    el.detailModal.setAttribute("aria-hidden", "true");
    setTimeout(() => el.detailModal.classList.add("hidden"), 250);
  }

  // -------------------------------------------------------------------------
  // API
  // -------------------------------------------------------------------------

  async function loadStatus() {
    try {
      const data = await window.AdminUtil.api("/gmail/status");
      setConnected(!!data.connected, data.gmail_email || "");
    } catch (_) {
      setConnected(false, "");
    }
  }

  async function loadEmails() {
    if (el.inboxBody) el.inboxBody.innerHTML = "<p class='empty'>Loading…</p>";
    try {
      const data = await window.AdminUtil.api("/gmail/emails");
      renderEmails(data.emails || []);
    } catch (err) {
      if (el.inboxBody) el.inboxBody.innerHTML = `<p class='empty' style='color:var(--danger)'>Failed to load emails</p>`;
    }
  }

  async function disconnect() {
    const ok = window.AdminConfirm?.ask
      ? await window.AdminConfirm.ask({
          title: "Disconnect Gmail?",
          message: "Your Gmail token will be removed. You can reconnect at any time.",
          okLabel: "Disconnect",
        })
      : true;
    if (!ok) return;
    try {
      await window.AdminUtil.api("/gmail/disconnect", { method: "DELETE" });
      setConnected(false, "");
      if (window.AdminUI?.showOk) window.AdminUI.showOk("Gmail disconnected");
    } catch (err) {
      if (window.AdminUI?.showError) window.AdminUI.showError(err instanceof Error ? err.message : "Disconnect failed");
    }
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------

  function boot() {
    if (_booted) return;
    _booted = true;

    el.btnConnect?.addEventListener("click", async () => {
      try {
        const data = await window.AdminUtil.api("/gmail/connect-url");
        window.location.href = data.url;
      } catch (err) {
        if (window.AdminUI?.showError) window.AdminUI.showError(err instanceof Error ? err.message : "Could not start Gmail connect");
      }
    });

    el.btnInbox?.addEventListener("click", openInbox);
    el.btnDisconnect?.addEventListener("click", disconnect);
    el.btnInboxRefresh?.addEventListener("click", loadEmails);
    el.btnInboxClose?.addEventListener("click", closeInbox);
    el.btnDetailClose?.addEventListener("click", closeDetail);

    el.inboxModal?.addEventListener("click", (e) => { if (e.target === el.inboxModal) closeInbox(); });
    el.detailModal?.addEventListener("click", (e) => { if (e.target === el.detailModal) closeDetail(); });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (el.detailModal && !el.detailModal.classList.contains("hidden")) { closeDetail(); return; }
      if (el.inboxModal  && !el.inboxModal.classList.contains("hidden"))  { closeInbox();  return; }
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail_connected")) {
      history.replaceState({}, "", "/");
      loadStatus();
      if (window.AdminUI?.showOk) window.AdminUI.showOk("Gmail connected successfully");
    } else if (params.get("gmail_error")) {
      history.replaceState({}, "", "/");
      if (window.AdminUI?.showError) window.AdminUI.showError("Gmail connect failed: " + params.get("gmail_error"));
    }

    loadStatus();
  }

  window.AdminGmail = { boot, loadStatus, loadEmails };
})();
