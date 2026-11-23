---
id: markdownai-verify-checker
title: MarkdownAI Verify Checker
play_mode: card
description: Check whether a card matches its sealed MarkdownAI Verify record.
theme_color: white
is_public: true
---
<style>
.vc { max-width: 720px; margin: 0 auto; font-size: 15px; }
.vc label { display: block; font-weight: 650; margin: 14px 0 6px; }
.vc input { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #c7ced8; border-radius: 6px; font: 13px ui-monospace, Menlo, monospace; }
.vc button { margin-top: 14px; padding: 9px 22px; border: 0; border-radius: 6px; background: #1f3a5f; color: #fff; font-weight: 650; cursor: pointer; }
.vc button:disabled { opacity: .6; cursor: default; }
.vc-result { margin-top: 18px; padding: 14px 16px; border-radius: 8px; border: 1px solid transparent; }
.vc-result:empty { display: none; }
.vc-match { background: #e8f6ee; border-color: #8cc9a4; color: #134a2b; }
.vc-mismatch { background: #fdeceb; border-color: #e3a19b; color: #6b1d16; }
.vc-unverifiable { background: #f2f3f5; border-color: #c7ced8; color: #39424e; }
.vc-result h3 { margin: 0 0 6px; font-size: 17px; }
.vc-result table { border-collapse: collapse; margin-top: 8px; font-size: 13px; }
.vc-result td { padding: 3px 12px 3px 0; vertical-align: top; }
</style>

# MarkdownAI Verify Checker

Paste the URL of a completed MarkdownAI Verify card. The checker compares the card with the SHA-256 of its sealed record. No sign-in is needed.

<div class="vc">
<label for="vc-url">Card URL</label>
<input id="vc-url" type="url" placeholder="https://www.hypercardbook.org/hypercard/…" autocomplete="off" spellcheck="false">
<button id="vc-btn" type="button" onclick="if (window.hcbVerifyCheck) { window.hcbVerifyCheck(); } else { var s = document.createElement('script'); s.src = '/js/verify-checker.v1.js'; s.onload = function () { window.hcbVerifyCheck(); }; document.head.appendChild(s); }">Verify</button>
<div id="vc-result" class="vc-result" aria-live="polite"></div>
</div>
