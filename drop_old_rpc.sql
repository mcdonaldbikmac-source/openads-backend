-- 1. Open Supabase Dashboard -> SQL Editor
-- 2. Paste and RUN the following code to remove the ambiguous old function:

DROP FUNCTION IF EXISTS public.record_impression(uuid, text, integer, text, text);
