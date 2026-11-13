# queue_picture_book_pages の書き方

システムが、あなたの指示から画像用プロンプトを組み立てる（画風、キャラの外見、文字の禁止、綴じ目の余白、複数場面の枠の指定、参照画像）。
あなたは下の項目だけを、**英語で**書く（本の文章は本のMarkdownに、元の言語で書く）。

## 最初の呼び出しだけ

### style（画風、英語1行）
例：`soft watercolor picture-book illustration, warm pastel colors, gentle outlines, hand-painted paper texture`
他の例：`colored pencil drawing, soft hatching, warm tones` / `pastel crayon texture, bright and cozy` / `layered paper cut-out collage with soft shadows`

### characters
```
{ "id": "mimi", "appearance": "Mimi — a small cream-white rabbit with long soft ears with pink insides, round rosy cheeks, big dark eyes, a tiny pink nose, round chubby body, no clothes" }
```
- id は短い英字。種類、年齢、毛色・髪、目、体型、服装、小物を書く。全ページに同じ文で貼られる。

## 各ユニット（units の1要素）
| 項目 | 内容 |
|---|---|
| unit | 絵の通し番号（1から）。文章だけのカードには付けない |
| type | `cover`（表紙。最初のunit 1だけ。文字なし）／`single`（1場面）／`multi`（2〜4場面を1枚に）／`wide`（見開き1枚）／`grid`（別々のページの絵を2つか4つ、1枚に描いて切り分ける。標準） |
| setting | 場所・時間・雰囲気。例：`cozy bedroom at dawn, wooden bed with blue checkered quilt, yellow curtains` |
| characters | 出るキャラのidの配列 |
| composition | 距離・角度・主役の位置・余白。multi は各場面の大きさ・形・配置 |
| scenes | single/wide は1つ。multi は2〜4つ（読む順）。grid はちょうど2つか4つ（ページ順） |
| source_url | wide / grid だけ。描けた横長の絵のURL（切るのだけ失敗したとき） |

### cover の例（unit 1）
```
{"unit":1,"type":"cover","setting":"sunny meadow with a small cottage, morning","characters":["mimi"],"composition":"Mimi large and centered, smiling, waving; cottage and sunrise behind her","scenes":["Mimi stands in the meadow at sunrise, the cottage and a blue bird behind her."]}
```
### single の例
```
{"unit":1,"type":"single","setting":"sunny meadow with a big oak tree and a small cottage with a red roof, morning","characters":[],"composition":"wide establishing shot, sun rising in the center, cottage on the right, empty sky on top","scenes":["The sun rises over the hills; a blue bird sits on the cottage chimney."]}
```
### multi の例
```
{"unit":2,"type":"multi","setting":"cozy bedroom at dawn, same bed with blue checkered quilt","characters":["mimi"],"composition":"One large scene on the lower left, one diagonal scene on the upper right, one small scene at the lower right; soft painted borders","scenes":["Mimi sleeps peacefully in the bed, smiling, covered by the blue checkered quilt.","Mimi wakes up, stretches both arms up, eyes closed, happy open mouth.","Mimi peeks out of the window, curtains tied back, sunrise outside."]}
```
### grid の例（4ページを1枚で）
```json
{"unit":3,"type":"grid","setting":"Cinderella's kitchen and the garden, same warm storybook look","characters":["cinderella"],"composition":"each panel a medium shot with the subject centered and calm space above","scenes":["Cinderella sweeps the kitchen floor at dawn.","Cinderella feeds the mice crumbs by the hearth.","A letter from the palace arrives at the door.","The stepsisters read the letter, excited, while Cinderella watches from the stairs."]}
```

### wide の例
```
{"unit":5,"type":"wide","setting":"field of glowing flowers at dusk, stars appearing","characters":["mimi"],"composition":"Mimi small on the left third looking right at a huge glowing tree on the right third; sky and flowers flow across the middle","scenes":["Mimi discovers a giant tree covered in tiny lights."]}
```

## 最後の呼び出しだけ：book_markdown
```
---
id: mimi-and-the-sunrise
title: ミミと あさひ
author: （システムが指示した作者の名前。HyperCardBook や Claude にしない）
theme_color: black
layout: full
cover_image: {{UNIT_1}}
picture_book: {"style":"soft watercolor picture-book illustration, warm pastel colors","sheet":"{{SHEET}}","characters":[{"id":"mimi","appearance":"Mimi — a small cream-white rabbit …"}]}
---

<style>
.pb-page { position: relative; width: 100%; height: 100%; }
.pb-text { position: absolute; left: 6%; right: 6%; bottom: 5%; margin: 0; padding: 0.6em 0.9em; font-family: serif; font-size: 1.3em; line-height: 1.8; text-align: center; color: #3b2f2a; background: rgba(255, 250, 240, 0.82); border-radius: 14px; }
.pb-textpage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 10%; box-sizing: border-box; background: #fffaf0; }
.pb-body { margin: 0; font-family: serif; font-size: 1.4em; line-height: 2; text-align: center; color: #3b2f2a; }
.pb-missing { display: flex; align-items: center; justify-content: center; height: 100%; color: #8a7a70; }
</style>

<div class="pb-page"><img src="{{UNIT_2}}" alt=""><p class="pb-text">あさが きました。おひさまが のぼります。</p></div>

***

<div class="pb-page"><img src="{{UNIT_3}}" alt=""><p class="pb-text">ミミは ぐっすり ねむって いました。</p></div>

***

<div class="pb-textpage"><p class="pb-body">（文章だけのページ）</p></div>

***

<div class="pb-textpage"><p class="pb-body">おしまい<br><br>原作：（原作があるときだけ。例：アンデルセン「みにくいアヒルの子」）<br>作：（作者の名前）</p></div>
```
- `layout: full`、`cover_image: {{UNIT_1}}`（表紙の絵）、`author`（作者の名前）を必ず入れる。タイトルと作者名は、本が表紙に表示する。
- 絵は `<img src="{{UNIT_n}}" alt="">`（見開きは `{{UNIT_n_L}}` / `{{UNIT_n_R}}`、grid は `{{UNIT_n_1}}`〜`{{UNIT_n_4}}`）。`<div class="pb-page">…</div>` は**1行で書き、中に空行を入れない**。文章は `<p class="pb-text">` で絵に重ねる。文章内の改行は `<br>`。
- 文章だけのカードは `<div class="pb-textpage"><p class="pb-body">…</p></div>`。
- `<style>` ブロックは本に1つだけ、上の内容をそのまま入れる。
- `picture_book:` は **1行のJSON**。中に `---` を入れない。キャラシートのURLは `{{SHEET}}` と書く（システムが差し込む）。
- 描けなかった絵は、システムが注記に置き換える。

## 続きの依頼・部分的な描き直し
- 対象ユニットだけを units に入れる（1回4枚まで）。`character_sheet_url` に記録済みのキャラシートURLを入れる（新しく描かない）。style と characters は記録から写す。
- **book_markdown は渡さない**。本の中の「未生成」の枠（`<span class="pb-missing" data-unit="N">`）が、できた絵で1枚ずつ埋まる。文章は変わらない。
- 見開き（wide）やまとめ描き（grid）で「切るのだけ失敗」と出たとき：そのユニットに、表示された `source_url` を入れる。絵は描き直さず、切るだけを再試行する。
- 結果の表示（成功・失敗の理由・429の待ち時間）はチャットに出る。成功した絵は描き直さない。
