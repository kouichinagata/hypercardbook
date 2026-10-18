// HyperCardBook PapeRobo Ask API v1 (loaded only on play_mode: miniapp Cards)
// const answer = await paperobo.ask('# 依頼\n…'); // → Markdown string from PapeRobo's AI
//   PapeRobo embeds the MiniApp in a sandboxed iframe (opaque origin), either in the chat or in its own tab page.
//   The prompt is posted only to PapeRobo's window; PapeRobo answers with its own sign-in, AI keys and the chat that opened the MiniApp.
//   One call per launch. Errors have a code: NOT_IN_PAPEROBO, LIMIT_EXCEEDED, INVALID_PROMPT, TIMEOUT, or what PapeRobo returns.
(function (w) {
    if (w.paperobo && w.paperobo.ask) return;

    var REQUEST = 'paperobo:ask';
    var RESULT = 'paperobo:ask:result';
    var MAX_PROMPT = 8000;
    var TIMEOUT_MS = 180000;
    var PRODUCTION = ['https://paperobo.hypercardbook.org'];
    // A Card served by the local HyperCardBook talks to the local PapeRobo (npm run dev on port 5180).
    var LOCAL = ['http://127.0.0.1:5180', 'http://localhost:5180'];
    var local = /^(localhost|127\.0\.0\.1)$/.test(w.location.hostname);
    var origins = local ? LOCAL : PRODUCTION;
    var used = false;

    function failure(code, message) {
        var error = new Error(message);
        error.code = code;
        return error;
    }

    // ancestorOrigins (Chrome, Safari) lets a Card opened elsewhere fail at once instead of waiting for the timeout.
    function framedByPapeRobo() {
        if (w.parent === w) return false;
        var ancestors = w.location.ancestorOrigins;
        return !ancestors || !ancestors.length || origins.indexOf(ancestors[0]) >= 0;
    }

    function ask(prompt) {
        if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT)
            return Promise.reject(failure('INVALID_PROMPT', 'paperobo.ask(prompt) needs a non-empty string of up to ' + MAX_PROMPT + ' characters.'));
        if (!framedByPapeRobo())
            return Promise.reject(failure('NOT_IN_PAPEROBO', 'paperobo.ask is available only when this MiniApp is opened from PapeRobo.'));
        if (used)
            return Promise.reject(failure('LIMIT_EXCEEDED', 'paperobo.ask can be called once per launch.'));
        used = true;

        var id = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
        return new Promise(function (resolve, reject) {
            var timer = setTimeout(function () { finish(); reject(failure('TIMEOUT', 'PapeRobo did not answer in time.')); }, TIMEOUT_MS);
            function finish() { clearTimeout(timer); w.removeEventListener('message', receive); }
            function receive(event) {
                var data = event.data;
                if (event.source !== w.parent || origins.indexOf(event.origin) < 0) return;
                if (!data || data.type !== RESULT || data.id !== id) return;
                finish();
                if (typeof data.markdown === 'string') resolve(data.markdown);
                else reject(failure(data.error && data.error.code || 'ASK_FAILED', data.error && data.error.message || 'PapeRobo could not answer.'));
            }
            w.addEventListener('message', receive);
            // targetOrigin keeps the prompt from reaching any parent other than PapeRobo.
            for (var i = 0; i < origins.length; i++) w.parent.postMessage({ type: REQUEST, id: id, prompt: prompt }, origins[i]);
        });
    }

    w.paperobo = Object.freeze({ ask: ask });
})(window);
