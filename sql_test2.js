require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: camps } = await supabase.from('campaigns').select('id, creative_title');
    for (const c of camps) {
        if (c.creative_title.includes('E2E') || c.creative_title.includes('Syndicate') || c.creative_title.includes('Test')) {
            console.log("Deleting Tracking Events for:", c.creative_title);
            await supabase.from('tracking_events').delete().eq('campaign_id', c.id);
            console.log("Deleting Campaign:", c.creative_title);
            const res = await supabase.from('campaigns').delete().eq('id', c.id);
            console.log("Result:", res.status, res.statusText);
        }
    }
}
check();
