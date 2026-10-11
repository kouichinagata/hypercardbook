// HyperCardBook sprite player v1
// Card 内の <div class="sprite-player" data-sprite='{...}'> を canvas で再生する。
// data-sprite: { format?: 'portrait'|'landscape', pages: [url], panels: [{ page, x, y, w, h, dur, move?, audio? }] }
//   x,y,w,h はページ画像に対する 0〜1 の比率、dur は秒、move は 'zoom'(既定) | 'none'
//   audio は読み上げ音声の URL（省略可）。コマが切り替わるたびに再生し、速度の切り替えに追従する
//   PC のブラウザでは ⏺ ボタンで、標準速度の動画（音声つき）をこの場で録画して保存できる
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

        // 動画の保存は PC のブラウザだけ（スマホは対象外）
        var canRecord = !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream && (window.AudioContext || window.webkitAudioContext)) &&
            !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

        var hasAudio = data.panels.some(function (p) { return !!p.audio; });
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        var bar = document.createElement('div');
        bar.className = 'sp-bar';
        bar.innerHTML =
            '<button type="button" class="sp-play">▶</button>' +
            (hasAudio ? '<button type="button" class="sp-mute" title="sound">🔊</button>' : '') +
            '<select class="sp-speed"><option value="1">standard</option><option value="1.5">1.5x</option><option value="2">2x</option></select>' +
            '<select class="sp-fmt"><option value="portrait">9:16</option><option value="landscape">16:9</option></select>' +
            (canRecord ? '<button type="button" class="sp-rec" title="Save video">⏺ Save video</button>' : '');
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
        function locate(tt) {
            if (tt === undefined) tt = t;
            var acc = 0;
            for (var i = 0; i < data.panels.length; i++) {
                var dur = data.panels[i].dur > 0 ? data.panels[i].dur : 1;
                if (tt < acc + dur) return { idx: i, u: (tt - acc) / dur };
                acc += dur;
            }
            return { idx: data.panels.length - 1, u: 1 };
        }

        function draw() {
            paint(ctx, canvas.width, canvas.height, t, images);
        }

        // 時刻 tt のフレームを c に描く（画面の再生と録画で共用する）
        function paint(c, W, H, tt, imgs) {
            c.fillStyle = '#000';
            c.fillRect(0, 0, W, H);

            var pos = locate(tt), panel = data.panels[pos.idx], u = pos.u;
            var img = imgs[panel.page || 0];
            if (!img || !img.complete || !img.naturalWidth) return;

            var sx = panel.x * img.naturalWidth, sy = panel.y * img.naturalHeight;
            var sw = panel.w * img.naturalWidth, sh = panel.h * img.naturalHeight;
            var s = Math.min(W / sw, H / sh) * (panel.move === 'none' ? 1 : 1 + ZOOM * u);
            var dw = sw * s, dh = sh * s;
            c.drawImage(img, sx, sy, sw, sh, (W - dw) / 2, (H - dh) / 2, dw, dh);
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

        // ---- 動画の保存（標準速度で1回再生しながら録画し、ファイルとして保存する） ----
        var recBtn = bar.querySelector('.sp-rec');
        var recording = false, cancelRec = false;

        function cacheBust(url) {
            if (!/^https?:/i.test(url)) return url;
            return url + (url.indexOf('?') < 0 ? '?' : '&') + 'rec=1';
        }

        function setRecUi(label) {
            recBtn.textContent = label;
            playBtn.disabled = recording;
            fmtSel.disabled = recording;
            bar.querySelector('.sp-speed').disabled = recording;
            if (muteBtn) muteBtn.disabled = recording;
        }

        // 録画用に、CORS つきで画像と音声を読み直す（キャンバスを汚さないため）
        function loadForRecording(ac) {
            var imgPromises = data.pages.map(function (url) {
                return new Promise(function (resolve, reject) {
                    var im = new Image();
                    im.crossOrigin = 'anonymous';
                    im.onload = function () { resolve(im); };
                    im.onerror = function () { reject(new Error('image')); };
                    im.src = cacheBust(url);
                });
            });
            var audioPromises = data.panels.map(function (p) {
                if (!p.audio) return Promise.resolve(null);
                return fetch(cacheBust(p.audio), { mode: 'cors' })
                    .then(function (r) { if (!r.ok) throw new Error('audio'); return r.arrayBuffer(); })
                    .then(function (b) { return ac.decodeAudioData(b); })
                    .catch(function () { return null; });
            });
            return Promise.all([Promise.all(imgPromises), Promise.all(audioPromises)]);
        }

        function pickMime() {
            var list = [
                ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'],
                ['video/webm;codecs=vp8,opus', 'webm'],
                ['video/webm', 'webm']
            ];
            for (var i = 0; i < list.length; i++) {
                if (MediaRecorder.isTypeSupported(list[i][0])) return { type: list[i][0], ext: list[i][1] };
            }
            return null;
        }

        function recordVideo() {
            if (recording) { cancelRec = true; return; }
            var mime = pickMime();
            if (!mime) { alert('Video recording is not supported in this browser.'); return; }
            if (playing) playBtn.click();
            recording = true;
            cancelRec = false;
            setRecUi('Preparing…');

            var AC = window.AudioContext || window.webkitAudioContext;
            var ac = new AC();
            var f = FRAMES[fmt];
            var rc = document.createElement('canvas');
            rc.width = f[0];
            rc.height = f[1];
            var rctx = rc.getContext('2d');
            var raf = 0;

            function fail(msg) {
                recording = false;
                setRecUi('⏺ Save video');
                try { ac.close(); } catch (e) {}
                alert(msg);
            }

            loadForRecording(ac).then(function (loaded) {
                var imgs = loaded[0], buffers = loaded[1];
                var skipped = 0;
                data.panels.forEach(function (p, i) { if (p.audio && !buffers[i]) skipped++; });

                var dest = ac.createMediaStreamDestination();
                var stream = rc.captureStream(30);
                dest.stream.getAudioTracks().forEach(function (tr) { stream.addTrack(tr); });
                var recorder = new MediaRecorder(stream, { mimeType: mime.type, videoBitsPerSecond: 5000000 });
                var chunks = [];
                recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
                recorder.onstop = function () {
                    cancelAnimationFrame(raf);
                    try { ac.close(); } catch (e) {}
                    var done = !cancelRec;
                    recording = false;
                    setRecUi('⏺ Save video');
                    draw();
                    if (!done) return;
                    var blob = new Blob(chunks, { type: mime.type });
                    var d = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
                    var name = 'sprite-' + fmt + '-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.' + mime.ext;
                    var a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
                    if (skipped) alert('Saved. ' + skipped + ' audio clip(s) could not be loaded and are silent in the video.');
                };

                var starts = [], acc = 0;
                data.panels.forEach(function (p) { starts.push(acc); acc += p.dur > 0 ? p.dur : 1; });

                return ac.resume().then(function () {
                    var t0 = ac.currentTime + 0.3;
                    buffers.forEach(function (b, i) {
                        if (!b) return;
                        var src = ac.createBufferSource();
                        src.buffer = b;
                        src.connect(dest);
                        var at = t0 + starts[i];
                        src.start(at);
                        src.stop(at + (data.panels[i].dur > 0 ? data.panels[i].dur : 1));
                    });
                    recorder.start();
                    setRecUi('⏹ Stop');

                    function frame() {
                        if (cancelRec || ac.currentTime - t0 >= total + 0.3) {
                            if (recorder.state !== 'inactive') recorder.stop();
                            return;
                        }
                        var tt = Math.min(Math.max(ac.currentTime - t0, 0), total - 0.001);
                        paint(rctx, rc.width, rc.height, tt, imgs);
                        paint(ctx, canvas.width, canvas.height, tt, images);
                        recBtn.textContent = '⏹ Stop ' + Math.floor(tt) + '/' + Math.ceil(total) + 's';
                        raf = requestAnimationFrame(frame);
                    }
                    frame();
                });
            }).catch(function (err) {
                fail('Could not record the video. The images or audio may be blocked from this page (CORS).');
            });
        }

        if (recBtn) recBtn.addEventListener('click', recordVideo);

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
