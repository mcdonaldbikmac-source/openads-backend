import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// This needs to use the Postgres connection to get the function def, but wait:
// we can just use supabase.rpc to execute a custom SQL if we had one.
// Since we don't, we can just check 'openads_campaigns' vs 'campaigns' contents to see if data is misrouted.

export async function GET() {
    const { data: c1 } = await supabase.from('campaigns').select('impressions').limit(5);
    let openads_camp = null;
    try {
        const { data: c2 } = await supabase.from('openads_campaigns').select('id, impressions, clicks').limit(5);
        openads_camp = c2;
    } catch(e) {}

    const { data: tracking } = await supabase.from('tracking_events').select('campaign_id, event_type').limit(10);
    
    return NextResponse.json({
        campaigns_impressions: c1,
        openads_campaigns: openads_camp,
        tracking_events: tracking
    });
}
