import { api, getMe, initNav, loginUrl, platformLabel } from "./api.js";
import { BOT_USERNAME } from "./config.js";

const $ = (id) => document.getElementById(id);

const els = {
  errorState: $("errorState"),
  errorMessage: $("errorMessage"),
  authGate: $("authGate"),
  signInBtn: $("signInBtn"),
  manageContent: $("manageContent"),
  communityName: $("communityName"),
  communityMeta: $("communityMeta"),
  claimSection: $("claimSection"),
  claimPrompt: $("claimPrompt"),
  claimBtn: $("claimBtn"),
  claimFeedback: $("claimFeedback"),
  claimReviewNotice: $("claimReviewNotice"),
  claimBox: $("claimBox"),
  stepBotAdmin: $("stepBotAdmin"),
  claimCommand: $("claimCommand"),
  copyCommandBtn: $("copyCommandBtn"),
  copyStatus: $("copyStatus"),
  claimTimer: $("claimTimer"),
  timeRemaining: $("timeRemaining"),
  checkStatusBtn: $("checkStatusBtn"),
  botSection: $("botSection"),
  noInstallNotice: $("noInstallNotice"),
  botConfigForm: $("botConfigForm"),
  greetingTemplate: $("greetingTemplate"),
  greetingCounter: $("greetingCounter"),
  greetingError: $("greetingError"),
  rulesText: $("rulesText"),
  rulesCounter: $("rulesCounter"),
  rulesError: $("rulesError"),
  botEnabled: $("botEnabled"),
  previewDisplay: $("previewDisplay"),
  saveStatus: $("saveStatus"),
  saveError: $("saveError"),
  saveConfigBtn: $("saveConfigBtn"),
};

let communityId = null;
let currentCommunity = null;
let countdownTimer = null;
let savingConfig = false;

function showError(msg) {
  els.errorMessage.textContent = msg;
  els.errorState.hidden = false;
  els.authGate.hidden = true;
  els.manageContent.hidden = true;
}

function showAuthRequired() {
  els.signInBtn.href = loginUrl();
  els.authGate.hidden = false;
  els.errorState.hidden = true;
  els.manageContent.hidden = true;
}

function parseCommunityId() {
  const params = new URLSearchParams(location.search);
  const rawId = params.get("id");
  if (!rawId || !/^\d+$/.test(rawId) || Number(rawId) < 1) {
    return null;
  }
  return Number(rawId);
}

function updateCounters() {
  els.greetingCounter.textContent = `${els.greetingTemplate.value.length} / 500 characters`;
  els.rulesCounter.textContent = `${els.rulesText.value.length} / 1000 characters`;
}

function updatePreview() {
  const rawGreeting = els.greetingTemplate.value;
  const rawRules = els.rulesText.value.trim();
  const groupName = currentCommunity?.name || "My Group";

  const replacements = {
    "{user}": "Alex",
    "{group_name}": groupName,
    "{rules}": rawRules || "1. Be kind and respectful.",
    "{member_count}": "1,250",
  };

  const previewText = rawGreeting.replace(
    /\{(user|group_name|rules|member_count)\}/g,
    (match) => (replacements[match] !== undefined ? replacements[match] : match)
  );

  els.previewDisplay.textContent = previewText || "Type a greeting template above to see a preview.";
}

function startCountdown(expiresAtIso) {
  if (countdownTimer) clearInterval(countdownTimer);

  const expiresTime = new Date(expiresAtIso).getTime();

  function tick() {
    const remainingMs = expiresTime - Date.now();
    if (remainingMs <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      els.timeRemaining.textContent = "Expired";
      return;
    }

    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, "0");
    els.timeRemaining.textContent = `${pad(minutes)}:${pad(seconds)}`;
  }

  tick();
  countdownTimer = setInterval(tick, 1000);
}

async function loadCommunityInfo() {
  // Check user listings first
  const meRes = await api("/api/me/communities");
  let myItem = null;
  if (meRes.ok && Array.isArray(meRes.data?.items)) {
    myItem = meRes.data.items.find((i) => i.id === communityId) || null;
  }

  if (myItem) {
    currentCommunity = myItem;
  } else {
    const pubRes = await api(`/api/communities/${communityId}`);
    if (!pubRes.ok) {
      showError("Community not found.");
      return;
    }
    currentCommunity = pubRes.data;
  }

  els.communityName.textContent = currentCommunity.name;
  const platform = platformLabel(currentCommunity.platform);
  const catName = currentCommunity.category?.name || "";
  els.communityMeta.textContent = catName ? `${platform} • ${catName}` : platform;

  // Check if current user is owner
  if (myItem && myItem.is_owner) {
    showOwnedView();
  } else {
    // Try bot-config endpoint directly: 200 means owner
    const botCheck = await api(`/api/communities/${communityId}/bot-config`);
    if (botCheck.ok) {
      showOwnedView(botCheck.data);
    } else {
      showClaimView();
    }
  }
}

function showClaimView() {
  els.claimSection.hidden = false;
  els.botSection.hidden = true;
  els.stepBotAdmin.textContent = `Add @${BOT_USERNAME} as an administrator.`;
}

async function showOwnedView(existingConfig = null) {
  els.claimSection.hidden = true;
  els.botSection.hidden = false;

  let configData = existingConfig;
  if (!configData) {
    const res = await api(`/api/communities/${communityId}/bot-config`);
    if (res.status === 404) {
      els.noInstallNotice.hidden = false;
      els.botConfigForm.hidden = true;
      return;
    }
    if (res.ok) {
      configData = res.data;
    }
  }

  if (configData) {
    els.noInstallNotice.hidden = true;
    els.botConfigForm.hidden = false;
    els.greetingTemplate.value = configData.greeting_template || "";
    els.rulesText.value = configData.rules_text || "";
    els.botEnabled.checked = Boolean(configData.enabled);
    updateCounters();
    updatePreview();
  }
}

els.claimBtn.addEventListener("click", async () => {
  els.claimBtn.disabled = true;
  els.claimFeedback.hidden = true;
  els.claimReviewNotice.hidden = true;

  const res = await api(`/api/communities/${communityId}/claim`, { method: "POST" });
  els.claimBtn.disabled = false;

  if (res.status === 200 && res.data?.code) {
    els.claimPrompt.hidden = true;
    els.claimBox.hidden = false;
    els.claimCommand.textContent = res.data.command;
    if (res.data.expires_at) {
      startCountdown(res.data.expires_at);
    }
    return;
  }

  if (res.status === 202) {
    els.claimPrompt.hidden = true;
    els.claimReviewNotice.textContent = "Sent to staff for manual review.";
    els.claimReviewNotice.hidden = false;
    return;
  }

  if (res.status === 409) {
    const mins = res.data?.minutes_left;
    const msg = mins
      ? `A claim is already in progress. Try again in ${mins} minute(s).`
      : (res.data?.error || "A claim is already in progress.");
    els.claimFeedback.textContent = msg;
    els.claimFeedback.hidden = false;
    return;
  }

  if (res.status === 429) {
    const secs = res.retryAfter || 60;
    els.claimFeedback.textContent = `Too many attempts. Please wait ${secs} seconds.`;
    els.claimFeedback.hidden = false;
    return;
  }

  els.claimFeedback.textContent = (res.data && res.data.error) || "Could not start claim. Try again.";
  els.claimFeedback.hidden = false;
});

els.copyCommandBtn.addEventListener("click", async () => {
  const text = els.claimCommand.textContent;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    els.copyStatus.textContent = "Command copied to clipboard.";
  } catch {
    els.copyStatus.textContent = "Could not copy automatically. Select and copy the text.";
  }
});

els.checkStatusBtn.addEventListener("click", async () => {
  els.checkStatusBtn.disabled = true;
  els.copyStatus.textContent = "Checking status...";

  const meRes = await api("/api/me/communities");
  els.checkStatusBtn.disabled = false;

  if (meRes.ok && Array.isArray(meRes.data?.items)) {
    const item = meRes.data.items.find((i) => i.id === communityId);
    if (item && item.is_owner) {
      if (countdownTimer) clearInterval(countdownTimer);
      els.copyStatus.textContent = "Ownership verified!";
      await showOwnedView();
      return;
    }
  }

  // Also check bot-config directly
  const botRes = await api(`/api/communities/${communityId}/bot-config`);
  if (botRes.ok) {
    if (countdownTimer) clearInterval(countdownTimer);
    els.copyStatus.textContent = "Ownership verified!";
    await showOwnedView(botRes.data);
    return;
  }

  els.copyStatus.textContent = "Not yet verified. Make sure the bot is an admin and the command was sent in the group.";
});

els.greetingTemplate.addEventListener("input", () => {
  updateCounters();
  updatePreview();
});

els.rulesText.addEventListener("input", () => {
  updateCounters();
  updatePreview();
});

els.botConfigForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (savingConfig) return;

  els.saveStatus.hidden = true;
  els.saveError.hidden = true;
  els.greetingError.hidden = true;
  els.rulesError.hidden = true;
  els.greetingTemplate.removeAttribute("aria-invalid");
  els.rulesText.removeAttribute("aria-invalid");

  const greeting = els.greetingTemplate.value;
  const rules = els.rulesText.value;
  const enabled = els.botEnabled.checked;

  if (greeting.length < 1 || greeting.length > 500) {
    els.greetingTemplate.setAttribute("aria-invalid", "true");
    els.greetingError.textContent = "Greeting template must be between 1 and 500 characters.";
    els.greetingError.hidden = false;
    return;
  }

  if (rules.length > 1000) {
    els.rulesText.setAttribute("aria-invalid", "true");
    els.rulesError.textContent = "Rules text must be 1000 characters or fewer.";
    els.rulesError.hidden = false;
    return;
  }

  savingConfig = true;
  els.saveConfigBtn.disabled = true;
  els.saveConfigBtn.textContent = "Saving...";

  const res = await api(`/api/communities/${communityId}/bot-config`, {
    method: "PUT",
    body: {
      greeting_template: greeting,
      rules_text: rules,
      enabled,
    },
  });

  savingConfig = false;
  els.saveConfigBtn.disabled = false;
  els.saveConfigBtn.textContent = "Save settings";

  if (res.ok) {
    els.saveStatus.textContent = "Settings saved successfully.";
    els.saveStatus.hidden = false;
    updatePreview();
  } else {
    els.saveError.textContent = (res.data && res.data.error) || "Could not save settings. Please try again.";
    els.saveError.hidden = false;
  }
});

async function init() {
  communityId = parseCommunityId();
  if (!communityId) {
    showError("Invalid community ID.");
    return;
  }

  const user = await initNav();
  if (!user) {
    showAuthRequired();
    return;
  }

  els.manageContent.hidden = false;
  await loadCommunityInfo();
}

init();
