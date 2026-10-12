# Sprite Card の雛形

この形に値を入れて、Card全体を出力する。`<<…>>` の部分だけを置き換え、それ以外は変えない。

```markdown
---
id: <<半角英数字とハイフンのid。例: manga-sprite-claude-code>>
title: <<まんがのタイトル>> アニメ
play_mode: card
author: <<著者名（システムの指定に従う）>>
description: <<1〜2文の説明。例: まんが「…」のコマを順に動かして見せるSpriteアニメ。>>
cover_image: <<1ページ目の画像URL>>
theme_color: black
---
# <<まんがのタイトル>>

▶ を押すと、まんがのコマが順に再生されます。速度と縦横（9:16／16:9）はボタンで切り替えられます。

<div class="sprite-player" data-sprite='{"format":"portrait","pages":["<<ページ1の画像URL>>","<<ページ2の画像URL>>"],"panels":[{"page":0,"x":0.004,"y":0.004,"w":0.58,"h":0.31,"dur":3.4,"move":"zoom","audio":"<<音声URL>>"},{"page":0,"x":0.59,"y":0.004,"w":0.4,"h":0.31,"dur":2.5,"move":"none"}]}'></div>

<script>
var s = document.createElement('script');
s.src = location.origin + '/js/sprite-player.v1.js';
document.head.appendChild(s);
</script>
```

## 書き方の決まり
- `data-sprite` の中の JSON は1行にする。`pages` は画像URLの配列、`panels` は上の例のコマを、全コマ分並べる。
- `x, y, w, h` は、`detect_manga_panels` が返した値をそのまま使う（0〜1の比率）。
- `dur` は秒数、`move` は `"zoom"` か `"none"`。
- `audio` は、そのコマの読み上げ音声のURL（`generate_speech` の `url`）。セリフがないコマ、音声を作れなかったコマには書かない。
- 最後の `<script>` は、そのまま写す。
