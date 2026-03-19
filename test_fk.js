const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { error } = await supabase.from('tracking_events').insert([{
        publisher_wallet: '0xb9a3faeb416580f4bc1c8f6e2d4773b580e9d18c',
        fid: 0,
        event_type: 'connect',
        sig: '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
        campaign_id: null // Try NULL first
    }]);
    
    if (error) {
        console.error("Failed with NULL campaign_id:", error.message);
    } else {
        console.log("Success with NULL campaign_id!");
    }
}
check();
