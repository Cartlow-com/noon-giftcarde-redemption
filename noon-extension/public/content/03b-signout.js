/**
 * Split from content.js — sign-out menu finders + clicks.
 * Part: 03b-signout.js
 */
function isSignOutLabel(text) {
  const t = normalizeText(text).toLowerCase();
  if (!t) return false;
  return (
    t === "sign out" ||
    t === "log out" ||
    t === "logout" ||
    (/sign\s*out|log\s*out/.test(t) && t.length <= 24)
  );
}

function resolveSignOutClickable(el) {
  if (!el) return null;
  return (
    el.closest("a[href], button, [role='button'], [role='menuitem'], [role='link']") ||
    el
  );
}

function findSignOutInScope(root, options) {
  const opts = options || {};
  const scope = root || document.body;
  const preferHeader = opts.preferHeader !== false;
  let best = null;
  let bestScore = -1;

  const nodes = scope.querySelectorAll(
    "a, button, [role='button'], [role='menuitem'], [role='link'], li, div, span",
  );
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isVisible(el)) continue;
    if (!isSignOutLabel(el.textContent)) continue;

    const clickable = resolveSignOutClickable(el);
    if (!clickable || !isVisible(clickable)) continue;

    let score = 10;
    const rect = clickable.getBoundingClientRect();
    if (preferHeader && rect.top < window.innerHeight * 0.55) score += 20;
    if (clickable.closest('[role="menu"], [role="listbox"], [aria-modal="true"]')) {
      score += 30;
    }
    if (clickable.closest("header, [role='banner']")) score += 15;
    score += Math.max(0, 24 - normalizeText(clickable.textContent).length);

    if (score > bestScore) {
      best = clickable;
      bestScore = score;
    }
  }
  return best;
}

function findOpenUserMenuRoot() {
  const panels = document.querySelectorAll(
    '[role="menu"], [role="listbox"], [role="dialog"], [aria-modal="true"]',
  );
  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    if (!isVisible(panel)) continue;
    if (findSignOutInScope(panel, { preferHeader: false })) return panel;
    if (findClickableByText("Orders", panel)) return panel;
  }
  return null;
}

function isUserMenuOpen() {
  return !!findOpenUserMenuRoot();
}

function findSignOutButton(options) {
  const opts = options || {};
  const menu = findOpenUserMenuRoot();
  if (menu) {
    const inMenu = findSignOutInScope(menu, { preferHeader: false });
    if (inMenu) return inMenu;
  }

  const header = queryByRole("banner") || document.querySelector("header");
  if (header) {
    const inHeader = findSignOutInScope(header, { preferHeader: true });
    if (inHeader) return inHeader;
  }

  if (opts.includeSidebar) {
    const main = document.querySelector("main") || document.body;
    return findSignOutInScope(main, { preferHeader: false });
  }

  return null;
}

function dispatchNativeClick(el) {
  if (!el) return;
  try {
    el.focus();
  } catch (_) {}
  try {
    el.click();
  } catch (_) {}
  try {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + Math.min(rect.height / 2, rect.height > 24 ? 18 : rect.height / 2);
    const hit = document.elementFromPoint(x, y);
    if (!hit) return;
    const clickable =
      hit.closest(
        "a, button, [role='button'], [role='menuitem'], [role='link']",
      ) || hit;
    clickable.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
      }),
    );
    try {
      clickable.click();
    } catch (_) {}
  } catch (_) {}
}

async function openProfileDropdown() {
  if (isUserMenuOpen()) return true;

  const profileBtn = findProfileButton();
  if (!profileBtn) return false;

  logStep("Opening account menu…");
  await mouse().click(profileBtn);
  // no fixed wait — Sign out is scanned next
  dispatchNativeClick(profileBtn);

  const opened = await waitFor(
    function () {
      return isUserMenuOpen() || findSignOutButton();
    },
    5000,
    50,
  );
  return !!opened;
}

async function clickSignOut(signOut) {
  logStep("Clicking Sign out…");
  await mouse().click(signOut, { fast: true });
  dispatchNativeClick(resolveSignOutClickable(signOut) || signOut);
}
