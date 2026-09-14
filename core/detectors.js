(function attachDeceptraDetectors(root) {
  "use strict";

  const TYPE_INFO = {
    prechecked_opt_in: ["Pre-selected opt-in", "high", "An optional choice appears selected before you made a decision."],
    confirmshaming: ["Confirmshaming", "medium", "The decline choice uses guilt or embarrassment to influence you."],
    forced_continuity: ["Forced continuity", "high", "A trial or purchase may turn into recurring billing automatically."],
    hidden_fee: ["Hidden or late fee", "high", "A mandatory charge is disclosed late or separately from the advertised price."],
    trick_question: ["Confusing consent wording", "medium", "The wording uses negatives or reversals that can make the choice hard to understand."],
    visual_interference: ["Unequal button hierarchy", "medium", "The preferred action is substantially more prominent than the alternative."],
    forced_action: ["Forced action", "high", "An unrelated action appears required to continue."],
    urgency: ["Urgency pressure", "low", "Time pressure may push you to decide before reviewing the terms."],
    scarcity: ["Scarcity pressure", "low", "Scarcity language may pressure a faster purchase decision."],
    social_proof: ["Social-proof pressure", "low", "Claims about other shoppers may influence the decision without useful verification."]
  };

  const RX = {
    marketing: /\b(marketing|newsletter|partner offers?|promotions?|special offers?|product updates?|shipping protection|insurance|donation|recurring delivery|subscribe)\b/i,
    required: /\b(terms of (?:service|use)|privacy policy|age requirement|required to (?:buy|purchase|place)|billing address)\b/i,
    confirmshaming: /\b(no thanks?[,— -]*(?:i |we )?(?:hate|prefer|don'?t want|do not want|would rather|miss)|continue without supporting|skip (?:this|savings)|i'?ll pay full price|no[,— -]*i don'?t care)\b/i,
    continuity: /\b(renews? automatically|auto[- ]?renew|recurring billing|then (?:you(?:r)?|we) (?:will )?(?:charge|bill)|unless (?:you )?cancel|until (?:you )?cancel|converts? to (?:a )?paid|trial.{0,60}(?:month|year|billing|subscription))\b/i,
    fee: /\b(service fee|platform fee|processing fee|handling (?:fee|charge)|booking fee|mandatory fee|surcharge|convenience fee)\b/i,
    lateFee: /\b(?:added|calculated|shown|applied).{0,45}(?:checkout|final step|next step|payment)|(?:checkout|final step|next step).{0,45}(?:fee|charge)\b/i,
    trick: /\b(?:don'?t|do not|not).{0,35}(?:unsubscribe|opt out|decline|refuse|stop receiving)|uncheck.{0,35}(?:not|don'?t)|check.{0,35}(?:not receive|opt out)\b/i,
    forced: /\b(?:must|required to|need to).{0,45}(?:create an account|sign up|share|subscribe|enable notifications?|provide (?:a )?phone)\b/i,
    urgency: /\b(limited time|ends (?:soon|today)|hurry|act now|today only|last chance|offer expires|\d{1,2}:\d{2}(?::\d{2})?)\b/i,
    scarcity: /\b(only \d+ left|low stock|selling fast|almost gone|in \d+ carts?|\d+ people (?:are )?viewing)\b/i,
    social: /\b(\d+ (?:people|customers|shoppers).{0,35}(?:view|bought|purchase)|just (?:bought|purchased)|popular choice|most people choose)\b/i,
    accept: /\b(accept|agree|allow all|yes|continue|subscribe|start trial|get offer)\b/i,
    reject: /\b(reject|decline|deny|no thanks|necessary only|continue without|skip|not now)\b/i
  };

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function finding(type, evidence, confidence, source, extra = {}) {
    const [title, severity, explanation] = TYPE_INFO[type];
    return {
      id: `${type}:${clean(evidence).toLowerCase().slice(0, 90)}`,
      type,
      title,
      severity,
      confidence: Number(clamp(confidence, 0, 1).toFixed(2)),
      evidence: clean(evidence).slice(0, 300),
      explanation,
      source,
      ...extra
    };
  }

  function dedupe(findings) {
    const seen = new Set();
    return findings.filter((item) => {
      const key = `${item.type}:${item.evidence.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function analyzeCheckboxes(checkboxes) {
    const out = [];
    for (const box of checkboxes || []) {
      const context = clean(box.context);
      const optional = !box.required && !RX.required.test(context);
      if (box.checked && box.defaultChecked && optional && RX.marketing.test(context)) {
        out.push(finding("prechecked_opt_in", context, 0.98, box.selector, { elementSelector: box.selector }));
      }
      if (RX.trick.test(context)) {
        out.push(finding("trick_question", context, 0.88, box.selector, { elementSelector: box.selector }));
      }
    }
    return out;
  }

  function analyzeTextBlocks(blocks) {
    const out = [];
    for (const block of blocks || []) {
      const text = clean(block.text || block);
      const selector = block.selector || "";
      if (text.length < 4) continue;
      if (RX.confirmshaming.test(text)) out.push(finding("confirmshaming", text, 0.92, selector, { elementSelector: selector }));
      if (RX.continuity.test(text)) out.push(finding("forced_continuity", text, 0.94, selector, { elementSelector: selector }));
      if (RX.fee.test(text) && RX.lateFee.test(text)) out.push(finding("hidden_fee", text, 0.9, selector, { elementSelector: selector }));
      if (RX.trick.test(text)) out.push(finding("trick_question", text, 0.84, selector, { elementSelector: selector }));
      if (RX.forced.test(text)) out.push(finding("forced_action", text, 0.86, selector, { elementSelector: selector }));
      if (RX.urgency.test(text)) out.push(finding("urgency", text, 0.78, selector, { elementSelector: selector }));
      if (RX.scarcity.test(text)) out.push(finding("scarcity", text, 0.8, selector, { elementSelector: selector }));
      if (RX.social.test(text)) out.push(finding("social_proof", text, 0.72, selector, { elementSelector: selector }));
    }
    return out;
  }

  function analyzeButtons(buttons) {
    const out = [];
    const accepts = (buttons || []).filter((b) => RX.accept.test(clean(b.text)) && !RX.reject.test(clean(b.text)));
    const rejects = (buttons || []).filter((b) => RX.reject.test(clean(b.text)));
    for (const yes of accepts) {
      for (const no of rejects) {
        if (!yes.group || yes.group !== no.group) continue;
        const areaRatio = Math.max(1, Number(yes.area || 1) / Math.max(1, Number(no.area || 1)));
        const prominenceGap = Number(yes.prominence || 0) - Number(no.prominence || 0);
        if (areaRatio >= 1.6 || prominenceGap >= 2.3) {
          out.push(finding(
            "visual_interference",
            `“${clean(yes.text)}” is much more prominent than “${clean(no.text)}”`,
            clamp(0.7 + Math.min(areaRatio - 1, 2) * 0.08 + Math.max(prominenceGap, 0) * 0.03, 0, 0.96),
            yes.selector,
            { elementSelector: yes.selector, relatedSelector: no.selector }
          ));
        }
      }
    }
    return out;
  }

  function analyzeSnapshot(snapshot) {
    return dedupe([
      ...analyzeCheckboxes(snapshot.checkboxes),
      ...analyzeTextBlocks(snapshot.textBlocks),
      ...analyzeButtons(snapshot.buttons)
    ]).sort((a, b) => ({ high: 3, medium: 2, low: 1 }[b.severity] - ({ high: 3, medium: 2, low: 1 }[a.severity]) || b.confidence - a.confidence));
  }

  const api = { analyzeSnapshot, regexes: RX, typeInfo: TYPE_INFO };
  root.DeceptraDetectors = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
