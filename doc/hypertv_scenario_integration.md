# HyperCardTV連携: Scenario Book自動生成

## 概要
HyperCardTV（tatenaga/hypertv-app）で動画が再生されると、HyperTV側が動画のダウンロード・AI解析・シーン毎のシナリオMarkdown生成までを行い、その結果をHyperCardBookに送って「Scenario: 動画名」というBookとして保存する。

**役割分担**
- **HyperCardTV側**: 動画ダウンロード、AI解析、シーン分割、シナリオMarkdown本文の生成、Bookタイトルの決定
- **HyperCardBook側（本ドキュメントの対象）**: 受け取ったMarkdownをユーザー本人のアカウントにBookとして保存するだけ。コンテンツの生成・加工は一切行わない

## エンドポイント
`POST /api/hypertv/scenario`（[+server.ts](../src/routes/api/hypertv/scenario/+server.ts)）

paperoboとの連携（`/api/paperobo/call-history`、`/api/paperobo/published-notification`）と同じ、事前共有シークレットによるサーバー間認証方式を踏襲。

### 認証
```
Authorization: Bearer <HYPERTV_SHARED_SECRET>
```
- 新規の環境変数 `HYPERTV_SHARED_SECRET` を使用（`HYPERCARDBOOK_SHARED_SECRET`とは別の専用シークレット。用途ごとに分離することで、片方が漏洩してももう片方は無傷にできる）
- `.env.example` に追記済み。**実際の値は `.env` に手動で設定すること**（本セッションでは `.env` への直接書き込みが権限上ブロックされたため未設定）

### リクエストボディ
```json
{
  "userId": "<supabaseUserId>",
  "videoId": "<動画ID（YouTube ID等）>",
  "videoTitle": "<動画タイトル>",
  "markdownContent": "<シーン毎に分割されたシナリオ本文（Markdown）>",
  "sourceUrl": "<元動画のURL（任意）>"
}
```

### 処理内容
1. `Authorization`ヘッダーのBearerトークンを`HYPERTV_SHARED_SECRET`と照合
2. 必須パラメータ（`userId`, `videoId`, `videoTitle`, `markdownContent`）を検証
3. Supabase service role クライアントで`books`テーブルに upsert
   - `slug`: `hypertv-<userId>-<videoId>`（ユーザー×動画で一意にすることで、別ユーザーが同じ動画を見てもBookが競合しないようにしている。同じユーザーが同じ動画を再度見た場合は同一Bookを更新）
   - `title`: `Scenario: <videoTitle>`
   - `author`: `HyperCardTV`
   - `theme_color`: `blue`
   - `is_public`: `false`（非公開）
   - `markdown_content`: フロントマター（title/author/theme_color/source_app/source_url/video_id）+ HyperTVから受け取った本文

### レスポンス
```json
{ "ok": true, "bookId": "...", "openUrl": "https://.../hyperbook/<id>", "created": true }
```

## hooks.server.tsの変更
[hooks.server.ts](../src/hooks.server.ts) の `isApiRoute` 判定は `/api/*` を原則ログイン必須にしている（未ログインなら401）。本エンドポイントは共有シークレットで独自に認証するため、paperobo関連エンドポイントと同様に除外リストへ追加した。

## HyperCardTV側（tatenaga）に必要な追加実装（未実施）
このドキュメント作成時点では、HyperCardTV側の呼び出し処理（`api/hypertv-scenario.js`相当）はまだ実装されていない。実装時は以下が必要:
- ユーザーの動画再生イベントを検知し、ログイン中のSupabaseアクセストークンを検証（`supabase.auth.getUser(token)`）してユーザーIDを確定
- 動画のダウンロード・AI解析・シーン分割・Markdown生成（HyperCardTV側の責務）
- 生成物を上記エンドポイントへPOST
- `HYPERTV_SHARED_SECRET`をtatenaga側のVercel環境変数にも同じ値で設定する必要がある
