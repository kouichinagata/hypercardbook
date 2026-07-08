# Supabase JWT & user_metadata 肥大化に伴う課題と対策

## 1. 発生した経緯

### 状況
HyperCardBookにGitHub連携機能を追加するにあたり、OAuth認証（Device Flow）で取得した `github_token` と、リポジトリの `github_owner`、`github_repo` 情報を安全に保存する仕組みを実装しました。また、各ユーザー独自のカスタムプラグインCSSなども同様の仕組みで保存されていました。

### 採用した保存方式
手軽に実装するため、既存のプロフィール設定（ペンネーム等）と同じく、Supabase Authの **`user_metadata`** 領域にこれらの値を保存しました。

### 発生したトラブル (HTTP 431 Error)
ローカル開発環境にて、HyperCardBook（`localhost:5173`）からPapeRobo（`localhost:5180`）を起動（自動ログイン）しようとした際、ブラウザ画面に **`HTTP ERROR 431 (Request Header Fields Too Large)`** が発生し、ページが開けなくなりました。

#### 原因のメカニズム
1. **Cookieの共有**:
   ブラウザの仕様上、ポート番号が異なっていても同一ホスト名（`localhost`）であればCookieが共有されます。そのため、`localhost:5173` でSupabaseクライアントが保存した巨大なセッションCookie（JWTが含まれる）が、`localhost:5180` 宛てのリクエストヘッダーにも自動付与されて送信されました。
2. **JWTの肥大化**:
   Supabaseの `user_metadata` に保存されたカスタムCSSなどの長大な文字列や連携トークンは、すべてユーザーのセッションJWT（JSON Web Token）内にエンコードされて埋め込まれます。このため、JWT全体のサイズが極めて巨大化しました。
3. **サーバーのヘッダー制限超過**:
   Node.js/ViteのデフォルトのHTTPヘッダー受け入れ上限（通常8KB）を超過したため、PapeRobo側のローカル開発サーバーがリクエストを拒否（HTTP 431）しました。

#### 一時的な回避策
HyperCardBook側と同様に、PapeRobo側の `package.json` の起動スクリプト（`dev`）にも Node.js のオプション `NODE_OPTIONS='--max-http-header-size=32768'` を追加し、許容ヘッダーサイズを32KBに拡張することでローカル開発環境での動作を復旧させました。

---

## 2. 根本的な課題 (Anti-Pattern)

現在の「`user_metadata`（JWT）への巨大データ・秘密情報の保存」は、以下の観点からセキュリティおよびパフォーマンス上のアンチパターンとなっています。

### ① セキュリティリスク (情報露出)
`user_metadata` に含まれるすべてのデータはJWTにエンコードされ、クライアントサイド（ブラウザのローカルストレージやCookie）に保持されます。JWTは暗号化されておらず単にBase64でエンコードされているだけであるため、**クライアントサイドで誰でも簡単にデコードして中身を閲覧できます。**
ここに `github_token` のような強力な秘密のトークンを保存することは、認証情報の漏洩リスクに直結し、極めて危険です。

### ② パフォーマンスとネットワーク帯域の無駄
JWTはAPIリクエストのたびに `Authorization: Bearer <JWT>` ヘッダーやCookieとして自動送信されます。カスタムプラグインCSSなどの巨大なコンテンツをここに含めると、**すべてのAPI通信のヘッダーサイズが無駄に肥大化し**、通信速度の低下や不要な帯域消費を引き起こします。

---

## 3. 今後の恒久対策 (リファクタリング方針)

次のスレッドまたは将来の改修において、以下の設計に移行することを推奨します。

### ① テーブルの分離
`user_metadata` の使用をペンネームやアバターURLなどの非機密・軽量な基本プロファイル情報のみに限定し、巨大なデータや秘密情報は専用のデータベーステーブルに切り出します。

* **`user_settings` テーブル (新規)**:
  カスタムプラグイン情報、CSSなどの長大な設定値の格納用。
* **`user_secrets` テーブル (新規)**:
  `github_token` などのAPIキーやアクセストークンなどの格納用。

### ② Row Level Security (RLS) による徹底保護
切り出したテーブルに対して、SupabaseのRLSポリシーを設定し、「**ログイン中のユーザー本人だけが自分のデータを読み書きできる**」ように保護します。

```sql
-- 例: user_secrets のRLSポリシー例
alter table user_secrets enable row level security;

create policy "Users can access their own secrets"
  on user_secrets for all
  using (auth.uid() = user_id);
```

### ③ オンデマンドなデータ取得への移行
* **クライアント側**:
  画面表示やAPI送信のたびに巨大なJWTをヘッダーに乗せて送るのをやめ、設定画面などを開いたときにのみ、Supabase SDK経由で対象のテーブルから必要な設定情報を個別にセレクトするように変更します。
* **AIアシスタント側 (generate API)**:
  `src/routes/api/generate/+server.ts` などのサーバーサイドAPIで、`github_push` などの処理を実行する直前に、サービスロール等を用いてデータベースから直接 `user_secrets` の `github_token` をセキュアに取得して実行する形に改修します。
