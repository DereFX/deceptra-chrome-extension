(function startDeceptra() {
  "use strict";

  if (globalThis.__deceptraContentLoaded) return;
  globalThis.__deceptraContentLoaded = true;

  const DEFAULTS = { enabled: true, showPageBadge: true, aiEnabled: false, minimumSeverity: "low" };
  const state = { findings: [], snapshot: null, settings: DEFAULTS, panelOpen: false, scanTimer: null, aiPending: false };
  const severityRank = { low: 1, medium: 2, high: 3 };
  const FLOW_SELECTOR = "form, [role='dialog'], [aria-modal='true'], [class*='cookie' i], [id*='cookie' i], [class*='consent' i], [id*='consent' i], [class*='checkout' i], [id*='checkout' i], [class*='cart' i], [id*='cart' i], [class*='payment' i], [id*='payment' i], [class*='subscription' i], [id*='subscription' i], [class*='modal' i]";

  function visible(element) {
    if (!element || !(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.05 && rect.width > 1 && rect.height > 1;
  }

  function safeText(element, max = 500) {
    return String(element?.innerText || element?.textContent || "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function selectorFor(element) {
    if (!element) return "";
    if (element.id && /^[A-Za-z][\w-]{0,80}$/.test(element.id)) return `#${CSS.escape(element.id)}`;
    const parts = [];
    let current = element;
    for (let depth = 0; current && current.nodeType === 1 && depth < 4; depth += 1) {
      let part = current.tagName.toLowerCase();
      if (current.classList.length) part += `.${CSS.escape(current.classList[0])}`;
      const siblings = current.parentElement ? [...current.parentElement.children].filter((x) => x.tagName === current.tagName) : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(" > ");
  }

  function labelText(input) {
    const explicit = input.labels ? [...input.labels].map((x) => safeText(x)).join(" ") : "";
    const parent = input.closest("label, fieldset, form, [role='dialog'], section, div");
    return `${explicit} ${input.getAttribute("aria-label") || ""} ${safeText(parent, 350)}`.replace(/\s+/g, " ").trim().slice(0, 500);
  }

  function flowContainer(element) {
    try { return element.closest(FLOW_SELECTOR); } catch (_) { return null; }
  }

  function flowMetadata(element) {
    const container = flowContainer(element);
    return { inFlow: Boolean(container), context: container ? safeText(container, 500) : "" };
  }

  function rgbLuminance(color) {
    const values = String(color).match(/[\d.]+/g);
    if (!values || values.length < 3) return 0.5;
    const rgb = values.slice(0, 3).map((n) => Number(n) / 255).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }

  function prominence(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const backgroundDifference = Math.abs(rgbLuminance(style.backgroundColor) - rgbLuminance(style.color));
    return Math.log10(Math.max(10, rect.width * rect.height)) + backgroundDifference * 2 + (Number.parseFloat(style.fontWeight) >= 600 ? 0.5 : 0);
  }

  function collectSnapshot() {
    const checkboxes = [...document.querySelectorAll("input[type='checkbox'], input[type='radio']")]
      .filter(visible)
      .slice(0, 100)
      .map((input) => ({
        checked: input.checked,
        defaultChecked: input.defaultChecked || input.hasAttribute("checked"),
        required: input.required,
        context: labelText(input),
        selector: selectorFor(input),
        ...flowMetadata(input)
      }));

    const buttonElements = [...document.querySelectorAll("button, [role='button'], input[type='submit'], input[type='button'], a[href]")]
      .filter(visible)
      .filter((element) => safeText(element, 120) || element.value)
      .slice(0, 160);
    const buttons = buttonElements.map((element) => {
      const rect = element.getBoundingClientRect();
      const container = element.closest("form, [role='dialog'], aside, section, main, div");
      const flow = flowMetadata(element);
      return {
        text: safeText(element, 140) || String(element.value || ""),
        selector: selectorFor(element),
        group: selectorFor(container),
        area: rect.width * rect.height,
        prominence: prominence(element),
        ...flow
      };
    });

    const textElements = [...document.querySelectorAll("label, p, li, small, button, a, [role='dialog'], [class*='price'], [class*='total'], [class*='fee'], [class*='trial'], [class*='consent']")]
      .filter(visible)
      .map((element) => ({ text: safeText(element, 650), selector: selectorFor(element), ...flowMetadata(element) }))
      .filter((item) => item.text.length >= 4 && item.text.length <= 650);
    const unique = [];
    const seen = new Set();
    for (const item of textElements) {
      const key = item.text.toLowerCase();
      if (!seen.has(key)) { seen.add(key); unique.push(item); }
      if (unique.length >= 240) break;
    }

    const flowDetected = checkboxes.some((item) => item.inFlow) || buttons.some((item) => item.inFlow) || unique.some((item) => item.inFlow);
    return {
      url: location.origin + location.pathname,
      title: document.title.slice(0, 200),
      checkboxes,
      buttons,
      textBlocks: unique,
      flowDetected,
      capturedAt: new Date().toISOString()
    };
  }

  function filteredFindings(items) {
    const floor = severityRank[state.settings.minimumSeverity] || 1;
    return items.filter((item) => (severityRank[item.severity] || 1) >= floor);
  }

  async function scan({ includeAI = true } = {}) {
    if (!state.settings.enabled) return;
    state.snapshot = collectSnapshot();
    const local = globalThis.DeceptraDetectors.analyzeSnapshot(state.snapshot);
    state.findings = filteredFindings(local);
    render();
    chrome.runtime.sendMessage({ type: "FINDINGS_UPDATED", findings: state.findings }).catch(() => {});

    if (includeAI && state.settings.aiEnabled && !state.aiPending) {
      state.aiPending = true;
      render();
      try {
        const result = await chrome.runtime.sendMessage({ type: "AI_ANALYZE", snapshot: state.snapshot });
        if (result?.ok && Array.isArray(result.findings)) {
          const merged = [...state.findings, ...result.findings.map((x) => ({ ...x, source: "ai" }))];
          state.findings = filteredFindings([...new Map(merged.map((x) => [x.id || `${x.type}:${x.evidence}`, x])).values()]);
        }
      } finally {
        state.aiPending = false;
        render();
      }
    }
  }

  function scheduleScan() {
    clearTimeout(state.scanTimer);
    state.scanTimer = setTimeout(() => scan({ includeAI: false }), 900);
  }

  function highlight(selector) {
    document.querySelectorAll(".deceptra-highlight").forEach((el) => el.classList.remove("deceptra-highlight"));
    if (!selector) return;
    try {
      const element = document.querySelector(selector);
      if (element) {
        element.classList.add("deceptra-highlight");
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } catch (_) {}
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function ensureUI() {
    if (document.getElementById("deceptra-host")) return document.getElementById("deceptra-host").shadowRoot;
    const host = document.createElement("div");
    host.id = "deceptra-host";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      :host{all:initial}.chip{position:fixed;right:18px;bottom:18px;z-index:2147483647;border:0;border-radius:999px;background:#111827;color:#fff;padding:11px 15px;font:600 13px system-ui;box-shadow:0 8px 30px #0004;cursor:pointer}.chip[data-count]:after{content:attr(data-count);margin-left:8px;background:#ef4444;border-radius:999px;padding:2px 7px}.panel{position:fixed;right:18px;bottom:66px;width:min(390px,calc(100vw - 36px));max-height:70vh;overflow:auto;z-index:2147483647;background:#fff;color:#111827;border:1px solid #d1d5db;border-radius:14px;box-shadow:0 18px 55px #0004;font:14px/1.4 system-ui}.hidden{display:none}.head{position:sticky;top:0;background:#111827;color:#fff;padding:15px;border-radius:13px 13px 0 0}.head strong{font-size:16px}.head button{float:right;background:transparent;color:#fff;border:0;font-size:20px;cursor:pointer}.status{font-size:12px;color:#d1d5db}.list{padding:10px}.empty{padding:22px;text-align:center;color:#4b5563}.item{border:1px solid #e5e7eb;border-left:5px solid #f59e0b;border-radius:9px;padding:11px;margin:8px 0;cursor:pointer}.item.high{border-left-color:#dc2626}.item.low{border-left-color:#3b82f6}.row{display:flex;justify-content:space-between;gap:12px}.tag{font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:700}.confidence{font-size:11px;color:#6b7280}.evidence{margin:6px 0;color:#374151;font-style:italic}.why{font-size:12px;color:#4b5563}.foot{padding:10px 14px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:11px}
    </style><button class="chip" type="button">Deceptra</button><section class="panel hidden"><header class="head"><button aria-label="Close">×</button><strong>Deceptra findings</strong><div class="status"></div></header><div class="list"></div><footer class="foot">Local scan only. Password and payment-field values are never read.</footer></section>`;
    document.documentElement.appendChild(host);
    shadow.querySelector(".chip").addEventListener("click", () => { state.panelOpen = !state.panelOpen; render(); });
    shadow.querySelector(".head button").addEventListener("click", () => { state.panelOpen = false; render(); });
    shadow.querySelector(".list").addEventListener("click", (event) => {
      const item = event.target.closest(".item");
      if (item) highlight(item.dataset.selector);
    });
    return shadow;
  }

  function render() {
    const ui = ensureUI();
    const chip = ui.querySelector(".chip");
    const panel = ui.querySelector(".panel");
    chip.hidden = !state.settings.showPageBadge;
    chip.dataset.count = state.findings.length ? String(state.findings.length) : "";
    panel.classList.toggle("hidden", !state.panelOpen);
    ui.querySelector(".status").textContent = state.aiPending ? "Checking ambiguous context with AI…" : `${state.findings.length} potential pattern${state.findings.length === 1 ? "" : "s"}`;
    const emptyTitle = state.snapshot?.flowDetected ? "No obvious manipulation found." : "No checkout or consent flow detected.";
    ui.querySelector(".list").innerHTML = state.findings.length ? state.findings.map((item) => `<article class="item ${escapeHtml(item.severity)}" data-selector="${escapeHtml(item.elementSelector || "")}"><div class="row"><strong>${escapeHtml(item.title)}</strong><span class="tag">${escapeHtml(item.severity)}</span></div><div class="confidence">Confidence ${Math.round((item.confidence || 0) * 100)}% · ${item.source === "ai" ? "AI review" : "local evidence"}</div><div class="evidence">“${escapeHtml(item.evidence)}”</div><div class="why">${escapeHtml(item.explanation)}</div></article>`).join("") : `<div class="empty">${emptyTitle}<br><small>This is not a guarantee that the flow is fair.</small></div>`;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SCAN_NOW") {
      scan({ includeAI: true }).then(() => sendResponse({ ok: true, findings: state.findings, snapshot: state.snapshot }));
      return true;
    }
    if (message?.type === "GET_FINDINGS") {
      sendResponse({ ok: true, findings: state.findings, scanning: state.aiPending });
    }
    if (message?.type === "OPEN_PANEL") { state.panelOpen = true; render(); sendResponse({ ok: true }); }
    return false;
  });

  chrome.storage.sync.get(DEFAULTS).then((settings) => {
    state.settings = settings;
    ensureUI();
    if (settings.enabled) scan({ includeAI: false });
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["checked", "class", "style", "aria-checked"] });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, value] of Object.entries(changes)) state.settings[key] = value.newValue;
    scan({ includeAI: false });
  });
})();
