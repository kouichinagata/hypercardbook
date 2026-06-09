# HyperCardBook Skills Specification

本書は、Anthropic（Claude Code）のSkills設計思想と、それに基づいて開発されたHyperCardBookのSkills拡張管理機能の仕様書です。

---

## 1. Anthropic (Claude Code) の Skills 概念と構造

Anthropicのアーキテクチャにおいて、Skillは単なるプロンプトテンプレートではなく、独立した機能拡張パッケージとして定義されます。

### フォルダ構成
```text
.claude/skills/
└── skill-name/
    ├── SKILL.md           # 必須：メタデータとSkill指示文本体
    ├── scripts/           # 任意：補助用実行コード（Python, shell等）
    └── resources/         # 任意：テンプレートや静的データ
```

### SKILL.md の記述構造
`SKILL.md` の内部は、YAML形式のメタデータブロック（YAML Frontmatter）と、Markdown形式の指示文ブロック（Markdown Body）に分かれます。

```markdown
---
name: "Skillの表示名"
description: "AIがこのSkillをいつ呼び出すすべきかを判断するための役割定義（最重要）"
dependencies: "python>=3.8"
---
# 指示文本体 (Skill文)
AIエージェントへの具体的な動作ルール、フォーマットの指定、記述ルールをここにMarkdownで記述します。
```

### 設計の特徴
* **コンテキスト・ドキュメント駆動**:
  OpenAI等の「スキーマで厳格に引数と型を定義するJSON構造」とは対照的に、Markdown本文の中に自然言語や変数プレースホルダー（例: `{text}`, `{to_lang}`）を配置して指示します。LLMの高度なコンテキスト解析能力に依存してバインディングを解決します。
* **段階的開示 (Progressive Disclosure)**:
  システムはディスカバリー用メタデータ（description）を元に、トリガーされたSkillのフォルダ内容のみを動的に読み込むため、コンテキストウィンドウの不要な肥大化を防ぎます。

---

## 2. HyperCardBook の Skills 仕様と設計

HyperCardBookでは、この `SKILL.md` の仕様をカプセル化した軽量な管理構造を採用し、AI（Gemini 3.5 Flash）とフロントエンドを統合しています。

### データ構造 (JSON)
メタデータおよびSkill文を、Supabaseのユーザープロファイル（`user_metadata`）に以下のJSONオブジェクト配列として保持します。

```typescript
interface Plugin {
    id: string;          // ユニーク識別子
    name: string;        // Skill名（YAML name に相当）
    description: string; // 説明文（YAML description に相当、最大200文字）
    kinds: string;       // 種別。ユーザーが編集可能なのは "Skills" のみ
    owner: string;       // 所有者（"HyperCardBook" もしくは "My plugin"）
    skill: string;       // Skill文（指示文本体、YAMLボディに相当）
}
```

### 編集・作成時の振る舞い

#### 1. システムスキルのインプレース自作化（クローン）
* 設定画面のテーブルから `Reading aloud`（Kinds: `Skills`, Owner: `HyperCardBook`）を選択した場合でも、下部の編集フォームで直接編集が可能です。
* ユーザーがフォーム（Name, Description, Skill文のいずれか）を編集した瞬間に、自動で `Owner` を `My plugin` に書き換え、ユーザー独自のカスタムスキルとして `userPlugins` 配列に挿入します。
* 再度元の標準システムスキルに戻したい場合は、画面上部の「Add」からいつでもオリジナルを再読込できます。
* `Kinds` が `Skills` 以外のプラグインは、ユーザーによる編集を許可しません（Read Only）。

#### 2. インライン新規作成（New）
* `New` ボタンを押すと、テーブルの選択をクリアし、下部の編集フォーム（Name, Description, Skill文）を空にします（画面遷移なしのインライン方式）。
* 編集フォーム横の「Create」を押した時点で正式に新規スキルとして登録・アクティブ化されます。

#### 3. AIによる自動生成・修正
* 編集エリアの直下に「AI指示（AIプロンプト）」の入力欄と「Run」ボタンを配置しています。
* サーバー側のAPIエンドポイント `/api/generate-skill` を呼び出し、AIに以下の挙動を行わせます。
  - **新規作成**: ユーザーの指示から「適切な名称」「役割説明」「Skill文テンプレート」を一度に自動生成する。
  - **既存修正**: 現在エディタに入力されているSkill文を入力として受け取り、その文脈を損なわずに新しい要件をマージする。
* AIは以下の構造化されたJSONデータを返し、フォームに即時反映します。
  ```json
  {
    "name": "スキル名",
    "description": "説明文",
    "skill": "Skill指示文"
  }
  ```

### 4. 実行時（Workspace）の動き
* チャットプロンプト内で `/スキル名` が入力された場合、送信時に対応するSkill文（`p.skill`）を `[Skill Directive: ...]` タグで結合し、AIに送信します（チャットの画面ログには余計な指示文は残りません）。
* AIとの会話中に「〜をSkillsにしといて」とチャットで依頼した際、AIの回答末尾の `[CREATE_SKILL: 名前]` タグをパースして自動保存する処理も、このデータ構造（`skill` および `description`）と同期して機能します。
