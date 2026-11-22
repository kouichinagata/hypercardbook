---
id: markdownai-verify-checker
title: MarkdownAI Verify Checker
play_mode: card
description: Check whether a Markdown document matches its sealed MarkdownAI Verify record.
theme_color: white
is_public: true
---
<style>
.vc { max-width: 720px; margin: 0 auto; font-size: 15px; }
.vc label { display: block; font-weight: 650; margin: 14px 0 6px; }
.vc input, .vc textarea { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #c7ced8; border-radius: 6px; font: 13px ui-monospace, Menlo, monospace; }
.vc textarea { min-height: 220px; resize: vertical; }
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

Paste the document ID and the Markdown of a completed MarkdownAI Verify document. The checker compares it with the SHA-256 of the sealed record. No sign-in is needed, and the Markdown is not stored.

<div class="vc">
<label for="vc-id">Document ID</label>
<input id="vc-id" type="text" placeholder="0190f3a2-xxxx-7xxx-xxxx-xxxxxxxxxxxx" autocomplete="off" spellcheck="false">
<label for="vc-md">Markdown</label>
<textarea id="vc-md" placeholder="Paste the whole Markdown, exactly as downloaded" spellcheck="false"></textarea>
<button id="vc-btn" type="button" onclick="window.hcbVerifyCheck && window.hcbVerifyCheck()">Verify</button>
<div id="vc-result" class="vc-result" aria-live="polite"></div>
</div>

<script>
window.hcbVerifyCheck = async function () {
  var idEl = document.getElementById('vc-id'), mdEl = document.getElementById('vc-md');
  var btn = document.getElementById('vc-btn'), out = document.getElementById('vc-result');
  function show(kind, title, text, rows) {
    out.className = 'vc-result vc-' + kind;
    out.textContent = '';
    var h = document.createElement('h3'); h.textContent = title; out.appendChild(h);
    if (text) { var p = document.createElement('div'); p.textContent = text; out.appendChild(p); }
    if (rows && rows.length) {
      var t = document.createElement('table');
      rows.forEach(function (r) { var tr = t.insertRow(); tr.insertCell().textContent = r[0]; tr.insertCell().textContent = r[1]; });
      out.appendChild(t);
    }
  }
  var when = function (iso) { try { return new Date(iso).toLocaleString() + ' (' + iso + ')'; } catch (e) { return iso; } };
  btn.disabled = true; btn.textContent = 'Verifying...';
  try {
    var res = await fetch(location.origin + '/api/verify/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verifyId: idEl.value.trim(), markdown: mdEl.value })
    });
    var data = await res.json().catch(function () { return {}; });
    if (data.result === 'match') {
      var r = data.record, rows = [['Document ID', r.verifyId], ['Record', r.recordType === 'issued' ? 'Certificate issued' : 'Completed'], ['Completed at', when(r.completedAt)]];
      (r.signers || []).forEach(function (s) { rows.push([s.method === 'stamp' ? 'Seal' : 'Signer', (s.name || 'Unnamed') + ' (' + s.kind + ') - ' + when(s.signedAt)]); });
      rows.push(['SHA-256', r.sha256]);
      show('match', 'Match', 'This Markdown is identical to the sealed record.', rows);
    } else if (data.result === 'mismatch') {
      show('mismatch', 'Possibly tampered', 'This Markdown differs from the sealed record of this document ID. Even one changed character or line ending gives a different hash.');
    } else {
      show('unverifiable', 'Cannot verify', data.error || 'The verification service did not respond. Please try again later.');
    }
  } catch (e) {
    show('unverifiable', 'Cannot verify', 'The verification service could not be reached. Please try again later.');
  } finally {
    btn.disabled = false; btn.textContent = 'Verify';
  }
};
</script>
