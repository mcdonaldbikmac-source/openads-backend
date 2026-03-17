-- Create apps table to store User-Registered Miniapps for the Publisher Dashboard
CREATE TABLE IF NOT EXISTS public.apps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    publisher_wallet TEXT NOT NULL,
    name TEXT NOT NULL,
    domain TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_apps_publisher_wallet ON public.apps(publisher_wallet);

-- Set Revenue Sharing Policy (Open access for ease of use)
ALTER TABLE public.apps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.apps FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.apps FOR INSERT WITH CHECK (true);
-- Give full permissions to the anon and authenticated roles
GRANT ALL ON TABLE public.apps TO anon;
GRANT ALL ON TABLE public.apps TO authenticated;
GRANT ALL ON TABLE public.apps TO service_role;
