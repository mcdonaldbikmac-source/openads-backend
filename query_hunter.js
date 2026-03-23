require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim());

async function check() {
    console.log("Searching for 'hunt16z'...");
    const { data: d1 } = await supabase.from('campaigns').select('id, creative_title, advertiser_wallet').ilike('advertiser_wallet', '%hunt16z%');
    console.log("Found username:", d1);

    console.log("Searching for FID '241235'...");
    const { data: d2 } = await supabase.from('campaigns').select('id, creative_title, advertiser_wallet').ilike('advertiser_wallet', '%241235%');
    console.log("Found FID:", d2);
    
    console.log("Searching exactly by campaign name...");
    const { data: d3 } = await supabase.from('campaigns').select('id, creative_title, advertiser_wallet').ilike('creative_title', '%Pop up icon banner%');
    console.log("Found exact campaigns by name:", d3);
}
check();
