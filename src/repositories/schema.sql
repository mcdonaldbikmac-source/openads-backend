-- =========================================================================
-- OPENADS V2 - DATABASE STRICTNESS MIGRATION SCRIPT
-- =========================================================================
-- PURPOSE: 
-- 1. Enforce strict Foreign Key Cascades to prevent phantom views.
-- 2. Push budget subtraction deeply into Postgres to eliminate race conditions.

-- -------------------------------------------------------------------------
-- PART 1: FOREIGN KEY CASCADES (Data Integrity)
-- -------------------------------------------------------------------------

-- 1A: tracking_events -> campaigns
-- Drops the old unbounded constraint and forces ON DELETE CASCADE.
ALTER TABLE tracking_events
DROP CONSTRAINT IF EXISTS tracking_events_campaign_id_fkey;

ALTER TABLE tracking_events
ADD CONSTRAINT tracking_events_campaign_id_fkey
FOREIGN KEY (campaign_id)
REFERENCES campaigns (id)
ON DELETE CASCADE;

-- 1B: vouchers -> campaigns
-- In case vouchers are bound to specific campaigns or users.
ALTER TABLE vouchers
DROP CONSTRAINT IF EXISTS vouchers_campaign_id_fkey;

-- (Only add this if your 'vouchers' table actually holds a campaign_id column)
-- ALTER TABLE vouchers ADD CONSTRAINT vouchers_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE;


-- -------------------------------------------------------------------------
-- PART 2: ATOMIC RPC FUNCTIONS (Financial Integrity)
-- -------------------------------------------------------------------------

-- REPLACES: frontend/backend floating point math
-- SOLVES: Two instances deducting $0.05 at the exact same millisecond and
-- successfully bypassing the budget ceiling. This locks the row mathematically.

CREATE OR REPLACE FUNCTION atomic_deduct_budget(
    p_campaign_id uuid,
    p_cost_wei numeric,
    p_cost_usd numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_budget_wei numeric;
    v_spend_wei numeric;
BEGIN
    -- 1. Lock the specific row FOR UPDATE to prevent race conditions natively
    SELECT budget_wei, spend_wei 
    INTO v_budget_wei, v_spend_wei
    FROM campaigns
    WHERE id = p_campaign_id
    FOR UPDATE;

    -- 2. If campaign doesn't exist, fail
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- 3. Calculate new total. If it exceeds budget, fail implicitly.
    IF (v_spend_wei + p_cost_wei) > v_budget_wei THEN
        -- Force campaign status to 'depleted' immediately
        UPDATE campaigns SET status = 'depleted' WHERE id = p_campaign_id;
        RETURN false;
    END IF;

    -- 4. Execute atomic update
    UPDATE campaigns
    SET 
        spend_wei = spend_wei + p_cost_wei,
        spend_usd = spend_usd + p_cost_usd,
        impressions = impressions + 1
    WHERE id = p_campaign_id;

    RETURN true;
END;
$$;


-- -------------------------------------------------------------------------
-- PART 3: ATOMIC DEPOSITS (Read-Modify-Write Protection)
-- -------------------------------------------------------------------------

-- REPLACES: frontend/backend adding values then updating
-- SOLVES: Prevents two parallel blockchain confirmation webhooks from overwriting
-- each other's addition math if they fetch the same base `budget_wei`.

CREATE OR REPLACE FUNCTION atomic_add_budget(
    p_campaign_id uuid,
    p_added_wei numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE campaigns
    SET 
        budget_wei = budget_wei + p_added_wei,
        -- Auto-resume the campaign upon adding budget
        status = CASE 
            WHEN status IN ('paused', 'completed', 'depleted') THEN 'active'
            ELSE status 
        END
    WHERE id = p_campaign_id;

    RETURN true;
END;
$$;
