-- Add logo_url to apps table
ALTER TABLE public.apps ADD COLUMN IF NOT EXISTS logo_url TEXT;
