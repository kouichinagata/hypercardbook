// HyperCardBook sprite player v1
// Card 内の <div class="sprite-player" data-sprite='{...}'> を canvas で再生する。
// data-sprite: { format?: 'portrait'|'landscape', pages: [url], panels: [{ page, x, y, w, h, dur, move?, audio? }] }
//   x,y,w,h はページ画像に対する 0〜1 の比率、dur は秒、move は 'zoom'(既定) | 'none'
//   audio は読み上げ音声の URL（省略可）。コマが切り替わるたびに再生し、速度の切り替えに追従する
(function () {
    if (window.__spritePlayerV1) return;
    window.__spritePlayerV1 = true;

    var FRAMES = { portrait: [540, 960], landscape: [960, 540] };
    var MAX_WIDTH = { portrait: '360px', landscape: '640px' };
    var ZOOM = 0.12;

    var style = document.createElement('style');
    style.textContent =
        '.sprite-player{margin:1em auto;text-align:center}' +
        '.sprite-player canvas{display:block;margin:0 auto;width:100%;background:#000;border-radius:6px}' +
        '.sprite-player .sp-bar{margin-top:.5em;display:flex;gap:.5em;justify-content:center;align-items:center;flex-wrap:wrap}' +
        '.sprite-player .sp-bar button,.sprite-player .sp-bar select{font-size:1rem;padding:.3em .6em}';
    document.head.appendChild(style);

    function init(el) {
        if (el.dataset.spriteReady) return;
        var data;
        try { data = JSON.parse(el.getAttribute('data-sprite')); } catch (e) { return; }
        if (!data || !Array.isArray(data.pages) || !Array.isArray(data.panels) || !data.panels.length) return;
        el.dataset.spriteReady = '1';

        var fmt = data.format === 'landscape' ? 'landscape' : 'portrait';
        var speed = 1, t = 0, playing = false, last = 0;
        var total = data.panels.reduce(function (sum, p) { return sum + (p.dur > 0 ? p.dur : 1); }, 0);

        var images = data.pages.map(function (url) {
            var img = new Image();
            img.onload = draw;
            img.src = url;
            return img;
        });

        // 音声はコマごとに作り、初めて再生するときに読み込む（再生中のコマだけ鳴らす）
        var sounds = [], curIdx = -1, muted = false;
        function soundAt(i) {
            var url = data.panels[i] && data.panels[i].audio;
            if (!url) return null;
            if (!sounds[i]) {
                sounds[i] = new Audio(url);
                sounds[i].preload = 'auto';
            }
            return sounds[i];
        }
        function stopSound(i) {
            var a = sounds[i];
            if (a) { a.pause(); a.currentTime = 0; }
        }
        function syncSound(idx, restart) {
            if (idx !== curIdx) {
                if (curIdx >= 0) stopSound(curIdx);
                curIdx = idx;
                restart = true;
            }
            var a = soundAt(idx);
            if (!a) return;
            a.muted = muted;
            a.playbackRate = speed;
            if (restart) a.currentTime = 0;
            if (a.paused && a.currentTime < (a.duration || Infinity)) a.play().catch(function () {});
        }
        function pauseSound() {
            if (curIdx >= 0 && sounds[curIdx]) sounds[curIdx].pause();
        }

        var hasAudio = data.panels.some(function (p) { return !!p.audio; });
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        var bar = document.createElement('div');
        bar.className = 'sp-bar';
        bar.innerHTML =
            '<button type="button" class="sp-play">▶</button>' +
            (hasAudio ? '<button type="button" class="sp-mute" title="sound">🔊</button>' : '') +
            '<select class="sp-speed"><option value="1">standard</option><option value="1.5">1.5x</option><option value="2">2x</option></select>' +
            '<select class="sp-fmt"><option value="portrait">9:16</option><option value="landscape">16:9</option></select>';
        el.appendChild(canvas);
        el.appendChild(bar);

        var playBtn = bar.querySelector('.sp-play');
        var fmtSel = bar.querySelector('.sp-fmt');
        fmtSel.value = fmt;

        function resize() {
            var f = FRAMES[fmt];
            canvas.width = f[0];
            canvas.height = f[1];
            canvas.style.maxWidth = MAX_WIDTH[fmt];
        }

        // 時刻 t にいるコマの番号と、そのコマ内の進み具合（0〜1）
        function locate() {
            var acc = 0;
            for (var i = 0; i < data.panels.length; i++) {
                var dur = data.panels[i].dur > 0 ? data.panels[i].dur : 1;
                if (t < acc + dur) return { idx: i, u: (t - acc) / dur };
                acc += dur;
            }
            return { idx: data.panels.length - 1, u: 1 };
        }

        function draw() {
            var W = canvas.width, H = canvas.height;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, W, H);

            var pos = locate(), panel = data.panels[pos.idx], u = pos.u;
            var img = images[panel.page || 0];
            if (!img || !img.complete || !img.naturalWidth) return;

            var sx = panel.x * img.naturalWidth, sy = panel.y * img.naturalHeight;
            var sw = panel.w * img.naturalWidth, sh = panel.h * img.naturalHeight;
            var s = Math.min(W / sw, H / sh) * (panel.move === 'none' ? 1 : 1 + ZOOM * u);
            var dw = sw * s, dh = sh * s;
            ctx.drawImage(img, sx, sy, sw, sh, (W - dw) / 2, (H - dh) / 2, dw, dh);
        }

        function tick(now) {
            if (!playing) return;
            t += ((now - last) / 1000) * speed;
            last = now;
            if (t >= total) {
                t = 0;
                playing = false;
                playBtn.textContent = '▶';
                if (curIdx >= 0) stopSound(curIdx);
                curIdx = -1;
                draw();
                return;
            }
            syncSound(locate().idx, false);
            draw();
            requestAnimationFrame(tick);
        }

        playBtn.addEventListener('click', function () {
            playing = !playing;
            playBtn.textContent = playing ? '❚❚' : '▶';
            if (playing) {
                last = performance.now();
                // 再生ボタンのクリック中に鳴らし始める（スマホは操作と同時でないと音を出せない）
                syncSound(locate().idx, false);
                requestAnimationFrame(tick);
            } else {
                pauseSound();
            }
        });
        var muteBtn = bar.querySelector('.sp-mute');
        if (muteBtn) {
            muteBtn.addEventListener('click', function () {
                muted = !muted;
                muteBtn.textContent = muted ? '🔇' : '🔊';
                if (curIdx >= 0 && sounds[curIdx]) sounds[curIdx].muted = muted;
            });
        }
        bar.querySelector('.sp-speed').addEventListener('change', function (e) {
            speed = parseFloat(e.target.value) || 1;
            if (curIdx >= 0 && sounds[curIdx]) sounds[curIdx].playbackRate = speed;
        });
        fmtSel.addEventListener('change', function (e) {
            fmt = e.target.value === 'landscape' ? 'landscape' : 'portrait';
            resize();
            draw();
        });

        resize();
        draw();
    }

    function scan() {
        var nodes = document.querySelectorAll('.sprite-player[data-sprite]');
        for (var i = 0; i < nodes.length; i++) init(nodes[i]);
    }

    scan();
    // Card の本文は後から描画されることがあるので、追加された要素も拾う
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
