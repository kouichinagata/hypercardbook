# MarkdownAI Plan Database & Limits Specification for PapeRobo

本ドキュメントは、PapeRoboにおいてログインユーザーの契約プラン（MarkdownAIプラン）をデータベース（Supabase）から直接参照し、連続通話時間の制限を制御するための仕様をまとめたものです。

---

## 1. データベース仕様 (Supabase Auth)

ユーザーのプラン情報は、Supabaseの認証スキーマ（`auth`）に紐づくメタデータ内に格納されています。

* **データベース名 / サービス**: Supabase
* **参照スキーマ / テーブル**: `auth.users`
* **メタデータ格納カラム**: `raw_user_meta_data` (JSONB型)
* **プラン特定キー**: `"plan"`

### JSON構造イメージ
`auth.users.raw_user_meta_data` 内の構造は以下のようになっています。

```json
{
  "iss": "https://fxtqkhfkavwtctuljrqt.supabase.co/auth/v1",
  "sub": "ユーザーのUUID",
  "plan": "pro",  // <--- このキーを参照します
  "nickname": "ユーザー名",
  "github_token": "...",
  "github_owner": "...",
  "github_repo": "..."
}
```

---

## 2. プラン値と連続通話時間制限

PapeRobo側で制御する連続通話時間の仕様は以下の通りです。

| プラン値 (`plan` キーの値) | 対象プラン名 | 連続通話時間上限 |
| :--- | :--- | :--- |
| `"free"` (または値なし/NULL) | 無料プラン (Free) | **3分** |
| `"standard"` | スタンダードプラン (Standard) | **20分** |
| `"pro"` | プロプラン (Pro) | **60分** (1時間) |
| `"enterprise"` | エンタープライズプラン (Enterprise) | **120分** (2時間) |

---

## 3. 実装例

### クライアントサイド (JavaScript / TypeScript)
PapeRoboのフロントエンドからログイン中ユーザーのセッション情報を取得して制御する場合のコード例です。

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('YOUR_SUPABASE_URL', 'YOUR_SUPABASE_ANON_KEY');

async function getCallLimitMinutes() {
    // データベースから最新のユーザー情報を取得 (メモリキャッシュではなく安全にDBを参照)
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
        console.error('ユーザー情報の取得に失敗しました。デフォルトでFree（3分）制限を適用します。');
        return 3; // Free制限
    }

    // メタデータからplanキーを取得 (存在しない場合は 'free' とみなす)
    const plan = user.user_metadata?.plan || 'free';

    switch (plan) {
        case 'enterprise':
            return 120; // 2時間 (120分)
        case 'pro':
            return 60;  // 60分
        case 'standard':
            return 20;  // 20分
        case 'free':
        default:
            return 3;   // 3分
    }
}
```

### バックエンドAPI / エッジファンクション (JWTデコード)
PapeRoboのバックエンド側でAPIリクエスト時に制限を検証する場合、リクエストヘッダーの `Authorization: Bearer <JWT>` からデコードされたペイロードの `user_metadata.plan` を参照します。

* **JWT ペイロードの参照パス**: `user_metadata.plan`
* **検証ロジック例 (Node.js)**:
  ```javascript
  // デコードされたJWTペイロードから取得
  const plan = jwtPayload.user_metadata?.plan || 'free';
  ```

---

## 4. 注意点

* **未設定ユーザー of 扱い**:
  過去に作成されたアカウントやメタデータ移行前のユーザーには、`plan` キーが存在しない場合があります。その場合は**必ずデフォルト値として `"free"`（制限時間3分）を適用**するようにフォールバック処理を実装してください。
* **プラン変更の即時反映**:
  ユーザーがHyperCardBook側でプランをアップグレードした場合、メタデータはSupabase側で即時書き換わります。PapeRobo側で古いセッションキャッシュを保持し続けないよう、通話開始前などの重要なタイミングでは `supabase.auth.getUser()` を呼び出して最新のメタデータを再取得することを推奨します。
