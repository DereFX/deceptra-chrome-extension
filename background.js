"use strict";

const DEFAULTS = {
  enabled: true,
  showPageBadge: true,
  aiEnabled: false,
  apiEndpoint: "",
  minimumSeverity: "low"
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(DEFAULTS);
  await chrome.storage.sync.set(current);
  chrome.action.setBadgeBackgroundColor({ color: "#b42318" });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "FINDINGS_UPDATED") {
    const count = Array.isArray(message.findings) ? message.findings.length : 0;
    if (sender.tab?.id != null) {
      chrome.action.setBadgeText({ tabId: sender.tab.id, text: count ? String(Math.min(count, 99)) : "" });
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "AI_ANALYZE") {
    analyzeWithEndpoint(message.snapshot)
      .then((findings) => sendResponse({ ok: true, findings }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

async function analyzeWithEndpoint(snapshot) {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  if (!settings.aiEnabled || !settings.apiEndpoint) return [];
  const payload = JSON.stringify({ snapshot });
  if (payload.length > 80_000) throw new Error("Sanitized page context is too large for AI analysis.");

  const response = await fetch(settings.apiEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload
  });
  if (!response.ok) throw new Error(`AI endpoint returned ${response.status}`);
  const data = await response.json();
  return Array.isArray(data.findings) ? data.findings.slice(0, 20) : [];
}
