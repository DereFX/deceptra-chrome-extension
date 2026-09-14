"use strict";

const DEFAULTS = { enabled: true };
const count = document.getElementById("count");
const summaryText = document.getElementById("summaryText");
const findingsNode = document.getElementById("findings");
const scanButton = document.getElementById("scan");

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function render(items) {
  count.textContent = String(items.length);
  summaryText.textContent = items.length ? `potential pattern${items.length === 1 ? "" : "s"} detected` : "No obvious manipulation found";
  findingsNode.innerHTML = items.slice(0, 6).map((item) => `<div class="finding ${escapeHtml(item.severity)}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.evidence).slice(0, 110)}</span></div>`).join("");
}

async function messageActive(message) {
  const tab = await activeTab();
  if (!tab?.id || !/^https?:/.test(tab.url || "")) throw new Error("Open a regular website to scan it.");
  return chrome.tabs.sendMessage(tab.id, message);
}

async function refresh() {
  try {
    const response = await messageActive({ type: "GET_FINDINGS" });
    render(response?.findings || []);
  } catch (error) {
    count.textContent = "!";
    summaryText.textContent = error.message;
  }
}

scanButton.addEventListener("click", async () => {
  scanButton.disabled = true; scanButton.textContent = "Scanning…";
  try {
    const response = await messageActive({ type: "SCAN_NOW" });
    render(response?.findings || []);
  } catch (error) {
    findingsNode.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  } finally {
    scanButton.disabled = false; scanButton.textContent = "Scan this page";
  }
});

document.getElementById("openPanel").addEventListener("click", async () => {
  try { await messageActive({ type: "OPEN_PANEL" }); window.close(); } catch (_) {}
});
document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("enabled").addEventListener("change", (event) => chrome.storage.sync.set({ enabled: event.target.checked }));
chrome.storage.sync.get(DEFAULTS).then((settings) => { document.getElementById("enabled").checked = settings.enabled; refresh(); });
