import { createClient } from '@supabase/supabase-js';

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawSupabaseUrl.replace(/\\n/g, '').replace(/\n/g, '').replace(/['"]/g, '').trim();

// We MUST use the Service Role Key on the backend to bypass RLS for admin tasks (like inserting ads)
const rawSupabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = rawSupabaseServiceKey.replace(/\\n/g, '').replace(/\n/g, '').replace(/['"]/g, '').trim();

if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('⚠️ Supabase URL or Service Role Key are missing. API routes will fail at runtime if not provided.');
}

// Provide dummy URL for Next.js build-time static evaluation to prevent compilation crashes
const safeSupabaseUrl = supabaseUrl || 'https://dummy-build-url.supabase.co';
const safeSupabaseKey = supabaseServiceKey || 'dummy-key';

export const supabase = createClient(safeSupabaseUrl, safeSupabaseKey);
