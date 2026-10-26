import { api, initNav, safeNext } from "./api.js";

const $ = (id) => document.getElementById(id);
const els = {
  panel: $("authPanel"),
  signedIn: $("signedIn"),
  signedInText: $("signedInText"),
  continueLink: $("continueLink"),
  signOut: $("signOut"),
  title: $("authTitle"),
  sub: $("authSub"),
  modeLogin: $("modeLogin"),
  modeRegister: $("modeRegister"),
  form: $("authForm"),
  email: $("email"),
  password: $("password"),
  showPassword: $("showPassword"),
  hint: $("passwordHint"),
  error: $("formError"),
  submit: $("submitBtn"),
};

const params = new URLSearchParams(location.search);
const next = safeNext(params.get("next"), "communities.html");
let mode = params.get("mode") === "register" ? "register" : "login";
let pending = false;

const COPY = {
  login: {
    title: "Sign in",
    sub: "Browsing is free. An account is only needed to get a group's invite link.",
    submit: "Sign in",
    autocomplete: "current-password",
  },
  register: {
    title: "Create an account",
    sub: "One account lets you get invite links and, later, list and manage your own groups.",
    submit: "Create account",
    autocomplete: "new-password",
  },
};

function setMode(value) {
  mode = value;
  const copy = COPY[mode];
  els.title.textContent = copy.title;
  els.sub.textContent = copy.sub;
  els.submit.textContent = copy.submit;
  els.password.autocomplete = copy.autocomplete;
  els.hint.hidden = mode !== "register";
  els.modeLogin.setAttribute("aria-pressed", String(mode === "login"));
  els.modeRegister.setAttribute("aria-pressed", String(mode === "register"));
  clearError();
}

function showError(message) {
  els.error.textContent = message;
  els.error.hidden = false;
}

function clearError() {
  els.error.textContent = "";
  els.error.hidden = true;
}

function setPending(value) {
  pending = value;
  els.submit.disabled = value;
  els.submit.textContent = value ? "Please wait..." : COPY[mode].submit;
}

// Mirrors the server rules so mistakes are caught before a request is sent.
// The server stays the authority and is checked again there.
function validate(email, password) {
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email address.";
  }
  if (!password) return "Enter your password.";
  if (mode === "register") {
    if (password.length < 8) return "Use at least 8 characters for your password.";
    if (new TextEncoder().encode(password).length > 72) {
      return "That password is too long. Use 72 bytes or fewer.";
    }
  }
  return null;
}

function messageFor(result) {
  switch (result.status) {
    case 0:
      return "The server could not be reached. Check your connection or verify the server is running.";
    case 401:
      return "Wrong email or password.";
    case 409:
      return "An account with that email already exists. Try signing in instead.";
    case 429: {
      if (result.retryAfter) {
        const minutes = Math.max(1, Math.ceil(result.retryAfter / 60));
        return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
      }
      return "Too many attempts. Wait a few minutes and try again.";
    }
    case 400:
      return (result.data && result.data.error) || "Check your details and try again.";
    case 403:
    case 413:
    case 415:
      return "The request was rejected. Reload the page and try again.";
    default:
      return "Something went wrong on our side. Try again in a moment.";
  }
}

els.modeLogin.addEventListener("click", () => setMode("login"));
els.modeRegister.addEventListener("click", () => setMode("register"));

els.showPassword.addEventListener("change", () => {
  els.password.type = els.showPassword.checked ? "text" : "password";
});

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (pending) return;
  clearError();

  const email = els.email.value.trim();
  const password = els.password.value;
  const problem = validate(email, password);
  if (problem) {
    showError(problem);
    return;
  }

  setPending(true);
  const result = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
    method: "POST",
    body: { email, password },
  });

  if (result.ok) {
    location.assign(next);
    return;
  }

  setPending(false);
  showError(messageFor(result));
});

els.signOut.addEventListener("click", async () => {
  els.signOut.disabled = true;
  await api("/api/auth/logout", { method: "POST" });
  location.reload();
});

async function init() {
  if (location.protocol === "file:") {
    showError("Notice: Opening this page directly from disk (file://) blocks API access. Run the server (npm run dev) and open http://localhost:3000/login.html.");
  }
  setMode(mode);
  const user = await initNav();
  if (user) {
    els.signedInText.textContent = `You are signed in as ${user.email}.`;
    els.continueLink.href = next;
    els.panel.hidden = true;
    els.signedIn.hidden = false;
  }
}

init();
