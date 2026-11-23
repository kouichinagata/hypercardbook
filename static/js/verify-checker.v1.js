// MarkdownAI Verify Checker card: the Verify button loads this file, so it works wherever the card is shown.
window.hcbVerifyCheck = async function () {
  var urlEl = document.getElementById('vc-url');
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
      body: JSON.stringify({ url: urlEl.value.trim() })
    });
    var data = await res.json().catch(function () { return {}; });
    if (data.result === 'match') {
      var r = data.record, rows = [['Document ID', r.documentId], ['Completed at', when(r.completedAt)]];
      (r.signers || []).forEach(function (s) { rows.push([s.method === 'stamp' ? 'Seal' : 'Signer', (s.name || 'Unnamed') + ' (' + s.kind + ') - ' + when(s.signedAt)]); });
      rows.push(['SHA-256', r.sha256]);
      show('match', 'Match', 'This card is identical to the sealed record.', rows);
    } else if (data.result === 'mismatch') {
      show('mismatch', 'Possibly tampered', 'This card differs from its sealed record. Even one changed character or line ending gives a different hash.');
    } else {
      show('unverifiable', 'Cannot verify', data.error || 'The verification service did not respond. Please try again later.');
    }
  } catch (e) {
    show('unverifiable', 'Cannot verify', 'The verification service could not be reached. Please try again later.');
  } finally {
    btn.disabled = false; btn.textContent = 'Verify';
  }
};
