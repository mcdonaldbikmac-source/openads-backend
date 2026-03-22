import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function GET(request: Request) {
    try {
        const { error } = await supabase.rpc('execute_sql', {
            sql_string: 'ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS farcaster_id TEXT;'
        });

        if (error) {
            // If execute_sql RPC doesn't exist, we must use a workaround if needed, 
            // but Next.js server has the real service_role key so it usually works if defined.
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Migration Complete' });
    } catch (err) {
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
