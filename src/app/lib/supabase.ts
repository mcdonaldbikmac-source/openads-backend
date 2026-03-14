import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
// We MUST use the Service Role Key on the backend to bypass RLS for admin tasks (like inserting ads)
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('⚠️ Supabase URL or Service Role Key are missing. API routes will fail at runtime if not provided.');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
