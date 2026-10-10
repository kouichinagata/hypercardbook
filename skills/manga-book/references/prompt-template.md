# queue_manga_pages の書き方

システムが、あなたの台本から画像用プロンプトを自動で組み立てる（絵柄、キャラの外見、横書きの指定、文字の余白、参照画像の指定など）。
あなたは下の項目だけを、**英語で（セリフだけ元の言語で）** 書く。

## 最初の呼び出しだけ

### style（絵柄、英語1行）
例：`clean digital anime-style linework, full color, soft shading, bright office colors`

### characters（登場人物の固定の外見）
```
{ "id": "ken", "appearance": "Ken — a 24-year-old Japanese man, short curly dark-brown hair, brown eyes, slim build, navy suit, white shirt, blue tie, employee ID on a blue lanyard" }
```
- id は短い英字。
- 年齢、性別、髪型と髪色、目、体型、服装、小物を書く。これが全ページに同じ文で貼られる。

## 各ページ（pages の1要素）

| 項目 | 内容 |
|---|---|
| page | ページ番号（1から） |
| setting | 場所・時間帯・雰囲気（英語）。例：`bright modern office, daytime, city skyline in the windows` |
| characters | このページに出るキャラの id の配列。例：`["ken","sakura"]` |
| layout | コマ割り（英語）。位置と大きさを言葉で書く。references/layouts.md の型を参考にする。タイトル帯もここ |
| panels | コマごとの文字列の配列（読む順）。コマ数がそのままコマ数になる |

### layout の例
```
Top row: one wide panel across the full width, about 40% of the page height. Below: two rows of two equal panels. A black title banner in the top-left corner reads "#1 技術的には完璧です！".
```

### panels の例（1コマ＝1文字列）
```
Medium shot. Ken at his desk fist-pumps at a laptop; a monitor behind him shows a green checkmark list with no readable text. Speech bubble: 「よし……完成！」
```
```
Close-up. Ken turns toward the camera, beaming. Speech bubble: 「先輩、できました！」
```
- 構図（close-up / medium shot / wide shot / low angle）、動き、表情、セリフを書く。
- セリフは `Speech bubble: 「…」`。ないコマは `No dialogue.`。沈黙は `Speech bubble: 「……」`。
- 画面や看板の中の文字は書かない、または1語だけにする。

## 最後の呼び出しだけ

### book_markdown
本のMarkdown全体。画像の URL の代わりに `{{PAGE_N}}` と書く。
```
---
title: まんがでわかる Claude Code 入門
author: （通常の本のルールどおり）
layout: fill
---

![Page 1]({{PAGE_1}})

***

![Page 2]({{PAGE_2}})

***
…
```

## その他
- aspect_ratio は通常は省略する（既定は縦長の 3:4）。
- 1回の呼び出しは最大30ページ。多いページ数は、何回かに分けて渡す。
