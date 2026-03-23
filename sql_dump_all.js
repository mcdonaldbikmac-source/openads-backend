require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim());

async function check() {
    const { data: camps } = await supabase.from('campaigns').select('*');
    console.log("Total campaigns:", camps ? camps.length : 0);
    if(camps) {
        for(const c of camps) {
            console.log(`- '${c.creative_title}', ID: ${c.id}, Advertiser: ${c.advertiser_wallet}`);
        }
    }
}
check();
