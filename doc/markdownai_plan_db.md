# MarkdownAI Plan Database & Limits Specification for PapeRobo

PapeRoboは、HyperCardBookと共通のSupabase Authユーザーに保存されたMarkdownAIプランを参照し、連続通話時間を制御します。

## 1. Supabase Authのプラン情報

プラン情報はユーザーが編集できる `user_metadata` ではなく、サーバーだけが更新する `app_metadata`（`auth.users.raw_app_meta_data`）に保存します。

```json
{
  "plan": "free",
  "promotion_plan": "pro",
  "promotion_expires_at": "2026-08-28T12:00:00.000Z",
  "promotion_code_id": "プロモーションコードのUUID"
}
```

- `plan`: 恒久プラン。未設定または不正な値は `free` とみなします。
- `promotion_plan`: 期間限定プロモーションで付与されたプラン。
- `promotion_expires_at`: プロモーションの終了日時（UTC）。
- 有効な恒久プランとプロモーションプランのうち、上位のプランを実効プランとします。
- プロモーション終了後は、データ削除処理を待たずに恒久プランへ自動的に戻ります。

既存ユーザーの `user_metadata.plan` は、`supabase_migration_plan_promotions.sql` の適用時に `app_metadata.plan` へ移行します。移行後のアプリケーションは `user_metadata.plan` を権限判定に使用しません。

## 2. PapeRoboの連続通話時間

| 実効プラン | 連続通話時間上限 |
| :--- | :--- |
| `free` | 3分 |
| `standard` | 12分 |
| `pro` | 30分 |
| `enterprise` | 60分 |

実装の正本はPapeRoboの `src/lib/server/markdownaiPlan.ts` です。

## 3. 参照方法

Supabaseで検証済みのユーザーを取得し、`app_metadata` から実効プランを計算します。

```typescript
const metadata = user.app_metadata || {};
const basePlan = normalizePlan(metadata.plan);
const promotionPlan = normalizePlan(metadata.promotion_plan);
const expiresAt = Date.parse(String(metadata.promotion_expires_at || ''));
const promotionIsActive =
    promotionPlan !== 'free' &&
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now();

const effectivePlan =
    promotionIsActive && rank[promotionPlan] > rank[basePlan]
        ? promotionPlan
        : basePlan;
```

クライアントから送られた任意のJWTペイロードや `user_metadata` を、そのまま権限判定に使用しないでください。重要な判定ではSupabase Authが検証したユーザー情報を使用します。

## 4. プロモーションコード

- コード本体はDBへ保存せず、SHA-256ハッシュだけを保存します。
- コードには、付与プラン、付与日数、利用開始日時、引換期限、最大利用回数、有効・無効状態を設定できます。
- 同じコードの同一ユーザーによる再利用、および有効なプロモーションを持つユーザーの重複引換は拒否します。
- 発行・一覧・無効化はHyperCardBookの `npm run promotion:codes -- ...` で行います。
- DBのテーブルと引換RPCは `supabase_migration_plan_promotions.sql` で作成します。

プラン変更後はJWT内の `app_metadata` を更新するため、セッションを更新してから新しい実効プランを表示・利用します。
