-- Add type column to apps table
ALTER TABLE public.apps ADD COLUMN IF NOT EXISTS app_type TEXT DEFAULT 'website';
