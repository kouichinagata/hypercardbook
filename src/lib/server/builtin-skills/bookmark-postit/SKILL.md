---
name: bookmark-postit
description: "本の右上にしおりを表示し、読書位置を自動保存・復旧します。しおり、読書位置の保存、続きから読む機能を本に付けたいときに使います。"
---
しおり機能（bookmark-postit）を有効にするには、本のYAMLフロントマターに必ず以下のイベントフックをそのまま記述しなさい。

```yaml
on_open_stack: |
  let p = getData("bookmark_" + stackId);
  if (p !== null) goCard(Number(p));
on_close_card: |
  saveData("bookmark_" + stackId, currentCard);
```
