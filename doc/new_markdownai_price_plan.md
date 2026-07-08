# MarkdownAI Price Plan & Specifications

MarkdownAIの新しい有料プラン、背景、および画面・認証仕様に関するまとめです。次スレでの開発や検討の引き継ぎ用として保存します。

---

## 1. 背景とコンセプト (Background & Concept)

* **合言葉**: "Markdown is all you need!"
* **概要**: Markdownを用いてAIエージェントの作成、業務・生活の向上、および各種情報の整理を行うプロジェクト。
* **沿革**: 
  * 2024年からMarkdownに特化したAIエディタ「MarkdownAI」をβ版としてサービス開始。
  * 2026年7月、新バージョンである「HyperCardBook」（元最高アーキテクトのQuark氏が作成・オープンソース化）を中心としたシステムに刷新。
* **ID統合**: MarkdownAI、PapeRobo、HyperCardBookの3つのユーザーIDは統合される。
* **有料版の定義**: 
  * 有料版（MarkdownAI）＝ HyperCardBook ＋ PapeRobo ＋ 有料機能（拡張機能）

---

## 2. 料金プラン体系 (Price Plans)

画面上に並ぶ縦長カードは、以下の3つのみの極めてシンプルな構成とします。

| プラン名 (Plan) | 価格 (Price) | 概要説明 (Description) | 切り替えアクション (Action) |
| :--- | :--- | :--- | :--- |
| **Standard** | `$0` | `Basic editor & reading features` | コード不要。ワンクリックで即時変更。 |
| **Pro** | `$20` (予定) | `Unlock advanced AI and publishing features` | クリックで「コード入力欄」を表示。 |
| **Enterprise** | `Ask` | `For organizations and custom limits` | クリックで「コード入力欄」を表示。 |

---

## 3. 認証・コード切り替え仕様 (Authentication & Activation)

複雑なコード管理やバグを避けるため、極めてシンプルかつ安全な方式を採用します。

* **暗号方式**: Node.js標準の `crypto`（ライブラリ不要）を用いた **SHA-256 ハッシュ値完全一致方式**。
* **切り替えロジック**:
  * **一般協力者**: 配布された「プロ用共通コード（1種類）」を入力することで、Proプランに切り替え。
  * **一般ユーザー**: コードを持たないため、ProやEnterpriseを押しても切り替わらずサービス開始を待つ。
  * **管理者（永田様）**: 
    * Supabase Authのログイン情報（メールアドレス等）で「管理者」と自動判定。
    * コード入力なし（またはマスターコード）で、Standard, Pro, Enterpriseのどのボタンを押しても、自分のアカウントを即座にそのプランに切り替えてテスト可能。
  * **将来のエンタープライズコード**: コードを用いて「Enterprise（実質スーパーユーザー）」に切り替え。

---

## 4. 将来的な有料機能ロードマップ (Roadmap & Features)

### 【第1弾予定】
* Book、Card、PapeRoboを任意のURLで配布可能（カスタムURL配布）
* Google Analytics対応
* GitHub対応（共同編集）
* 画像の制限解除（1GBまで）
* PapeRoboの時間制限解除（3分から30分まで）

### 【第2弾予定】
* Web検索機能の追加（Gemini Web Search Grounding）
* HyperCardBookでのAI API Key設定による無制限解除
* PapeRoboChat機能、会話履歴の提供
* PapeRobo Vision機能、3人会話機能対応

### 【その他】
* 動画のアップロード機能とインタラクティブTV（Pro）
* ePub出力とePub Playerによる配布（未定）
* コンテンツの有料販売
* **将来実装**: Enterprise版の組織管理者（その会社のスーパーユーザー）が、上限枚数以内で社員向けにエンタープライズログインコードを発行・配布できる管理画面。

---

## 5. 画面UIの動き (UI Interaction)

* **Standardボタンを押した場合**: 
  * コード入力は不要です。
  * ボタンを押した瞬間に即座に「スタンダード（無料版）」に切り替わり、画面がリロードされて無料版の状態で動作します。（プロやスーパーユーザーからでもワンクリックで戻すテストが可能です）
* **Pro / Enterpriseボタンを押した場合**: 
  * **一般ユーザー / 協力者**:
    * ボタンの下に `Enter activation code` の入力欄と `Apply` ボタンがスライドで表示されます。
    * 正しいコードを入力して適用すると、プランが切り替わり画面がリロードされて機能が解放されます。
  * **管理者（永田様）**:
    * Supabaseの認証により管理者と判定されているため、コード入力なし（またはワンクリック）でボタンを押した瞬間に即座に「プロ」または「スーパーユーザー」へ切り替わり、画面がリロードされて該当プランのテスト検証ができます。

