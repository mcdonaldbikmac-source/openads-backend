require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim());

async function check() {
    const wallet = '1550542';
    const address = '0x895Af8672d72528F168A239a16c4c07eeE4890C0';
    
    let orQuery = `advertiser_wallet.ilike.${wallet},advertiser_wallet.ilike.%|${wallet}|%`;
    if (address) {
        orQuery += `,advertiser_wallet.ilike.${address},advertiser_wallet.ilike.%|${address}|%`;
    }
    
    console.log("Testing orQuery:", orQuery);
    
    const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select('*')
        .or(orQuery)
        .eq('is_test', false)
        .order('created_at', { ascending: false });
        
    console.log("Query Error:", error);
    console.log("Returned Campaigns:", campaigns);
}
check();
