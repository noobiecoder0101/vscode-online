import { api, getMe, initNav, loginUrl, platformLabel } from "./api.js";

const $ = (id) => document.getElementById(id);

const els = {
  authGate: $("authGate"),
  authGateLink: $("authGateLink"),
  contentArea: $("contentArea"),
  form: $("submitForm"),
  name: $("name"),
  nameError: $("nameError"),
  description: $("description"),
  descCounter: $("descCounter"),
  descError: $("descError"),
  category: $("category"),
  categoryError: $("categoryError"),
  platform: $("platform"),
  platformError: $("platformError"),
  inviteLink: $("inviteLink"),
  linkError: $("linkError"),
  formError: $("formError"),
  formStatus: $("formStatus"),
  submitBtn: $("submitBtn"),
  myListingsStatus: $("myListingsStatus"),
  myListingsEmpty: $("myListingsEmpty"),
  myListingsList: $("myListingsList"),
};

let user = null;
let submitting = false;

function clearFieldErrors() {
  const fields = [
    { input: els.name, error: els.nameError },
    { input: els.description, error: els.descError },
    { input: els.category, error: els.categoryError },
    { input: els.platform, error: els.platformError },
    { input: els.inviteLink, error: els.linkError },
  ];
  for (const { input, error } of fields) {
    input.removeAttribute("aria-invalid");
    error.textContent = "";
    error.hidden = true;
  }
  els.formError.textContent = "";
  els.formError.hidden = true;
  els.formStatus.textContent = "";
  els.formStatus.hidden = true;
}

function setFieldError(input, errorEl, message) {
  input.setAttribute("aria-invalid", "true");
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function updateDescCounter() {
  const len = els.description.value.length;
  els.descCounter.textContent = `${len} / 500 characters`;
}

function validateClient(data) {
  let valid = true;

  if (!data.name || data.name.length < 3 || data.name.length > 80) {
    setFieldError(els.name, els.nameError, "Name must be between 3 and 80 characters.");
    valid = false;
  }

  if (data.description && data.description.length > 500) {
    setFieldError(els.description, els.descError, "Description must be 500 characters or fewer.");
    valid = false;
  }

  if (!data.category) {
    setFieldError(els.category, els.categoryError, "Select a category.");
    valid = false;
  }

  if (!data.platform) {
    setFieldError(els.platform, els.platformError, "Select a platform.");
    valid = false;
  }

  if (!data.invite_link) {
    setFieldError(els.inviteLink, els.linkError, "Enter an invite link.");
    valid = false;
  } else if (!data.invite_link.startsWith("https://")) {
    setFieldError(els.inviteLink, els.linkError, "Invite link must start with https://.");
    valid = false;
  }

  return valid;
}

async function loadCategories() {
  const res = await api("/api/categories");
  if (!res.ok || !Array.isArray(res.data)) return;

  for (const cat of res.data) {
    if (!cat || !cat.slug) continue;
    const opt = document.createElement("option");
    opt.value = cat.slug;
    opt.textContent = cat.name;
    els.category.append(opt);
  }
}

async function loadMyListings() {
  els.myListingsStatus.textContent = "Loading your listings...";
  els.myListingsStatus.hidden = false;
  els.myListingsEmpty.hidden = true;
  els.myListingsList.hidden = true;
  els.myListingsList.replaceChildren();

  const res = await api("/api/me/communities");
  els.myListingsStatus.hidden = true;

  if (!res.ok) {
    els.myListingsStatus.textContent = "Could not load listings. Try refreshing the page.";
    els.myListingsStatus.hidden = false;
    return;
  }

  const items = Array.isArray(res.data?.items) ? res.data.items : [];
  if (items.length === 0) {
    els.myListingsEmpty.hidden = false;
    return;
  }

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "listing-item card-block";

    const head = document.createElement("div");
    head.className = "listing-item-head";

    const title = document.createElement("h3");
    title.className = "listing-item-title";
    title.textContent = item.name;
    head.append(title);

    const badge = document.createElement("span");
    badge.className = `badge badge-${item.status}`;
    badge.textContent = item.status === "approved" ? "Approved" : item.status === "rejected" ? "Rejected" : "Pending review";
    head.append(badge);

    const meta = document.createElement("div");
    meta.className = "listing-item-meta";

    const platformChip = document.createElement("span");
    platformChip.className = "chip chip-platform";
    platformChip.textContent = platformLabel(item.platform);
    meta.append(platformChip);

    if (item.category && item.category.name) {
      const catChip = document.createElement("span");
      catChip.className = "chip";
      catChip.textContent = item.category.name;
      meta.append(catChip);
    }

    li.append(head, meta);

    if (item.status === "rejected" && item.review_note) {
      const note = document.createElement("p");
      note.className = "review-note";
      note.textContent = `Review note: ${item.review_note}`;
      li.append(note);
    }

    if (item.status === "approved") {
      const foot = document.createElement("div");
      foot.className = "listing-item-actions";
      const manageLink = document.createElement("a");
      manageLink.className = "btn btn-ghost btn-small";
      manageLink.href = `manage.html?id=${encodeURIComponent(item.id)}`;
      manageLink.textContent = "Manage bot";
      foot.append(manageLink);
      li.append(foot);
    }

    els.myListingsList.append(li);
  }

  els.myListingsList.hidden = false;
}

els.description.addEventListener("input", updateDescCounter);

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (submitting) return;

  clearFieldErrors();

  const data = {
    name: els.name.value.trim(),
    description: els.description.value.trim() || undefined,
    category: els.category.value.trim(),
    platform: els.platform.value.trim(),
    invite_link: els.inviteLink.value.trim(),
  };

  if (!validateClient(data)) return;

  submitting = true;
  els.submitBtn.disabled = true;
  els.submitBtn.textContent = "Submitting...";

  const res = await api("/api/communities", {
    method: "POST",
    body: data,
  });

  submitting = false;
  els.submitBtn.disabled = false;
  els.submitBtn.textContent = "Submit community";

  if (res.status === 201) {
    els.formStatus.textContent = "Submitted. A reviewer will check it before it appears.";
    els.formStatus.hidden = false;
    els.form.reset();
    updateDescCounter();
    await loadMyListings();
    return;
  }

  if (res.status === 409) {
    els.formError.textContent = "This community is already listed.";
    els.formError.hidden = false;
    return;
  }

  if (res.status === 429) {
    const waitSeconds = res.retryAfter || 60;
    const waitMsg = waitSeconds >= 60
      ? `${Math.ceil(waitSeconds / 60)} minute(s)`
      : `${waitSeconds} second(s)`;
    els.formError.textContent = `Too many submissions. Please wait ${waitMsg} before trying again.`;
    els.formError.hidden = false;
    return;
  }

  if (res.status === 400) {
    const msg = (res.data && res.data.error) || "Validation failed. Please check your inputs.";
    els.formError.textContent = msg;
    els.formError.hidden = false;
    return;
  }

  els.formError.textContent = "An error occurred while submitting. Please try again.";
  els.formError.hidden = false;
});

async function init() {
  user = await initNav();

  if (!user) {
    els.authGateLink.href = loginUrl();
    els.authGate.hidden = false;
    els.contentArea.hidden = true;
    return;
  }

  els.authGate.hidden = true;
  els.contentArea.hidden = false;

  await Promise.all([loadCategories(), loadMyListings()]);
}

init();
