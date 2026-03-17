import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// This needs to use the Postgres connection to get the function def, but wait:
// we can just use supabase.rpc to execute a custom SQL if we had one.
// Since we don't, we can just check 'openads_campaigns' vs 'campaigns' contents to see if data is misrouted.

// Force activate all campaigns for local subagent demo
export async function GET() {
    const { data, error } = await supabase
        .from('campaigns')
        .update({ status: 'active', budget_wei: '1000000000000000000' })
        .neq('id', '00000000-0000-0000-0000-000000000000') // dummy condition to match all
        .select('id, creative_title, status');

    return NextResponse.json({ activated: data, error });
}
