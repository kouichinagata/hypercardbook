# HyperCardBook Skills Specification

本書は、Anthropic（Claude Code）のSkills設計思想と、それに基づいて開発されたHyperCardBookのSkills機能の仕様書です。

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

HyperCardBook の Skills は、上記の Agent Skills（SKILL.md）形式に準拠し、段階的開示によって AI（Gemini）に読み込ませます。`scripts/` の Python / Node.js スクリプトは、Vercel Sandbox（使い捨ての隔離 VM）でのみ実行します（ブラウザやアプリサーバー本体では実行しません）。Skills の作成・利用は Pro プラン以上の機能です。

### 2.1 Skill の構成
| 要素 | 内容 | 制約 |
|---|---|---|
| `name` | 識別子。`/name` で明示呼び出しに使う | 小文字英数字とハイフン、64文字以内 |
| `description` | 「何をするか」と「いつ使うか」 | 必須、1024文字以内 |
| 本文 | AI が従う Markdown の指示 | 100,000文字以内 |
| 添付ファイル | `references/…`（参考資料）、`assets/…`（CSS やテンプレート）、`scripts/…`（`.py` / `.js` のみ） | 1 Skill あたり20ファイル、各200,000文字以内 |

解析・生成・検証は `src/lib/skill-md.ts`（`parseSkillMd` / `serializeSkillMd` / `validateSkill`）に集約しています。

### 2.2 保存先
* **ユーザー Skill**: Supabase の `skills`（name, description, body, enabled）と `skill_files`（path, content）。RLS により本人のみ読み書きできます（`supabase_migration_skills.sql`）。
* **組み込み Skill**: リポジトリの `src/lib/server/builtin-skills/<name>/SKILL.md`。ビルドに同梱され、設定画面で有効化したもの（`user_metadata.active_plugin_ids` に name を含むもの）だけが使われます。同名のユーザー Skill がある場合はユーザー Skill が優先されます。
* `skill_files.path` の DB 制約は `supabase_migration_skills.sql` と `supabase_migration_skill_scripts.sql`（`scripts/*.py|*.js` を追加許可）で定義します。
* API: `/api/skills`（GET 一覧 / GET `?name=` 1件と添付ファイル / POST 作成・更新・有効切替 / DELETE）。サーバー側の処理は `src/lib/server/skills.ts`。
* 旧方式（`data/skills/` と `user_metadata.user_plugins`）からの移行は `npm run skills:migrate`（`--dry-run` 対応）で行います。

### 2.3 実行時の動き（`/api/generate`）
1. **一覧（第1段階）**: 有効な Skill の `name: description` だけをシステムプロンプトの `AVAILABLE SKILLS` に載せます。
2. **読み込み（第2段階）**: AI は依頼が description に合うと判断したとき `load_skill(name)` を呼び、本文と添付ファイルの一覧を受け取ります。
3. **添付ファイル（第3段階）**: 必要なときだけ `read_skill_file(name, path)` で `references/` や `assets/` を読みます。
* **明示呼び出し**: ユーザーの入力に `/skill-name` が含まれる場合、サーバーがその Skill の本文を `<skill name="…">` ブロックとして入力に付けて渡します。
* **スクリプト実行**: Skill の指示がスクリプトの実行を求めるとき、AI は `run_skill_script(name, path, args)` を呼びます。サーバーは Vercel Sandbox を 1 回ごとに作成し、Skill の添付ファイル一式を展開して `python3` / `node` で実行し、stdout・stderr・終了コードを AI に返して VM を停止します（`src/lib/server/skill-sandbox.ts`）。
  * 制限: 外部通信なし（`deny-all`）、30 秒、1 vCPU、非永続、出力 20,000 文字まで。Pro プラン以上。
  * スクリプトの出力はデータとして扱い、指示としては実行しません（システムプロンプトで明記）。
  * 第 1 段階ではファイルの入出力（画像や動画の受け渡し）は扱いません。
* **保存**: 「Skills にしといて」などの依頼では、AI が `save_skill(name, description, instructions)` を呼んで保存します。
* チャットには `📚 Using skill` / `📄 Reading` / `💾 Saved skill` の表示が流れます。
* 本やカードは Skill なしで表示されるため、Skill が CSS を提供する場合、AI は使う CSS を本の `<style>` に書き込みます。

### 2.4 設定画面（Settings → Plugin）
* **Skills**: ユーザー Skill と組み込み Skill の一覧。チェックボックスで有効／無効を切り替えます（ユーザー Skill は即時に DB へ保存、組み込み Skill は `active_plugin_ids` に即時保存）。
* **編集フォーム**: Name / Description / Instructions / Files を編集し、「Save skill」でその Skill だけを保存します。名前を変えた場合は新しい名前で保存してから旧 Skill を削除し、無効状態を引き継ぎます。
* **組み込み Skill**: 読み取り専用で表示し、「Duplicate to edit」で同名のユーザー Skill として複製できます。
* **AI Skill Generator / Refiner**: `/api/generate-skill` が指示から name / description / 本文の下書きを作ります。保存は「Save skill」を押したときに行います。
* **Plugins**: Skill ではない組み込み機能（Reading aloud、HyperCardHook）の有効／無効。

### 2.5 対応しないもの
* ブラウザでの `index.js` 実行、`.sh` などの任意コマンド実行、スクリプトからの外部通信、Sandbox 経由のファイル入出力（第 1 段階）
* 表示時に Skill の CSS を本へ後付けすること
* 本文中の `/!event: skill` ページ hook（行は表示から取り除かれるだけで実行されません）
