/** Purge Demo Banner Ad */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function purge() {
    const ids = [
        '3c94a0d6-9588-4e72-8442-0c425771af8f', // Demo Banner Ad
    ];
    
    // Pause them globally
    const { data, error } = await supabase
        .from('campaigns')
        .update({ status: 'paused', budget_wei: '0' })
        .in('id', ids);
        
    if (error) {
        console.error("Purge Error:", error);
    } else {
        console.log("Successfully neutralized the Demo Banner Ad.");
        
        // Also just list out what is currently active to double check
        const { data: rem } = await supabase.from('campaigns').select('id, creative_title, cpm_rate_wei, ad_type, advertiser_wallet').eq('status', 'active');
        console.log("Remaining Active Campaigns:");
        console.dir(rem, {depth: null});
    }
}
purge();
