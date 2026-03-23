require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: camps } = await supabase.from('campaigns').select('*').ilike('creative_title', '%Pop up%');
    console.log("Found Campaigns for Pop up: ", camps.length);
    for(const c of camps) {
        console.log(`Title: ${c.creative_title}, Owner: ${c.advertiser_wallet}, ID: ${c.id}`);
    }
}
check();
