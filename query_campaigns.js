/** Query Campaigns */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
    if (error) {
        console.error("DB Error:", error);
    } else {
        console.log("Active Campaigns in DB:");
        data.filter(c => c.status === 'active').forEach(c => {
            console.log(`\nID: ${c.id}`);
            console.log(`Title: ${c.creative_title}`);
            console.log(`CPM: ${c.cpm_rate_wei}`);
            console.log(`Format: ${c.ad_type}`);
            let img = c.image_url.substring(0, 150) + "...";
            console.log(`Image: ${img}`);
            if (c.image_url.includes("DEFI SUMMER")) {
                console.log(">> CONTAINS 'DEFI SUMMER' in IMAGE_URL!");
            }
        });
    }
}
check();
