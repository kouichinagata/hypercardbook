// HyperCardBook PapeRobo Ask API v1 (loaded only on play_mode: miniapp Cards)
// const answer = await paperobo.ask('# 依頼\n…'); // → Markdown string from PapeRobo's AI
//   PapeRobo embeds the MiniApp in a sandboxed iframe (opaque origin), either in the chat or in its own tab page.
//   The prompt is posted only to PapeRobo's window; PapeRobo answers with its own sign-in, AI keys and the chat that opened the MiniApp.
//   ask() may be called many times; PapeRobo allows it on Pro and above only (otherwise it rejects with the plan error PapeRobo returns).
// await paperobo.say('Message'); // posts to the PapeRobo group chat as the MiniApp itself (no AI reply is triggered); Pro and above only
//   Errors have a code: NOT_IN_PAPEROBO, INVALID_PROMPT, INVALID_TEXT, TIMEOUT, or what PapeRobo returns (e.g. a plan restriction).
(function (w) {
    if (w.paperobo && w.paperobo.ask) return;

    var ASK_REQUEST = 'paperobo:ask';
    var ASK_RESULT = 'paperobo:ask:result';
    var SAY_REQUEST = 'paperobo:say';
    var SAY_RESULT = 'paperobo:say:result';
    var MAX_PROMPT = 8000;
    var MAX_SAY = 8000;
    var TIMEOUT_MS = 180000;
    var SAY_TIMEOUT_MS = 30000;
    var PRODUCTION = ['https://paperobo.hypercardbook.org'];
    // A Card served by the local HyperCardBook talks to the local PapeRobo (npm run dev on port 5180).
    var LOCAL = ['http://127.0.0.1:5180', 'http://localhost:5180'];
    var local = /^((markdown\.)?localhost|127\.0\.0\.1)$/.test(w.location.hostname);
    var origins = local ? LOCAL : PRODUCTION;

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

    // One request/response round trip with PapeRobo. `payload` is merged into the posted message.
    function call(request, result, payload, timeoutMs, read) {
        var id = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
        return new Promise(function (resolve, reject) {
            var timer = setTimeout(function () { finish(); reject(failure('TIMEOUT', 'PapeRobo did not answer in time.')); }, timeoutMs);
            function finish() { clearTimeout(timer); w.removeEventListener('message', receive); }
            function receive(event) {
                var data = event.data;
                if (event.source !== w.parent || origins.indexOf(event.origin) < 0) return;
                if (!data || data.type !== result || data.id !== id) return;
                finish();
                var value = data.error ? undefined : read(data);
                if (value) resolve(value.value);
                else reject(failure(data.error && data.error.code || 'REQUEST_FAILED', data.error && data.error.message || 'PapeRobo could not complete the request.'));
            }
            w.addEventListener('message', receive);
            // targetOrigin keeps the message from reaching any parent other than PapeRobo.
            payload.type = request;
            payload.id = id;
            for (var i = 0; i < origins.length; i++) w.parent.postMessage(payload, origins[i]);
        });
    }

    function ask(prompt) {
        if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT)
            return Promise.reject(failure('INVALID_PROMPT', 'paperobo.ask(prompt) needs a non-empty string of up to ' + MAX_PROMPT + ' characters.'));
        if (!framedByPapeRobo())
            return Promise.reject(failure('NOT_IN_PAPEROBO', 'paperobo.ask is available only when this MiniApp is opened from PapeRobo.'));
        return call(ASK_REQUEST, ASK_RESULT, { prompt: prompt }, TIMEOUT_MS, function (data) {
            return typeof data.markdown === 'string' ? { value: data.markdown } : null;
        });
    }

    function say(text) {
        if (typeof text !== 'string' || !text.trim() || text.length > MAX_SAY)
            return Promise.reject(failure('INVALID_TEXT', 'paperobo.say(text) needs a non-empty string of up to ' + MAX_SAY + ' characters.'));
        if (!framedByPapeRobo())
            return Promise.reject(failure('NOT_IN_PAPEROBO', 'paperobo.say is available only when this MiniApp is opened from PapeRobo.'));
        return call(SAY_REQUEST, SAY_RESULT, { text: text }, SAY_TIMEOUT_MS, function (data) {
            return data.ok === true ? { value: undefined } : null;
        });
    }

    w.paperobo = Object.freeze({ ask: ask, say: say });
})(window);
