# Deceptra Chrome Extension

Deceptra is a privacy-first Manifest V3 extension that detects manipulative consent and checkout patterns. It scans DOM state locally, highlights relevant elements, and explains why a pattern may manipulate the user. An optional Vercel endpoint can review ambiguous, sanitized context with an LLM.

## What works

- Pre-selected optional marketing, protection, donation, and subscription controls
- Confirmshaming and guilt-based decline copy
- Automatic renewal and forced-continuity language
- Late or separately disclosed mandatory fees
- Confusing opt-out wording and forced account/subscription actions
- Unequal accept/reject button hierarchy using area and visual prominence
- Urgency, scarcity, and unverifiable social-proof pressure
- Page badge, popup summary, injected findings panel, and element highlighting
- MutationObserver rescans for dynamically rendered checkout interfaces
- No reading of password, card, form-entry, or other input values

## Install locally

1. Download and unzip `deceptra-extension-v0.1.1.zip`, or use this repository folder directly.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the folder containing `manifest.json` (the generated `dist/` folder after packaging).
5. Open `demo/index.html` through a local web server or visit an HTTP(S) checkout page.
6. Click the Deceptra toolbar icon and choose **Scan this page**.

## Test and package

Requires Node.js 20 or later.

```bash
npm test
npm run package
```

The package command creates `deceptra-extension-v0.1.1.zip` with extension runtime files only.

## Optional Vercel AI review

The extension works locally without Vercel. To enable contextual AI review:

1. Import this GitHub repository into Vercel.
2. Set `OPENAI_API_KEY` in Vercel's encrypted environment settings. Never commit it.
3. Optionally set `OPENAI_MODEL` and `ALLOWED_EXTENSION_ORIGIN`.
4. Deploy and copy `https://YOUR-PROJECT.vercel.app/api/analyze`.
5. Open Deceptra settings, paste the endpoint, enable AI review, and save.

The backend limits and sanitizes the snapshot. It receives checkbox state, visible labels, button copy and visual measurements, and nearby UI text. It does not receive input values, passwords, payment fields, cookies, or full HTML.

## Architecture

```text
Page DOM → local sanitizer → deterministic detectors → popup / page panel
                         └── optional sanitized snapshot → Vercel → LLM findings
```

The deterministic layer is deliberately conservative and mirrors the benchmark taxonomy. The trained DistilRoBERTa model reached 96.3% accuracy and 96.4% F1 on the held-out text benchmark, but its 306 MB weights are intentionally not bundled in Chrome. For the hackathon, the optional LLM endpoint supplies contextual review while DOM-based rules cover patterns a text model cannot see.

## Important limitations

- A warning is evidence for review, not a legal conclusion.
- Cross-origin iframes are not scanned in v0.1.
- True price-history comparison requires observing multiple checkout steps.
- Visual hierarchy detection is heuristic and varies with site design.
- The academic text benchmark is not a substitute for a current, independent real-flow evaluation.

## Privacy and security

- Local scanning is the default; AI review is opt-in.
- Form values are never collected.
- API keys belong only in Vercel environment variables.
- The API response is not cached and the endpoint rejects oversized payloads.
- Restrict the deployed endpoint to the assigned Chrome extension origin before public release.

## Repository deployment vs. Chrome Web Store

GitHub can host the source and downloadable ZIP. Installing for a demo uses **Load unpacked**. Public Chrome Web Store distribution requires a separate developer account, privacy disclosure, store listing, review, and submission.
