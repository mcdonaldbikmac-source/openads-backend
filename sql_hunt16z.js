require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: camps } = await supabase.from('campaigns').select('id, creative_title, advertiser_wallet, created_at');
    console.log("ALL CAMPAIGNS IN DB:");
    for (const c of camps) {
        console.log(`- "${c.creative_title}" belongs to: ${c.advertiser_wallet}`);
    }
}
check();
