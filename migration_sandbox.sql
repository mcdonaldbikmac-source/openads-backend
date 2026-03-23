-- Phase 1: Institutionalizing Data Segregation Firewalls
-- Execute this entirely in the Supabase SQL Editor

-- 1. Campaigns Table
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_campaigns_real ON campaigns (id) WHERE is_test = false;

-- 2. Apps Table
ALTER TABLE apps ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_apps_real ON apps (id) WHERE is_test = false;

-- 3. Telemetry Table (Tracking Events)
ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_tracking_events_real ON tracking_events (id) WHERE is_test = false;

-- 4. Financial Ledger (Vouchers)
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_vouchers_real ON vouchers (code) WHERE is_test = false;
