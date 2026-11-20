import { api, getMe, initNav, loginUrl, platformLabel, safeUrl } from "./api.js";

const PAGE_SIZE = 10;
const $ = (id) => document.getElementById(id);

const els = {
  authGate: $("authGate"),
  signInBtn: $("signInBtn"),
  forbiddenGate: $("forbiddenGate"),
  adminContent: $("adminContent"),
  actionStatus: $("actionStatus"),
  actionError: $("actionError"),
  tabListings: $("tabListings"),
  tabClaims: $("tabClaims"),
  panelListings: $("panelListings"),
  panelClaims: $("panelClaims"),
  listingsStatus: $("listingsStatus"),
  listingsEmpty: $("listingsEmpty"),
  listingsList: $("listingsList"),
  listingsPager: $("listingsPager"),
  prevListings: $("prevListings"),
  nextListings: $("nextListings"),
  listingsPageInfo: $("listingsPageInfo"),
  claimsStatus: $("claimsStatus"),
  claimsEmpty: $("claimsEmpty"),
  claimsList: $("claimsList"),
};

let page = 1;
let totalListings = 0;

function setStatus(msg) {
  els.actionStatus.textContent = msg;
  els.actionStatus.hidden = false;
  els.actionError.hidden = true;
}

function setError(msg) {
  els.actionError.textContent = msg;
  els.actionError.hidden = false;
  els.actionStatus.hidden = true;
}

function clearFeedback() {
  els.actionStatus.textContent = "";
  els.actionStatus.hidden = true;
  els.actionError.textContent = "";
  els.actionError.hidden = true;
}

function switchTab(target) {
  clearFeedback();
  if (target === "listings") {
    els.tabListings.setAttribute("aria-selected", "true");
    els.tabClaims.setAttribute("aria-selected", "false");
    els.panelListings.hidden = false;
    els.panelClaims.hidden = true;
    loadListings();
  } else {
    els.tabListings.setAttribute("aria-selected", "false");
    els.tabClaims.setAttribute("aria-selected", "true");
    els.panelListings.hidden = true;
    els.panelClaims.hidden = false;
    loadClaims();
  }
}

for (const tab of [els.tabListings, els.tabClaims]) {
  tab.addEventListener("click", () => {
    switchTab(tab === els.tabListings ? "listings" : "claims");
  });
  tab.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      switchTab(tab === els.tabListings ? "listings" : "claims");
    }
  });
}

function formatDate(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return isoStr;
  }
}

async function loadListings() {
  els.listingsStatus.textContent = "Loading pending listings...";
  els.listingsStatus.hidden = false;
  els.listingsEmpty.hidden = true;
  els.listingsList.hidden = true;
  els.listingsList.replaceChildren();

  const offset = (page - 1) * PAGE_SIZE;
  const res = await api(`/api/admin/communities?status=pending&limit=${PAGE_SIZE}&offset=${offset}`);

  if (res.status === 401) {
    showAuthRequired();
    return;
  }
  if (res.status === 403) {
    showForbidden();
    return;
  }

  els.listingsStatus.hidden = true;

  if (!res.ok) {
    setError("Could not load pending listings.");
    return;
  }

  const items = Array.isArray(res.data?.items) ? res.data.items : [];
  totalListings = typeof res.data?.total === "number" ? res.data.total : items.length;

  if (items.length === 0) {
    els.listingsEmpty.hidden = false;
    els.listingsPager.hidden = true;
    return;
  }

  for (const item of items) {
    els.listingsList.append(createListingItem(item));
  }

  els.listingsList.hidden = false;
  updatePagination();
}

function updatePagination() {
  const totalPages = Math.max(1, Math.ceil(totalListings / PAGE_SIZE));
  els.listingsPager.hidden = totalPages <= 1;
  els.listingsPageInfo.textContent = `Page ${page} of ${totalPages}`;
  els.prevListings.disabled = page <= 1;
  els.nextListings.disabled = page >= totalPages;
}

els.prevListings.addEventListener("click", () => {
  if (page > 1) {
    page -= 1;
    loadListings();
  }
});

els.nextListings.addEventListener("click", () => {
  const totalPages = Math.ceil(totalListings / PAGE_SIZE);
  if (page < totalPages) {
    page += 1;
    loadListings();
  }
});

function createListingItem(item) {
  const li = document.createElement("li");
  li.className = "card-block admin-item";
  li.id = `listing-${item.id}`;

  const head = document.createElement("div");
  head.className = "listing-item-head";

  const title = document.createElement("h3");
  title.className = "listing-item-title";
  title.textContent = item.name;
  head.append(title);

  const chips = document.createElement("div");
  chips.className = "chips";
  const platformChip = document.createElement("span");
  platformChip.className = "chip chip-platform";
  platformChip.textContent = platformLabel(item.platform);
  chips.append(platformChip);

  if (item.category && item.category.name) {
    const catChip = document.createElement("span");
    catChip.className = "chip";
    catChip.textContent = item.category.name;
    chips.append(catChip);
  }
  head.append(chips);

  const desc = document.createElement("p");
  desc.className = "listing-desc";
  desc.textContent = item.description || "No description provided.";

  const dateP = document.createElement("p");
  dateP.className = "item-date";
  dateP.textContent = `Submitted: ${formatDate(item.created_at)}`;

  const linkRow = document.createElement("div");
  linkRow.className = "link-row";

  const linkText = document.createElement("span");
  linkText.className = "link-raw";
  linkText.textContent = item.invite_link;

  linkRow.append(linkText);

  const safeHref = safeUrl(item.invite_link);
  if (safeHref) {
    const openLink = document.createElement("a");
    openLink.className = "btn btn-ghost btn-small";
    openLink.href = safeHref;
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    openLink.textContent = "Open link";
    linkRow.append(openLink);
  }

  const actions = document.createElement("div");
  actions.className = "admin-actions";

  const approveBtn = document.createElement("button");
  approveBtn.type = "button";
  approveBtn.className = "btn btn-primary btn-small";
  approveBtn.textContent = "Approve";

  const rejectToggleBtn = document.createElement("button");
  rejectToggleBtn.type = "button";
  rejectToggleBtn.className = "btn btn-ghost btn-small";
  rejectToggleBtn.textContent = "Reject";

  actions.append(approveBtn, rejectToggleBtn);

  const rejectForm = document.createElement("div");
  rejectForm.className = "inline-reject-box";
  rejectForm.hidden = true;

  const reasonLabel = document.createElement("label");
  const reasonId = `reason-${item.id}`;
  reasonLabel.setAttribute("for", reasonId);
  reasonLabel.textContent = "Rejection reason (3 to 300 characters)";

  const reasonInput = document.createElement("input");
  reasonInput.className = "input";
  reasonInput.id = reasonId;
  reasonInput.type = "text";
  reasonInput.minLength = 3;
  reasonInput.maxLength = 300;
  reasonInput.placeholder = "Explain why this submission was rejected";

  const rejectConfirmBtn = document.createElement("button");
  rejectConfirmBtn.type = "button";
  rejectConfirmBtn.className = "btn btn-danger btn-small";
  rejectConfirmBtn.textContent = "Confirm rejection";

  const rejectCancelBtn = document.createElement("button");
  rejectCancelBtn.type = "button";
  rejectCancelBtn.className = "btn btn-ghost btn-small";
  rejectCancelBtn.textContent = "Cancel";

  const rejectBtns = document.createElement("div");
  rejectBtns.className = "reject-actions";
  rejectBtns.append(rejectConfirmBtn, rejectCancelBtn);

  const rejectError = document.createElement("p");
  rejectError.className = "form-error";
  rejectError.setAttribute("role", "alert");
  rejectError.hidden = true;

  rejectForm.append(reasonLabel, reasonInput, rejectBtns, rejectError);

  approveBtn.addEventListener("click", async () => {
    approveBtn.disabled = true;
    rejectToggleBtn.disabled = true;
    clearFeedback();

    const res = await api(`/api/admin/communities/${encodeURIComponent(item.id)}/approve`, {
      method: "POST",
    });

    if (res.ok) {
      li.remove();
      totalListings = Math.max(0, totalListings - 1);
      setStatus(`Approved community "${item.name}".`);
      if (els.listingsList.children.length === 0) {
        if (page > 1) {
          page -= 1;
          loadListings();
        } else {
          els.listingsEmpty.hidden = false;
          els.listingsPager.hidden = true;
        }
      } else {
        updatePagination();
      }
    } else {
      approveBtn.disabled = false;
      rejectToggleBtn.disabled = false;
      setError((res.data && res.data.error) || "Failed to approve community.");
    }
  });

  rejectToggleBtn.addEventListener("click", () => {
    rejectForm.hidden = !rejectForm.hidden;
    if (!rejectForm.hidden) {
      reasonInput.focus();
    }
  });

  rejectCancelBtn.addEventListener("click", () => {
    rejectForm.hidden = true;
    reasonInput.value = "";
    rejectError.hidden = true;
  });

  rejectConfirmBtn.addEventListener("click", async () => {
    const reason = reasonInput.value.trim();
    if (reason.length < 3 || reason.length > 300) {
      rejectError.textContent = "Reason must be between 3 and 300 characters.";
      rejectError.hidden = false;
      reasonInput.focus();
      return;
    }

    rejectConfirmBtn.disabled = true;
    rejectError.hidden = true;
    clearFeedback();

    const res = await api(`/api/admin/communities/${encodeURIComponent(item.id)}/reject`, {
      method: "POST",
      body: { reason },
    });

    if (res.ok) {
      li.remove();
      totalListings = Math.max(0, totalListings - 1);
      setStatus(`Rejected community "${item.name}".`);
      if (els.listingsList.children.length === 0) {
        if (page > 1) {
          page -= 1;
          loadListings();
        } else {
          els.listingsEmpty.hidden = false;
          els.listingsPager.hidden = true;
        }
      } else {
        updatePagination();
      }
    } else {
      rejectConfirmBtn.disabled = false;
      rejectError.textContent = (res.data && res.data.error) || "Failed to reject community.";
      rejectError.hidden = false;
    }
  });

  li.append(head, desc, dateP, linkRow, actions, rejectForm);
  return li;
}

async function loadClaims() {
  els.claimsStatus.textContent = "Loading claim reviews...";
  els.claimsStatus.hidden = false;
  els.claimsEmpty.hidden = true;
  els.claimsList.hidden = true;
  els.claimsList.replaceChildren();

  const res = await api("/api/admin/claim-reviews?status=pending");

  if (res.status === 401) {
    showAuthRequired();
    return;
  }
  if (res.status === 403) {
    showForbidden();
    return;
  }

  els.claimsStatus.hidden = true;

  if (!res.ok) {
    setError("Could not load claim reviews.");
    return;
  }

  const items = Array.isArray(res.data?.items) ? res.data.items : [];
  if (items.length === 0) {
    els.claimsEmpty.hidden = false;
    return;
  }

  for (const item of items) {
    els.claimsList.append(createClaimItem(item));
  }

  els.claimsList.hidden = false;
}

function createClaimItem(item) {
  const li = document.createElement("li");
  li.className = "card-block admin-item";
  li.id = `claim-${item.id}`;

  const head = document.createElement("div");
  head.className = "listing-item-head";

  const title = document.createElement("h3");
  title.className = "listing-item-title";
  title.textContent = item.community_name || `Community #${item.community_id}`;
  head.append(title);

  if (item.platform) {
    const chip = document.createElement("span");
    chip.className = "chip chip-platform";
    chip.textContent = platformLabel(item.platform);
    head.append(chip);
  }

  const requesterP = document.createElement("p");
  requesterP.className = "item-detail";
  requesterP.textContent = `Requester: ${item.requester_email || `User #${item.requested_by}`}`;

  const reasonP = document.createElement("p");
  reasonP.className = "item-detail";
  reasonP.textContent = `Reason: ${item.reason}`;

  const dateP = document.createElement("p");
  dateP.className = "item-date";
  dateP.textContent = `Requested: ${formatDate(item.created_at)}`;

  const actions = document.createElement("div");
  actions.className = "admin-actions";

  const approveBtn = document.createElement("button");
  approveBtn.type = "button";
  approveBtn.className = "btn btn-primary btn-small";
  approveBtn.textContent = "Approve claim";

  const rejectBtn = document.createElement("button");
  rejectBtn.type = "button";
  rejectBtn.className = "btn btn-danger btn-small";
  rejectBtn.textContent = "Reject claim";

  actions.append(approveBtn, rejectBtn);

  approveBtn.addEventListener("click", async () => {
    approveBtn.disabled = true;
    rejectBtn.disabled = true;
    clearFeedback();

    const res = await api(`/api/admin/claim-reviews/${encodeURIComponent(item.id)}/approve`, {
      method: "POST",
    });

    if (res.ok) {
      li.remove();
      setStatus(`Approved claim for "${item.community_name || item.community_id}".`);
      if (els.claimsList.children.length === 0) {
        els.claimsEmpty.hidden = false;
      }
    } else {
      approveBtn.disabled = false;
      rejectBtn.disabled = false;
      setError((res.data && res.data.error) || "Failed to approve claim review.");
    }
  });

  rejectBtn.addEventListener("click", async () => {
    approveBtn.disabled = true;
    rejectBtn.disabled = true;
    clearFeedback();

    const res = await api(`/api/admin/claim-reviews/${encodeURIComponent(item.id)}/reject`, {
      method: "POST",
    });

    if (res.ok) {
      li.remove();
      setStatus(`Rejected claim for "${item.community_name || item.community_id}".`);
      if (els.claimsList.children.length === 0) {
        els.claimsEmpty.hidden = false;
      }
    } else {
      approveBtn.disabled = false;
      rejectBtn.disabled = false;
      setError((res.data && res.data.error) || "Failed to reject claim review.");
    }
  });

  li.append(head, requesterP, reasonP, dateP, actions);
  return li;
}

function showAuthRequired() {
  els.signInBtn.href = loginUrl();
  els.authGate.hidden = false;
  els.forbiddenGate.hidden = true;
  els.adminContent.hidden = true;
}

function showForbidden() {
  els.authGate.hidden = true;
  els.forbiddenGate.hidden = false;
  els.adminContent.hidden = true;
}

async function init() {
  const user = await initNav();
  if (!user) {
    showAuthRequired();
    return;
  }

  // Pre-flight check via admin listing to check role (staff/admin vs 403)
  const probe = await api("/api/admin/communities?status=pending&limit=1&offset=0");
  if (probe.status === 401) {
    showAuthRequired();
    return;
  }
  if (probe.status === 403) {
    showForbidden();
    return;
  }

  els.authGate.hidden = true;
  els.forbiddenGate.hidden = true;
  els.adminContent.hidden = false;

  await loadListings();
}

init();
