-- MarkdownAI promotion codes and time-limited plan entitlements.
-- Apply this migration to the production Supabase project before deploying
-- the application code that reads plan data from app_metadata.

CREATE TABLE IF NOT EXISTS public.plan_promotion_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL,
    code_hash TEXT NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
    plan TEXT NOT NULL CHECK (plan IN ('standard', 'pro', 'enterprise')),
    entitlement_days INTEGER NOT NULL CHECK (entitlement_days > 0),
    available_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    redeem_by TIMESTAMPTZ,
    max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
    redemption_count INTEGER NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (redeem_by IS NULL OR redeem_by > available_from)
);

CREATE TABLE IF NOT EXISTS public.plan_promotion_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_code_id UUID NOT NULL
        REFERENCES public.plan_promotion_codes(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL CHECK (plan IN ('standard', 'pro', 'enterprise')),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (promotion_code_id, user_id),
    CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_plan_promotion_redemptions_user
    ON public.plan_promotion_redemptions (user_id, ends_at DESC);

ALTER TABLE public.plan_promotion_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_promotion_redemptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.plan_promotion_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.plan_promotion_redemptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.plan_promotion_codes TO service_role;
GRANT ALL ON public.plan_promotion_redemptions TO service_role;

-- Move existing permanent plans to server-controlled app_metadata.
UPDATE auth.users
SET raw_app_meta_data =
    COALESCE(raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object(
        'plan',
        CASE
            WHEN raw_app_meta_data ->> 'plan' IN ('free', 'standard', 'pro', 'enterprise')
                THEN raw_app_meta_data ->> 'plan'
            WHEN raw_user_meta_data ->> 'plan' IN ('free', 'standard', 'pro', 'enterprise')
                THEN raw_user_meta_data ->> 'plan'
            ELSE 'free'
        END
    );

CREATE OR REPLACE FUNCTION public.redeem_plan_promotion(
    p_code_hash TEXT,
    p_user_id UUID,
    p_expected_plan TEXT
)
RETURNS TABLE (
    promotion_plan TEXT,
    starts_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    promotion public.plan_promotion_codes%ROWTYPE;
    base_plan TEXT;
    base_plan_rank INTEGER;
    promotion_plan_rank INTEGER;
    entitlement_start TIMESTAMPTZ := now();
    entitlement_end TIMESTAMPTZ;
BEGIN
    IF p_expected_plan NOT IN ('standard', 'pro', 'enterprise') THEN
        RAISE EXCEPTION 'promotion_plan_invalid' USING ERRCODE = 'P0001';
    END IF;

    -- Serialize redemptions for the same user, even when two different codes
    -- are submitted concurrently.
    SELECT CASE
        WHEN target_user.raw_app_meta_data ->> 'plan'
            IN ('free', 'standard', 'pro', 'enterprise')
            THEN target_user.raw_app_meta_data ->> 'plan'
        ELSE 'free'
    END
    INTO base_plan
    FROM auth.users AS target_user
    WHERE target_user.id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'promotion_user_not_found' USING ERRCODE = 'P0001';
    END IF;

    SELECT *
    INTO promotion
    FROM public.plan_promotion_codes AS promotion_code
    WHERE promotion_code.code_hash = lower(p_code_hash)
    FOR UPDATE;

    IF NOT FOUND OR promotion.plan <> p_expected_plan THEN
        RAISE EXCEPTION 'promotion_code_invalid' USING ERRCODE = 'P0001';
    END IF;
    IF NOT promotion.is_active THEN
        RAISE EXCEPTION 'promotion_code_inactive' USING ERRCODE = 'P0001';
    END IF;
    IF promotion.available_from > entitlement_start THEN
        RAISE EXCEPTION 'promotion_code_not_started' USING ERRCODE = 'P0001';
    END IF;
    IF promotion.redeem_by IS NOT NULL AND promotion.redeem_by < entitlement_start THEN
        RAISE EXCEPTION 'promotion_code_expired' USING ERRCODE = 'P0001';
    END IF;
    IF promotion.max_redemptions IS NOT NULL
       AND promotion.redemption_count >= promotion.max_redemptions THEN
        RAISE EXCEPTION 'promotion_code_limit_reached' USING ERRCODE = 'P0001';
    END IF;
    base_plan_rank := CASE base_plan
        WHEN 'enterprise' THEN 3
        WHEN 'pro' THEN 2
        WHEN 'standard' THEN 1
        ELSE 0
    END;
    promotion_plan_rank := CASE promotion.plan
        WHEN 'enterprise' THEN 3
        WHEN 'pro' THEN 2
        WHEN 'standard' THEN 1
        ELSE 0
    END;
    IF base_plan_rank >= promotion_plan_rank THEN
        RAISE EXCEPTION 'promotion_plan_not_upgrade' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM public.plan_promotion_redemptions AS prior_redemption
        WHERE prior_redemption.promotion_code_id = promotion.id
          AND prior_redemption.user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'promotion_code_already_redeemed' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM public.plan_promotion_redemptions AS active_redemption
        WHERE active_redemption.user_id = p_user_id
          AND active_redemption.ends_at > entitlement_start
    ) THEN
        RAISE EXCEPTION 'promotion_already_active' USING ERRCODE = 'P0001';
    END IF;

    entitlement_end := entitlement_start + make_interval(days => promotion.entitlement_days);

    INSERT INTO public.plan_promotion_redemptions (
        promotion_code_id,
        user_id,
        plan,
        starts_at,
        ends_at
    )
    VALUES (
        promotion.id,
        p_user_id,
        promotion.plan,
        entitlement_start,
        entitlement_end
    );

    UPDATE public.plan_promotion_codes
    SET redemption_count = redemption_count + 1,
        updated_at = now()
    WHERE id = promotion.id;

    UPDATE auth.users
    SET raw_app_meta_data =
        COALESCE(raw_app_meta_data, '{}'::jsonb) ||
        jsonb_build_object(
            'promotion_plan', promotion.plan,
            'promotion_expires_at', entitlement_end,
            'promotion_code_id', promotion.id
        ),
        updated_at = now()
    WHERE id = p_user_id;

    RETURN QUERY
    SELECT promotion.plan, entitlement_start, entitlement_end;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_plan_promotion(TEXT, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_plan_promotion(TEXT, UUID, TEXT)
    TO service_role;
