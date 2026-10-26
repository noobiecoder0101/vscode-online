import { api, initNav, loginUrl, platformLabel, safeImage, safeUrl } from "./api.js";

const PAGE_SIZE = 12;
const PLATFORMS = ["telegram", "discord", "whatsapp", "reddit", "slack", "signal", "facebook", "x"];
const DEFAULTS = { q: "", category: "", platform: "", sort: "members", page: 1 };

const $ = (id) => document.getElementById(id);
const els = {
  form: $("filters"),
  q: $("q"),
  category: $("category"),
  platform: $("platform"),
  sort: $("sort"),
  status: $("resultsStatus"),
  clear: $("clearFilters"),
  state: $("resultsState"),
  list: $("results"),
  pager: $("pager"),
  prev: $("prevPage"),
  next: $("nextPage"),
  pageInfo: $("pageInfo"),
};

let state = readStateFromUrl();
let user = null;
let controller = null;
let searchTimer = null;

// All text from the API goes in through textContent, never innerHTML.
function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatCount(value) {
  return (Number(value) || 0).toLocaleString("en-US");
}

/* ---------- URL state ---------- */

function readStateFromUrl() {
  const params = new URLSearchParams(location.search);
  const page = Number.parseInt(params.get("page") || "1", 10);
  const platform = (params.get("platform") || "").toLowerCase();
  const category = params.get("category") || "";

  return {
    q: (params.get("q") || "").slice(0, 100),
    category: /^[a-z0-9-]+$/i.test(category) ? category : "",
    platform: PLATFORMS.includes(platform) ? platform : "",
    sort: params.get("sort") === "newest" ? "newest" : "members",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

function writeStateToUrl(mode) {
  const params = new URLSearchParams();
  for (const key of ["q", "category", "platform"]) {
    if (state[key]) params.set(key, state[key]);
  }
  if (state.sort !== DEFAULTS.sort) params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(state.page));

  const query = params.toString();
  const url = location.pathname + (query ? `?${query}` : "");
  history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
}

function syncControls() {
  els.q.value = state.q;
  els.platform.value = state.platform;
  els.sort.value = state.sort;
  if ([...els.category.options].some((o) => o.value === state.category)) {
    els.category.value = state.category;
  }
  els.clear.hidden = !(state.q || state.category || state.platform);
}

/* ---------- Loading ---------- */

async function loadCategories() {
  const r = await api("/api/categories");
  let list = [];
  if (r.ok) {
    list = Array.isArray(r.data) ? r.data : r.data?.items || r.data?.categories || [];
  }

  for (const category of list) {
    if (!category || !category.slug) continue;
    const option = document.createElement("option");
    option.value = category.slug;
    option.textContent = `${category.name} (${category.community_count ?? 0})`;
    els.category.append(option);
  }

  const known = list.some((c) => c && c.slug === state.category);
  if (state.category && !known) {
    if (r.ok) {
      // The slug in the URL does not exist, so drop it instead of showing no results.
      state.category = "";
      writeStateToUrl("replace");
    } else {
      // Categories failed to load, keep the filter and show its slug as the label.
      const option = document.createElement("option");
      option.value = state.category;
      option.textContent = state.category;
      els.category.append(option);
    }
  }
  syncControls();
}

async function load() {
  if (controller) controller.abort();
  controller = new AbortController();
  setBusy(true);

  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.category) params.set("category", state.category);
  if (state.platform) params.set("platform", state.platform);
  params.set("sort", state.sort);
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String((state.page - 1) * PAGE_SIZE));

  let result;
  try {
    result = await api(`/api/communities?${params}`, { signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") return;
    throw err;
  }

  setBusy(false);
  if (!result.ok) {
    showError(result);
    return;
  }
  render(result.data);
}

function setBusy(busy) {
  els.list.setAttribute("aria-busy", String(busy));
  els.list.classList.toggle("is-loading", busy);
  if (busy && !els.list.children.length) {
    els.status.textContent = "Loading communities...";
    showState("Loading communities...");
  }
}

function showState(message, retry) {
  els.state.hidden = false;
  els.state.replaceChildren(h("p", "", message));
  if (retry) {
    const button = h("button", "btn btn-ghost btn-small", "Try again");
    button.type = "button";
    button.addEventListener("click", retry);
    els.state.append(button);
  }
}

function showError(result) {
  els.list.replaceChildren();
  els.pager.hidden = true;
  els.status.textContent = "";

  let message = "Communities could not be loaded.";
  if (result.status === 0) message = "The server could not be reached. Check your connection.";
  else if (result.status === 429) message = "Too many requests. Wait a moment and try again.";
  else if (result.status === 400 && result.data?.error) message = result.data.error;

  showState(message, load);
}

/* ---------- Rendering ---------- */

function render(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const total = Number.isFinite(data?.total) ? data.total : items.length;

  // A stale page number from the URL: jump to the last page that exists.
  if (!items.length && total > 0 && state.page > 1) {
    state.page = Math.max(1, Math.ceil(total / PAGE_SIZE));
    writeStateToUrl("replace");
    load();
    return;
  }

  els.list.replaceChildren(...items.map(buildCard));
  els.clear.hidden = !(state.q || state.category || state.platform);

  if (!items.length) {
    els.status.textContent = "No communities found.";
    showState("Nothing matches these filters. Try a different keyword, or clear the filters.");
    els.pager.hidden = true;
    return;
  }

  els.state.hidden = true;
  const from = (state.page - 1) * PAGE_SIZE + 1;
  const to = from + items.length - 1;
  els.status.textContent = `Showing ${from} to ${to} of ${formatCount(total)} communities`;

  const pages = Math.ceil(total / PAGE_SIZE);
  els.pager.hidden = pages <= 1;
  els.pageInfo.textContent = `Page ${state.page} of ${pages}`;
  els.prev.disabled = state.page <= 1;
  els.next.disabled = state.page >= pages;
}

function buildCard(item) {
  const li = h("li");
  const card = h("article", "listing");

  const imageSrc = safeImage(item.image_url);
  if (imageSrc) {
    const media = h("div", "listing-media");
    const image = document.createElement("img");
    image.src = imageSrc;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => media.remove());
    media.append(image);
    card.append(media);
  }

  const body = h("div", "listing-body");

  const chips = h("div", "chips");
  chips.append(h("span", "chip chip-platform", platformLabel(item.platform)));
  if (item.category && item.category.name) chips.append(h("span", "chip", item.category.name));

  const title = h("h2", "listing-title", item.name);
  const description = h("p", "listing-desc", item.description || "No description yet.");

  const note = h("p", "listing-note");
  note.setAttribute("role", "status");

  const foot = h("div", "listing-foot");
  foot.append(h("span", "members", `${formatCount(item.member_count)} members`), buildJoinControl(item, note));

  body.append(chips, title, description, foot, note);
  card.append(body);
  li.append(card);
  return li;
}

function setNote(note, message, isError) {
  note.textContent = message;
  note.classList.toggle("error", Boolean(isError));
}

function buildJoinControl(item, note) {
  const wrap = h("div", "join-control");
  const button = h("button", "btn btn-primary btn-small", user ? "Get invite link" : "Sign in to join");
  button.type = "button";

  button.addEventListener("click", async () => {
    if (!user) {
      location.assign(loginUrl());
      return;
    }

    button.disabled = true;
    setNote(note, "Checking...");
    const r = await api(`/api/communities/${encodeURIComponent(item.id)}/join`);
    const href = r.ok && r.data ? safeUrl(r.data.invite_link) : null;

    if (href) {
      showInvite(wrap, note, href);
      return;
    }

    button.disabled = false;
    if (r.status === 401) {
      user = null;
      button.textContent = "Sign in to join";
      setNote(note, "Your session ended. Sign in again to get the link.", true);
    } else if (r.status === 429) {
      setNote(note, "Too many requests. Wait a moment and try again.", true);
    } else if (r.status === 404) {
      setNote(note, "This community is no longer listed.", true);
    } else {
      setNote(note, "The link could not be loaded. Try again.", true);
    }
  });

  wrap.append(button);
  return wrap;
}

function showInvite(wrap, note, href) {
  const open = h("a", "btn btn-primary btn-small", "Open invite");
  open.href = href;
  open.target = "_blank";
  open.rel = "noopener noreferrer";

  const copy = h("button", "btn btn-ghost btn-small", "Copy link");
  copy.type = "button";
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(href);
      setNote(note, "Link copied.");
    } catch {
      setNote(note, "Copying failed. Use Open invite instead.", true);
    }
  });

  wrap.replaceChildren(open, copy);
  setNote(note, "");
  open.focus();
}

/* ---------- Events ---------- */

function applySearch() {
  const q = els.q.value.trim();
  if (q === state.q) return;
  state.q = q;
  state.page = 1;
  writeStateToUrl("replace");
  load();
}

for (const key of ["category", "platform", "sort"]) {
  els[key].addEventListener("change", () => {
    state[key] = els[key].value;
    state.page = 1;
    writeStateToUrl("push");
    syncControls();
    load();
  });
}

els.q.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applySearch, 300);
});

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearTimeout(searchTimer);
  applySearch();
});

els.clear.addEventListener("click", () => {
  state = { ...DEFAULTS, sort: state.sort };
  writeStateToUrl("push");
  syncControls();
  load();
});

function goToPage(page) {
  state.page = page;
  writeStateToUrl("push");
  els.form.scrollIntoView({ block: "start" });
  load();
}

els.prev.addEventListener("click", () => goToPage(Math.max(1, state.page - 1)));
els.next.addEventListener("click", () => goToPage(state.page + 1));

window.addEventListener("popstate", () => {
  state = readStateFromUrl();
  syncControls();
  load();
});

/* ---------- Start ---------- */

async function init() {
  syncControls();
  const [me] = await Promise.all([initNav(), loadCategories()]);
  user = me;
  load();
}

init();